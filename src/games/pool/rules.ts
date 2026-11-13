/**
 * 8-ball rules (simplified WPA/bar rules) as pure functions over a plain state, so the
 * shooter's result can be sent online as is.
 */
import { FOOT_X, groupOf, HEAD_X, rack, respot, simulate, type Ball, type ShotEvents } from './physics';

export type Group = 'solid' | 'stripe';

export interface PoolState {
  balls: Ball[];
  /** Player 0 or 1 to shoot. */
  turn: 0 | 1;
  /** Each player's group once the table is no longer open. */
  groups: [Group | null, Group | null];
  /** Cue ball can be placed: behind the head string (break) or anywhere (after a foul). */
  inHand: 'none' | 'kitchen' | 'table';
  breakShot: boolean;
  winner: 0 | 1 | null;
  /** What happened on the last shot, for the banner ('' = nothing to say). */
  msg: string;
}

export function newRack(rnd: () => number, breaker: 0 | 1): PoolState {
  return { balls: rack(rnd), turn: breaker, groups: [null, null], inHand: 'kitchen', breakShot: true, winner: null, msg: '' };
}

const left = (balls: Ball[], g: Group) => balls.filter((b, i) => !b.in && groupOf(i) === g).length;

/** Balls `p` may hit first: their group, the 8 once it is cleared, any non-8 while the table is open. */
export function legalFirst(s: PoolState, p: 0 | 1, id: number): boolean {
  const g = s.groups[p];
  if (!g) return id !== 8 && id !== 0;
  return left(s.balls, g) === 0 ? id === 8 : groupOf(id) === g;
}

/**
 * Applies a shot that already ran on `after` (balls moved) with events `ev`, starting from `before`.
 * Returns the next state (new object; `after` is used as its balls).
 */
export function judge(before: PoolState, after: Ball[], ev: ShotEvents): PoolState {
  const p = before.turn;
  const o = (1 - p) as 0 | 1;
  const s: PoolState = { ...before, balls: after, groups: [...before.groups] as PoolState['groups'], inHand: 'none', breakShot: false, msg: '' };
  const cueIn = ev.pocketed.includes(0);
  const objects = ev.pocketed.filter((id) => id !== 0);
  const foul = cueIn || ev.first === null || !legalFirst(before, p, ev.first) || (!objects.length && !ev.rail && !before.breakShot);
  const why = cueIn ? 'Bola blanca a la tronera' : ev.first === null ? 'No tocó ninguna bola' : !legalFirst(before, p, ev.first) ? 'Tocó primero una bola que no era suya' : 'Ninguna bola tocó banda';

  if (objects.includes(8)) {
    if (before.breakShot) respot(after, 8, FOOT_X);
    else {
      const cleared = before.groups[p] !== null && left(before.balls, before.groups[p]!) === 0;
      s.winner = cleared && !foul ? p : o;
      s.msg = s.winner === p ? '¡Bola 8 dentro!' : cleared ? 'Falta al meter la 8' : 'Bola 8 antes de tiempo';
      return s;
    }
  }
  if (cueIn) respot(after, 0, HEAD_X);
  if (!before.groups[p] && !foul && !before.breakShot) {
    const g = objects.map(groupOf).find((x) => x === 'solid' || x === 'stripe') as Group | undefined;
    if (g) {
      s.groups[p] = g;
      s.groups[o] = g === 'solid' ? 'stripe' : 'solid';
      s.msg = g === 'solid' ? 'lisas (1-7)' : 'rayadas (9-15)'; // Pool.after says whose
    }
  }
  const mine = s.groups[p];
  const scored = objects.some((id) => id !== 8 && (!mine || groupOf(id) === mine));
  if (foul) {
    s.turn = o;
    s.inHand = 'table';
    s.msg = `Falta: ${why}`;
  } else s.turn = scored ? p : o;
  return s;
}

/** Runs the shot from `s` (cue ball at `cue` if placed) and judges it. Pure: `s` is untouched. */
export function play(s: PoolState, v: { x: number; z: number }, cue?: { x: number; z: number }): { next: PoolState; ev: ShotEvents } {
  const balls = s.balls.map((b) => ({ ...b }));
  if (cue) Object.assign(balls[0], cue);
  const ev = simulate(balls, v);
  return { next: judge(s, balls, ev), ev };
}
