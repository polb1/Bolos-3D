import { create } from 'zustand';

export type FoosScreen = 'menu' | 'controls' | 'playing' | 'end';

interface FoosState {
  screen: FoosScreen;
  /** AI level: 0 easy, 1 medium, 2 hard. */
  level: number;
  score: [number, number];
  banner: { text: string; mine: boolean; n: number } | null;
  result: string;
  set(p: Partial<Omit<FoosState, 'set'>>): void;
}

export const useFoosStore = create<FoosState>((set) => ({
  screen: 'menu',
  level: 1,
  score: [0, 0],
  banner: null,
  result: '',
  set: (p) => set(p),
}));
