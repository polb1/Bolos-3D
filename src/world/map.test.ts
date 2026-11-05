import { describe, expect, it } from 'vitest';
import { ACTIVITIES } from './activities';
import { MAP_H, MAP_W, ROOMS, solids, SPAWN } from './map';

const RADIUS = 0.3; // same feet circle as World
const STEP = 0.25; // sampling grid, tiles

/**
 * Flood fill over positions where the player's feet circle fits, on a grid finer
 * than the tiles, so narrow gaps between furniture count as blocked like in game.
 */
function reachable() {
  const boxes = solids();
  const free = (x: number, y: number) =>
    boxes.every(([bx, by, w, h]) => {
      const dx = x - Math.max(bx, Math.min(x, bx + w));
      const dy = y - Math.max(by, Math.min(y, by + h));
      return dx * dx + dy * dy >= RADIUS * RADIUS;
    });
  const W = MAP_W / STEP;
  const H = MAP_H / STEP;
  const seen = new Uint8Array(W * H);
  const cell = (x: number, y: number) => [Math.round(x / STEP), Math.round(y / STEP)];
  const [sx, sy] = cell(SPAWN.x, SPAWN.y);
  const q = [[sx, sy]];
  seen[sy * W + sx] = 1;
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || !free(nx * STEP, ny * STEP)) continue;
      seen[ny * W + nx] = 1;
      q.push([nx, ny]);
    }
  }
  /** True if some reachable sample lies within `r` tiles of (x, y). */
  const near = (x: number, y: number, r: number) => {
    for (let j = Math.floor((y - r) / STEP); j <= (y + r) / STEP; j++)
      for (let i = Math.floor((x - r) / STEP); i <= (x + r) / STEP; i++)
        if (i >= 0 && j >= 0 && i < W && j < H && seen[j * W + i] && Math.hypot(i * STEP - x, j * STEP - y) <= r) return true;
    return false;
  };
  return { free, near };
}

describe('hall map', () => {
  const { free, near } = reachable();

  it('the player spawns where they fit', () => {
    expect(free(SPAWN.x, SPAWN.y)).toBe(true);
  });

  it('every room can be walked into from the entrance', () => {
    for (const r of ROOMS) {
      let any = false;
      for (let y = r.y0 + 1; y < r.y1 && !any; y++) for (let x = r.x0 + 1; x < r.x1 && !any; x++) any = near(x + 0.5, y + 0.5, 0.4);
      expect(any, r.name).toBe(true);
    }
  });

  it('every activity can be triggered by walking up to it', () => {
    for (const a of ACTIVITIES) expect(near(a.x, a.y, a.radius), a.id).toBe(true);
  });
});
