import * as S from './sprites';
import { TILE, type Floor, type G } from './sprites';

/** Top-down pixel-art hall: rooms joined by doors, all in tile units (16 px). */
export const MAP_W = 44;
export const MAP_H = 30;

interface Room {
  name: string;
  floor: Floor;
  accent: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const ROOMS: Room[] = [
  { name: 'Bolera', floor: 'bowling', accent: '#d8f24a', x0: 0, y0: 0, x1: 20, y1: 11 },
  { name: 'Billar', floor: 'pool', accent: '#4fb6ff', x0: 20, y0: 0, x1: 43, y1: 11 },
  { name: 'Dardos', floor: 'darts', accent: '#ffb84f', x0: 0, y0: 11, x1: 12, y1: 21 },
  { name: 'Vestíbulo', floor: 'lobby', accent: '#d8f24a', x0: 12, y0: 11, x1: 31, y1: 29 },
  { name: 'Sala de mesas', floor: 'hockey', accent: '#ff4f6e', x0: 31, y0: 11, x1: 43, y1: 21 },
  { name: 'Bar', floor: 'bar', accent: '#ff4fd8', x0: 0, y0: 21, x1: 12, y1: 29 },
  { name: 'Arcade', floor: 'arcade', accent: '#b06bff', x0: 31, y0: 21, x1: 43, y1: 29 },
];

const DOORS: Array<[number, number]> = [
  [16, 11], [17, 11], // bowling
  [25, 11], [26, 11], // billiards
  [12, 15], [12, 16], // darts
  [31, 15], [31, 16], // tables
  [12, 25], [12, 26], // bar
  [31, 25], [31, 26], // arcade
];

export const SPAWN = { x: 21.5, y: 27.2 };

/** Floor kind per tile, or null for a wall. */
export const tiles: Array<Array<Floor | null>> = Array.from({ length: MAP_H }, () => Array<Floor | null>(MAP_W).fill(null));
for (const r of ROOMS) for (let y = r.y0 + 1; y < r.y1; y++) for (let x = r.x0 + 1; x < r.x1; x++) tiles[y][x] = r.floor;
for (const [x, y] of DOORS) tiles[y][x] = 'lobby';

export const roomAt = (x: number, y: number) => ROOMS.find((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) ?? null;

/** Wall trim colour: the room whose interior lies below the wall. */
function accentFor(x: number, y: number) {
  return (roomAt(x + 0.5, y + 1.5) ?? roomAt(x + 0.5, y - 0.5))?.accent ?? '#4fb6ff';
}

// ------------------------------------------------------------------ props
export interface Prop {
  /** Top-left of the sprite in pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Solid footprint in tiles (x, y, w, h), or null. */
  solid: [number, number, number, number] | null;
  /** 'floor' draws under everything; 'sort' is depth-sorted with the player by its bottom edge. */
  layer: 'floor' | 'sort';
  draw(g: G, t: number): void;
  animated?: boolean;
}

const props: Prop[] = [];
const T = TILE;

/** A prop whose footprint starts at tile (tx, ty) and whose sprite may rise above it. */
function add(tx: number, ty: number, w: number, h: number, draw: (g: G, t: number) => void, opts: Partial<Prop> & { foot?: [number, number] | null } = {}) {
  const foot = opts.foot === undefined ? [w / T, Math.max(1, Math.round(h / T))] : opts.foot;
  props.push({
    x: tx * T,
    y: ty * T + (foot ? foot[1] * T : h) - h,
    w,
    h,
    solid: foot ? [tx, ty, foot[0], foot[1]] : null,
    layer: 'sort',
    draw,
    ...opts,
  });
}

// Bowling: four lanes into the north wall, ball returns and benches.
[2, 6, 10, 14].forEach((tx, i) => add(tx, 1, 32, 112, (g) => S.lane(g, i + 1), { layer: 'floor', foot: null }));
props.push({ x: 2 * T, y: T, w: 14 * T, h: 7 * T, solid: [2, 1, 14, 7], layer: 'floor', draw: () => {} });
for (const tx of [4.5, 12.5]) add(tx, 8, 16, 32, S.ballReturn, { foot: [1, 1] }); // leave a full tile free below: the approach must stay walkable
add(2, 10, 48, 14, (g) => S.sofa(g, 48, '#1d4fc4'), { foot: [3, 0.9] });
add(13, 10, 48, 14, (g) => S.sofa(g, 48, '#1d4fc4'), { foot: [3, 0.9] });
add(18, 1, 16, 16, S.plant);

// Billiards.
add(24, 4, 64, 32, S.poolTable);
add(34, 4, 64, 32, S.poolTable);
for (const [x, y] of [[21, 1], [42, 1], [21, 9], [42, 9]]) add(x, y, 16, 16, S.plant);

// Darts: three boards on the west wall, oche lines and high tables.
const dartColors = ['#ffb84f', '#ff4fd8', '#4fb6ff'];
[13, 16, 19].forEach((ty, i) => {
  props.push({ x: 0, y: ty * T, w: 16, h: 16, solid: null, layer: 'floor', draw: (g) => S.dartboard(g, dartColors[i]) });
  props.push({ x: 4 * T, y: ty * T - 6, w: 2, h: 28, solid: null, layer: 'floor', draw: (g) => S.px(g, 0, 0, 2, 28, dartColors[i]) });
});
add(8, 14, 16, 16, S.highTable);
add(8, 18, 16, 16, S.highTable);

// Tables room: two air hockey and two foosball tables.
add(33, 13, 64, 32, (g, t) => S.airHockey(g, '#ff3355', t), { animated: true });
add(33, 17, 64, 32, (g, t) => S.airHockey(g, '#3a8bff', t + 1.3), { animated: true });
add(38.5, 13, 48, 32, S.foosball);
add(38.5, 17, 48, 32, S.foosball);

// Arcade: two rows of cabinets.
[33, 35, 37, 39, 41].forEach((tx, i) => add(tx, 22, 16, 28, (g, t) => S.arcadeCabinet(g, (i * 67 + 280) % 360, t, i), { animated: true }));
[34, 36, 38, 40].forEach((tx, i) => add(tx, 26, 16, 28, (g, t) => S.arcadeCabinet(g, (i * 53 + 20) % 360, t, i + 7), { animated: true }));

// Bar and chill zone.
props.push({ x: 2 * T, y: 21 * T, w: 7 * T, h: 16, solid: null, layer: 'floor', draw: (g) => S.backBar(g, 7 * T) });
add(2, 23, 7 * T, 16, (g) => S.barCounter(g, 7 * T));
for (const tx of [2.5, 4.5, 6.5, 8.5]) add(tx, 24.3, 16, 16, S.stool, { foot: [0.7, 0.6] });
add(1, 27, 48, 14, (g) => S.sofa(g, 48, '#3b2a6b'), { foot: [3, 0.9] });
add(6, 27, 48, 14, (g) => S.sofa(g, 48, '#3b2a6b'), { foot: [3, 0.9] });
add(10, 22, 16, 16, S.plant);
add(10, 27.2, 16, 16, S.plant);

// Lobby: logo rug, pillars, reception and plants.
props.push({
  x: 17 * T,
  y: 15 * T,
  w: 10 * T,
  h: 4 * T,
  solid: null,
  layer: 'floor',
  draw: (g) => {
    S.rug(g, 10 * T, 4 * T);
    S.pixelText(g, 'VIRTUAL', 5 * T, 22, '#ffffff', 14);
    S.pixelText(g, 'ARCADE', 5 * T, 42, '#d8f24a', 14);
  },
});
for (const [x, y] of [[15, 13], [28, 13], [15, 21], [28, 21]]) add(x, y, 16, 30, (g, t) => S.pillar(g, t), { animated: true, foot: [1, 1] });
add(16, 25, 64, 16, (g) => S.reception(g, 64));
for (const [x, y] of [[13, 12], [30, 12], [13, 28], [30, 28]]) add(x, y, 16, 16, S.plant);

export const PROPS = props;

/** Neon signs painted on the wall row above each room. */
export const SIGNS: Array<{ text: string; x: number; y: number; color: string }> = [
  { text: 'BOWLING', x: 9.5, y: 0.6, color: '#d8f24a' },
  { text: 'BILLAR', x: 31.5, y: 0.6, color: '#4fb6ff' },
  { text: 'DARDOS', x: 6, y: 11.6, color: '#ffb84f' },
  { text: 'AIR HOCKEY · FUTBOLÍN', x: 37, y: 11.6, color: '#ff4f6e' },
  { text: 'BAR', x: 5.5, y: 21.4, color: '#ff4fd8' },
  { text: 'ARCADE', x: 37, y: 21.4, color: '#b06bff' },
];

/** Static layer: floors, walls and non-animated floor props, drawn once. */
export function drawStatic(g: G) {
  const tile = document.createElement('canvas');
  tile.width = tile.height = T;
  const tg = tile.getContext('2d')!;
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      tg.clearRect(0, 0, T, T);
      const f = tiles[y][x];
      if (f) S.floorTile(tg, f, x, y);
      else S.wallTile(tg, x, y, !!tiles[y + 1]?.[x], accentFor(x, y));
      g.drawImage(tile, x * T, y * T);
    }
  // Glass entrance doors in the south wall.
  S.px(g, 21 * T, 29 * T + 2, 2 * T, 12, '#1b3f73');
  S.px(g, 21 * T, 29 * T + 2, 2 * T, 1, '#d8f24a');
  S.px(g, 22 * T, 29 * T + 2, 1, 12, '#d8f24a');
  // Cue rack on the billiards wall.
  for (let i = 0; i < 6; i++) S.px(g, 29 * T + 4 + i * 4, 4, 1, 11, '#d9b27a');
  for (const p of props) if (p.layer === 'floor') {
    g.save();
    g.translate(p.x, p.y);
    p.draw(g, 0);
    g.restore();
  }
  for (const s of SIGNS) S.pixelText(g, s.text, s.x * T, s.y * T + 3, s.color, 8);
}

/** Solid boxes in tile units for the player collision. */
export function solids() {
  const out: Array<[number, number, number, number]> = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (!tiles[y][x]) out.push([x, y, 1, 1]);
  for (const p of props) if (p.solid) out.push(p.solid);
  return out;
}
