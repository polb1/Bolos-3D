import { create } from 'zustand';
import { DEFAULT_SETTINGS, type Settings } from '../config/settings';
import type { PlayerGame } from '../game/match';
import { currentScore, gameStats, type Roll } from '../scoring/scoring';
import { storage } from '../utils/storage';

export type Screen = 'loading' | 'menu' | 'setup' | 'playing' | 'paused' | 'end';
export type Phase = 'aim' | 'grab' | 'rolling' | 'settling' | 'sweep';

export interface Aim {
  /** Wrist spin preset, -1..1 (added to the curve of the stroke). */
  spin: number;
}

/** What the last delivery actually was, shown after the throw. */
export interface ThrowInfo {
  kmh: number;
  angleDeg: number;
  spin: number;
}

export interface Banner {
  id: number;
  title: string;
  sub: string;
  kind: string;
}

export interface Stats {
  games: number;
  best: number;
  strikes: number;
  spares: number;
}

interface State {
  screen: Screen;
  loadError: string | null;
  settings: Settings;
  stats: Stats;
  muted: boolean;
  players: PlayerGame[];
  current: number;
  phase: Phase;
  aim: Aim;
  lastThrow: ThrowInfo | null;
  banner: Banner | null;
  cine: boolean;
  /** Overhead TV clip playing. */
  tv: boolean;
  newRecord: boolean;

  setScreen(s: Screen): void;
  setLoadError(e: string): void;
  updateSettings(p: Partial<Settings>): void;
  toggleMute(): void;
  newMatch(): void;
  addRoll(player: number, roll: Roll): void;
  setCurrent(i: number): void;
  setPhase(p: Phase): void;
  setAim(a: Partial<Aim>): void;
  setLastThrow(t: ThrowInfo | null): void;
  showBanner(b: Omit<Banner, 'id'>): void;
  clearBanner(): void;
  setCine(on: boolean): void;
  setTv(on: boolean): void;
  finishMatch(): void;
}

let bannerId = 0;

export const useGameStore = create<State>((set, get) => ({
  screen: 'loading',
  loadError: null,
  settings: storage.get('settings', DEFAULT_SETTINGS),
  stats: storage.get<Stats>('stats', { games: 0, best: 0, strikes: 0, spares: 0 }),
  muted: storage.getRaw('muted', false),
  players: [],
  current: 0,
  phase: 'aim',
  aim: { spin: 0 },
  lastThrow: null,
  banner: null,
  cine: false,
  tv: false,
  newRecord: false,

  setScreen: (screen) => set({ screen }),
  setLoadError: (loadError) => set({ loadError }),
  updateSettings: (p) => {
    const settings = { ...get().settings, ...p };
    storage.set('settings', settings);
    set({ settings });
  },
  toggleMute: () => {
    const muted = !get().muted;
    storage.set('muted', muted);
    set({ muted });
  },
  newMatch: () => {
    const { settings } = get();
    const players = settings.names.slice(0, settings.players).map((name, i) => ({
      name: name.trim() || `Jugador ${i + 1}`,
      rolls: [],
    }));
    set({ players, current: 0, phase: 'aim', lastThrow: null, banner: null, cine: false, tv: false, newRecord: false, aim: { spin: 0 } });
  },
  addRoll: (player, roll) =>
    set({ players: get().players.map((p, i) => (i === player ? { ...p, rolls: [...p.rolls, roll] } : p)) }),
  setCurrent: (current) => set({ current }),
  setPhase: (phase) => set({ phase }),
  setAim: (a) => set({ aim: { ...get().aim, ...a } }),
  setLastThrow: (lastThrow) => set({ lastThrow }),
  showBanner: (b) => set({ banner: { ...b, id: ++bannerId } }),
  clearBanner: () => set({ banner: null }),
  setCine: (cine) => set({ cine }),
  setTv: (tv) => set({ tv }),
  finishMatch: () => {
    const { players, stats } = get();
    const best = Math.max(...players.map((p) => currentScore(p.rolls)));
    const totals = players.reduce(
      (acc, p) => {
        const s = gameStats(p.rolls);
        return { strikes: acc.strikes + s.strikes, spares: acc.spares + s.spares };
      },
      { strikes: 0, spares: 0 },
    );
    const next: Stats = {
      games: stats.games + 1,
      best: Math.max(stats.best, best),
      strikes: stats.strikes + totals.strikes,
      spares: stats.spares + totals.spares,
    };
    storage.set('stats', next);
    set({ stats: next, newRecord: best > stats.best && best > 0, screen: 'end', cine: false });
  },
}));
