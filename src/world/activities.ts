import type { Place } from './worldStore';

/** Something the player can walk up to and use. Coordinates are map tiles. */
export interface Activity {
  id: string;
  name: string;
  /** Where the player must stand (tile x, y). */
  x: number;
  y: number;
  radius: number;
  /** Layer to switch to; null while the minigame is still being built. */
  place: Place | null;
  color: string;
}

/** The hall's interactive spots. Adding a game = one entry here + its module. */
export const ACTIVITIES: Activity[] = [
  { id: 'bowling', name: 'Bolera', x: 9, y: 9, radius: 2.4, place: 'bowling', color: '#d8f24a' },
  { id: 'pool-1', name: 'Billar', x: 26, y: 7.3, radius: 1.8, place: 'pool', color: '#4fb6ff' },
  { id: 'pool-2', name: 'Billar', x: 36, y: 7.3, radius: 1.8, place: 'pool', color: '#4fb6ff' },
  { id: 'darts', name: 'Dardos', x: 5.5, y: 16.5, radius: 2.4, place: 'darts', color: '#ffb84f' },
  { id: 'airhockey-1', name: 'Air Hockey', x: 35, y: 15.8, radius: 1.3, place: 'airhockey', color: '#ff4f6e' },
  { id: 'airhockey-2', name: 'Air Hockey', x: 35, y: 20, radius: 1.3, place: 'airhockey', color: '#ff4f6e' },
  { id: 'foosball-1', name: 'Futbolín', x: 40, y: 15.8, radius: 1.3, place: null, color: '#7dffb0' },
  { id: 'foosball-2', name: 'Futbolín', x: 40, y: 20, radius: 1.3, place: null, color: '#7dffb0' },
  { id: 'arcade', name: 'Recreativas', x: 37.5, y: 24.6, radius: 2.4, place: 'arcade', color: '#b06bff' },
];

/** Closest activity whose radius contains the point, or null. */
export function nearestActivity(x: number, y: number): Activity | null {
  let best: Activity | null = null;
  let bestD = Infinity;
  for (const a of ACTIVITIES) {
    const d = Math.hypot(a.x - x, a.y - y);
    if (d <= a.radius && d < bestD) {
      best = a;
      bestD = d;
    }
  }
  return best;
}
