/** «Ladrillos»: bounce the ball off the paddle and break every brick. Field is 1 wide × 1.3 tall. */
import type { ArcadeGame, ArcadeInput } from './types';

const FH = 1.3;
const COLS = 10;
const ROWS = 6;
const BW = 1 / COLS;
const BH = 0.045;
const TOP = 0.12;
const PW = 0.2;
const PY = FH - 0.08;
const BR = 0.013;
const COLORS = ['#c4553a', '#d9783f', '#e8a24a', '#c9b45a', '#7fa36a', '#5f8fa8'];

export class BricksGame implements ArcadeGame {
  score = 0;
  lives = 3;
  over = false;
  status = '';
  aspect = 1 / FH;
  level = 1;
  px = 0.5;
  ball = { x: 0.5, y: PY - BR, vx: 0, vy: 0 };
  stuck = true;
  bricks: boolean[] = [];

  constructor() {
    this.bricks = new Array(COLS * ROWS).fill(true);
  }

  private get speed() {
    return 0.75 + this.level * 0.08;
  }

  step(dt: number, input: ArcadeInput) {
    this.status = this.stuck ? 'Espacio o toca para sacar' : `Nivel ${this.level}`;
    if (this.over) return;
    if (input.pointer !== null) this.px = input.pointer;
    else this.px += input.steer * 1.3 * dt;
    this.px = Math.min(Math.max(this.px, PW / 2), 1 - PW / 2);
    const b = this.ball;
    if (this.stuck) {
      b.x = this.px;
      b.y = PY - BR;
      if (input.fire) {
        this.stuck = false;
        b.vx = this.speed * 0.45;
        b.vy = -this.speed * 0.9;
      }
      return;
    }
    // Substeps so the fast ball never tunnels through a brick.
    const n = 4;
    for (let i = 0; i < n && !this.stuck; i++) this.move(dt / n);
  }

  private move(dt: number) {
    const b = this.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < BR) (b.x = BR), (b.vx = Math.abs(b.vx));
    if (b.x > 1 - BR) (b.x = 1 - BR), (b.vx = -Math.abs(b.vx));
    if (b.y < BR) (b.y = BR), (b.vy = Math.abs(b.vy));
    if (b.vy > 0 && b.y + BR >= PY && b.y < PY + 0.02 && Math.abs(b.x - this.px) < PW / 2 + BR) {
      // Where it lands on the paddle sets the angle: centre goes straight up, edges go wide.
      const k = (b.x - this.px) / (PW / 2);
      const a = k * 1.05;
      b.vx = Math.sin(a) * this.speed;
      b.vy = -Math.cos(a) * this.speed;
      b.y = PY - BR;
    }
    if (b.y > FH + 0.05) {
      this.lives--;
      this.stuck = true;
      if (this.lives <= 0) this.over = true;
      return;
    }
    const c = Math.floor(b.x / BW);
    const r = Math.floor((b.y - TOP) / BH);
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS && this.bricks[r * COLS + c]) {
      this.bricks[r * COLS + c] = false;
      this.score += (ROWS - r) * 10;
      // Bounce off the side it came through.
      const inX = Math.min(b.x - c * BW, (c + 1) * BW - b.x) / BW;
      const inY = Math.min(b.y - TOP - r * BH, TOP + (r + 1) * BH - b.y) / BH;
      if (inX < inY) b.vx = -b.vx;
      else b.vy = -b.vy;
      if (!this.bricks.some(Boolean)) {
        this.level++;
        this.bricks.fill(true);
        this.stuck = true;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const s = Math.min(w, h / FH);
    const ox = (w - s) / 2;
    const oy = (h - s * FH) / 2;
    ctx.fillStyle = '#120d0a';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    ctx.fillStyle = '#1d1511';
    ctx.fillRect(0, 0, 1, FH);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        if (!this.bricks[r * COLS + c]) continue;
        ctx.fillStyle = COLORS[r];
        ctx.fillRect(c * BW + 0.003, TOP + r * BH + 0.003, BW - 0.006, BH - 0.006);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(c * BW + 0.003, TOP + r * BH + 0.003, BW - 0.006, BH * 0.25);
      }
    ctx.fillStyle = '#d9a35a';
    ctx.fillRect(this.px - PW / 2, PY, PW, 0.018);
    ctx.fillStyle = '#f5ead8';
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, BR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
