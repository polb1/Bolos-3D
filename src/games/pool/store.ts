import { create } from 'zustand';
import type { PoolState } from './rules';

export type PoolScreen = 'menu' | 'controls' | 'seek' | 'playing' | 'end';
/** Against the AI, online, two people on this device, or alone (practice). */
export type PoolOpponent = 'ai' | 'online' | 'local' | 'solo';
export type PoolCam = '3d' | 'top';

interface PoolStore {
  screen: PoolScreen;
  opponent: PoolOpponent;
  /** AI level: 0 easy, 1 medium, 2 expert. */
  level: number;
  /** Player 0 and 1 names; `me` is the player on this device (online), null if both are. */
  names: [string, string];
  me: 0 | 1 | null;
  /** Rules state after the last shot (the table as it stands). */
  game: PoolState | null;
  /** Balls are rolling. */
  rolling: boolean;
  cam: PoolCam;
  /** Cue pulled back (0..1) for the power meter. */
  power: number;
  banner: { text: string; n: number } | null;
  result: string;
  set(p: Partial<Omit<PoolStore, 'set'>>): void;
}

export const usePoolStore = create<PoolStore>((set) => ({
  screen: 'menu',
  opponent: 'ai',
  level: 1,
  names: ['Tú', 'Rival'],
  me: 0,
  game: null,
  rolling: false,
  cam: '3d',
  power: 0,
  banner: null,
  result: '',
  set: (p) => set(p),
}));
