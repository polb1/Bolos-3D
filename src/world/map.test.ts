import { describe, expect, it } from 'vitest';
import { ACTIVITIES } from './activities';
import { MAP_H, MAP_W, ROOMS, solids, SPAWN } from './map';

/** Walkable 4-neighbour flood fill over tiles not covered by any solid box. */
function reachable() {
  const blocked = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false));
  for (const [x, y, w, h] of solids())
    for (let ty = Math.floor(y); ty < Math.ceil(y + h); ty++)
      for (let tx = Math.floor(x); tx < Math.ceil(x + w); tx++) if (blocked[ty]) blocked[ty][tx] = true;
  const seen = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false));
  const q: Array<[number, number]> = [[Math.floor(SPAWN.x), Math.floor(SPAWN.y)]];
  seen[q[0][1]][q[0][0]] = true;
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || seen[ny][nx] || blocked[ny][nx]) continue;
      seen[ny][nx] = true;
      q.push([nx, ny]);
    }
  }
  return { seen, blocked };
}

describe('hall map', () => {
  const { seen, blocked } = reachable();

  it('the player spawns on a free tile', () => {
    expect(blocked[Math.floor(SPAWN.y)][Math.floor(SPAWN.x)]).toBe(false);
  });

  it('every room can be walked into from the entrance', () => {
    for (const r of ROOMS) {
      let any = false;
      for (let y = r.y0 + 1; y < r.y1; y++) for (let x = r.x0 + 1; x < r.x1; x++) any ||= seen[y][x];
      expect(any, r.name).toBe(true);
    }
  });

  it('every activity spot is reachable', () => {
    for (const a of ACTIVITIES) expect(seen[Math.floor(a.y)][Math.floor(a.x)], a.id).toBe(true);
  });
});
