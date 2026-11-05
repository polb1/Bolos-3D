import { describe, expect, it } from 'vitest';
import { describeRoll, isSplit, nextPlayer, type PlayerGame } from './match';

const p = (...pins: number[]): PlayerGame => ({ name: 'x', rolls: pins.map((n) => ({ pins: n })) });

describe('match', () => {
  it('players alternate whole frames', () => {
    expect(nextPlayer([p(), p()])).toBe(0);
    expect(nextPlayer([p(7), p()])).toBe(0); // second ball of the frame
    expect(nextPlayer([p(7, 2), p()])).toBe(1);
    expect(nextPlayer([p(10), p()])).toBe(1);
    expect(nextPlayer([p(10), p(3, 4)])).toBe(0);
  });

  it('match ends when every game is over', () => {
    const done = p(...Array(20).fill(0));
    expect(nextPlayer([done, p(...Array(19).fill(0))])).toBe(1);
    expect(nextPlayer([done, done])).toBe(-1);
  });

  it('detects splits', () => {
    expect(isSplit([6, 9])).toBe(true); // 7-10
    expect(isSplit([3, 5])).toBe(true); // 4-6
    expect(isSplit([1, 2])).toBe(false); // 2-3 adjacent
    expect(isSplit([0, 6])).toBe(false); // head pin standing
    expect(isSplit([9])).toBe(false);
  });

  it('banner texts', () => {
    const base = { standingAfter: [], foul: false, gutter: false, streak: 1, frame: 0 };
    expect(describeRoll({ ...base, knocked: 10, freshRack: true }).title).toBe('¡STRIKE!');
    expect(describeRoll({ ...base, knocked: 10, freshRack: true, streak: 3 }).title).toBe('¡PAVO!');
    expect(describeRoll({ ...base, knocked: 3, freshRack: false }).kind).toBe('spare');
    expect(describeRoll({ ...base, knocked: 0, freshRack: true, gutter: true, standingAfter: [0] }).kind).toBe('gutter');
    expect(describeRoll({ ...base, knocked: 0, freshRack: true, foul: true }).kind).toBe('foul');
  });
});
