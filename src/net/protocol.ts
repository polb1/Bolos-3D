/**
 * Wire format shared by the browser client and the room server (server/server.ts).
 * Every message is one JSON object with a `t` tag. Anything that arrives from the
 * network goes through the parse* functions, which reject malformed input.
 */

/** Where a player is: walking the hall or inside a minigame. */
export type NetPlace = 'world' | 'bowling' | 'airhockey';
const PLACES: NetPlace[] = ['world', 'bowling', 'airhockey'];

export const MAX_NAME = 16;
export const MAX_MSG_BYTES = 2048;
export const MAX_PLAYERS = 32;
export const OUTFIT_COUNT = 4;

export interface PeerPos {
  x: number;
  y: number;
  /** 0 down, 1 left, 2 right, 3 up (same as the hall sprite). */
  dir: number;
  moving: boolean;
  place: NetPlace;
}

export interface Peer extends PeerPos {
  id: string;
  name: string;
  outfit: number;
}

export type ClientMsg =
  | { t: 'hello'; name: string; outfit: number }
  | ({ t: 'pos' } & PeerPos)
  /** Free-form payload for minigames, relayed to the rest of the room. */
  | { t: 'game'; data: unknown };

export type ServerMsg =
  | { t: 'welcome'; id: string; room: string; peers: Peer[] }
  | { t: 'join'; peer: Peer }
  | ({ t: 'pos'; id: string } & PeerPos)
  | { t: 'leave'; id: string }
  | { t: 'game'; id: string; data: unknown }
  | { t: 'full' };

/** Trims, strips control characters and caps length; never empty. */
export function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, MAX_NAME) : '';
  return s || 'Jugador';
}

/** Room names come from the URL: keep them short and URL-safe. */
export function cleanRoom(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) : '';
  return s || 'local';
}

const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

/** Validates a message from a client; returns null if it is not acceptable. */
export function parseClient(raw: string): ClientMsg | null {
  if (raw.length > MAX_MSG_BYTES) return null;
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  if (m.t === 'hello') {
    const outfit = num(m.outfit, 0, OUTFIT_COUNT - 1);
    return { t: 'hello', name: cleanName(m.name), outfit: outfit === null ? 0 : Math.round(outfit) };
  }
  if (m.t === 'pos') {
    const x = num(m.x, 0, 100);
    const y = num(m.y, 0, 100);
    const dir = num(m.dir, 0, 3);
    if (x === null || y === null || dir === null || !PLACES.includes(m.place as NetPlace)) return null;
    return { t: 'pos', x, y, dir: Math.round(dir), moving: m.moving === true, place: m.place as NetPlace };
  }
  if (m.t === 'game') return { t: 'game', data: m.data ?? null };
  return null;
}

/** Validates a message from the server (the client trusts it no more than the server trusts clients). */
export function parseServer(raw: string): ServerMsg | null {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object' || typeof m.t !== 'string') return null;
  const peer = (p: unknown): Peer | null => {
    if (!p || typeof p !== 'object') return null;
    const o = p as Record<string, unknown>;
    const pos = parseClient(JSON.stringify({ ...o, t: 'pos' }));
    if (typeof o.id !== 'string' || !pos || pos.t !== 'pos') return null;
    const { t: _, ...rest } = pos;
    return { ...rest, id: o.id, name: cleanName(o.name), outfit: Math.round(num(o.outfit, 0, OUTFIT_COUNT - 1) ?? 0) };
  };
  switch (m.t) {
    case 'welcome': {
      if (typeof m.id !== 'string' || !Array.isArray(m.peers)) return null;
      return { t: 'welcome', id: m.id, room: cleanRoom(m.room), peers: m.peers.map(peer).filter((p): p is Peer => !!p) };
    }
    case 'join': {
      const p = peer(m.peer);
      return p ? { t: 'join', peer: p } : null;
    }
    case 'pos': {
      const pos = parseClient(raw);
      return pos && pos.t === 'pos' && typeof m.id === 'string' ? { ...pos, id: m.id } : null;
    }
    case 'leave':
      return typeof m.id === 'string' ? { t: 'leave', id: m.id } : null;
    case 'game':
      return typeof m.id === 'string' ? { t: 'game', id: m.id, data: m.data ?? null } : null;
    case 'full':
      return { t: 'full' };
  }
  return null;
}
