import { create } from 'zustand';
import { COIN_REWARD, COIN_THRESHOLD, DEFAULT_SETTINGS, type Settings } from '../config/settings';
import { LADDER } from '../game/ai';
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
  coins: number;
  /** Shop items bought (ball colours and lane woods share one id space). */
  owned: string[];
  /** Coins won in the match that just ended. */
  earned: number;
  /** Stepladder round against the AI (0 = vs #3 seed … 2 = final), null outside the tournament. */
  ladder: number | null;
  ladderResult: 'win' | 'lose' | 'champion' | null;

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
  /** Spends coins on a shop item; false if already owned or unaffordable. */
  buy(id: string, price: number): boolean;
  setLadder(round: number | null): void;
}

let bannerId = 0;
const LADDER_WIN_COINS = 15;
const LADDER_TITLE_COINS = 60;

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
  coins: storage.getRaw('coins', 0),
  owned: storage.getRaw<string[]>('owned', []),
  earned: 0,
  ladder: null,
  ladderResult: null,

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
    const { settings, ladder } = get();
    const players: PlayerGame[] =
      ladder === null
        ? settings.names.slice(0, settings.players).map((name, i) => ({ name: name.trim() || `Jugador ${i + 1}`, rolls: [] }))
        : [
            { name: settings.names[0].trim() || 'Jugador 1', rolls: [] },
            { name: LADDER[ladder].name, rolls: [], ai: ladder },
          ];
    set({ ladderResult: null,  players, current: 0, phase: 'aim', lastThrow: null, banner: null, cine: false, tv: false, newRecord: false, aim: { spin: 0 } });
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
    const best = Math.max(...players.filter((p) => p.ai === undefined).map((p) => currentScore(p.rolls)));
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
    const humans = players.filter((p) => p.ai === undefined);
    let earned = humans.filter((p) => currentScore(p.rolls) > COIN_THRESHOLD).length * COIN_REWARD;
    const { ladder } = get();
    let ladderResult: State['ladderResult'] = null;
    if (ladder !== null) {
      // shortcut: a tie goes to the higher seed instead of a 9th-10th frame roll-off.
      const won = currentScore(players[0].rolls) > currentScore(players[1].rolls);
      ladderResult = !won ? 'lose' : ladder === LADDER.length - 1 ? 'champion' : 'win';
      earned += ladderResult === 'champion' ? LADDER_TITLE_COINS : won ? LADDER_WIN_COINS : 0;
    }
    const coins = get().coins + earned;
    storage.set('coins', coins);
    set({ stats: next, newRecord: best > stats.best && best > 0, screen: 'end', cine: false, coins, earned, ladderResult });
  },
  setLadder: (ladder) => set({ ladder }),
  buy: (id, price) => {
    const { coins, owned } = get();
    if (owned.includes(id) || coins < price) return false;
    const next = { coins: coins - price, owned: [...owned, id] };
    storage.set('coins', next.coins);
    storage.set('owned', next.owned);
    set(next);
    return true;
  },
}));
