import type { Side } from './physics';

export type Mode = 'ai' | 'versus' | 'training';

export interface Score {
  /** Goals by side 1 (bottom player) and side -1 (rival). */
  p1: number;
  p2: number;
  target: number;
  winner: Side | null;
}

export const newScore = (target = 7): Score => ({ p1: 0, p2: 0, target, winner: null });

/** Applies a goal. Training has no rival goal count and never ends. */
export function applyGoal(s: Score, scorer: Side, mode: Mode): Score {
  if (s.winner) return s;
  const next = { ...s, p1: s.p1 + (scorer === 1 ? 1 : 0), p2: s.p2 + (scorer === -1 ? 1 : 0) };
  if (mode !== 'training') {
    if (next.p1 >= s.target) next.winner = 1;
    else if (next.p2 >= s.target) next.winner = -1;
  }
  return next;
}

/** Standard rule: whoever was scored on gets the puck. In training it always comes back to you. */
export const serveTo = (scorer: Side, mode: Mode): Side => (mode === 'training' ? 1 : (-scorer as Side));
