import { describe, expect, it } from 'vitest';
import { box, resolve } from './collide';

describe('player collisions', () => {
  const wall = box(0, 0, 2, 2); // x,z in [-1, 1]

  it('pushes the player out to its radius', () => {
    const p = { x: 1.1, z: 0 };
    resolve(p, 0.3, [wall]);
    expect(p.x).toBeCloseTo(1.3);
  });

  it('gets out of a box even from the inside', () => {
    const p = { x: 0.9, z: 0.1 };
    resolve(p, 0.3, [wall]);
    expect(p.x).toBeCloseTo(1.3);
  });

  it('cannot tunnel into a corner between two boxes', () => {
    const p = { x: 1.05, z: 1.05 };
    resolve(p, 0.3, [wall, box(2, 2, 2, 2)]);
    const inside = (b: ReturnType<typeof box>) => p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;
    expect(inside(wall)).toBe(false);
  });

  it('leaves a free player alone', () => {
    const p = { x: 3, z: 3 };
    resolve(p, 0.3, [wall]);
    expect(p).toEqual({ x: 3, z: 3 });
  });
});
