import { create } from 'zustand';
import { storage } from '../utils/storage';

/** Which layer is live: the arcade hall or one of its activities. */
export type Place = 'world' | 'bowling' | 'airhockey';
export type WorldScreen = 'loading' | 'title' | 'character' | 'controls' | 'stats' | 'explore' | 'paused';

export interface Outfit {
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
}

export const OUTFITS: Array<{ name: string; outfit: Outfit }> = [
  { name: 'Clásico', outfit: { skin: '#e0ac86', shirt: '#d8f24a', pants: '#25324f', hair: '#2b1d14' } },
  { name: 'Neón', outfit: { skin: '#c68a62', shirt: '#ff4fd8', pants: '#1a1a2e', hair: '#111111' } },
  { name: 'Retro', outfit: { skin: '#f1c7a5', shirt: '#4fb6ff', pants: '#6b4b2a', hair: '#c9772f' } },
  { name: 'Noche', outfit: { skin: '#8d5a3b', shirt: '#2a2a35', pants: '#40404c', hair: '#0b0b0b' } },
];

interface WorldState {
  place: Place;
  screen: WorldScreen;
  /** Activity the player is close enough to use. */
  nearby: string | null;
  /** Fade-to-black overlay for transitions. */
  fade: boolean;
  toast: string | null;
  outfit: number;
  setScreen(s: WorldScreen): void;
  setPlace(p: Place): void;
  setNearby(id: string | null): void;
  setFade(on: boolean): void;
  showToast(t: string): void;
  setOutfit(i: number): void;
}

let toastTimer = 0;

export const useWorldStore = create<WorldState>((set) => ({
  place: 'world',
  screen: 'loading',
  nearby: null,
  fade: false,
  toast: null,
  outfit: storage.getRaw('outfit', 0),
  setScreen: (screen) => set({ screen }),
  setPlace: (place) => set({ place }),
  setNearby: (nearby) => set({ nearby }),
  setFade: (fade) => set({ fade }),
  showToast: (toast) => {
    clearTimeout(toastTimer);
    set({ toast });
    toastTimer = window.setTimeout(() => set({ toast: null }), 2200);
  },
  setOutfit: (outfit) => {
    storage.set('outfit', outfit);
    set({ outfit });
  },
}));
