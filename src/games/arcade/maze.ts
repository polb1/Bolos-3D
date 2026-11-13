/**
 * «Ratón glotón»: a maze chase. A mouse eats every crumb while cats hunt it; a cheese
 * wheel scares the cats for a few seconds and the mouse can catch them.
 * Grid movement: each mover is on tile (x, y) heading `dir` with progress p (0..1).
 */
import { DX, DY, type ArcadeGame, type ArcadeInput, type Dir } from './types';

// # wall · crumb  o cheese  - pen door (wall)  C cat home  P mouse start  (space) empty
export const MAP = [
  '###################',
  '#........#........#',
  '#o##.###.#.###.##o#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.### # ###.####',
  '   #.#       #.#   ',
  '####.# ##-## #.####',
  '    .  #CCC#  .    ',
  '####.# ##### #.####',
  '   #.#       #.#   ',
  '####.# ##### #.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o.#.....P.....#.o#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################',
];
export const MW = MAP[0].length;
export const MH = MAP.length;
const at = (ch: string) => {
  const out: { x: number; y: number }[] = [];
  MAP.forEach((r, y) => [...r].forEach((c, x) => c === ch && out.push({ x, y })));
  return out;
};
const START = at('P')[0];
const HOMES = at('C');
/** Where a released cat appears: just above the pen door. */
const EXIT = { x: at('-')[0].x, y: at('-')[0].y - 1 };

const wrap = (x: number) => (x + MW) % MW;
export const open = (x: number, y: number) => y >= 0 && y < MH && !'#-'.includes(MAP[y][wrap(x)]);

export interface Mover {
  x: number;
  y: number;
  dir: Dir | null;
  p: number;
}
interface Cat {
  m: Mover;
  kind: number;
  /** Seconds left in the pen (0 = out). */
  wait: number;
  scared: boolean;
}
const reverse = (d: Dir) => ((d + 2) % 4) as Dir;
export const posOf = (m: Mover) => {
  const d = m.dir ?? 0;
  const k = m.dir === null ? 0 : m.p;
  return { x: m.x + DX[d] * k, y: m.y + DY[d] * k };
};
const CAT_COLORS = ['#e07a3f', '#9a9a9a', '#3a3030', '#e8d6b8'];

export class MazeGame implements ArcadeGame {
  score = 0;
  lives = 3;
  over = false;
  status = '';
  aspect = MW / MH;
  level = 1;
  mouse: Mover = { ...START, dir: null, p: 0 };
  want: Dir | null = null;
  cats: Cat[] = [];
  /** 1 = crumb, 2 = cheese, 0 = eaten. */
  food = new Uint8Array(MW * MH);
  left = 0;
  fright = 0;
  combo = 0;
  /** Pause after being caught or clearing the maze. */
  hold = 1.5;
  private cleared = false;

  constructor(private rnd: () => number = Math.random) {
    this.fill();
    this.reset();
  }

  private fill() {
    this.left = 0;
    MAP.forEach((r, y) => [...r].forEach((c, x) => {
      const v = c === '.' ? 1 : c === 'o' ? 2 : 0;
      this.food[y * MW + x] = v;
      if (v) this.left++;
    }));
  }

  private reset() {
    this.mouse = { ...START, dir: null, p: 0 };
    this.want = null;
    this.fright = 0;
    this.cats = HOMES.map((h, i) => ({ m: { ...h, dir: null, p: 0 }, kind: i, wait: 1 + i * 3, scared: false }));
    this.cats.push({ m: { ...EXIT, dir: 3, p: 0 }, kind: 3, wait: 0, scared: false });
  }

  private get speed() {
    return 5.2;
  }
  private catSpeed(c: Cat) {
    return c.scared ? 2.6 : Math.min(3.6 + this.level * 0.3, 5);
  }

