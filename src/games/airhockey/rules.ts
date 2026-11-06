import type { Side } from './physics';

export type Mode = 'ai' | 'versus' | 'training';

/** Match clock, s: first to the goal target or whoever leads when it runs out. */
export const MATCH_TIME = 90;

export interface Score {
  /** Goals by side 1 (bottom player) and side -1 (rival). */
  p1: number;
  p2: number;
  target: number;
  winner: Side | null;
  /** Time ran out on a tie: the next goal wins. */
  golden: boolean;
}

export const newScore = (target = 10): Score => ({ p1: 0, p2: 0, target, winner: null, golden: false });

/** Applies a goal. Training has no rival goal count and never ends. */
export function applyGoal(s: Score, scorer: Side, mode: Mode): Score {
  if (s.winner) return s;
  const next = { ...s, p1: s.p1 + (scorer === 1 ? 1 : 0), p2: s.p2 + (scorer === -1 ? 1 : 0) };
  if (mode !== 'training') {
    if (s.golden || next.p1 >= s.target || next.p2 >= s.target) next.winner = scorer;
  }
  return next;
}

/** Clock ran out: the leader wins; a tie goes to golden goal. */
export function timeUp(s: Score, mode: Mode): Score {
  if (s.winner || s.golden || mode === 'training') return s;
  if (s.p1 === s.p2) return { ...s, golden: true };
  return { ...s, winner: s.p1 > s.p2 ? 1 : -1 };
}

/** Standard rule: whoever was scored on gets the puck. In training it always comes back to you. */
export const serveTo = (scorer: Side, mode: Mode): Side => (mode === 'training' ? 1 : (-scorer as Side));
