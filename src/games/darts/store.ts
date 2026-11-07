import { create } from 'zustand';
import type { DartsMode, Hit } from './physics';

export type DartsScreen = 'menu' | 'controls' | 'seek' | 'playing' | 'end';
/** Solo (501 or practice), a match against the AI, or a match against someone online. */
export type Opponent = 'solo' | 'ai' | 'online';

interface DartsState {
  screen: DartsScreen;
  mode: DartsMode;
  opponent: Opponent;
  /** AI level: 0 easy, 1 medium, 2 expert. */
  level: number;
  /** Solo: 501 points left or practice total. In a match: the thrower's points left. */
  points: number;
  /** Points at the start of this turn (a bust goes back to it). */
  turnStart: number;
  round: number;
  /** Darts of the current turn. */
  hits: Hit[];
  /** Banner over the board: last dart, bust, game shot. */
  banner: { text: string; kind: 'hit' | 'bust' | 'win' | 'miss'; n: number } | null;
  darts: number;
  /** Camera zoomed onto the rules poster. */
  poster: boolean;
  // --- matches: index 0 is always this player, 1 the rival
  names: [string, string];
  scores: [number, number];
  legs: [number, number];
  /** Whose visit it is. */
  who: 0 | 1;
  /** Match result text for the end screen. */
  result: string;
  set(p: Partial<Omit<DartsState, 'set'>>): void;
}

export const useDartsStore = create<DartsState>((set) => ({
  screen: 'menu',
  mode: '501',
  opponent: 'solo',
  level: 1,
  points: 501,
  turnStart: 501,
  round: 1,
  hits: [],
  banner: null,
  darts: 0,
  poster: false,
  names: ['Tú', 'Rival'],
  scores: [501, 501],
  legs: [0, 0],
  who: 0,
  result: '',
  set: (p) => set(p),
}));