  step(dt: number, input: ArcadeInput) {
    this.status = `Nivel ${this.level}`;
    if (this.over) return;
    if (input.dir !== null) this.want = input.dir;
    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold <= 0 && this.cleared) {
        this.cleared = false;
        this.level++;
        this.fill();
        this.reset();
      }
      return;
    }
    this.moveMouse(this.speed * dt);
    for (const c of this.cats) {
      if (c.wait > 0) {
        c.wait -= dt;
        if (c.wait <= 0) c.m = { ...EXIT, dir: this.rnd() < 0.5 ? 1 : 3, p: 0 };
        continue;
      }
      this.moveCat(c, this.catSpeed(c) * dt);
    }
    if (this.fright > 0 && (this.fright -= dt) <= 0) this.cats.forEach((c) => (c.scared = false));
    this.collide();
  }

  private moveMouse(dist: number) {
    const m = this.mouse;
    const w = this.want;
    if (m.dir === null) {
      if (w === null || !open(m.x + DX[w], m.y + DY[w])) return;
      m.dir = w;
      m.p = 0;
    }
    if (w !== null && w === reverse(m.dir) && m.p > 0) {
      m.x = wrap(m.x + DX[m.dir]);
      m.y += DY[m.dir];
      m.p = 1 - m.p;
      m.dir = w;
    }
    m.p += dist;
    while (m.p >= 1 && m.dir !== null) {
      m.x = wrap(m.x + DX[m.dir]);
      m.y += DY[m.dir];
      m.p -= 1;
      this.eat(m.x, m.y);
      if (w !== null && open(m.x + DX[w], m.y + DY[w])) m.dir = w;
      else if (!open(m.x + DX[m.dir], m.y + DY[m.dir])) {
        m.dir = null;
        m.p = 0;
      }
    }
  }

  private eat(x: number, y: number) {
    const i = y * MW + x;
    const f = this.food[i];
    if (!f) return;
    this.food[i] = 0;
    this.left--;
    this.score += f === 2 ? 50 : 10;
    if (f === 2) {
      this.fright = Math.max(7 - this.level * 0.5, 3);
      this.combo = 0;
      for (const c of this.cats) {
        if (c.wait > 0) continue;
        c.scared = true;
        if (c.m.dir !== null && c.m.p > 0) {
          c.m.x = wrap(c.m.x + DX[c.m.dir]);
          c.m.y += DY[c.m.dir];
          c.m.p = 1 - c.m.p;
          c.m.dir = reverse(c.m.dir);
        }
      }
    }
    if (this.left === 0) {
      this.cleared = true;
      this.hold = 2;
    }
  }

  private target(c: Cat) {
    const m = this.mouse;
    if (c.kind === 1 && m.dir !== null) return { x: m.x + DX[m.dir] * 4, y: m.y + DY[m.dir] * 4 };
    if (c.kind === 2 && Math.hypot(c.m.x - m.x, c.m.y - m.y) < 7) return { x: 1, y: MH - 2 };
    return m;
  }

  private moveCat(c: Cat, dist: number) {
    const m = c.m;
    if (m.dir === null) m.dir = 3;
    m.p += dist;
    while (m.p >= 1) {
      m.x = wrap(m.x + DX[m.dir]);
      m.y += DY[m.dir];
      m.p -= 1;
      const dirs = ([0, 1, 2, 3] as Dir[]).filter((d) => open(m.x + DX[d], m.y + DY[d]));
      const ok = dirs.length > 1 ? dirs.filter((d) => d !== reverse(m.dir!)) : dirs;
      // Scared or the wandering cat (and a dash of randomness so they never move as one) pick at random.
      if (c.scared || c.kind === 3 || this.rnd() < 0.15) m.dir = ok[Math.floor(this.rnd() * ok.length)];
      else {
        const t = this.target(c);
        m.dir = ok.reduce((a, b) => (Math.hypot(m.x + DX[b] - t.x, m.y + DY[b] - t.y) < Math.hypot(m.x + DX[a] - t.x, m.y + DY[a] - t.y) ? b : a));
      }
    }
  }

  private collide() {
    const a = posOf(this.mouse);
    for (const c of this.cats) {
      if (c.wait > 0) continue;
      const b = posOf(c.m);
      let dx = Math.abs(a.x - b.x);
      dx = Math.min(dx, MW - dx);
      if (dx + Math.abs(a.y - b.y) > 0.7) continue;
      if (c.scared) {
        this.score += 200 << this.combo++;
        c.scared = false;
        c.m = { ...HOMES[1], dir: null, p: 0 };
        c.wait = 3;
      } else {
        this.lives--;
        this.hold = 1.5;
        if (this.lives <= 0) this.over = true;
        else this.reset();
        return;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const s = Math.floor(Math.min(w / MW, h / MH));
    const ox = Math.floor((w - s * MW) / 2);
    const oy = Math.floor((h - s * MH) / 2);
    ctx.fillStyle = '#120d0a';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.beginPath();
    ctx.rect(0, 0, s * MW, s * MH);
    ctx.clip();
    // Walls: warm wooden blocks with a lighter top edge.
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++) {
        const c = MAP[y][x];
        if (c === '#') {
          ctx.fillStyle = '#6b3f22';
          ctx.fillRect(x * s, y * s, s, s);
          ctx.fillStyle = '#8e5a32';
          ctx.fillRect(x * s + 1, y * s + 1, s - 2, s * 0.35);
        } else if (c === '-') {
          ctx.fillStyle = '#d9a35a';
          ctx.fillRect(x * s, y * s + s * 0.4, s, s * 0.2);
        }
        const f = this.food[y * MW + x];
        if (f === 1) {
          ctx.fillStyle = '#f2d27a';
          ctx.fillRect(x * s + s * 0.42, y * s + s * 0.42, s * 0.16, s * 0.16);
        } else if (f === 2) {
          const k = 0.75 + Math.sin(t * 6) * 0.1;
          ctx.fillStyle = '#f5c542';
          ctx.beginPath();
          ctx.moveTo(x * s + s * 0.15, y * s + s * (0.85 - 0.6 * k + 0.1));
          ctx.lineTo(x * s + s * 0.85, y * s + s * 0.85);
          ctx.lineTo(x * s + s * 0.15, y * s + s * 0.85);
          ctx.fill();
        }
      }
    for (const c of this.cats) this.drawCat(ctx, c, s, t);
    if (!this.over && (this.hold <= 0 || this.cleared || Math.floor(t * 6) % 2)) this.drawMouse(ctx, s, t);
    ctx.restore();
  }

  private drawMouse(ctx: CanvasRenderingContext2D, s: number, t: number) {
    const p = posOf(this.mouse);
    const ang = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][this.mouse.dir ?? (this.want ?? 1)];
    ctx.save();
    ctx.translate((p.x + 0.5) * s, (p.y + 0.5) * s);
    ctx.rotate(ang);
    const wig = this.mouse.dir === null ? 0 : Math.sin(t * 20) * 0.08;
    ctx.strokeStyle = '#d88a8a';
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.beginPath();
    ctx.moveTo(-s * 0.35, 0);
    ctx.quadraticCurveTo(-s * 0.6, s * (0.25 + wig), -s * 0.75, 0);
    ctx.stroke();
    ctx.fillStyle = '#b8b2aa';
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.42, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8a0a0';
    for (const e of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 0.08, e * s * 0.28, s * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(s * 0.42, 0, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1210';
    for (const e of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 0.22, e * s * 0.1, s * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawCat(ctx: CanvasRenderingContext2D, c: Cat, s: number, t: number) {
    const p = c.wait > 0 ? { x: c.m.x, y: c.m.y + Math.sin(t * 4 + c.kind) * 0.15 } : posOf(c.m);
    const blink = c.scared && this.fright < 2 && Math.floor(t * 8) % 2;
    const col = c.scared ? (blink ? '#f0e6d8' : '#5a7bb8') : CAT_COLORS[c.kind];
    const cx = (p.x + 0.5) * s;
    const cy = (p.y + 0.5) * s;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.4, cy - s * 0.05);
    ctx.lineTo(cx - s * 0.36, cy - s * 0.46);
    ctx.lineTo(cx - s * 0.12, cy - s * 0.28);
    ctx.lineTo(cx + s * 0.12, cy - s * 0.28);
    ctx.lineTo(cx + s * 0.36, cy - s * 0.46);
    ctx.lineTo(cx + s * 0.4, cy - s * 0.05);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.05, s * 0.42, s * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    const look = c.m.dir ?? 2;
    const ex = DX[look] * s * 0.05;
    const ey = DY[look] * s * 0.05;
    ctx.fillStyle = c.scared ? '#f0e6d8' : '#f5e27a';
    for (const e of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + e * s * 0.15 + ex, cy + ey, s * 0.09, s * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!c.scared) {
      ctx.fillStyle = '#1a1210';
      for (const e of [-1, 1]) ctx.fillRect(cx + e * s * 0.15 + ex * 1.6 - s * 0.02, cy + ey * 1.6 - s * 0.08, s * 0.04, s * 0.16);
    }
  }
}
