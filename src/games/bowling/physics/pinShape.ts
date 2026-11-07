import { PIN } from '../constants';

let cached: Float32Array | null = null;

/** Points of the pin's lathe profile revolved around Y, for a convex-hull collider. */
export function pinHullPoints(segments = 12): Float32Array {
  if (cached) return cached;
  const pts: number[] = [];
  for (const [r, y] of PIN.profile) {
    if (r === 0) {
      pts.push(0, y, 0);
      continue;
    }
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      pts.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  cached = new Float32Array(pts);
  return cached;
}
