import { create } from 'zustand';
import { net } from '../net/client';
import { SPOT_R, SPOTS, spotAt, type Spot } from './activities';

export { SPOT_R, SPOTS, spotAt, type Spot };

/** Hall coordinates travel on the wire shifted into 0..100 (see World.ts). */
export const NET_OFFSET = 50;

const opposite = (s: Spot) => SPOTS.find((o) => o.table === s.table && o.side !== s.side)!;

/** What the hall UI shows while the player stands in a circle. */
export const useLobbyStore = create<{
  spot: Spot | null;
  ready: boolean;
  rival: { id: string; name: string; ready: boolean } | null;
}>(() => ({ spot: null, ready: false, rival: null }));

type Msg = { k: 'ready'; spot: string | null } | { k: 'start'; to: string; table: number };

/**
 * Online air hockey lobby. Occupancy comes from everyone's hall position; "ready"
 * is announced over the room. When both sides of a table are ready, blue sends
 * `start` and both open the match (blue hosts, red joins).
 */
export class HockeyLobby {
  /** Peer id -> spot key they marked ready on. */
  private readonly readyAt = new Map<string, string | null>();
  private resendT = 0;
  private starting = false;

  constructor(private readonly begin: (role: 'host' | 'guest', rival: { id: string; name: string }, table: number) => void) {
    net.onGame((from, data) => {
      const m = data as Msg;
      if (m?.k === 'ready') this.readyAt.set(from, typeof m.spot === 'string' ? m.spot : null);
      else if (m?.k === 'start' && m.to === net.id) {
        const st = useLobbyStore.getState();
        // Only accept from the rival actually standing opposite while we're ready.
        if (st.spot?.side === 'red' && st.ready && st.rival?.id === from) this.launch('guest', st.rival, st.spot.table);
      }
    });
  }

  toggleReady() {
    const st = useLobbyStore.getState();
    if (!st.spot || net.id === null) return;
    useLobbyStore.setState({ ready: !st.ready });
    this.announce();
  }

  private announce() {
    const st = useLobbyStore.getState();
    net.sendGame({ k: 'ready', spot: st.ready && st.spot ? st.spot.key : null } satisfies Msg);
  }

  /** Called every hall frame with the player's floor position (null = not in the hall). */
  update(dt: number, x: number | null, z: number | null) {
    const st = useLobbyStore.getState();
    const spot = x === null || z === null ? null : spotAt(x, z);
    if (spot?.key !== st.spot?.key) {
      const wasReady = st.ready;
      useLobbyStore.setState({ spot, ready: false, rival: null });
      if (wasReady) this.announce();
      if (!spot) return;
    }
    if (!spot) return;

    const other = opposite(spot);
    let rival: { id: string; name: string; ready: boolean } | null = null;
    for (const p of net.peers.values()) {
      if (p.place !== 'world' || Math.hypot(p.x - NET_OFFSET - other.x, p.y - NET_OFFSET - other.z) > SPOT_R + 0.15) continue;
      rival = { id: p.id, name: p.name, ready: this.readyAt.get(p.id) === other.key };
      break;
    }
    const cur = useLobbyStore.getState().rival;
    if (rival?.id !== cur?.id || rival?.ready !== cur?.ready || rival?.name !== cur?.name) useLobbyStore.setState({ rival });

    // Late joiners learn who is ready.
    if (st.ready && (this.resendT -= dt) <= 0) {
      this.resendT = 1;
      this.announce();
    }
    if (spot.side === 'blue' && st.ready && rival?.ready && !this.starting) {
      net.sendGame({ k: 'start', to: rival.id, table: spot.table } satisfies Msg);
      this.launch('host', rival, spot.table);
    }
  }

  private launch(role: 'host' | 'guest', rival: { id: string; name: string }, table: number) {
    this.starting = true;
    useLobbyStore.setState({ ready: false });
    this.announce();
    this.begin(role, { id: rival.id, name: rival.name }, table);
    window.setTimeout(() => (this.starting = false), 1500);
  }
}
