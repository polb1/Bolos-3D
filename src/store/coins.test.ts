import { describe, expect, it } from 'vitest';
import { useGameStore } from './useGameStore';

describe('coins and shop', () => {
  it('rewards scores over 100 and spends coins once per item', () => {
    const s = useGameStore;
    s.setState({ coins: 0, owned: [], players: [{ name: 'A', rolls: Array(12).fill({ pins: 10 }) }, { name: 'B', rolls: Array(20).fill({ pins: 0 }) }] });
    s.getState().finishMatch();
    expect(s.getState().earned).toBe(20);
    expect(s.getState().buy('lava', 40)).toBe(false);
    expect(s.getState().buy('cerezo', 20)).toBe(true);
    expect(s.getState().coins).toBe(0);
    expect(s.getState().buy('cerezo', 20)).toBe(false);
  });
});

describe('stepladder vs AI', () => {
  it('a win advances, the final crowns, and a tie goes to the AI', () => {
    const s = useGameStore;
    const game = (me: number, ai: number, round: number) => {
      s.setState({ ladder: round, coins: 0, players: [{ name: 'Yo', rolls: Array(20).fill({ pins: me }) }, { name: 'IA', rolls: Array(20).fill({ pins: ai }), ai: round }] });
      s.getState().finishMatch();
      return s.getState();
    };
    expect(game(4, 3, 0)).toMatchObject({ ladderResult: 'win', coins: 15 });
    expect(game(4, 3, 2)).toMatchObject({ ladderResult: 'champion', coins: 60 });
    expect(game(3, 3, 1)).toMatchObject({ ladderResult: 'lose', coins: 0 });
  });
});
