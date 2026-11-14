import { describe, expect, it } from 'vitest';
import { GOAL, L, Table } from './physics';

describe('foosball', () => {
  it('a kick sends the ball forward and a ball in the goal mouth scores', () => {
    const t = new Table(() => 0.5);
    const mid = t.rods[3]; // team 0 midfield
    t.ball = { x: mid.x + 0.03, z: mid.base[2], vx: 0, vz: 0 };
    t.kick(mid);
    t.step(0.05);
    expect(t.ball.vx).toBeGreaterThan(1.5);
    t.ball = { x: L / 2 - 0.02, z: 0, vx: 1, vz: 0 };
    t.rods.forEach((r) => (r.slide = r.range)); // keep the goalie out of the way
    t.step(0.1);
    expect(t.goal).toBe(0);
    expect(t.score).toEqual([1, 0]);
  });

  it('the ball bounces off the end wall beside the goal and off a figure', () => {
    const t = new Table(() => 0.5);
    t.ball = { x: -L / 2 + 0.03, z: GOAL / 2 + 0.05, vx: -1, vz: 0 };
    t.step(0.05);
    expect(t.goal).toBe(null);
    expect(t.ball.vx).toBeGreaterThan(0);
    const g = t.rods[0];
    t.ball = { x: g.x + 0.05, z: 0, vx: -1, vz: 0 };
    t.step(0.1);
    expect(t.ball.vx).toBeGreaterThan(0);
    expect(t.ball.x).toBeGreaterThan(g.x);
  });
});
