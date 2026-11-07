import { beforeAll, describe, expect, it } from 'vitest';
import { BALL } from '../constants';
import { initRapier, PhysicsWorld, type LaunchParams } from './PhysicsWorld';

function roll(p: Omit<LaunchParams, 'mass'>, onImpact?: () => void) {
  const w = new PhysicsWorld();
  w.resetRack();
  w.launchBall({ ...p, mass: BALL.defaultMass });
  for (let t = 0; t < 8; t += 1 / 60) w.step(1 / 60, onImpact);
  const down = 10 - w.standingPins().length;
  const end = w.ballPose()!.position;
  w.dispose();
  return { down, end };
}

describe('physics', () => {
  beforeAll(() => initRapier());

  it('an untouched rack stays standing', () => {
    const w = new PhysicsWorld();
    w.resetRack();
    for (let i = 0; i < 300; i++) w.step(1 / 60);
    expect(w.standingPins()).toHaveLength(10);
    expect(w.pinsAtRest()).toBe(true);
  });

  it('a gutter ball knocks nothing down and ends in the pit', () => {
    const r = roll({ x: 0, angle: 0.034, speed: 8, spin: 0 });
    expect(r.down).toBe(0);
    expect(r.end.z).toBeLessThan(-18.5);
  });

  it('a straight ball in the 1-3 pocket strikes', () => {
    let hits = 0;
    const r = roll({ x: 0.06, angle: 0, speed: 9.5, spin: 0 }, () => hits++);
    expect(r.down).toBe(10);
    expect(hits).toBeGreaterThan(0);
  });

  it('a hook ball curves on the dry back end and strikes', () => {
    expect(roll({ x: 0.25, angle: 0, speed: 8.5, spin: -0.6 }).down).toBe(10);
    expect(roll({ x: -0.24, angle: 0, speed: 8.5, spin: 0.7 }).down).toBe(10); // left-hander
  });

  it('spin direction controls the curve', () => {
    const left = roll({ x: 0, angle: 0, speed: 8, spin: -1 });
    const right = roll({ x: 0, angle: 0, speed: 8, spin: 1 });
    expect(left.end.x).toBeLessThan(right.end.x);
  });

  it('a slow, light-hit ball leaves pins standing', () => {
    expect(roll({ x: 0.45, angle: 0, speed: 8, spin: 0 }).down).toBeLessThan(10);
  });
});

describe('real-world variation', () => {
  beforeAll(() => initRapier());

  it('is reproducible for a given seed and varies between seeds', async () => {
    const { createRng } = await import('../../../utils/random');
    const run = (seed: number) => {
      const w = new PhysicsWorld();
      w.setVariation(createRng(seed));
      w.resetRack();
      w.launchBall({ x: 0.07, angle: 0, speed: 8.5, spin: 0, mass: BALL.defaultMass });
      for (let t = 0; t < 8; t += 1 / 60) w.step(1 / 60);
      const r = { standing: w.standingPins().join(','), x: w.ballPose()!.position.x };
      w.dispose();
      return r;
    };
    expect(run(7)).toEqual(run(7));
    const xs = new Set([1, 2, 3, 4, 5].map((s) => run(s).x.toFixed(3)));
    expect(xs.size).toBeGreaterThan(1); // the uneven lane moves the ball differently each time
  });

  it('an untouched varied rack still stands', async () => {
    const { createRng } = await import('../../../utils/random');
    const w = new PhysicsWorld();
    w.setVariation(createRng(42));
    w.resetRack();
    for (let i = 0; i < 300; i++) w.step(1 / 60);
    expect(w.standingPins()).toHaveLength(10);
    expect(w.wobblers()).toHaveLength(0);
  });
});
