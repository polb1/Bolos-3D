/**
 * Darts: regulation board geometry, scoring and dart flight. Pure (no Three.js) so it is tested.
 * Coordinates in metres: board face in the plane z = 0 facing +z, bull at (0, BULL_Y);
 * the player throws from z > 0 towards -z.
 */

export const BULL_Y = 1.73; // regulation height of the bull
export const OCHE = 2.37; // throw line distance to the board face
/** Outer edge of the black surround (dart still sticks, scores 0). */
export const BOARD_R = 0.2123;
/** Regulation radii (m): inner bull, outer bull, treble in/out, double in/out. */
export const R = { bull: 0.00635, outer: 0.016, trebleIn: 0.099, trebleOut: 0.107, doubleIn: 0.162, doubleOut: 0.17 };
/** Clockwise from the top, as seen from the oche. */
export const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

export interface Hit {
  /** Points scored. */
  score: number;
  /** 1 single, 2 double, 3 treble (bulls: 25 = 1, 50 = 2). 0 outside the scoring area. */
  mult: number;
  /** Short label: "T20", "D16", "25", "BULL", "5", "FUERA". */
  label: string;
}

/** What a dart scores when it sticks at (x, y) on the board face. */
export function scoreAt(x: number, y: number): Hit {
  const dy = y - BULL_Y;
  const r = Math.hypot(x, dy);
  if (r <= R.bull) return { score: 50, mult: 2, label: 'BULL' };
  if (r <= R.outer) return { score: 25, mult: 1, label: '25' };
  if (r > R.doubleOut) return { score: 0, mult: 0, label: 'FUERA' };
  const a = Math.atan2(x, dy); // 0 at the top, clockwise positive
  const n = ORDER[((Math.round(a / ((Math.PI * 2) / 20)) % 20) + 20) % 20];
  if (r >= R.doubleIn) return { score: n * 2, mult: 2, label: `D${n}` };
  if (r >= R.trebleIn && r <= R.trebleOut) return { score: n * 3, mult: 3, label: `T${n}` };
  return { score: n, mult: 1, label: String(n) };
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const G = 9.81;
/** Quadratic air drag per unit mass for a steel-tip dart (~22 g, small flights), 1/m. */
const DRAG = 0.012;

export interface Flight {
  /** Sampled positions (every `dt`), last one on the board plane or the floor. */
  path: Vec3[];
  dt: number;
  /** Where it ends: stuck in the board, hit the wall around it, or dropped short on the floor. */
  end: 'board' | 'wall' | 'floor';
  at: Vec3;
  /** Velocity at impact. */
  v: Vec3;
}

/** Integrates a thrown dart from `p` with velocity `v` until it reaches the board plane or the floor. */
export function fly(p: Vec3, v: Vec3, dt = 1 / 240): Flight {
  let { x, y, z } = p;
  let { x: vx, y: vy, z: vz } = v;
  const path: Vec3[] = [{ x, y, z }];
  for (let i = 0; i < 2400; i++) {
    const s = Math.hypot(vx, vy, vz);
    vx -= DRAG * s * vx * dt;
    vy -= (G + DRAG * s * vy) * dt;
    vz -= DRAG * s * vz * dt;
    const nz = z + vz * dt;
    if (nz <= 0) {
      // Land exactly on the face.
      const k = z / (z - nz);
      x += vx * dt * k;
      y += vy * dt * k;
      z = 0;
      path.push({ x, y, z });
      const end = Math.hypot(x, y - BULL_Y) <= BOARD_R ? 'board' : 'wall';
      return { path, dt, end, at: { x, y, z }, v: { x: vx, y: vy, z: vz } };
    }
    x += vx * dt;
    y += vy * dt;
    z = nz;
    path.push({ x, y, z });
    if (y <= 0 || vz >= 0) break;
  }
  return { path, dt, end: 'floor', at: { x, y: Math.max(0, y), z }, v: { x: vx, y: vy, z: vz } };
}

/**
 * Launch velocity of a throw: `speed` m/s along the direction that would reach `aim`
 * from `from` at the comfortable speed `ideal` (the player's trained arc). Throwing
 * harder than that lands high, softer lands low — the gravity drop does it.
 */
export function launch(from: Vec3, aim: Vec3, speed: number, ideal: number, sideways = 0): Vec3 {
  // `sideways` rad, + = to the right.
  const dx = aim.x - from.x;
  const dz = aim.z - from.z;
  const d = Math.hypot(dx, dz);
  const t = d / ideal;
  let dy = aim.y - from.y + (G * t * t) / 2;
  // The trained arc already accounts for drag: refine the lift against the real flight.
  for (let i = 0; i < 3; i++) {
    const l = Math.hypot(dx, dy, dz);
    const hit = fly(from, { x: (dx / l) * ideal, y: (dy / l) * ideal, z: (dz / l) * ideal }).at;
    dy += aim.y - hit.y;
  }
  const len = Math.hypot(dx, dy, dz);
  const c = Math.cos(sideways);
  const s = Math.sin(sideways);
  // Unit direction, turned sideways around the vertical axis.
  const ux = (dx * c - dz * s) / len;
  const uz = (dz * c + dx * s) / len;
  return { x: ux * speed, y: (dy / len) * speed, z: uz * speed };
}

// ------------------------------------------------------------------ rules

export type DartsMode = '501' | 'practice';
export const DARTS_PER_TURN = 3;

export interface Turn {
  /** Points left at the start of the turn (501) or total so far (practice). */
  start: number;
  hits: Hit[];
  bust: boolean;
}

/**
 * 501 double-out: a dart that leaves 1, goes below 0, or reaches 0 without a double
 * busts the turn (score goes back to where it started).
 */
export function apply501(left: number, hit: Hit): { left: number; bust: boolean; won: boolean } {
  const next = left - hit.score;
  if (next < 0 || next === 1 || (next === 0 && hit.mult !== 2)) return { left, bust: true, won: false };
  return { left: next, bust: false, won: next === 0 };
}
