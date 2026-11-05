import { BALL, rackPositions } from '../config/constants';
import type { LaunchParams } from '../physics/PhysicsWorld';
import { clamp } from '../utils/math';
import { gaussian, type Rng } from '../utils/random';
import { isSplit } from './match';

/** A computer bowler: how far its release strays from what it aims for. */
export interface Rival {
  name: string;
  /** Average it is billed with in the bracket. */
  average: number;
  /** Std dev of the release point (m). */
  sx: number;
  /** Std dev of the launch angle (rad). */
  sa: number;
  /** Std dev of the speed (fraction). */
  sv: number;
}

/**
 * Stepladder finals, as on the pro tours: the player qualifies as the 4th seed
 * and must beat #3, then #2, then the top seed, one game each.
 */
export const LADDER: Rival[] = [
  { name: 'Leo «Canal» Vidal', average: 150, sx: 0.16, sa: 0.010, sv: 0.08 },
  { name: 'Marta Roldán', average: 190, sx: 0.09, sa: 0.006, sv: 0.05 },
  { name: 'Iker «El Pavo» Sanz', average: 225, sx: 0.05, sa: 0.0035, sv: 0.03 },
];

const POCKET_X = 0.06; // between pins 1 and 3

/**
 * Picks a line for the standing pins and throws it straight with human-like
 * error. The physics decides what falls, never this function.
 */
export function aiThrow(standing: number[], rival: Rival, rng: Rng): Omit<LaunchParams, 'mass'> {
  const spots = rackPositions();
  const fresh = standing.length === 10;
  let target = POCKET_X;
  if (!fresh && standing.length) {
    // A split has a gap in the middle: aim at one side instead of the hole.
    const group = isSplit(standing) ? pickSide(standing, spots) : standing;
    const xs = group.map((i) => spots[i][0]);
    const lead = group.reduce((a, b) => (spots[a][1] > spots[b][1] ? a : b));
    // Spare: the middle of what is left, leaning to the pin closest to the bowler.
    target = (xs.reduce((a, b) => a + b, 0) / xs.length + spots[lead][0]) / 2;
  }
  return {
    x: clamp(target + gaussian(rng, rival.sx), -BALL.maxOffset, BALL.maxOffset),
    angle: gaussian(rng, rival.sa),
    speed: 9.2 * (1 + gaussian(rng, rival.sv)),
    spin: 0,
  };
}

/** The larger of the left / right groups of a split (ties: the side nearer the bowler). */
function pickSide(standing: number[], spots: Array<[number, number]>) {
  const left = standing.filter((i) => spots[i][0] < 0);
  const right = standing.filter((i) => spots[i][0] > 0);
  const mid = standing.filter((i) => spots[i][0] === 0);
  if (!left.length || !right.length) return standing;
  const front = (g: number[]) => Math.max(...g.map((i) => spots[i][1]));
  const pick = left.length !== right.length ? (left.length > right.length ? left : right) : front(left) >= front(right) ? left : right;
  return [...pick, ...mid];
}
