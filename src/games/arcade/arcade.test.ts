import { describe, expect, it } from 'vitest';
import { BricksGame } from './bricks';
import { MAP, MazeGame, MH, MW, open } from './maze';
import { PlanesGame } from './planes';
import { PlanetGame } from './planet';
import { SnakeGame } from './snake';

describe('arcade shooters', () => {
  it('planes: auto-fire downs a fighter, a crash costs a life', () => {
    const g = new PlanesGame(() => 0.5);
    g.foes.push({ x: 0.5, y: 0.6, vx: 0, vy: 0, hp: 1, kind: 'fighter', t: 0 });
    for (let i = 0; i < 60 && !g.score; i++) g.step(1 / 60, inp());
    expect(g.score).toBe(50);
    g.safe = 0;
    g.foes = [{ x: g.me.x, y: g.me.y, vx: 0, vy: 0, hp: 1, kind: 'fighter', t: 0 }];
    g.step(0.001, inp());
    expect(g.lives).toBe(2);
  });

  it('planet: a big rock splits when shot, a rock on the planet costs a life', () => {
    const g = new PlanetGame(() => 0.5);
    g.addRock(0.5, 0.2, 3, 0);
    for (let i = 0; i < 40 && g.rocks.length < 2; i++) g.step(1 / 60, inp());
    expect(g.rocks.filter((r) => r.size === 2).length).toBe(2);
    g.rocks = [];
    g.addRock(0.5, 0.52, 1, 0);
    g.step(0.001, inp());
    expect(g.lives).toBe(2);
  });
});
import type { ArcadeInput, Dir } from './types';

const inp = (p: Partial<ArcadeInput> = {}): ArcadeInput => ({ dir: null, steer: 0, lift: 0, pointer: null, pointerY: null, fire: false, ...p });

describe('arcade', () => {
  it('maze rows are even and every crumb is reachable from the mouse', () => {
    expect(MAP.every((r) => r.length === MW)).toBe(true);
    const start = MAP.findIndex((r) => r.includes('P'));
    const seen = new Set<number>();
    const q = [[MAP[start].indexOf('P'), start]];
    while (q.length) {
      const [x, y] = q.pop()!;
      const k = y * MW + ((x + MW) % MW);
      if (seen.has(k) || !open(x, y)) continue;
      seen.add(k);
      q.push([(x + 1) % MW, y], [(x + MW - 1) % MW, y], [x, y + 1], [x, y - 1]);
    }
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if ('.o'.includes(MAP[y][x])) expect(seen.has(y * MW + x)).toBe(true);
  });

  it('mouse eats crumbs and stops at walls', () => {
    const g = new MazeGame(() => 0.5);
    g.hold = 0;
    g.cats = [];
    g.step(0.016, inp({ dir: 3 as Dir }));
    for (let i = 0; i < 120; i++) g.step(0.016, inp());
    expect(g.score).toBe(50); // five crumbs left of the start, then the wall at x=3
    expect(g.mouse.x).toBe(4);
    expect(g.mouse.dir).toBe(null);
  });

  it('a cat catching the mouse costs a life', () => {
    const g = new MazeGame(() => 0.5);
    g.hold = 0;
    g.cats = [{ m: { ...g.mouse }, kind: 0, wait: 0, scared: false }];
    g.step(0.001, inp());
    expect(g.lives).toBe(2);
  });

  it('snake grows on an apple and dies on the wall', () => {
    const s = new SnakeGame(() => 0);
    s.apple = { x: 11, y: 10 };
    s.step(0.01, inp({ dir: 0 as Dir }));
    s.queue = [];
    s.advance();
    expect(s.body.length).toBe(4);
    for (let i = 0; i < 20; i++) s.advance();
    expect(s.over).toBe(true);
  });

  it('bricks: launch, break a brick, lose the ball', () => {
    const b = new BricksGame();
    b.step(0.016, inp({ fire: true }));
    for (let i = 0; i < 300 && !b.score; i++) b.step(0.016, inp());
    expect(b.score).toBeGreaterThan(0);
    b.ball = { x: 0.02, y: 1.25, vx: 0, vy: 1 };
    b.px = 0.9;
    b.step(0.2, inp({ pointer: 0.9 }));
    expect(b.lives).toBe(2);
  });
});
