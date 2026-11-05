/**
 * Turns the player's drag of the ball into a release: speed and direction come
 * from the hand's velocity just before letting go, and the hook from how much
 * the stroke curved at the end (like rotating the wrist through the release).
 */
export interface Release {
  /** m/s along the hand's final direction. */
  speed: number;
  /** Forward component (m/s, + = towards the pins). */
  forward: number;
  /** rad, + = towards the right. */
  angle: number;
  /** Change of direction at the end of the stroke (rad, + = curving right). */
  curve: number;
}

interface Sample {
  t: number;
  x: number;
  z: number;
}

const FINAL = 0.08; // s window for the release velocity
const EARLY = 0.22; // s window start for the curvature reference

export class SwingTracker {
  private samples: Sample[] = [];

  reset() {
    this.samples = [];
  }

  add(t: number, x: number, z: number) {
    this.samples.push({ t, x, z });
    const cutoff = t - 0.5;
    while (this.samples.length > 2 && this.samples[0].t < cutoff) this.samples.shift();
  }

  private velocity(from: number, to: number): { vx: number; vz: number } | null {
    const win = this.samples.filter((s) => s.t >= from - 1e-6 && s.t <= to + 1e-6);
    if (win.length < 2) return null;
    const a = win[0];
    const b = win[win.length - 1];
    const dt = b.t - a.t;
    if (dt < 0.012) return null;
    return { vx: (b.x - a.x) / dt, vz: (b.z - a.z) / dt };
  }

  release(): Release | null {
    const end = this.samples[this.samples.length - 1]?.t;
    if (end === undefined) return null;
    const v1 = this.velocity(end - FINAL, end) ?? this.velocity(end - EARLY, end);
    if (!v1) return null;
    const forward = -v1.vz;
    const angle = Math.atan2(v1.vx, forward);
    const v0 = this.velocity(end - EARLY, end - FINAL);
    const curve = v0 && -v0.vz > 0.3 ? angle - Math.atan2(v0.vx, -v0.vz) : 0;
    return { speed: Math.hypot(v1.vx, v1.vz), forward, angle, curve };
  }
}
