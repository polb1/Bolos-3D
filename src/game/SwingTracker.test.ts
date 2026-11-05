import { describe, expect, it } from 'vitest';
import { SwingTracker } from './SwingTracker';

function stroke(path: (t: number) => [number, number], duration = 0.3) {
  const s = new SwingTracker();
  for (let t = 0; t <= duration + 1e-9; t += 1 / 60) {
    const [x, z] = path(t);
    s.add(t, x, z);
  }
  return s.release()!;
}

describe('swing tracker', () => {
  it('a straight forward stroke gives its speed and no angle or curve', () => {
    const r = stroke((t) => [0, 2 - 7 * t]);
    expect(r.forward).toBeCloseTo(7, 1);
    expect(r.angle).toBeCloseTo(0, 3);
    expect(r.curve).toBeCloseTo(0, 3);
  });

  it('an angled stroke gives its direction', () => {
    const r = stroke((t) => [0.3 * t, 2 - 6 * t]);
    expect(r.angle).toBeCloseTo(Math.atan2(0.3, 6), 2);
  });

  it('a stroke bending right at the end curves right', () => {
    const r = stroke((t) => [1.5 * t * t, 2 - 6 * t]);
    expect(r.curve).toBeGreaterThan(0.01);
    const l = stroke((t) => [-1.5 * t * t, 2 - 6 * t]);
    expect(l.curve).toBeLessThan(-0.01);
  });

  it('pulling the ball back is not a throw', () => {
    expect(stroke((t) => [0, 1 + 3 * t]).forward).toBeLessThan(0);
  });

  it('no movement gives no release', () => {
    expect(new SwingTracker().release()).toBeNull();
  });
});
