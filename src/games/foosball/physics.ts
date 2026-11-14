/**
 * Foosball table as pure 2D physics (top view). x runs along the table, z across it.
 * Team 0 defends the goal at -x and attacks +x; team 1 the other way round.
 * Rods slide along z and spin to kick; the ball rolls with a little friction.
 */
export const L = 1.2; // playing field length (m)
export const W = 0.68; // width
export const GOAL = 0.2; // goal mouth width
export const BALL_R = 0.017;
export const GOALS_TO_WIN = 5;
const FOOT_X = 0.012; // half thickness of a figure's foot along x
const FOOT_Z = 0.017; // half width across
export const KICK_T = 0.22; // seconds for a full swing
const KICK_SPEED = 2.4;
export const REACH = 0.03; // extra reach of a swinging foot, front or back
const STEP = 1 / 240;

/** From the team 0 goal: goalie, defence, rival attack, midfield, rival midfield, attack, rival defence, rival goalie. */
const LAYOUT: Array<[team: 0 | 1, n: number, gap: number]> = [
  [0, 1, 0], [0, 2, 0.24], [1, 3, 0.2], [0, 5, 0.12], [1, 5, 0.12], [0, 3, 0.2], [1, 2, 0.24], [1, 1, 0],
];

export interface Rod {
  x: number;
  team: 0 | 1;
  /** z of each figure with the rod centred. */
  base: number[];
  range: number;
  slide: number;
  /** z velocity of the rod (from the last step). */
  vel: number;
  /** Seconds into the current kick, or -1. */
  kick: number;
  angle: number;
}

export const dir = (team: 0 | 1) => (team ? -1 : 1);

export class Table {
  rods: Rod[];
  ball = { x: 0, z: 0, vx: 0, vz: 0 };
  score: [number, number] = [0, 0];
  /** Set on the step a goal goes in. */
  goal: 0 | 1 | null = null;
  private still = 0;

  constructor(private rnd: () => number = Math.random) {
    this.rods = LAYOUT.map(([team, n, gap], i) => ({
      x: -L / 2 + 0.075 + (i * (L - 0.15)) / 7,
      team,
      base: Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * gap),
      range: n === 1 ? GOAL / 2 + 0.02 : (W - (n - 1) * gap) / 2 - 0.03,
      slide: 0,
      vel: 0,
      kick: -1,
      angle: 0,
    }));
  }

  serve() {
    this.ball = { x: 0, z: (this.rnd() - 0.5) * 0.3, vx: (this.rnd() - 0.5) * 0.2, vz: (this.rnd() < 0.5 ? -1 : 1) * (0.15 + this.rnd() * 0.15) };
    this.goal = null;
  }

  /** Moves a rod towards a slide value (clamped to its range) at up to `speed` m/s. */
  drive(rod: Rod, target: number, speed: number, dt: number) {
    const t = Math.min(Math.max(target, -rod.range), rod.range);
    const d = Math.min(Math.max(t - rod.slide, -speed * dt), speed * dt);
    rod.slide += d;
    rod.vel = d / dt;
  }

  kick(rod: Rod) {
    if (rod.kick < 0 || rod.kick > KICK_T * 0.7) rod.kick = 0;
  }

  /** Advances the table by dt seconds in fixed sub-steps. */
  step(dt: number) {
    for (let t = 0; t < dt - 1e-9; t += STEP) this.sub(Math.min(STEP, dt - t));
  }

  private sub(dt: number) {
    for (const r of this.rods) {
      if (r.kick >= 0) {
        r.kick += dt;
        if (r.kick >= KICK_T) r.kick = -1;
      }
      r.angle = r.kick >= 0 ? Math.sin((Math.PI * r.kick) / KICK_T) * 1.3 * dir(r.team) : 0;
    }
    const b = this.ball;
    if (this.goal !== null) return;
    const f = Math.exp(-0.5 * dt);
    b.vx *= f;
    b.vz *= f;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    if (Math.abs(b.z) > W / 2 - BALL_R) {
      b.z = Math.sign(b.z) * (W / 2 - BALL_R);
      b.vz = -b.vz * 0.7;
    }
    if (Math.abs(b.x) > L / 2 - BALL_R) {
      if (Math.abs(b.z) < GOAL / 2 - BALL_R * 0.5) {
        if (Math.abs(b.x) > L / 2 + BALL_R) {
          this.goal = b.x > 0 ? 0 : 1;
          this.score[this.goal]++;
        }
      } else {
        b.x = Math.sign(b.x) * (L / 2 - BALL_R);
        b.vx = -b.vx * 0.7;
      }
    }
    for (const r of this.rods) {
      // A foot swung past ~50° is off the ground and the ball rolls under it.
      if (Math.abs(r.angle) > 0.9) continue;
      const dx = b.x - r.x;
      const striking = r.kick >= 0 && r.kick < KICK_T / 2;
      // A kick also reaches a ball just behind the figure (the rod is rolled back over it first).
      const reach = FOOT_X + BALL_R + (striking ? REACH : 0);
      if (Math.abs(dx) > reach) continue;
      for (const z0 of r.base) {
        const dz = b.z - (z0 + r.slide);
        if (Math.abs(dz) > FOOT_Z + BALL_R) continue;
        const d = dir(r.team);
        if (striking) {
          b.x = r.x + d * (FOOT_X + BALL_R);
          b.vx = d * KICK_SPEED * (0.85 + this.rnd() * 0.3);
          b.vz = (dz / (FOOT_Z + BALL_R)) * 0.9 + r.vel * 0.5 + (this.rnd() - 0.5) * 0.8;
        } else {
          const s = dx === 0 ? d : Math.sign(dx);
          b.x = r.x + s * (FOOT_X + BALL_R);
          if (b.vx * s < 0) b.vx = -b.vx * 0.45;
          b.vz += r.vel * 0.3;
        }
        break;
      }
    }
    // A ball that stops dead somewhere rolls on, as on a table with a slightly domed field.
    if (Math.hypot(b.vx, b.vz) < 0.06) {
      if ((this.still += dt) > 1) {
        this.still = 0;
        b.vz += -Math.sign(b.z || 1) * 0.1;
        b.vx += (this.rnd() < 0.5 ? -1 : 1) * 0.15;
      }
    } else this.still = 0;
  }
}

/** AI speed (m/s), reaction (s) and aim error (m) for easy / medium / hard. */
export const AI_LEVELS = [
  { speed: 0.45, react: 0.25, err: 0.02 },
  { speed: 0.8, react: 0.14, err: 0.01 },
  { speed: 1.3, react: 0.06, err: 0.004 },
];

/** Drives one team's rods: line the nearest figure up with the ball and kick when it is in front. */
export function aiControl(t: Table, team: 0 | 1, level: number, dt: number, seen: { x: number; z: number }) {
  const lv = AI_LEVELS[level];
  const d = dir(team);
  for (const r of t.rods) {
    if (r.team !== team) continue;
    const ahead = (seen.x - r.x) * d;
    let best = r.base[0];
    for (const z0 of r.base) if (Math.abs(seen.z - z0 - r.slide) < Math.abs(seen.z - best - r.slide)) best = z0;
    // Rods the ball is far behind of drift back to the middle.
    const target = ahead < -0.08 ? 0 : seen.z - best + Math.sin(r.x * 37) * lv.err;
    t.drive(r, target, lv.speed, dt);
    if (Math.abs(ahead) < 0.025 + REACH && Math.abs(seen.z - best - r.slide) < 0.025) t.kick(r);
  }
}
