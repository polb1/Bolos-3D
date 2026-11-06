import { TABLE, type HockeyPhysics, type Mallet } from './physics';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface AIProfile {
  /** Perception delay: it acts on where the puck was this many seconds ago. */
  reaction: number;
  /** How often it re-plans, s. */
  think: number;
  maxSpeed: number;
  maxAccel: number;
  /** Aim error (m) at the intercept / shot. */
  noise: number;
  /** Rail bounces it can follow when predicting a shot. */
  bounces: number;
  /** Highest puck speed in its half at which it goes on the attack. */
  attackBelow: number;
  /** Chance of trying a bank shot off a rail instead of a straight one. */
  bank: number;
  /** Distance from its end rail where it waits; further out leaves the goal open. */
  depth: number;
}

export const AI_PROFILES: Record<Difficulty, AIProfile> = {
  easy: { reaction: 0.34, think: 0.14, maxSpeed: 2.2, maxAccel: 12, noise: 0.1, bounces: 0, attackBelow: 0.7, bank: 0, depth: 0.42 },
  normal: { reaction: 0.2, think: 0.08, maxSpeed: 3.8, maxAccel: 28, noise: 0.05, bounces: 1, attackBelow: 1.6, bank: 0.2, depth: 0.26 },
  hard: { reaction: 0.08, think: 0.04, maxSpeed: 6.5, maxAccel: 70, noise: 0.015, bounces: 3, attackBelow: 2.6, bank: 0.4, depth: 0.19 },
};

interface Seen {
  t: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
}

/**
 * Where a puck moving in a straight line crosses `zLine`, folding rail bounces.
 * Returns null if it isn't heading there or needs more bounces than `maxBounces`.
 */
export function predictX(x: number, z: number, vx: number, vz: number, zLine: number, maxBounces: number) {
  if (Math.abs(vz) < 1e-6) return null;
  const t = (zLine - z) / vz;
  if (t <= 0) return null;
  const lim = TABLE.width / 2 - TABLE.puckR;
  const span = 2 * lim;
  let u = x + vx * t + lim; // 0..span when no bounce
  const bounces = Math.floor(Math.abs(u) / span) + (u < 0 ? 1 : 0);
  if (bounces > maxBounces) return null;
  u = ((u % (2 * span)) + 2 * span) % (2 * span);
  if (u > span) u = 2 * span - u;
  return { x: u - lim, t };
}

/**
 * Rival for one mallet. It only uses what it has seen of the puck (delayed by its
 * reaction time) and extrapolates the trajectory; it never reads the future.
 */
export class HockeyAI {
  private seen: Seen[] = [];
  private t = 0;
  private nextThink = 0;
  private aimX = 0;
  private plan: 'home' | 'defend' | 'attack' = 'home';
  private rng: () => number;

  constructor(
    readonly mallet: Mallet,
    public profile: AIProfile,
    rng: () => number = Math.random,
  ) {
    this.rng = rng;
    mallet.maxSpeed = profile.maxSpeed;
    mallet.maxAccel = profile.maxAccel;
  }

  setProfile(p: AIProfile) {
    this.profile = p;
    this.mallet.maxSpeed = p.maxSpeed;
    this.mallet.maxAccel = p.maxAccel;
  }

  reset() {
    this.seen = [];
    this.plan = 'home';
  }

  private gauss() {
    return (this.rng() + this.rng() + this.rng() - 1.5) * 1.41;
  }

  update(dt: number, ph: HockeyPhysics) {
    this.t += dt;
    const p = ph.puck;
    this.seen.push({ t: this.t, x: p.x, z: p.z, vx: p.vx, vz: p.vz });
    while (this.seen.length > 2 && this.seen[1].t <= this.t - this.profile.reaction) this.seen.shift();
    if (this.t < this.nextThink) return;
    this.nextThink = this.t + this.profile.think;
    if (!p.live) return this.home(this.seen[0]);
    this.decide(this.seen[0]);
  }

  private home(o: Seen | undefined) {
    const m = this.mallet;
    const s = m.side;
    m.tx = (o?.x ?? 0) * 0.3;
    m.tz = s * (TABLE.length / 2 - this.profile.depth);
    this.plan = 'home';
  }

  private decide(o: Seen) {
    const m = this.mallet;
    const s = m.side;
    const P = this.profile;
    const L = TABLE.length / 2;
    const mine = o.z * s > 0;
    const speed = Math.hypot(o.vx, o.vz);
    const towardMe = o.vz * s > 0.25;

    // Slow puck in my half: go and shoot it.
    if (mine && (speed < P.attackBelow || !towardMe)) return this.attack(o);

    if (towardMe) {
      const zDef = s * (L - Math.min(this.profile.depth, 0.3));
      // Meet it earlier if it's already deep in my half.
      const zLine = o.z * s > L - 0.17 ? o.z : zDef;
      const hit = predictX(o.x, o.z, o.vx, o.vz, zLine, P.bounces);
      if (this.plan !== 'defend' || hit) this.aimX = (hit ? hit.x : o.x * 0.5) + this.gauss() * P.noise;
      this.plan = 'defend';
      m.tx = this.aimX;
      m.tz = zLine;
      return;
    }
    this.home(o);
  }

  private attack(o: Seen) {
    const m = this.mallet;
    const s = m.side;
    const P = this.profile;
    const L = TABLE.length / 2;
    if (this.plan !== 'attack') {
      // Pick a target: the far goal, or its mirror image behind a rail for a bank shot.
      const bank = this.rng() < P.bank ? (this.rng() < 0.5 ? -1 : 1) : 0;
      this.aimX = bank * (TABLE.width - 2 * TABLE.puckR) + this.gauss() * P.noise * 2;
      this.plan = 'attack';
    }
    // Lead the puck slightly by its observed motion.
    const px = o.x + o.vx * 0.05;
    const pz = o.z + o.vz * 0.05;
    let dx = this.aimX - px;
    let dz = -s * L - pz;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const reach = TABLE.puckR + TABLE.malletR;
    const bx = px - dx * (reach + 0.04);
    const bz = pz - dz * (reach + 0.04);
    const behindOk = bz * s < L - TABLE.malletR; // room to get behind it
    const aligned = Math.hypot(m.x - bx, m.z - bz) < 0.015 && Math.hypot(m.vx, m.vz) < 0.6;
    const inFront = (m.z - pz) * s < 0; // mallet is on the shooting side of the puck
    if (!behindOk || aligned) {
      // Strike through the puck.
      m.tx = px + dx * 0.3;
      m.tz = pz + dz * 0.3;
    } else if (inFront) {
      // Walk around the puck rather than knocking it into my own goal.
      const side = m.x < px ? -1 : 1;
      m.tx = px + side * (reach + 0.06);
      m.tz = bz;
    } else {
      m.tx = bx;
      m.tz = bz;
    }
  }
}
