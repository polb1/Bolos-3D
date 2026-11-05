/** Axis-aligned box on the floor plane (metres). */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const box = (x: number, z: number, w: number, d: number): Box => ({
  minX: x - w / 2,
  maxX: x + w / 2,
  minZ: z - d / 2,
  maxZ: z + d / 2,
});

/**
 * Pushes a circle (the player) out of every box it overlaps. Run after each
 * move; a few passes settle corners where two boxes meet.
 */
export function resolve(p: { x: number; z: number }, r: number, boxes: Box[]) {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const b of boxes) {
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
      let dx = p.x - cx;
      let dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.z = cz + (dz / d) * r;
      } else {
        // Centre inside the box: leave by the nearest face.
        const out = [p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z];
        const i = out.indexOf(Math.min(...out));
        dx = i === 0 ? -1 : i === 1 ? 1 : 0;
        dz = i === 2 ? -1 : i === 3 ? 1 : 0;
        if (dx) p.x = (dx < 0 ? b.minX : b.maxX) + dx * r;
        else p.z = (dz < 0 ? b.minZ : b.maxZ) + dz * r;
      }
      moved = true;
    }
    if (!moved) return;
  }
}
