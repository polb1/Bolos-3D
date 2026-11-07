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
