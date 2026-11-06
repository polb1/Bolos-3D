import type { Place } from '../world/worldStore';

/** Something the player can walk up to and use. */
export interface Activity {
  id: string;
  name: string;
  /** Where the player must stand (floor x, z). */
  x: number;
  z: number;
  radius: number;
  /** Layer to switch to; null while the minigame is still being built. */
  place: Place | null;
  color: string;
}

/** The 3D hall's interactive spots (floor metres). Adding a game = one entry here + its module. */
export const ACTIVITIES: Activity[] = [
  { id: 'bowling', name: 'Bolera', x: -10, z: -4.6, radius: 2.2, place: 'bowling', color: '#d8f24a' },
  { id: 'pool-1', name: 'Billar', x: 7.5, z: -8.9, radius: 1.9, place: null, color: '#4fb6ff' },
  { id: 'pool-2', name: 'Billar', x: 12.5, z: -8.9, radius: 1.9, place: null, color: '#4fb6ff' },
  { id: 'airhockey-1', name: 'Air Hockey', x: 12.3, z: 0, radius: 1.8, place: 'airhockey', color: '#ff4f6e' },
  { id: 'airhockey-2', name: 'Air Hockey', x: 12.3, z: 4.4, radius: 1.8, place: 'airhockey', color: '#ff4f6e' },
  { id: 'foosball-1', name: 'Futbolín', x: -1.6, z: 1.2, radius: 1.6, place: null, color: '#7dffb0' },
  { id: 'foosball-2', name: 'Futbolín', x: 2.6, z: 1.2, radius: 1.6, place: null, color: '#7dffb0' },
  { id: 'darts', name: 'Dardos', x: -13.2, z: 2.5, radius: 2.4, place: null, color: '#ffb84f' },
  { id: 'arcade', name: 'Recreativas', x: 13.4, z: 10.1, radius: 2.4, place: null, color: '#b06bff' },
];

/** Closest activity whose radius contains the point, or null. */
export function nearestActivity(x: number, z: number): Activity | null {
  let best: Activity | null = null;
  let bestD = Infinity;
  for (const a of ACTIVITIES) {
    const d = Math.hypot(a.x - x, a.z - z);
    if (d <= a.radius && d < bestD) {
      best = a;
      bestD = d;
    }
  }
  return best;
}
