import { describe, expect, it } from 'vitest';
import { createRng } from '../../utils/random';
import { AI_PROFILES, HockeyAI, predictX, type Difficulty } from './ai';
import { HockeyPhysics, malletBounds, TABLE, type HockeyEvent } from './physics';
import { applyGoal, newScore, serveTo } from './rules';

const W = TABLE.width / 2;
const L = TABLE.length / 2;
const R = TABLE.puckR;

function run(ph: HockeyPhysics, seconds: number, each?: (ev: HockeyEvent[]) => void | boolean) {
  for (let i = 0; i < seconds * 60; i++) {
    const ev = ph.step(1 / 60);
    if (each?.(ev)) return;
  }
}

/** Physics with both mallets parked out of the way. */
function empty() {
  const ph = new HockeyPhysics();
  for (const m of ph.mallets) m.active = false;
  return ph;
}

describe('air hockey physics', () => {
  it('the puck never leaves the table at top speed', () => {
    const ph = empty();
    ph.tuning.maxPuckSpeed = 14;
    Object.assign(ph.puck, { x: 0.2, z: 0.3, vx: 13.1, vz: 4.7 });
    for (let i = 0; i < 2000 && ph.puck.live; i++) {
      ph.step(1 / 60);
      const p = ph.puck;
      if (Math.abs(p.z) <= L) expect(Math.abs(p.x)).toBeLessThanOrEqual(W - R + 1e-9);
      if (Math.abs(p.x) > TABLE.goal / 2) expect(Math.abs(p.z)).toBeLessThanOrEqual(L - R + 1e-9);
    }
  });

  it('rail bounces mirror the angle and only lose the rail restitution', () => {
    const ph = empty();
    Object.assign(ph.puck, { x: W - R - 0.01, z: 0.4, vx: 3, vz: -2 });
    let hit = false;
    run(ph, 0.05, (ev) => (hit = ev.some((e) => e.type === 'wall')));
    expect(hit).toBe(true);
    expect(ph.puck.vx).toBeCloseTo(-3 * ph.tuning.wallE, 1);
    expect(ph.puck.vz).toBeCloseTo(-2 * ph.tuning.wallGrip, 1);
  });

  it('the air cushion barely slows a free puck', () => {
    const ph = empty();
    Object.assign(ph.puck, { x: 0, z: 0.9, vx: 0, vz: -0.9 });
    run(ph, 1);
    expect(-ph.puck.vz).toBeGreaterThan(0.9 * 0.93);
  });

  it('a moving mallet drives the puck away along the contact normal', () => {
    const ph = new HockeyPhysics();
    ph.mallets[1].active = false;
    const m = ph.mallets[0];
    Object.assign(m, { x: 0, z: 0.6, tx: 0, tz: 0.2 });
    ph.serve(1, 0);
    ph.puck.z = 0.45;
    let hits = 0;
    run(ph, 0.12, (ev) => void (hits += ev.filter((e) => e.type === 'hit').length));
    expect(hits).toBeGreaterThan(0);
    expect(ph.puck.vz).toBeLessThan(-3);
    expect(Math.abs(ph.puck.vx)).toBeLessThan(0.3);
  });

  it('mallets stay in their own half and inside the rails', () => {
    const ph = empty();
    for (const m of ph.mallets) {
      m.active = true;
      const b = malletBounds(m.side);
      for (const [tx, tz] of [[5, -5], [-5, 5], [0, 0], [5, 5]]) {
        m.tx = tx;
        m.tz = tz;
        run(ph, 0.5);
        expect(m.x).toBeGreaterThanOrEqual(b.xMin - 1e-9);
        expect(m.x).toBeLessThanOrEqual(b.xMax + 1e-9);
        expect(m.z).toBeGreaterThanOrEqual(b.zMin - 1e-9);
        expect(m.z).toBeLessThanOrEqual(b.zMax + 1e-9);
      }
      expect(Math.sign(m.z)).toBe(m.side);
    }
  });

  it('a puck pinned against a rail pushes the mallet back instead of passing through it', () => {
    const ph = new HockeyPhysics();
    ph.mallets[1].active = false;
    const m = ph.mallets[0];
    Object.assign(m, { x: 0, z: 0.5, tx: 5, tz: 0.5 });
    Object.assign(ph.puck, { x: W - R, z: 0.5, vx: 0, vz: 0 });
    run(ph, 0.5);
    expect(Math.hypot(m.x - ph.puck.x, m.z - ph.puck.z)).toBeGreaterThanOrEqual(R + TABLE.malletR - 1e-6);
    expect(Math.abs(ph.puck.x)).toBeLessThanOrEqual(W - R + 1e-9);
  });

  it('detects goals only through the mouth, credited to the shooter', () => {
    const ph = empty();
    Object.assign(ph.puck, { x: 0.02, z: 0.5, vx: 0, vz: -5 });
    let goal: HockeyEvent | undefined;
    run(ph, 1, (ev) => !!(goal = ev.find((e) => e.type === 'goal')));
    expect(goal).toEqual({ type: 'goal', scorer: 1 });
    expect(ph.puck.live).toBe(false);

    const wide = empty();
    Object.assign(wide.puck, { x: 0.3, z: 0.5, vx: 0, vz: -5 });
    let any = false;
    run(wide, 0.3, (ev) => (any = ev.some((e) => e.type === 'goal')));
    expect(any).toBe(false);
    expect(wide.puck.vz).toBeGreaterThan(0); // bounced off the end rail
  });

  it('a puck aimed at a post bounces off it', () => {
    const ph = empty();
    Object.assign(ph.puck, { x: -TABLE.goal / 2 + 0.01, z: 0.5, vx: 0, vz: 5 });
    let any = false;
    run(ph, 0.5, (ev) => (any = any || ev.some((e) => e.type === 'goal')));
    expect(any).toBe(false);
  });
});

