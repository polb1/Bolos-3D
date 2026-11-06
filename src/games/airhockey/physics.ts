/**
 * Air hockey physics in the table plane (x across, z along; metres, m/s).
 * Pure TypeScript with no rendering, so it can be tested and stepped headless.
 * Side 1 plays the +z half and defends the goal at z = +L/2; side -1 the opposite.
 */

export const TABLE = {
  width: 1.0, // playing surface of a 7 ft table, inside the rails
  length: 2.0,
  goal: 0.26, // goal slot width
  puckR: 0.041, // 3.25" puck
  malletR: 0.048, // ~3.8" mallet
} as const;

export type Side = 1 | -1;

export interface Tuning {
  maxPuckSpeed: number;
  /** Normal restitution of the rails (plastic puck on rubber-faced rails). */
  wallE: number;
  /** Fraction of tangential speed kept on a rail hit. */
  wallGrip: number;
  malletE: number;
  /** Exponential drag of the air cushion, 1/s. */
  airDrag: number;
}

export const DEFAULT_TUNING: Tuning = { maxPuckSpeed: 11, wallE: 0.86, wallGrip: 0.97, malletE: 0.78, airDrag: 0.06 };

export interface Puck {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** False after a goal until the puck is served again. */
  live: boolean;
}

export interface Mallet {
  side: Side;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Where the hand wants it; the mallet chases it within maxSpeed/maxAccel. */
  tx: number;
  tz: number;
  maxSpeed: number;
  maxAccel: number;
  active: boolean;
}

export type HockeyEvent =
  | { type: 'hit' | 'wall'; force: number; x: number; z: number }
  | { type: 'goal'; scorer: Side };

const H = 1 / 600; // substep: at 14 m/s the puck moves 2.3 cm, well under its radius

export function newMallet(side: Side): Mallet {
  const z = side * (TABLE.length / 2 - 0.2);
  return { side, x: 0, z, vx: 0, vz: 0, tx: 0, tz: z, maxSpeed: 12, maxAccel: 300, active: true };
}

