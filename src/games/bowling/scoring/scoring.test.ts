import { describe, expect, it } from 'vitest';
import { currentScore, gameStats, isGameOver, maxPossible, scoreFrames, turnState, type Roll } from './scoring';

const r = (...pins: number[]): Roll[] => pins.map((p) => ({ pins: p }));
const totals = (rolls: Roll[]) => scoreFrames(rolls).map((f) => f.total);
const marks = (rolls: Roll[]) => scoreFrames(rolls).map((f) => f.marks.join(''));

describe('scoring', () => {
  it('gutter game is 0', () => {
    const g = r(...Array(20).fill(0));
    expect(currentScore(g)).toBe(0);
    expect(isGameOver(g)).toBe(true);
    expect(marks(g)[0]).toBe('--');
  });

  it('all ones is 20', () => {
    expect(currentScore(r(...Array(20).fill(1)))).toBe(20);
  });

  it('perfect game is 300 with 12 strikes', () => {
    const g = r(...Array(12).fill(10));
    expect(isGameOver(g)).toBe(true);
    expect(currentScore(g)).toBe(300);
    expect(totals(g)).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 270, 300]);
    expect(marks(g)[9]).toBe('XXX');
  });

  it('11 strikes is not over', () => {
    expect(isGameOver(r(...Array(11).fill(10)))).toBe(false);
  });

  it('all spares 5/5 with final 5 is 150', () => {
    const g = r(...Array(21).fill(5));
    expect(isGameOver(g)).toBe(true);
    expect(currentScore(g)).toBe(150);
    expect(marks(g)[0]).toBe('5/');
    expect(marks(g)[9]).toBe('5/5');
  });

  it('spare bonus is next ball, pending until thrown', () => {
    expect(totals(r(7, 3))[0]).toBeNull();
    expect(totals(r(7, 3, 4))[0]).toBe(14);
    expect(totals(r(7, 3, 4, 2))[1]).toBe(20);
  });

  it('strike bonus is next two balls', () => {
    expect(totals(r(10, 3))[0]).toBeNull();
    expect(totals(r(10, 3, 6))).toEqual([19, 28, null, null, null, null, null, null, null, null]);
    expect(totals(r(10, 10, 10))[0]).toBe(30);
    expect(totals(r(10, 10, 4, 2))[0]).toBe(24);
  });

  it('strike followed by spare', () => {
    expect(totals(r(10, 4, 6, 5, 0)).slice(0, 3)).toEqual([20, 35, 40]);
  });

  it('classic example game scores 133', () => {
    const g = r(1, 4, 4, 5, 6, 4, 5, 5, 10, 0, 1, 7, 3, 6, 4, 10, 2, 8, 6);
    expect(isGameOver(g)).toBe(true);
    expect(totals(g)).toEqual([5, 14, 29, 49, 60, 61, 77, 97, 117, 133]);
    expect(marks(g)[9]).toBe('2/6');
  });

  it('open tenth frame ends after two balls', () => {
    const g = r(...Array(18).fill(0), 3, 4);
    expect(isGameOver(g)).toBe(true);
    expect(currentScore(g)).toBe(7);
  });

  it('tenth frame strike then partial then spare', () => {
    const g = r(...Array(18).fill(0), 10, 7, 3);
    expect(isGameOver(g)).toBe(true);
    expect(marks(g)[9]).toBe('X7/');
    expect(currentScore(g)).toBe(20);
  });

  it('tenth frame strike then open bonus', () => {
    const g = r(...Array(18).fill(0), 10, 3, 4);
    expect(marks(g)[9]).toBe('X34');
    expect(currentScore(g)).toBe(17);
  });

  it('turn state tracks rack resets', () => {
    expect(turnState([])).toEqual({ frame: 0, ball: 0, freshRack: true, gameOver: false });
    expect(turnState(r(7))).toEqual({ frame: 0, ball: 1, freshRack: false, gameOver: false });
    expect(turnState(r(10))).toEqual({ frame: 1, ball: 0, freshRack: true, gameOver: false });
    const nine = r(...Array(18).fill(0));
    expect(turnState(nine)).toMatchObject({ frame: 9, ball: 0, freshRack: true });
    expect(turnState([...nine, ...r(10)])).toMatchObject({ frame: 9, ball: 1, freshRack: true });
    expect(turnState([...nine, ...r(10, 6)])).toMatchObject({ frame: 9, ball: 2, freshRack: false });
    expect(turnState([...nine, ...r(10, 10)])).toMatchObject({ frame: 9, ball: 2, freshRack: true });
    expect(turnState([...nine, ...r(4, 6)])).toMatchObject({ frame: 9, ball: 2, freshRack: true });
  });

  it('fouls count zero and allow a spare on the full rack', () => {
    const g: Roll[] = [{ pins: 0, foul: true }, { pins: 10 }, { pins: 5 }, { pins: 0 }];
    expect(marks(g)[0]).toBe('F/');
    expect(totals(g).slice(0, 2)).toEqual([15, 20]);
    expect(gameStats(g)).toMatchObject({ fouls: 1, spares: 1, strikes: 0, opens: 1 });
  });

  it('max possible score', () => {
    expect(maxPossible([])).toBe(300);
    expect(maxPossible(r(9, 0))).toBe(279);
    expect(maxPossible(r(7))).toBe(290);
  });

  it('an open tenth frame counts as open', () => {
    expect(gameStats(r(...Array(18).fill(0), 3, 4)).opens).toBe(10);
    expect(gameStats(r(...Array(18).fill(0), 10, 3, 4)).opens).toBe(9);
  });

  it('stats', () => {
    const g = r(1, 4, 4, 5, 6, 4, 5, 5, 10, 0, 1, 7, 3, 6, 4, 10, 2, 8, 6);
    expect(gameStats(g)).toMatchObject({ strikes: 2, spares: 5, opens: 3 });
  });
});
