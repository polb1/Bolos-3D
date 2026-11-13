import { describe, expect, it } from 'vitest';
import { createRng } from '../../utils/random';
import { chooseShot } from './ai';
import { HEAD_X, L, R, rack, simulate, W } from './physics';
import { judge, newRack, play, type PoolState } from './rules';

const empty = (): PoolState => {
  const s = newRack(createRng(1), 0);
  s.balls.forEach((b, i) => i && (b.in = true));
  return { ...s, breakShot: false, inHand: 'none' };
};

describe('pool physics', () => {
  it('racks 15 balls without overlaps', () => {
    const b = rack(createRng(3));
    for (let i = 0; i < 16; i++)
      for (let j = i + 1; j < 16; j++) expect(Math.hypot(b[i].x - b[j].x, b[i].z - b[j].z)).toBeGreaterThan(2 * R);
  });

  it('a straight shot pots a ball in the corner and the cue ball stops behind it (stun)', () => {
    const s = empty();
    s.balls[0] = { x: 0, z: 0, vx: 0, vz: 0, in: false };
    s.balls[1] = { x: 0.4, z: 0.2, vx: 0, vz: 0, in: false };
    const dx = L / 2 - 0.4, dz = W / 2 - 0.2, d = Math.hypot(dx, dz);
    const ev = simulate(s.balls, { x: (dx / d) * 2, z: (dz / d) * 2 });
    expect(ev.first).toBe(1);
    expect(ev.pocketed).toEqual([1]);
  });

  it('is deterministic', () => {
    const a = rack(createRng(7));
    const b = rack(createRng(7));
    simulate(a, { x: 6, z: 0.05 });
    simulate(b, { x: 6, z: 0.05 });
    expect(a).toEqual(b);
  });

  it('balls slow down and stop on the cloth', () => {
    const s = empty();
    simulate(s.balls, { x: 0.5, z: 0 });
    expect(s.balls[0].x).toBeGreaterThan(HEAD_X + 0.5);
    expect(s.balls[0].x).toBeLessThan(L / 2);
  });
});

describe('8-ball rules', () => {
  it('scratch gives the rival ball in hand', () => {
    const s = empty();
    s.balls[0] = { x: L / 2 - 0.2, z: W / 2 - 0.1, vx: 0, vz: 0, in: false };
    const { next } = play(s, { x: 2, z: 1 });
    expect(next.turn).toBe(1);
    expect(next.inHand).toBe('table');
  });

  it('potting the 8 early loses, after clearing wins', () => {
    const s = empty();
    s.groups = ['solid', 'stripe'];
    s.balls[3].in = false; // a solid still on the table
    const ev = { first: 8, pocketed: [8], rail: false };
    expect(judge(s, s.balls.map((b) => ({ ...b })), ev).winner).toBe(1);
    s.balls[3].in = true;
    expect(judge(s, s.balls.map((b) => ({ ...b })), ev).winner).toBe(0);
  });

  it('first pot after the break assigns groups and keeps the turn', () => {
    const s = empty();
    s.balls[11].in = false;
    const n = judge(s, s.balls.map((b) => ({ ...b })), { first: 11, pocketed: [11], rail: false });
    expect(n.groups).toEqual(['stripe', 'solid']);
    expect(n.msg).toBe('rayadas (9-15)');
    expect(n.turn).toBe(0);
  });

  it('the expert AI pots an easy ball', () => {
    const s = empty();
    s.balls[0] = { x: 0, z: 0, vx: 0, vz: 0, in: false };
    s.balls[2] = { x: 0.6, z: 0.3, vx: 0, vz: 0, in: false };
    s.balls[10] = { x: -0.5, z: -0.3, vx: 0, vz: 0, in: false };
    s.groups = ['solid', 'stripe'];
    const shot = chooseShot(s, 2, createRng(5));
    expect(play(s, shot.v, shot.cue).ev.pocketed).toContain(2);
  });
});

describe('AI against AI', () => {
  it('a full rack ends with a winner', () => {
    const rng = createRng(11);
    let s = newRack(rng, 0);
    let shots = 0;
    while (s.winner === null && shots < 300) {
      const shot = chooseShot(s, 1, rng);
      s = play(s, shot.v, shot.cue).next;
      shots++;
    }
    expect(s.winner).not.toBeNull();
  });
});