/** Allowed area for a mallet's centre: its own half, inside the rails. */
export function malletBounds(side: Side) {
  const r = TABLE.malletR;
  const xMax = TABLE.width / 2 - r;
  const far = TABLE.length / 2 - r;
  return side === 1 ? { xMin: -xMax, xMax, zMin: r, zMax: far } : { xMin: -xMax, xMax, zMin: -far, zMax: -r };
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class HockeyPhysics {
  puck: Puck = { x: 0, z: 0, vx: 0, vz: 0, live: true };
  mallets: [Mallet, Mallet] = [newMallet(1), newMallet(-1)];
  tuning: Tuning;
  events: HockeyEvent[] = [];
  private acc = 0;

  constructor(tuning: Partial<Tuning> = {}) {
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
  }

  /** Puts the puck at rest in front of `side`'s mallet. */
  serve(side: Side, x = 0) {
    Object.assign(this.puck, { x, z: side * 0.45, vx: 0, vz: 0, live: true });
  }

  /** Advances real time `dt` in fixed substeps; returns and clears events. */
  step(dt: number): HockeyEvent[] {
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= H) {
      this.substep(H);
      this.acc -= H;
    }
    const ev = this.events;
    this.events = [];
    return ev;
  }

  private moveMallet(m: Mallet, h: number) {
    const b = malletBounds(m.side);
    const tx = clamp(m.tx, b.xMin, b.xMax);
    const tz = clamp(m.tz, b.zMin, b.zMax);
    const dx = tx - m.x;
    const dz = tz - m.z;
    const d = Math.hypot(dx, dz);
    // "Arrive": fastest speed that can still stop at the target with maxAccel.
    const speed = Math.min(m.maxSpeed, Math.sqrt(2 * m.maxAccel * d), d / h);
    const wx = d > 1e-9 ? (dx / d) * speed : 0;
    const wz = d > 1e-9 ? (dz / d) * speed : 0;
    let ax = (wx - m.vx) / h;
    let az = (wz - m.vz) / h;
    const a = Math.hypot(ax, az);
    if (a > m.maxAccel) {
      ax *= m.maxAccel / a;
      az *= m.maxAccel / a;
    }
    m.vx += ax * h;
    m.vz += az * h;
    m.x += m.vx * h;
    m.z += m.vz * h;
    if (m.x < b.xMin || m.x > b.xMax) (m.x = clamp(m.x, b.xMin, b.xMax)), (m.vx = 0);
    if (m.z < b.zMin || m.z > b.zMax) (m.z = clamp(m.z, b.zMin, b.zMax)), (m.vz = 0);
  }

  private substep(h: number) {
    for (const m of this.mallets) if (m.active) this.moveMallet(m, h);
    const p = this.puck;
    if (!p.live) return;
    const t = this.tuning;
    const R = TABLE.puckR;

    const drag = 1 - t.airDrag * h;
    p.vx *= drag;
    p.vz *= drag;
    p.x += p.vx * h;
    p.z += p.vz * h;

    for (const m of this.mallets) if (m.active) this.hitMallet(m);
    this.hitRails();
    // A puck squeezed against a rail must not end up inside the mallet: the hand gives way.
    for (const m of this.mallets) {
      if (!m.active) continue;
      const dx = m.x - p.x;
      const dz = m.z - p.z;
      const d = Math.hypot(dx, dz);
      const min = R + TABLE.malletR;
      if (d < min && d > 1e-9) {
        m.x = p.x + (dx / d) * min;
        m.z = p.z + (dz / d) * min;
      }
    }

    const sp = Math.hypot(p.vx, p.vz);
    if (sp > t.maxPuckSpeed) {
      p.vx *= t.maxPuckSpeed / sp;
      p.vz *= t.maxPuckSpeed / sp;
    }

    const line = TABLE.length / 2 + R; // fully over the goal line
    if (p.z > line) this.goal(-1);
    else if (p.z < -line) this.goal(1);
  }

  private goal(scorer: Side) {
    this.puck.live = false;
    this.puck.vx = this.puck.vz = 0;
    this.events.push({ type: 'goal', scorer });
  }

  /** Mallet is hand-driven (effectively infinite mass): reflect the relative velocity. */
  private hitMallet(m: Mallet) {
    const p = this.puck;
    const dx = p.x - m.x;
    const dz = p.z - m.z;
    const d = Math.hypot(dx, dz);
    const min = TABLE.puckR + TABLE.malletR;
    if (d >= min) return;
    const nx = d > 1e-9 ? dx / d : 0;
    const nz = d > 1e-9 ? dz / d : -m.side;
    p.x = m.x + nx * min;
    p.z = m.z + nz * min;
    const rel = (p.vx - m.vx) * nx + (p.vz - m.vz) * nz;
    if (rel >= 0) return;
    const j = -(1 + this.tuning.malletE) * rel;
    p.vx += j * nx;
    p.vz += j * nz;
    this.events.push({ type: 'hit', force: -rel, x: p.x, z: p.z });
  }

  private hitRails() {
    const p = this.puck;
    const t = this.tuning;
    const R = TABLE.puckR;
    const W = TABLE.width / 2;
    const L = TABLE.length / 2;
    const G = TABLE.goal / 2;
    const inSlot = Math.abs(p.z) > L; // inside a goal mouth, past the end rail

    const xLim = inSlot ? G - R : W - R;
    if (p.x < -xLim || p.x > xLim) {
      const s = Math.sign(p.x);
      p.x = s * xLim;
      if (p.vx * s > 0) {
        this.events.push({ type: 'wall', force: Math.abs(p.vx), x: p.x, z: p.z });
        p.vx = -p.vx * t.wallE;
        p.vz *= t.wallGrip;
      }
    }

    if (Math.abs(p.x) > G && Math.abs(p.z) > L - R) {
      const s = Math.sign(p.z);
      p.z = s * (L - R);
      if (p.vz * s > 0) {
        this.events.push({ type: 'wall', force: Math.abs(p.vz), x: p.x, z: p.z });
        p.vz = -p.vz * t.wallE;
        p.vx *= t.wallGrip;
      }
    }

    // Goal posts: the corners of each mouth act as round points.
    for (const sx of [-G, G])
      for (const sz of [-L, L]) {
        const dx = p.x - sx;
        const dz = p.z - sz;
        const d = Math.hypot(dx, dz);
        if (d >= R || d < 1e-9) continue;
        const nx = dx / d;
        const nz = dz / d;
        p.x = sx + nx * R;
        p.z = sz + nz * R;
        const vn = p.vx * nx + p.vz * nz;
        if (vn < 0) {
          p.vx -= (1 + t.wallE) * vn * nx;
          p.vz -= (1 + t.wallE) * vn * nz;
          this.events.push({ type: 'wall', force: -vn, x: p.x, z: p.z });
        }
      }
  }
}