describe('air hockey AI', () => {
  it('predicts rail bounces by folding the straight line', () => {
    expect(predictX(0, 0, 0, -1, -0.5, 0)!.x).toBeCloseTo(0);
    const lim = W - R;
    const p = predictX(0, 0, 1, -1, -(lim * 2), 1)!; // reaches the rail halfway, then comes back
    expect(p.x).toBeCloseTo(0, 5);
    expect(predictX(0, 0, 1, -1, -(lim * 2), 0)).toBeNull();
    expect(predictX(0, 0, 0, 1, -0.5, 3)).toBeNull(); // moving away
  });

  /** Fires shots from the far half at the AI's goal; returns how many it saves. */
  function saves(diff: Difficulty, shots = 40) {
    const rng = createRng(7);
    let saved = 0;
    for (let i = 0; i < shots; i++) {
      const ph = new HockeyPhysics();
      ph.mallets[0].active = false;
      const ai = new HockeyAI(ph.mallets[1], AI_PROFILES[diff], createRng(i + 1));
      const x0 = (rng() - 0.5) * 0.8;
      const tx = (rng() - 0.5) * 0.16; // clean on target, inside the posts
      const z0 = 0.6;
      const sp = 4 + rng() * 5; // a good human shot
      const bank = i % 3 === 0;
      const aimX = bank ? (tx > 0 ? 1 : -1) * (TABLE.width - 2 * R) - tx : tx;
      const dx = aimX - x0;
      const dz = -L - z0;
      const d = Math.hypot(dx, dz);
      // let the AI settle at home first
      for (let k = 0; k < 60; k++) ai.update(1 / 60, ph), ph.step(1 / 60);
      Object.assign(ph.puck, { x: x0, z: z0, vx: (dx / d) * sp, vz: (dz / d) * sp, live: true });
      let conceded = false;
      for (let k = 0; k < 180 && !conceded; k++) {
        ai.update(1 / 60, ph);
        conceded = ph.step(1 / 60).some((e) => e.type === 'goal' && e.scorer === 1);
        if (ph.puck.vz > 0.5 && ph.puck.z > 0) break; // cleared
      }
      if (!conceded) saved++;
    }
    return saved / shots;
  }

  it('defends: the hard AI stops most shots, the easy one fewer', () => {
    const hard = saves('hard');
    const easy = saves('easy');
    expect(hard).toBeGreaterThan(0.75);
    expect(easy).toBeLessThan(hard);
  });

  it('attacks and scores against an empty goal', () => {
    let goals = 0;
    for (let i = 0; i < 10; i++) {
      const ph = new HockeyPhysics();
      ph.mallets[0].active = false;
      const ai = new HockeyAI(ph.mallets[1], AI_PROFILES.normal, createRng(i + 3));
      ph.serve(-1, (i - 5) * 0.06);
      for (let k = 0; k < 60 * 8; k++) {
        ai.update(1 / 60, ph);
        if (ph.step(1 / 60).some((e) => e.type === 'goal' && e.scorer === -1)) {
          goals++;
          break;
        }
      }
    }
    expect(goals).toBeGreaterThanOrEqual(8);
  });
});

describe('air hockey rules', () => {
  it('counts goals, ends at the target and serves to whoever conceded', () => {
    let s = newScore(3);
    s = applyGoal(s, 1, 'ai');
    s = applyGoal(s, -1, 'ai');
    s = applyGoal(s, 1, 'ai');
    expect([s.p1, s.p2, s.winner]).toEqual([2, 1, null]);
    s = applyGoal(s, 1, 'ai');
    expect(s.winner).toBe(1);
    expect(applyGoal(s, -1, 'ai')).toBe(s); // no goals after the end
    expect(serveTo(1, 'ai')).toBe(-1);
    expect(serveTo(-1, 'versus')).toBe(1);
  });

  it('training never ends and always serves back to the player', () => {
    let s = newScore(1);
    for (let i = 0; i < 5; i++) s = applyGoal(s, 1, 'training');
    expect([s.p1, s.winner]).toEqual([5, null]);
    expect(serveTo(1, 'training')).toBe(1);
  });
});
