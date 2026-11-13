/**
 * Pool (8-ball): table geometry and ball physics in 2D, pure so it is tested.
 * Coordinates in metres on the playing surface: x along the length (head/break side at -x),
 * z across. Only + - * / and Math.sqrt are used, which are exactly rounded in every JS
 * engine, so two browsers simulating the same shot get the same table bit for bit.
 */

/** 8-foot bar table playing surface and regulation balls (57.15 mm). */
export const L = 2.24;
export const W = 1.12;
export const R = 0.028575;
/** Pocket mouths: corner gap measured along each rail, side gap either side of the middle. */
export const CORNER = 0.075;
export const SIDE = 0.06;
export const HEAD_X = -L / 4;
export const FOOT_X = L / 4;
/** Rolling deceleration on cloth (m/s²), cushion and ball-ball restitution. */
export const DECEL = 0.16;
export const CUSHION_E = 0.72;
export const BALL_E = 0.94;
export const MAX_SPEED = 6.5;
const STEP = 1 / 600;
const REST = 0.004; // m/s: below this a ball has stopped

export interface Ball {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Pocketed. */
  in: boolean;
}

/** What happened during a shot (for the rules). */
export interface ShotEvents {
  /** First ball the cue ball touched, or null. */
  first: number | null;
  /** Balls pocketed, in order (0 = the cue ball). */
  pocketed: number[];
  /** A ball hit a cushion after the cue ball's first contact. */
  rail: boolean;
}

/** Pocket centres (drawn holes, and where the AI aims). */
export const POCKETS = [
  { x: -L / 2, z: -W / 2 }, { x: 0, z: -W / 2 - 0.01 }, { x: L / 2, z: -W / 2 },
  { x: -L / 2, z: W / 2 }, { x: 0, z: W / 2 + 0.01 }, { x: L / 2, z: W / 2 },
];

/** Solids 1-7, 8, stripes 9-15. */
export const groupOf = (id: number): 'solid' | 'stripe' | 'eight' | 'cue' => (id === 0 ? 'cue' : id === 8 ? 'eight' : id < 8 ? 'solid' : 'stripe');

/** Racked table: cue ball on the head spot, triangle apex on the foot spot. `rnd` shuffles the rack. */
export function rack(rnd: () => number): Ball[] {
  const balls: Ball[] = Array.from({ length: 16 }, () => ({ x: 0, z: 0, vx: 0, vz: 0, in: false }));
  balls[0].x = HEAD_X;
  // 8 in the middle of the third row; the back corners one solid, one stripe; the rest shuffled.
  const rest = [2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const corners = rnd() < 0.5 ? [1, 9] : [9, 1];
  const gap = 2 * R + 0.0004;
  let k = 0;
  for (let row = 0; row < 5; row++)
    for (let j = 0; j <= row; j++) {
      const id = row === 2 && j === 1 ? 8 : row === 4 && j === 0 ? corners[0] : row === 4 && j === 4 ? corners[1] : rest[k++];
      balls[id].x = FOOT_X + row * gap * 0.8660254;
      balls[id].z = (j - row / 2) * gap;
    }
  return balls;
}

export const clone = (b: Ball[]): Ball[] => b.map((o) => ({ ...o }));
export const moving = (balls: Ball[]) => balls.some((b) => !b.in && (b.vx !== 0 || b.vz !== 0));

/** Advances the table by one fixed step, recording events. */
export function step(balls: Ball[], ev: ShotEvents, hit?: (kind: 'ball' | 'rail' | 'pocket', speed: number) => void) {
  const dt = STEP;
  for (let i = 0; i < 16; i++) {
    const b = balls[i];
    if (b.in || (b.vx === 0 && b.vz === 0)) continue;
    const s = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
    const ns = s - DECEL * dt;
    if (ns < REST) {
      b.vx = b.vz = 0;
      continue;
    }
    b.vx *= ns / s;
    b.vz *= ns / s;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    // Cushions, except across a pocket mouth: there the ball drops.
    const ex = L / 2 - R;
    const ez = W / 2 - R;
    if (b.x > ex || b.x < -ex) {
      if (b.z > W / 2 - CORNER || b.z < -(W / 2 - CORNER)) pocket(b, i, ev), hit?.('pocket', s);
      else {
        hit?.('rail', Math.abs(b.vx));
        b.x = b.x > 0 ? 2 * ex - b.x : -2 * ex - b.x;
        b.vx = -b.vx * CUSHION_E;
        b.vz *= 0.94;
        if (ev.first !== null) ev.rail = true;
      }
    }
    if (!b.in && (b.z > ez || b.z < -ez)) {
      if (b.x > L / 2 - CORNER || b.x < -(L / 2 - CORNER) || (b.x < SIDE && b.x > -SIDE)) pocket(b, i, ev), hit?.('pocket', s);
      else {
        hit?.('rail', Math.abs(b.vz));
        b.z = b.z > 0 ? 2 * ez - b.z : -2 * ez - b.z;
        b.vz = -b.vz * CUSHION_E;
        b.vx *= 0.94;
        if (ev.first !== null) ev.rail = true;
      }
    }
  }
  const D = 2 * R;
  for (let i = 0; i < 16; i++) {
    const a = balls[i];
    if (a.in) continue;
    for (let j = i + 1; j < 16; j++) {
      const b = balls[j];
      if (b.in) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= D * D || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      // Push apart, then exchange the normal velocity (equal masses).
      const push = (D - d) / 2;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
      const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (vn <= 0) continue;
      hit?.('ball', vn);
      const j2 = ((1 + BALL_E) / 2) * vn;
      a.vx -= j2 * nx;
      a.vz -= j2 * nz;
      b.vx += j2 * nx;
      b.vz += j2 * nz;
      if (i === 0 && ev.first === null) ev.first = j;
    }
  }
}

function pocket(b: Ball, id: number, ev: ShotEvents) {
  b.in = true;
  b.vx = b.vz = 0;
  ev.pocketed.push(id);
}

/** Simulates a whole shot (cue ball sent at `v`) until everything stops. Mutates `balls`. */
export function simulate(balls: Ball[], v: { x: number; z: number }): ShotEvents {
  const ev: ShotEvents = { first: null, pocketed: [], rail: false };
  balls[0].vx = v.x;
  balls[0].vz = v.z;
  for (let n = 0; n < 600 * 40 && moving(balls); n++) step(balls, ev);
  for (const b of balls) b.vx = b.vz = 0;
  return ev;
}

/** Whether the cue ball can be placed at (x, z): on the table, clear of the other balls. */
export function freeSpot(balls: Ball[], x: number, z: number, kitchen: boolean, skip = 0): boolean {
  if (x < -L / 2 + R || x > (kitchen ? HEAD_X : L / 2 - R) || z < -W / 2 + R || z > W / 2 - R) return false;
  return balls.every((b, i) => i === skip || b.in || (b.x - x) * (b.x - x) + (b.z - z) * (b.z - z) > 4 * R * R * 1.02);
}

/** Puts a pocketed ball back: on `x0`, or the nearest free point behind it along the length. */
export function respot(balls: Ball[], id: number, x0: number) {
  const b = balls[id];
  for (let k = 0; k < 200; k++) {
    for (const x of [x0 + k * 0.01, x0 - k * 0.01]) {
      if (freeSpot(balls, x, 0, false, id)) return Object.assign(b, { x, z: 0, vx: 0, vz: 0, in: false });
    }
  }
}
