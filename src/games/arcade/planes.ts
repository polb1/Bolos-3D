/**
 * «Escuadrilla»: a vertical scroller over the sea. Your biplane fires on its own; dodge and
 * shoot down the enemy planes, the bombers take three hits and drop shells. Field is 1 × 1.4.
 */
import type { ArcadeGame, ArcadeInput } from './types';

export const PH = 1.4;
interface Thing {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  kind: 'fighter' | 'bomber' | 'shell' | 'star';
  t: number;
}

export class PlanesGame implements ArcadeGame {
  score = 0;
  lives = 3;
  over = false;
  status = '';
  aspect = 1 / PH;
  me = { x: 0.5, y: PH - 0.15 };
  shots: { x: number; y: number }[] = [];
  foes: Thing[] = [];
  booms: { x: number; y: number; t: number }[] = [];
  /** Seconds of invulnerability after a hit, and of double shot after a star. */
  safe = 2;
  power = 0;
  time = 0;
  private gun = 0;
  private spawn = 1;
  private scroll = 0;

  constructor(private rnd: () => number = Math.random) {}

  get wave() {
    return 1 + Math.floor(this.time / 30);
  }

  step(dt: number, input: ArcadeInput) {
    this.status = `Oleada ${this.wave}`;
    if (this.over) return;
    this.time += dt;
    this.scroll += dt * 0.12;
    const m = this.me;
    if (input.pointer !== null && input.pointerY !== null) {
      // Follow the finger, keeping the plane above it so it stays visible.
      const tx = input.pointer;
      const ty = input.pointerY * PH - 0.12;
      const k = Math.min(1, dt * 12);
      m.x += (tx - m.x) * k;
      m.y += (ty - m.y) * k;
    } else {
      m.x += input.steer * 0.85 * dt;
      m.y += input.lift * 0.85 * dt;
    }
    m.x = Math.min(Math.max(m.x, 0.05), 0.95);
    m.y = Math.min(Math.max(m.y, 0.35), PH - 0.06);
    this.safe = Math.max(0, this.safe - dt);
    this.power = Math.max(0, this.power - dt);

    if ((this.gun -= dt) <= 0) {
      this.gun = 0.16;
      if (this.power > 0) this.shots.push({ x: m.x - 0.025, y: m.y - 0.04 }, { x: m.x + 0.025, y: m.y - 0.04 });
      else this.shots.push({ x: m.x, y: m.y - 0.05 });
    }
    for (const s of this.shots) s.y -= 1.6 * dt;
    this.shots = this.shots.filter((s) => s.y > -0.05);

    if ((this.spawn -= dt) <= 0) {
      this.spawn = Math.max(0.9 - this.wave * 0.08, 0.35) * (0.6 + this.rnd() * 0.8);
      const bomber = this.wave > 1 && this.rnd() < 0.2;
      this.foes.push({ x: 0.08 + this.rnd() * 0.84, y: -0.06, vx: 0, vy: bomber ? 0.12 : 0.22 + this.wave * 0.02, hp: bomber ? 3 : 1, kind: bomber ? 'bomber' : 'fighter', t: this.rnd() * 6 });
      if (this.rnd() < 0.05) this.foes.push({ x: 0.1 + this.rnd() * 0.8, y: -0.05, vx: 0, vy: 0.18, hp: 1, kind: 'star', t: 0 });
    }
    for (const f of this.foes) {
      f.t += dt;
      if (f.kind === 'fighter') f.vx = Math.sin(f.t * 2) * 0.12;
      if (f.kind === 'bomber' && f.t % 2.2 < dt && f.y > 0) {
        const dx = m.x - f.x;
        const dy = m.y - f.y;
        const d = Math.hypot(dx, dy) || 1;
        this.foes.push({ x: f.x, y: f.y + 0.04, vx: (dx / d) * 0.35, vy: (dy / d) * 0.35, hp: 1, kind: 'shell', t: 0 });
      }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
    // Shots hit planes.
    for (const f of this.foes) {
      if (f.kind === 'shell' || f.kind === 'star') continue;
      const r = f.kind === 'bomber' ? 0.06 : 0.04;
      for (const s of this.shots) {
        if (s.y < -1 || Math.abs(s.x - f.x) > r || Math.abs(s.y - f.y) > r) continue;
        s.y = -2;
        if (--f.hp <= 0) {
          this.score += f.kind === 'bomber' ? 150 : 50;
          this.booms.push({ x: f.x, y: f.y, t: 0 });
          break;
        }
      }
    }
    // The player touches something.
    for (const f of this.foes) {
      if (f.hp <= 0) continue;
      const r = f.kind === 'bomber' ? 0.07 : f.kind === 'shell' ? 0.025 : 0.05;
      if (Math.abs(f.x - m.x) > r || Math.abs(f.y - m.y) > r) continue;
      if (f.kind === 'star') {
        f.hp = 0;
        this.power = 8;
        this.score += 100;
      } else if (this.safe <= 0) {
        f.hp = 0;
        this.booms.push({ x: m.x, y: m.y, t: 0 });
        this.lives--;
        this.safe = 2;
        if (this.lives <= 0) this.over = true;
      }
    }
    this.foes = this.foes.filter((f) => f.hp > 0 && f.y < PH + 0.1 && f.x > -0.1 && f.x < 1.1);
    for (const b of this.booms) b.t += dt;
    this.booms = this.booms.filter((b) => b.t < 0.5);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const s = Math.min(w, h / PH);
    ctx.fillStyle = '#0d1820';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate((w - s) / 2, (h - s * PH) / 2);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.rect(0, 0, 1, PH);
    ctx.clip();
    // Sea with drifting islands and clouds (two speeds for depth).
    ctx.fillStyle = '#1f5a73';
    ctx.fillRect(0, 0, 1, PH);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 18; i++) ctx.fillRect(((i * 0.37) % 1) - 0.02, (((i * 0.53 + this.scroll * 2) % 1.6) - 0.1), 0.06, 0.004);
    for (let i = 0; i < 3; i++) {
      const y = ((i * 0.6 + this.scroll) % 1.8) - 0.3;
      const x = [0.2, 0.75, 0.45][i];
      ctx.fillStyle = '#d9c38a';
      ctx.beginPath();
      ctx.ellipse(x, y, 0.13, 0.08, i, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5f8a4a';
      ctx.beginPath();
      ctx.ellipse(x, y, 0.1, 0.06, i, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(245,240,230,0.35)';
    for (let i = 0; i < 4; i++) {
      const y = ((i * 0.45 + this.scroll * 3) % 1.8) - 0.2;
      const x = (i * 0.29 + 0.1) % 1;
      for (const [dx, r] of [[-0.05, 0.04], [0, 0.055], [0.05, 0.04]]) {
        ctx.beginPath();
        ctx.arc(x + dx, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#f5d76e';
    for (const sh of this.shots) ctx.fillRect(sh.x - 0.004, sh.y - 0.015, 0.008, 0.03);
    for (const f of this.foes) {
      if (f.kind === 'shell') {
        ctx.fillStyle = '#f08a4a';
        ctx.beginPath();
        ctx.arc(f.x, f.y, 0.012, 0, Math.PI * 2);
        ctx.fill();
      } else if (f.kind === 'star') {
        ctx.fillStyle = Math.floor(t * 8) % 2 ? '#f5d76e' : '#fff3c4';
        ctx.font = '0.06px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', f.x, f.y);
      } else plane(ctx, f.x, f.y, f.kind === 'bomber' ? 1.5 : 1, true, f.kind === 'bomber' ? '#5a5f48' : '#8a3a30', t);
    }
    if (!this.over && (this.safe <= 0 || Math.floor(t * 10) % 2)) plane(ctx, this.me.x, this.me.y, 1, false, this.power > 0 ? '#e8b04a' : '#d9d2c0', t);
    for (const b of this.booms) {
      ctx.fillStyle = `rgba(245,${160 - b.t * 200},60,${1 - b.t * 2})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 0.02 + b.t * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Top-down biplane: wings, fuselage, tail and a spinning prop. `down` = flying towards the player. */
function plane(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, down: boolean, col: string, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, down ? -k : k);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(-0.05 + 0.015, -0.01 + 0.03, 0.1, 0.022);
  ctx.fillStyle = col;
  ctx.fillRect(-0.055, -0.012, 0.11, 0.024);
  ctx.fillRect(-0.011, -0.04, 0.022, 0.08);
  ctx.fillRect(-0.025, 0.028, 0.05, 0.012);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-0.055, 0.004, 0.11, 0.008);
  ctx.fillStyle = '#2a2420';
  ctx.beginPath();
  ctx.arc(0, -0.008, 0.007, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(240,235,220,0.6)';
  ctx.fillRect(-0.02 * Math.abs(Math.sin(t * 40)), -0.046, 0.04 * Math.abs(Math.sin(t * 40)), 0.004);
  ctx.restore();
}
