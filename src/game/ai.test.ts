import { beforeAll, describe, expect, it } from 'vitest';
import { BALL, rackPositions } from '../config/constants';
import { initRapier, PhysicsWorld } from '../physics/PhysicsWorld';
import { currentScore, isGameOver, turnState, type Roll } from '../scoring/scoring';
import { createRng } from '../utils/random';
import { aiThrow, LADDER, type Rival } from './ai';

/** Plays a whole game headless: every ball goes through the physics. */
function playGame(rival: Rival, seed: number) {
  const rng = createRng(seed);
  const rolls: Roll[] = [];
  let standing = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  while (!isGameOver(rolls)) {
    if (turnState(rolls).freshRack) standing = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const w = new PhysicsWorld();
    w.setVariation(createRng(seed));
    w.resetRack();
    w.removePins([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((i) => !standing.includes(i)));
    w.restorePins(standing.map((index) => ({ index, x: rackPositions()[index][0], z: rackPositions()[index][1] })));
    w.launchBall({ ...aiThrow(standing, rival, rng), mass: BALL.defaultMass });
    for (let t = 0; t < 6; t += 1 / 60) w.step(1 / 60);
    const after = w.standingPins();
    w.dispose();
    rolls.push({ pins: standing.length - after.length });
    standing = after;
  }
  return currentScore(rolls);
}

describe('AI rivals', () => {
  beforeAll(() => initRapier());

  it('harder rivals score more on average', () => {
    const avg = LADDER.map((r) => {
      const scores = [1, 2, 3, 4, 5, 6].map((s) => playGame(r, s * 97));
      return scores.reduce((a, b) => a + b, 0) / scores.length;
    });
    expect(avg[0]).toBeLessThan(avg[2]);
    expect(avg[2]).toBeGreaterThan(160);
  }, 120_000);
});
