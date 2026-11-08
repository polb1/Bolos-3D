import { describe, expect, it } from 'vitest';
import { apply501, BULL_Y, fly, launch, OCHE, scoreAt } from './physics';

describe('dartboard scoring', () => {
  it('scores bulls, trebles, doubles and singles at regulation radii', () => {
    expect(scoreAt(0, BULL_Y).label).toBe('BULL');
    expect(scoreAt(0.01, BULL_Y).score).toBe(25);
    expect(scoreAt(0, BULL_Y + 0.103)).toMatchObject({ label: 'T20', score: 60 });
    expect(scoreAt(0, BULL_Y + 0.166)).toMatchObject({ label: 'D20', score: 40 });
    expect(scoreAt(0, BULL_Y + 0.05).score).toBe(20);
    expect(scoreAt(0, BULL_Y + 0.18).label).toBe('FUERA');
  });

  it('follows the clockwise number order seen from the oche', () => {
    expect(scoreAt(0.05, BULL_Y).score).toBe(6); // right
    expect(scoreAt(-0.05, BULL_Y).score).toBe(11); // left
    expect(scoreAt(0, BULL_Y - 0.05).score).toBe(3); // bottom
    const a = (Math.PI * 2) / 20; // one sector clockwise from 20 is 1
    expect(scoreAt(0.05 * Math.sin(a), BULL_Y + 0.05 * Math.cos(a)).score).toBe(1);
  });
});

describe('dart flight', () => {
  const hand = { x: 0, y: 1.6, z: OCHE + 0.35 };
  const bull = { x: 0, y: BULL_Y, z: 0 };

  it('the trained throw lands on the aim; harder lands high, softer low', () => {
    const at = (s: number) => fly(hand, launch(hand, bull, s, 6)).at;
    expect(Math.abs(at(6).y - BULL_Y)).toBeLessThan(0.02);
    expect(at(6.5).y).toBeGreaterThan(BULL_Y + 0.03);
    expect(at(5.5).y).toBeLessThan(BULL_Y - 0.03);
    expect(fly(hand, launch(hand, bull, 6, 6)).end).toBe('board');
  });

  it('a feeble throw drops to the floor', () => {
    expect(fly(hand, launch(hand, bull, 2, 6)).end).toBe('floor');
  });

  it('a sideways wrist pushes the dart off line', () => {
    expect(fly(hand, launch(hand, bull, 6, 6, 0.05)).at.x).toBeGreaterThan(0.05);
  });
});

describe('501 double-out', () => {
  it('busts below zero, on 1, and on finishing without a double', () => {
    expect(apply501(40, { score: 40, mult: 2, label: 'D20' })).toEqual({ left: 0, bust: false, won: true });
    expect(apply501(40, { score: 40, mult: 1, label: '40' }).bust).toBe(true);
    expect(apply501(20, { score: 19, mult: 1, label: '19' }).bust).toBe(true);
    expect(apply501(20, { score: 60, mult: 3, label: 'T20' }).bust).toBe(true);
    expect(apply501(100, { score: 60, mult: 3, label: 'T20' })).toEqual({ left: 40, bust: false, won: false });
  });
});

import { aiTarget, bedCentre } from './physics';

describe('AI checkout choice', () => {
  const hit = (t: { n: number; mult: number }) => {
    const c = bedCentre(t.n, t.mult);
    return scoreAt(c.x, c.y);
  };
  it('aims at the middle of the bed it means', () => {
    expect(hit({ n: 20, mult: 3 }).label).toBe('T20');
    expect(hit({ n: 16, mult: 2 }).label).toBe('D16');
    expect(hit({ n: 25, mult: 2 }).label).toBe('BULL');
    expect(hit({ n: 25, mult: 1 }).label).toBe('25');
    expect(hit({ n: 7, mult: 1 }).label).toBe('7');
  });
  it('finishes, sets up doubles and scores', () => {
    expect(aiTarget(32)).toEqual({ n: 16, mult: 2 });
    expect(aiTarget(50)).toEqual({ n: 25, mult: 2 });
    expect(aiTarget(100)).toEqual({ n: 20, mult: 3 }); // leaves 40
    expect(aiTarget(41)).toEqual({ n: 1, mult: 1 }); // leaves 40
    expect(aiTarget(501)).toEqual({ n: 20, mult: 3 });
    for (let left = 2; left <= 501; left++) {
      const t = aiTarget(left);
      const r = apply501(left, hit(t));
      expect(r.bust, `left ${left} -> ${JSON.stringify(t)}`).toBe(false);
    }
  });
});

import { bounceOut, R, wireDistance } from './physics';

describe('bounce-outs', () => {
  it('measures the distance to rings and radial wires', () => {
    expect(wireDistance(0, BULL_Y + R.trebleIn)).toBeCloseTo(0, 6);
    // Middle of the 20 single bed: far from any wire.
    expect(wireDistance(0, BULL_Y + 0.13)).toBeGreaterThan(0.02);
    // On the divider between 20 and 1 (9° right of the top).
    const a = (9 * Math.PI) / 180;
    expect(wireDistance(Math.sin(a) * 0.13, BULL_Y + Math.cos(a) * 0.13)).toBeLessThan(1e-6);
  });
  it('bounces only square on a wire or onto another dart', () => {
    expect(bounceOut(0, BULL_Y + R.doubleIn, [])).toBe('wire');
    expect(bounceOut(0, BULL_Y + 0.13, [])).toBeNull();
    expect(bounceOut(0, BULL_Y + 0.13, [{ x: 0.0005, y: BULL_Y + 0.1305 }])).toBe('dart');
    expect(bounceOut(0, BULL_Y + 0.13, [{ x: 0.02, y: BULL_Y + 0.13 }])).toBeNull();
  });
});

import { checkout } from './physics';

describe('checkout', () => {
  const name = (r: ReturnType<typeof checkout>) => r?.map((b) => (b.mult === 1 ? `${b.n}` : `${'SDT'[b.mult - 1]}${b.n}`)).join(' ');
  it('finishes with a double, fewest darts first', () => {
    expect(name(checkout(40, 3))).toBe('D20');
    expect(name(checkout(50, 1))).toBe('D25');
    expect(name(checkout(5, 3))).toBe('1 D2');
    expect(name(checkout(3, 3))).toBe('1 D1');
    expect(name(checkout(170, 3))).toBe('T20 T20 D25');
  });
  it('knows the bogey numbers and the darts left', () => {
    expect(checkout(169, 3)).toBeNull();
    expect(checkout(3, 1)).toBeNull();
    expect(checkout(1, 3)).toBeNull();
  });
});
