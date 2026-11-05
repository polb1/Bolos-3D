/**
 * Official ten-pin bowling scoring (USBC rules).
 * Pure functions: a player's game is just the ordered list of deliveries.
 */

export interface Roll {
  /** Pins credited for this delivery (0 on a foul). */
  pins: number;
  foul?: boolean;
}

export interface FrameView {
  /** Marks shown in the frame boxes: 'X', '/', '-', 'F' or a digit. */
  marks: string[];
  /** Running total once the frame (and its bonus) can be scored, else null. */
  total: number | null;
  complete: boolean;
}

export interface TurnState {
  /** 0-based frame the next delivery belongs to (9 = tenth). */
  frame: number;
  /** 0-based delivery within the frame. */
  ball: number;
  /** True when the next delivery is thrown at a full, fresh rack. */
  freshRack: boolean;
  gameOver: boolean;
}

export const FRAMES = 10;
export const PINS = 10;

/** Splits the delivery list into frames (last frame may hold up to 3 rolls). */
export function splitFrames(rolls: Roll[]): Roll[][] {
  const frames: Roll[][] = [];
  let i = 0;
  while (i < rolls.length && frames.length < FRAMES - 1) {
    if (rolls[i].pins === PINS) {
      frames.push([rolls[i]]);
      i += 1;
    } else {
      frames.push(rolls.slice(i, i + 2));
      i += 2;
    }
  }
  if (i < rolls.length) frames.push(rolls.slice(i, i + 3));
  return frames;
}

function tenthFrameDone(f: Roll[]): boolean {
  if (f.length < 2) return false;
  const bonus = f[0].pins === PINS || f[0].pins + f[1].pins === PINS;
  return bonus ? f.length === 3 : true;
}

export function turnState(rolls: Roll[]): TurnState {
  const frames = splitFrames(rolls);
  const last = frames[frames.length - 1];
  if (!last) return { frame: 0, ball: 0, freshRack: true, gameOver: false };

  const idx = frames.length - 1;
  if (idx < FRAMES - 1) {
    const done = last[0].pins === PINS || last.length === 2;
    if (done) return { frame: idx + 1, ball: 0, freshRack: true, gameOver: false };
    return { frame: idx, ball: 1, freshRack: false, gameOver: false };
  }

  // Tenth frame: the rack is reset after a strike or after a spare.
  if (tenthFrameDone(last)) return { frame: idx, ball: last.length, freshRack: false, gameOver: true };
  const ball = last.length;
  let freshRack: boolean;
  if (ball === 1) freshRack = last[0].pins === PINS;
  else {
    const [a, b] = last;
    freshRack = a.pins === PINS ? b.pins === PINS : true; // X-X → fresh; X-n → leftover; spare → fresh
  }
  return { frame: idx, ball, freshRack, gameOver: false };
}

export function isGameOver(rolls: Roll[]): boolean {
  return turnState(rolls).gameOver;
}

/** Marks for one frame's rolls, honouring rack resets (tenth frame, fouls). */
function frameMarks(f: Roll[]): string[] {
  const marks: string[] = [];
  let standing = PINS;
  let fresh = true;
  for (const r of f) {
    if (r.foul) marks.push('F');
    else if (fresh && r.pins === PINS) marks.push('X');
    else if (!fresh && r.pins === standing) marks.push('/');
    else marks.push(r.pins === 0 ? '-' : String(r.pins));

    standing -= r.pins;
    fresh = standing === 0;
    if (fresh) standing = PINS;
  }
  return marks;
}

export function scoreFrames(rolls: Roll[]): FrameView[] {
  const frames = splitFrames(rolls);
  const views: FrameView[] = [];
  let running = 0;
  let cursor = 0;
  let pending = false;

  for (let n = 0; n < FRAMES; n++) {
    const f = frames[n];
    if (!f) {
      views.push({ marks: [], total: null, complete: false });
      continue;
    }
    const tenth = n === FRAMES - 1;
    const complete = tenth ? tenthFrameDone(f) : f[0].pins === PINS || f.length === 2;

    let value: number | null = null;
    if (tenth) {
      if (complete) value = f.reduce((s, r) => s + r.pins, 0);
    } else if (f[0].pins === PINS) {
      const b = rolls.slice(cursor + 1, cursor + 3);
      if (b.length === 2) value = PINS + b[0].pins + b[1].pins;
    } else if (f.length === 2) {
      const base = f[0].pins + f[1].pins;
      if (base === PINS) {
        const b = rolls[cursor + 2];
        if (b) value = PINS + b.pins;
      } else value = base;
    }

    if (value === null) pending = true;
    if (!pending && value !== null) running += value;
    views.push({ marks: frameMarks(f), total: pending ? null : running, complete });
    cursor += f.length;
  }
  return views;
}

/** Score of the frames that are already determined. */
export function currentScore(rolls: Roll[]): number {
  let last = 0;
  for (const f of scoreFrames(rolls)) if (f.total !== null) last = f.total;
  return last;
}

/** Highest score still achievable — useful for the HUD. */
export function maxPossible(rolls: Roll[]): number {
  const sim = [...rolls];
  let guard = 0;
  while (!isGameOver(sim) && guard++ < 30) {
    const t = turnState(sim);
    const standing = t.freshRack ? PINS : PINS - lastPartial(sim);
    sim.push({ pins: standing });
  }
  return currentScore(sim);
}

function lastPartial(rolls: Roll[]): number {
  return rolls[rolls.length - 1]?.pins ?? 0;
}

export interface GameStats {
  strikes: number;
  spares: number;
  opens: number;
  fouls: number;
  gutters: number;
}

export function gameStats(rolls: Roll[]): GameStats {
  const stats: GameStats = { strikes: 0, spares: 0, opens: 0, fouls: 0, gutters: 0 };
  for (const v of scoreFrames(rolls)) {
    for (const m of v.marks) {
      if (m === 'X') stats.strikes++;
      if (m === '/') stats.spares++;
      if (m === 'F') stats.fouls++;
    }
  }
  splitFrames(rolls).forEach((f, n) => {
    if (n < FRAMES - 1 && f.length === 2 && f[0].pins + f[1].pins < PINS) stats.opens++;
  });
  return stats;
}
