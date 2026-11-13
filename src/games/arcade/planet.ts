/**
 * «Planeta en peligro»: a cannon on a small planet shoots the rocks falling on it. The gun
 * fires on its own; turn it with ← → or point where to shoot. Big rocks split in two.
 * Field is 1 × 1 with the planet in the middle.
 */
import type { ArcadeGame, ArcadeInput } from './types';

const PR = 0.09;
const SIZES = [0, 0.018, 0.03, 0.045];
interface Rock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  shape: number[];
}

export class PlanetGame implements ArcadeGame {
  score = 0;
  lives = 3;
  over = false;
  status = '';
  aspect = 1;
  aim = -Math.PI / 2;
  shots: { x: number; y: number; vx: number; vy: number }[] = [];
  rocks: Rock[] = [];
  booms: { x: number; y: number; t: number; big: boolean }[] = [];
  time = 0;
  shake = 0;
  private gun = 0;
  private spawn = 0.5;
  private stars: [number, number, number][];

  constructor(private rnd: () => number = Math.random) {
    this.stars = Array.from({ length: 70 }, () => [this.rnd(), this.rnd(), this.rnd()]);
  }

  get level() {
    return 1 + Math.floor(this.time / 25);
  }

  addRock(x: number, y: number, size: number, speed: number) {
    const a = Math.atan2(0.5 - y, 0.5 - x) + (this.rnd() - 0.5) * 0.5;
    this.rocks.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, size, spin: this.rnd() * 6, shape: Array.from({ length: 9 }, () => 0.75 + this.rnd() * 0.35) });
  }

  step(dt: number, input: ArcadeInput) {
    this.status = `Nivel ${this.level}`;
    if (this.over) return;
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt);
    if (input.pointer !== null && input.pointerY !== null) this.aim = Math.atan2(input.pointerY - 0.5, input.pointer - 0.5);
    else this.aim += input.steer * 3 * dt;

    if ((this.gun -= dt) <= 0) {
      this.gun = 0.2;
      const c = Math.cos(this.aim);
      const s = Math.sin(this.aim);
      this.shots.push({ x: 0.5 + c * (PR + 0.03), y: 0.5 + s * (PR + 0.03), vx: c * 1.1, vy: s * 1.1 });
    }
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.shots = this.shots.filter((s) => s.x > -0.05 && s.x < 1.05 && s.y > -0.05 && s.y < 1.05);

    if ((this.spawn -= dt) <= 0) {
      this.spawn = Math.max(1.6 - this.level * 0.15, 0.6);
      const a = this.rnd() * Math.PI * 2;
      this.addRock(0.5 + Math.cos(a) * 0.75, 0.5 + Math.sin(a) * 0.75, this.rnd() < 0.5 ? 3 : 2, 0.07 + this.level * 0.012);
    }
    for (const r of this.rocks) {
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.spin += dt;
    }
    const hit: Rock[] = [];
    for (const r of this.rocks) {
      const rad = SIZES[r.size];
      for (const s of this.shots) {
        if (Math.hypot(s.x - r.x, s.y - r.y) > rad + 0.006) continue;
        s.x = -1;
        hit.push(r);
        break;
      }
    }
    this.shots = this.shots.filter((s) => s.x >= 0);
    for (const r of hit) {
      this.rocks.splice(this.rocks.indexOf(r), 1);
      this.score += [0, 50, 20, 10][r.size];
      this.booms.push({ x: r.x, y: r.y, t: 0, big: false });
      if (r.size > 1) {
        const sp = Math.hypot(r.vx, r.vy) * 1.25;
        // The halves fly off sideways, then fall back in.
        for (const side of [-1, 1]) {
          const a = Math.atan2(r.vy, r.vx) + side * 0.7;
          this.rocks.push({ ...r, size: r.size - 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, shape: r.shape.map((v, i) => (i % 2 ? v : 1.8 - v)) });
        }
      }
    }
    for (const r of [...this.rocks]) {
      if (Math.hypot(r.x - 0.5, r.y - 0.5) > PR + SIZES[r.size] * 0.8) continue;
      this.rocks.splice(this.rocks.indexOf(r), 1);
      this.booms.push({ x: r.x, y: r.y, t: 0, big: true });
      this.lives--;
      this.shake = 0.4;
      if (this.lives <= 0) this.over = true;
    }
    // Pieces that drift away for good are dropped.
    this.rocks = this.rocks.filter((r) => Math.hypot(r.x - 0.5, r.y - 0.5) < 1);
    for (const b of this.booms) b.t += dt;
    this.booms = this.booms.filter((b) => b.t < 0.6);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const s = Math.min(w, h);
    ctx.fillStyle = '#07060c';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    const j = this.shake * 0.02;
    ctx.translate((w - s) / 2 + (Math.random() - 0.5) * j * s, (h - s) / 2 + (Math.random() - 0.5) * j * s);
    ctx.scale(s, s);
    for (const [x, y, b] of this.stars) {
      ctx.fillStyle = `rgba(255,245,225,${0.3 + b * 0.6 * (0.7 + 0.3 * Math.sin(t * 2 + x * 40))})`;
      ctx.fillRect(x, y, 0.003 + b * 0.002, 0.003 + b * 0.002);
    }
    // Planet: warm bands, a soft atmosphere and the lit side.
    const g = ctx.createRadialGradient(0.5, 0.5, PR, 0.5, 0.5, PR * 1.6);
    g.addColorStop(0, 'rgba(240,170,100,0.35)');
    g.addColorStop(1, 'rgba(240,170,100,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0.5 - PR * 1.6, 0.5 - PR * 1.6, PR * 3.2, PR * 3.2);
    ctx.save();
    ctx.beginPath();
    ctx.arc(0.5, 0.5, PR, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#c4703f';
    ctx.fillRect(0.5 - PR, 0.5 - PR, PR * 2, PR * 2);
    ['#d9935a', '#a85a35', '#e0b07a', '#b8643a'].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(0.5 - PR, 0.5 - PR + i * PR * 0.5 + 0.01, PR * 2, PR * 0.18);
    });
    ctx.fillStyle = 'rgba(10,6,20,0.45)';
    ctx.beginPath();
    ctx.arc(0.5 + PR * 0.5, 0.5 + PR * 0.5, PR * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Cannon.
    ctx.save();
    ctx.translate(0.5, 0.5);
    ctx.rotate(this.aim);
    ctx.fillStyle = '#5a4a40';
    ctx.fillRect(PR - 0.01, -0.009, 0.04, 0.018);
    ctx.fillStyle = '#e8d6b8';
    ctx.beginPath();
    ctx.arc(PR - 0.005, 0, 0.016, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#f5d76e';
    for (const sh of this.shots) {
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, 0.005, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const r of this.rocks) {
      const rad = SIZES[r.size];
      ctx.fillStyle = '#7a6a5c';
      ctx.strokeStyle = '#a89482';
      ctx.lineWidth = 0.003;
      ctx.beginPath();
      r.shape.forEach((k, i) => {
        const a = r.spin + (i / r.shape.length) * Math.PI * 2;
        const fn = i ? 'lineTo' : 'moveTo';
        ctx[fn](r.x + Math.cos(a) * rad * k, r.y + Math.sin(a) * rad * k);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    for (const b of this.booms) {
      ctx.fillStyle = `rgba(245,${180 - b.t * 200},80,${1 - b.t / 0.6})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, (b.big ? 0.03 : 0.01) + b.t * (b.big ? 0.15 : 0.08), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
