import { create } from 'zustand';
import type { DartsMode, Hit } from './physics';

export type DartsScreen = 'menu' | 'controls' | 'playing' | 'end';

interface DartsState {
  screen: DartsScreen;
  mode: DartsMode;
  /** 501: points left; practice: total scored. */
  points: number;
  /** Points at the start of this turn (a bust goes back to it). */
  turnStart: number;
  round: number;
  /** Darts of the current turn. */
  hits: Hit[];
  /** Banner over the board: last dart, bust, game shot. */
  banner: { text: string; kind: 'hit' | 'bust' | 'win' | 'miss'; n: number } | null;
  darts: number;
  set(p: Partial<Omit<DartsState, 'set'>>): void;
}

export const useDartsStore = create<DartsState>((set) => ({
  screen: 'menu',
  mode: '501',
  points: 501,
  turnStart: 501,
  round: 1,
  hits: [],
  banner: null,
  darts: 0,
  set: (p) => set(p),
}));
