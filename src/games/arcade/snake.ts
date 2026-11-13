/** «Serpiente»: eat the apples and grow; hitting a wall or yourself ends the run. */
import { DX, DY, type ArcadeGame, type ArcadeInput, type Dir } from './types';

export const SN = 20;

export class SnakeGame implements ArcadeGame {
  score = 0;
  lives = 1;
  over = false;
  status = '';
  aspect = 1;
  body = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  dir: Dir = 1;
  queue: Dir[] = [];
  apple = { x: 15, y: 10 };
  private acc = 0;
  started = false;

  constructor(private rnd: () => number = Math.random) {}

  private get tick() {
    return Math.max(0.13 - this.body.length * 0.0015, 0.07);
  }

  step(dt: number, input: ArcadeInput) {
    this.status = this.started ? `Longitud ${this.body.length}` : 'Pulsa una flecha para empezar';
    if (this.over) return;
    if (input.dir !== null) {
      const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
      if (input.dir !== last && input.dir !== (last + 2) % 4 && this.queue.length < 2) this.queue.push(input.dir);
      this.started = true;
    }
    if (!this.started) return;
    this.acc += dt;
    while (this.acc >= this.tick && !this.over) {
      this.acc -= this.tick;
      this.advance();
    }
  }

  advance() {
    if (this.queue.length) this.dir = this.queue.shift()!;
    const h = this.body[0];
    const n = { x: h.x + DX[this.dir], y: h.y + DY[this.dir] };
    const eats = n.x === this.apple.x && n.y === this.apple.y;
    const body = eats ? this.body : this.body.slice(0, -1);
    if (n.x < 0 || n.y < 0 || n.x >= SN || n.y >= SN || body.some((b) => b.x === n.x && b.y === n.y)) {
      this.over = true;
      return;
    }
    this.body = [n, ...body];
    if (eats) {
      this.score += 10;
      this.placeApple();
    }
  }

  private placeApple() {
    const free: { x: number; y: number }[] = [];
    for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) if (!this.body.some((b) => b.x === x && b.y === y)) free.push({ x, y });
    if (free.length) this.apple = free[Math.floor(this.rnd() * free.length)];
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const s = Math.floor(Math.min(w, h) / SN);
    const ox = Math.floor((w - s * SN) / 2);
    const oy = Math.floor((h - s * SN) / 2);
    ctx.fillStyle = '#120d0a';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ox, oy);
    for (let y = 0; y < SN; y++)
      for (let x = 0; x < SN; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#2a3a22' : '#2f4226';
        ctx.fillRect(x * s, y * s, s, s);
      }
    const a = this.apple;
    const k = 0.36 + Math.sin(t * 6) * 0.03;
    ctx.fillStyle = '#c4453a';
    ctx.beginPath();
    ctx.arc((a.x + 0.5) * s, (a.y + 0.55) * s, s * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7fa36a';
    ctx.fillRect((a.x + 0.5) * s, a.y * s + s * 0.08, s * 0.18, s * 0.12);
    this.body.forEach((b, i) => {
      ctx.fillStyle = i === 0 ? '#e8c45a' : i % 2 ? '#c9a23f' : '#d6b04a';
      const m = i === 0 ? 0.04 : 0.1;
      ctx.fillRect(b.x * s + s * m, b.y * s + s * m, s * (1 - 2 * m), s * (1 - 2 * m));
    });
    const hd = this.body[0];
    ctx.fillStyle = '#1a1210';
    for (const e of [-1, 1]) {
      const ex = (hd.x + 0.5 + DX[this.dir] * 0.2 + DY[this.dir] * e * 0.2) * s;
      const ey = (hd.y + 0.5 + DY[this.dir] * 0.2 + DX[this.dir] * e * 0.2) * s;
      ctx.fillRect(ex - s * 0.06, ey - s * 0.06, s * 0.12, s * 0.12);
    }
    ctx.restore();
  }
}
