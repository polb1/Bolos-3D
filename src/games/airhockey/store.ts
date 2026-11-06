import { create } from 'zustand';
import { storage } from '../../utils/storage';
import type { Difficulty } from './ai';
import type { Side } from './physics';
import { newScore, type Mode, type Score } from './rules';

export type HockeyScreen = 'menu' | 'settings' | 'controls' | 'playing' | 'paused' | 'end';
/** Online match: the host (blue, side 1) runs the simulation; the guest is red (side -1). */
export interface OnlineMatch {
  role: 'host' | 'guest';
  rival: string;
  rivalName: string;
  /** Set when the rival quits or drops. */
  rivalLeft: boolean;
}

export type PuckSpeed = 'slow' | 'normal' | 'fast';

export interface HockeySettings {
  target: number;
  difficulty: Difficulty;
  puckSpeed: PuckSpeed;
  /** Mallet responsiveness, 0.5–1.5. */
  sensitivity: number;
}

export const PUCK_SPEEDS: Record<PuckSpeed, number> = { slow: 3.5, normal: 4.5, fast: 6 };

const DEFAULTS: HockeySettings = { target: 10, difficulty: 'normal', puckSpeed: 'normal', sensitivity: 1 };

interface HockeyState {
  screen: HockeyScreen;
  mode: Mode;
  settings: HockeySettings;
  score: Score;
  /** Match time, s (updated a few times per second). */
  time: number;
  /** Last goal, for the HUD flash. */
  lastGoal: { scorer: Side; n: number } | null;
  online: OnlineMatch | null;
  setScreen(s: HockeyScreen): void;
  updateSettings(p: Partial<HockeySettings>): void;
  set(p: Partial<Pick<HockeyState, 'mode' | 'score' | 'time' | 'lastGoal' | 'online'>>): void;
}

export const useHockeyStore = create<HockeyState>((set) => ({
  screen: 'menu',
  mode: 'ai',
  settings: storage.get('hockey.v2', DEFAULTS), // v2: new 10-goal default replaces saved 7
  score: newScore(),
  time: 0,
  lastGoal: null,
  online: null,
  setScreen: (screen) => set({ screen }),
  updateSettings: (p) =>
    set((s) => {
      const settings = { ...s.settings, ...p };
      storage.set('hockey.v2', settings);
      return { settings };
    }),
  set: (p) => set(p),
}));
