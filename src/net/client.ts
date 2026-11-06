import { create } from 'zustand';
import { useWorldStore } from '../world/worldStore';
import { cleanRoom, parseServer, type ClientMsg, type NetPlace, type Peer, type PeerPos } from './protocol';

export type NetStatus = 'off' | 'connecting' | 'online' | 'offline' | 'full';

/** UI-facing connection state (names only; positions live outside React). */
export const useNetStore = create<{ status: NetStatus; room: string; names: string[] }>(() => ({
  status: 'off',
  room: cleanRoom(new URLSearchParams(location.search).get('sala')),
  names: [],
}));

/** A remote player as drawn in the hall: `x/y` ease towards the last received `tx/ty`. */
export interface RemotePeer extends Peer {
  tx: number;
  ty: number;
  anim: number;
}

const SEND_EVERY = 0.1; // s, 10 updates per second

function serverUrl(room: string) {
  const ws = location.protocol === 'https:' ? 'wss' : 'ws';
  // dev: Vite on 5173, room on 8787; production: server.ts serves both from the same domain
  const host = import.meta.env.DEV ? `${location.hostname || 'localhost'}:8787` : location.host;
  const base = import.meta.env.VITE_SERVER_URL || `${ws}://${host}`;
  // The two hall styles use different maps, so each style gets its own copy of the room.
  const style = useWorldStore.getState().style === 'pixel' ? '-pixel' : '';
  return `${base}/?sala=${encodeURIComponent(room + style)}`;
}

/**
 * Connection to the room server. The game works the same without it: if the server
 * is unreachable it just shows "offline" and keeps retrying in the background.
 */
class NetClient {
  readonly peers = new Map<string, RemotePeer>();
  id: string | null = null;
  /** Minigame messages from other players (for future online games). */
  onGame: ((from: string, data: unknown) => void) | null = null;
  private ws: WebSocket | null = null;
  private hello: { name: string; outfit: number } | null = null;
  private retry = 1000;
  private retryTimer = 0;
  private sendT = 0;
  private lastSent = '';

  /** Joins the room (idempotent); `name`/`outfit` can be changed by calling again. */
  connect(name: string, outfit: number) {
    const changed = this.hello && (this.hello.name !== name || this.hello.outfit !== outfit);
    this.hello = { name, outfit };
    if (changed) this.reopen();
    else if (!this.ws) this.open();
  }

  disconnect() {
    this.hello = null;
    clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
    this.reset('off');
  }

  private reopen() {
    this.ws?.close();
    this.ws = null;
    this.open();
  }

  private reset(status: NetStatus) {
    this.peers.clear();
    this.id = null;
    this.lastSent = '';
    useNetStore.setState({ status, names: [] });
  }

  private open() {
    if (!this.hello || typeof WebSocket === 'undefined') return;
    if (useNetStore.getState().status === 'off') useNetStore.setState({ status: 'connecting' }); // retries stay "offline"
    let ws: WebSocket;
    try {
      ws = new WebSocket(serverUrl(useNetStore.getState().room));
    } catch {
      return this.scheduleRetry();
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 1000;
      this.send({ t: 'hello', ...this.hello! });
    };
    ws.onmessage = (e) => this.receive(String(e.data));
    ws.onclose = () => {
      if (this.ws !== ws) return; // replaced on purpose
      this.ws = null;
      if (useNetStore.getState().status !== 'full') this.reset('offline');
      this.scheduleRetry();
    };
  }

  private scheduleRetry() {
    if (!this.hello) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.open(), this.retry);
    this.retry = Math.min(this.retry * 2, 15000);
  }

  private send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private names() {
    useNetStore.setState({ names: [...this.peers.values()].map((p) => p.name) });
  }

  private receive(raw: string) {
    const m = parseServer(raw);
    if (!m) return;
    switch (m.t) {
      case 'welcome':
        this.id = m.id;
        this.peers.clear();
        for (const p of m.peers) this.peers.set(p.id, { ...p, tx: p.x, ty: p.y, anim: 0 });
        useNetStore.setState({ status: 'online', room: m.room.replace(/-pixel$/, '') });
        this.names();
        break;
      case 'join':
        this.peers.set(m.peer.id, { ...m.peer, tx: m.peer.x, ty: m.peer.y, anim: 0 });
        this.names();
        break;
      case 'pos': {
        const p = this.peers.get(m.id);
        if (p) Object.assign(p, { tx: m.x, ty: m.y, dir: m.dir, moving: m.moving, place: m.place });
        break;
      }
      case 'leave':
        this.peers.delete(m.id);
        this.names();
        break;
      case 'game':
        this.onGame?.(m.id, m.data);
        break;
      case 'full':
        useNetStore.setState({ status: 'full' });
        this.hello = null; // don't hammer a full room
        break;
    }
  }

  /** Called every frame by the hall: sends our position (throttled) and eases remote players. */
  tick(dt: number, me: PeerPos) {
    this.sendT -= dt;
    if (this.sendT <= 0 && this.id) {
      this.sendT = SEND_EVERY;
      const r = (v: number) => Math.round(v * 100) / 100;
      const msg: ClientMsg = { t: 'pos', x: r(me.x), y: r(me.y), dir: me.dir, moving: me.moving, place: me.place };
      const s = JSON.stringify(msg);
      if (s !== this.lastSent) {
        this.lastSent = s;
        this.send(msg);
      }
    }
    const k = 1 - Math.exp(-dt * 12);
    for (const p of this.peers.values()) {
      p.x += (p.tx - p.x) * k;
      p.y += (p.ty - p.y) * k;
      p.anim = p.moving ? p.anim + dt * 9 : 0;
    }
  }

  /** Sends a minigame payload to everyone else in the room. */
  sendGame(data: unknown) {
    this.send({ t: 'game', data });
  }
}

export const net = new NetClient();
export type { NetPlace };
