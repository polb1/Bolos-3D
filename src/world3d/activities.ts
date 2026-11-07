import type { Place } from '../world/worldStore';


/** Air hockey table centres (long side along x). */
export const HOCKEY_TABLES = [
  { x: 13.3, z: 0 },
  { x: 13.3, z: 4.4 },
];

/** A circle at one end of a table: blue = home (hosts the match), red = visitor. */
export interface Spot {
  key: string;
  table: number;
  side: 'blue' | 'red';
  x: number;
  z: number;
}

export const SPOT_R = 0.55;
export const SPOTS: Spot[] = HOCKEY_TABLES.flatMap((t, table) => [
  { key: `${table}b`, table, side: 'blue' as const, x: t.x - 1.65, z: t.z },
  { key: `${table}r`, table, side: 'red' as const, x: t.x + 1.65, z: t.z },
]);

export const spotAt = (x: number, z: number) => SPOTS.find((s) => Math.hypot(s.x - x, s.z - z) <= SPOT_R) ?? null;

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
  { id: 'bowling', name: 'Bolera', x: -10, z: -4.6, radius: 2.2, place: 'bowling', color: '#e8b04a' },
  { id: 'pool-1', name: 'Billar', x: 7.5, z: -8.9, radius: 1.9, place: null, color: '#7fb0a0' },
  { id: 'pool-2', name: 'Billar', x: 12.5, z: -8.9, radius: 1.9, place: null, color: '#7fb0a0' },
  { id: 'airhockey-1', name: 'Air Hockey · contra la IA', x: 13.3, z: 1.05, radius: 0.75, place: 'airhockey', color: '#d9705a' },
  { id: 'airhockey-2', name: 'Air Hockey · contra la IA', x: 13.3, z: 5.45, radius: 0.75, place: 'airhockey', color: '#d9705a' },
  { id: 'foosball-1', name: 'Futbolín', x: -1.6, z: 1.2, radius: 1.6, place: null, color: '#8fb86a' },
  { id: 'foosball-2', name: 'Futbolín', x: 2.6, z: 1.2, radius: 1.6, place: null, color: '#8fb86a' },
  { id: 'darts', name: 'Dardos', x: -13.2, z: 2.5, radius: 2.4, place: 'darts', color: '#e0a050' },
  { id: 'arcade', name: 'Recreativas', x: 13.4, z: 10.1, radius: 2.4, place: null, color: '#b08ac0' },
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
