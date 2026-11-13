/**
 * Pool AI: lists ghost-ball shots at every legal ball into every pocket, simulates each one
 * on a copy of the table, keeps the best outcome, then adds its level's cueing error.
 */
import { gaussian, type Rng } from '../../utils/random';
import { freeSpot, HEAD_X, MAX_SPEED, POCKETS, R, W, type Ball } from './physics';
import { legalFirst, play, type PoolState } from './rules';

/** Aim error (rad) and power error (fraction) for easy / medium / expert. */
export const AI_ERR = [
  { aim: 0.03, power: 0.18 },
  { aim: 0.012, power: 0.1 },
  { aim: 0.004, power: 0.05 },
];

export interface AiShot {
  v: { x: number; z: number };
  cue?: { x: number; z: number };
}

const norm = (x: number, z: number) => {
  const d = Math.sqrt(x * x + z * z) || 1;
  return { x: x / d, z: z / d };
};

/** Nothing but `skip` balls within a ball width of the segment a→b. */
function clear(balls: Ball[], a: { x: number; z: number }, b: { x: number; z: number }, skip: number[]) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1;
  return balls.every((o, i) => {
    if (o.in || skip.includes(i)) return true;
    const t = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.z - a.z) * dz) / l2));
    const px = a.x + dx * t - o.x;
    const pz = a.z + dz * t - o.z;
    return px * px + pz * pz > 4 * R * R;
  });
}

/** How good the table is for `me` after a shot (higher = better). */
function score(s: PoolState, me: 0 | 1) {
  if (s.winner !== null) return s.winner === me ? 1000 : -1000;
  let v = s.turn === me ? 100 : 0;
  if (s.inHand !== 'none') v += s.turn === me ? 30 : -60;
  return v;
}

export function chooseShot(s: PoolState, level: number, rng: Rng): AiShot {
  const me = s.turn;
  const cues: ({ x: number; z: number } | undefined)[] = [undefined];
  const targets = s.balls.map((_, i) => i).filter((i) => !s.balls[i].in && legalFirst(s, me, i));
  if (s.inHand === 'kitchen') cues.splice(0, 1, { x: HEAD_X, z: 0 }, { x: HEAD_X, z: -W / 4 }, { x: HEAD_X, z: W / 4 });
  else if (s.inHand === 'table')
    // Straight behind each target, in line with each pocket.
    for (const t of targets)
      for (const p of POCKETS) {
        const d = norm(s.balls[t].x - p.x, s.balls[t].z - p.z);
        const c = { x: s.balls[t].x + d.x * 0.3, z: s.balls[t].z + d.z * 0.3 };
        if (freeSpot(s.balls, c.x, c.z, false)) cues.push(c);
      }
  type Cand = AiShot & { pre: number };
  const cands: Cand[] = [];
  for (const cue of cues.slice(0, 16)) {
    const c = cue ?? s.balls[0];
    for (const t of targets) {
      const b = s.balls[t];
      for (const p of POCKETS) {
        const toP = norm(p.x - b.x, p.z - b.z);
        const ghost = { x: b.x - toP.x * 2 * R, z: b.z - toP.z * 2 * R };
        const aim = norm(ghost.x - c.x, ghost.z - c.z);
        const cut = aim.x * toP.x + aim.z * toP.z;
        if (cut < 0.3 || !clear(s.balls, c, ghost, [0, t]) || !clear(s.balls, b, p, [0, t])) continue;
        const dist = Math.sqrt((ghost.x - c.x) ** 2 + (ghost.z - c.z) ** 2) + Math.sqrt((p.x - b.x) ** 2 + (p.z - b.z) ** 2) / cut;
        for (const k of [0.9, 1.5]) {
          const sp = Math.min(MAX_SPEED * 0.8, 0.8 + dist * k);
          cands.push({ v: { x: aim.x * sp, z: aim.z * sp }, cue, pre: cut * 2 - dist });
        }
      }
      // A plain hit on it, in case nothing pots (safety).
      const a = norm(b.x - c.x, b.z - c.z);
      cands.push({ v: { x: a.x * 1.6, z: a.z * 1.6 }, cue, pre: -5 });
    }
  }
  if (s.breakShot) cands.push({ v: { x: MAX_SPEED, z: (rng() - 0.5) * 0.1 }, cue: cues[0], pre: 10 });
  if (!cands.length) {
    const a = rng() * Math.PI * 2;
    return { v: { x: Math.cos(a) * 2, z: Math.sin(a) * 2 }, cue: cues[0] };
  }
  cands.sort((a, b) => b.pre - a.pre);
  let best = cands[0];
  let bestV = -Infinity;
  for (const c of cands.slice(0, 40)) {
    const v = score(play(s, c.v, c.cue).next, me) + c.pre;
    if (v > bestV) (bestV = v), (best = c);
  }
  // Cueing error: the stroke turns a little and the pace is never exact.
  const e = AI_ERR[level] ?? AI_ERR[1];
  const ang = Math.atan2(best.v.z, best.v.x) + gaussian(rng, e.aim);
  const sp = Math.min(MAX_SPEED, Math.sqrt(best.v.x ** 2 + best.v.z ** 2) * (1 + gaussian(rng, e.power)));
  return { v: { x: Math.cos(ang) * sp, z: Math.sin(ang) * sp }, cue: best.cue };
}

