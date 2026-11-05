import { FRAMES, isGameOver, PINS, turnState, type Roll } from '../scoring/scoring';

export interface PlayerGame {
  name: string;
  rolls: Roll[];
  /** Index into LADDER when this bowler is the computer. */
  ai?: number;
}

/** Players alternate frame by frame; returns who throws next (-1 when the match is over). */
export function nextPlayer(players: PlayerGame[]): number {
  let best = -1;
  let bestFrame = Infinity;
  players.forEach((p, i) => {
    if (isGameOver(p.rolls)) return;
    const f = turnState(p.rolls).frame;
    if (f < bestFrame) {
      bestFrame = f;
      best = i;
    }
  });
  return best;
}

/** Pin adjacency on the rack (indices 0–9 = pins 1–10). */
const ADJ: number[][] = [
  [1, 2], [0, 2, 3, 4], [0, 1, 4, 5], [1, 4, 6, 7], [1, 2, 3, 5, 7, 8],
  [2, 4, 8, 9], [3, 7], [3, 4, 6, 8], [4, 5, 7, 9], [5, 8],
];

/** A split: head pin down and the remaining pins are not one connected group. */
export function isSplit(standing: number[]): boolean {
  if (standing.includes(0) || standing.length < 2) return false;
  const set = new Set(standing);
  const seen = new Set<number>([standing[0]]);
  const queue = [standing[0]];
  while (queue.length) {
    const p = queue.pop()!;
    for (const n of ADJ[p]) if (set.has(n) && !seen.has(n)) (seen.add(n), queue.push(n));
  }
  return seen.size !== set.size;
}

export interface RollOutcome {
  title: string;
  sub: string;
  kind: 'strike' | 'spare' | 'gutter' | 'foul' | 'split' | 'count';
}

/** Describes a delivery for the banner. `streak` = consecutive strikes including this one. */
export function describeRoll(opts: {
  knocked: number;
  freshRack: boolean;
  standingAfter: number[];
  foul: boolean;
  gutter: boolean;
  streak: number;
  frame: number;
}): RollOutcome {
  const { knocked, freshRack, standingAfter, foul, gutter, streak, frame } = opts;
  const sub = `Frame ${Math.min(frame + 1, FRAMES)}`;
  if (foul) return { title: '¡FALTA!', sub: 'Has cruzado la línea de falta · 0 bolos', kind: 'foul' };
  if (freshRack && knocked === PINS) {
    const title = streak >= 3 ? '¡PAVO!' : streak === 2 ? '¡DOBLE!' : '¡STRIKE!';
    return { title, sub: streak >= 3 ? `${streak} strikes seguidos` : sub, kind: 'strike' };
  }
  if (!freshRack && standingAfter.length === 0) return { title: '¡SPARE!', sub, kind: 'spare' };
  if (gutter && knocked === 0) return { title: 'Canal', sub: 'La bola se ha ido por la canaleta', kind: 'gutter' };
  if (freshRack && isSplit(standingAfter)) {
    return { title: 'Split', sub: `Quedan ${standingAfter.map((i) => i + 1).join('-')}`, kind: 'split' };
  }
  const word = knocked === 1 ? 'bolo' : 'bolos';
  return { title: `${knocked} ${word}`, sub: knocked === 0 ? 'Sin suerte esta vez' : sub, kind: 'count' };
}
