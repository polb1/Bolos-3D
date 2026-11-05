/**
 * Pixel-art sprites drawn procedurally, one game pixel = one canvas unit.
 * Everything is drawn at 1× and scaled up with nearest-neighbour by the world.
 */
import type { Outfit } from './worldStore';

export type G = CanvasRenderingContext2D;
export const TILE = 16;

export const px = (g: G, x: number, y: number, w: number, h: number, c: string) => {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
};

/** Deterministic per-tile noise so floors vary without flicker. */
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

// ------------------------------------------------------------------ floors & walls
export type Floor = 'lobby' | 'bowling' | 'pool' | 'darts' | 'hockey' | 'arcade' | 'bar';

export function floorTile(g: G, kind: Floor, tx: number, ty: number) {
  const r = hash(tx, ty);
  switch (kind) {
    case 'lobby': {
      px(g, 0, 0, 16, 16, '#141a33');
      const c = ['#d8f24a', '#4fb6ff', '#ff4fd8', '#7dffd9'][Math.floor(r * 4)];
      if (r > 0.55) px(g, Math.floor(r * 12) + 1, Math.floor(hash(ty, tx) * 12) + 1, 2, 2, c + '88');
      if (r < 0.12) px(g, 3, 9, 4, 1, '#ffffff22');
      break;
    }
    case 'bowling':
      px(g, 0, 0, 16, 16, '#d9b07a');
      for (let x = 0; x < 16; x += 4) px(g, x, 0, 1, 16, '#b88d58');
      px(g, (tx * 5) % 4 * 4, Math.floor(r * 16), 4, 1, '#a57a47');
      break;
    case 'pool':
      px(g, 0, 0, 16, 16, '#123a2e');
      if ((tx + ty) % 2 === 0) {
        px(g, 7, 3, 2, 2, '#1d5442');
        px(g, 5, 5, 6, 2, '#1d5442');
        px(g, 7, 7, 2, 2, '#1d5442');
      }
      break;
    case 'darts':
      px(g, 0, 0, 16, 16, '#4a2c1c');
      px(g, 0, (ty % 2) * 8 + 7, 16, 1, '#3a2014');
      px(g, (tx % 2) * 8 + 3, ty % 2 ? 8 : 0, 1, 8, '#3a2014');
      if (r > 0.8) px(g, 9, 3, 3, 1, '#5d3a26');
      break;
    case 'hockey':
      px(g, 0, 0, 16, 16, (tx + ty) % 2 ? '#1c3f73' : '#23508f');
      px(g, 0, 0, 16, 1, '#ffffff14');
      px(g, 0, 0, 1, 16, '#ffffff14');
      break;
    case 'arcade':
      px(g, 0, 0, 16, 16, '#22113d');
      if (r > 0.6) {
        const c = ['#ff4fd8', '#b06bff', '#4fb6ff'][Math.floor(r * 3) % 3];
        const x = Math.floor(hash(ty, tx) * 12) + 2;
        const y = Math.floor(r * 12) + 2;
        px(g, x, y - 1, 1, 3, c);
        px(g, x - 1, y, 3, 1, c);
      }
      break;
    case 'bar':
      px(g, 0, 0, 16, 16, (tx + ty) % 2 ? '#e8e4dc' : '#1c1d26');
      px(g, 0, 15, 16, 1, '#00000030');
      break;
  }
}

/** Wall in 3/4 view: lit top cap, panelled face and a neon trim in the room's colour. */
export function wallTile(g: G, tx: number, ty: number, faceBelow: boolean, accent: string) {
  px(g, 0, 0, 16, 16, '#0e1226');
  px(g, 0, 0, 16, 4, '#2a3360');
  px(g, 0, 4, 16, 1, '#3b4680');
  if (faceBelow) {
    px(g, 0, 5, 16, 11, '#161c38');
    px(g, (tx % 2) * 8, 5, 1, 11, '#0c1022');
    px(g, 0, 11, 16, 1, accent);
    px(g, 0, 12, 16, 1, accent + '55');
    px(g, 0, 15, 16, 1, '#05060d');
  }
  if (hash(tx, ty) > 0.93) px(g, 6, 1, 4, 1, '#ffffff22');
}

// ------------------------------------------------------------------ text
export function pixelText(g: G, text: string, x: number, y: number, color: string, size = 8, glow = true) {
  g.font = `bold ${size}px monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (glow) {
    g.shadowColor = color;
    g.shadowBlur = 4;
  }
  g.fillStyle = color;
  g.fillText(text, x, y);
  g.shadowBlur = 0;
  g.fillStyle = '#ffffffcc';
  g.fillText(text, x, y);
}

// ------------------------------------------------------------------ furniture & machines
/** Bowling lane seen from above: gutters, boards, arrows, pins at the far end. 32×112. */
export function lane(g: G, n: number) {
  px(g, 0, 0, 32, 112, '#7d8597');
  px(g, 1, 0, 3, 112, '#5c6374');
  px(g, 28, 0, 3, 112, '#5c6374');
  px(g, 4, 0, 24, 112, '#e2bd86');
  for (let x = 6; x < 28; x += 3) px(g, x, 0, 1, 112, '#cfa66e');
  px(g, 4, 0, 24, 28, '#efd3a6'); // pin deck
  for (const [dx, dy] of [[0, 0], [-1, 1], [1, 1], [-2, 2], [0, 2], [2, 2], [-3, 3], [-1, 3], [1, 3], [3, 3]]) {
    const x = 15 + dx * 3;
    const y = 20 - dy * 4;
    px(g, x, y, 2, 3, '#ffffff');
    px(g, x, y + 1, 2, 1, '#d1252b');
  }
  for (let i = 0; i < 7; i++) px(g, 8 + i * 3, 70 + Math.abs(3 - i) * 2, 1, 3, '#7a4f22');
  px(g, 4, 110, 24, 2, '#ff3b3b');
  pixelText(g, String(n), 16, 34, '#d8f24a', 7);
}

export function ballReturn(g: G) {
  px(g, 2, 2, 12, 28, '#1b2a4a');
  px(g, 3, 3, 10, 26, '#26386a');
  for (const [y, c] of [[6, '#b3122e'], [14, '#123d9e'], [22, '#5d7a0c']] as const) {
    px(g, 4, y, 8, 6, c);
    px(g, 5, y + 1, 2, 2, '#ffffff66');
  }
}

/** Pool table 64×32 with lamp glow. */
export function poolTable(g: G) {
  px(g, 0, 2, 64, 30, '#00000040');
  px(g, 0, 0, 64, 30, '#5a3420');
  px(g, 2, 2, 60, 26, '#3f2414');
  px(g, 4, 4, 56, 22, '#0f7a52');
  px(g, 4, 4, 56, 1, '#0b5c3e');
  for (const x of [3, 30, 58]) for (const y of [3, 24]) px(g, x, y, 3, 3, '#050505');
  const balls = ['#f2c200', '#1d4fc4', '#d8261c', '#5a2a8c', '#f2701d', '#13803c', '#111111'];
  balls.forEach((c, i) => px(g, 42 + Math.floor(i / 3) * 3, 11 + (i % 3) * 3, 2, 2, c));
  px(g, 16, 14, 2, 2, '#f8f6ee');
  px(g, 6, 18, 18, 1, '#d9b27a');
  for (const x of [2, 60]) for (const y of [27, 27]) px(g, x, y + 2, 2, 3, '#2a170c');
}

/** Air hockey 64×32 with LED rim. */
export function airHockey(g: G, rim: string, t: number) {
  px(g, 0, 2, 64, 30, '#00000040');
  px(g, 0, 0, 64, 30, '#1b2233');
  px(g, 1, 1, 62, 28, rim);
  px(g, 3, 3, 58, 24, '#eef3fb');
  for (let x = 6; x < 60; x += 4) for (let y = 6; y < 26; y += 4) px(g, x, y, 1, 1, '#c8d3e6');
  px(g, 31, 3, 2, 24, '#e1263f');
  px(g, 3, 11, 2, 8, '#111');
  px(g, 59, 11, 2, 8, '#111');
  px(g, 10, 13, 5, 5, '#e1263f');
  px(g, 49, 12, 5, 5, '#1f6fe0');
  const p = Math.sin(t * 2) * 18;
  px(g, 31 + Math.round(p), 14, 3, 3, '#ff7a1f');
}

/** Foosball 48×32: field, rods and little players. */
export function foosball(g: G) {
  px(g, 0, 4, 48, 28, '#00000040');
  px(g, 0, 2, 48, 28, '#6b4122');
  px(g, 3, 5, 42, 22, '#1f8a3a');
  px(g, 23, 5, 1, 22, '#ffffff99');
  px(g, 3, 13, 2, 6, '#111');
  px(g, 43, 13, 2, 6, '#111');
  for (let i = 0; i < 8; i++) {
    const x = 6 + i * 5;
    px(g, x, 0, 1, 32, '#c9d2e0');
    const red = [0, 1, 3, 5].includes(i);
    const n = [1, 2, 3, 5, 5, 3, 2, 1][i];
    for (let k = 0; k < n; k++) px(g, x - 1, 7 + Math.round(((k + 0.5) * 18) / n), 3, 2, red ? '#d8261c' : '#1d4fc4');
    px(g, x - 1, red ? 0 : 29, 3, 3, '#111');
  }
  px(g, 25, 15, 2, 2, '#ffffff');
}

/** Dartboard hung on a wall tile, 16×16. */
export function dartboard(g: G, accent: string) {
  px(g, 1, 1, 14, 14, '#161a26');
  const cx = 8;
  const cy = 8;
  for (const [r, c] of [[6, '#11833b'], [5, '#efe2c2'], [4, '#151515'], [3, '#d1252b'], [2, '#efe2c2'], [1, '#11833b']] as const) {
    g.fillStyle = c;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }
  px(g, 7, 7, 2, 2, '#d1252b');
  px(g, 1, 0, 14, 1, accent);
}

/** Upright arcade cabinet 16×28 (footprint is the bottom tile). */
export function arcadeCabinet(g: G, hue: number, t: number, seed: number) {
  const body = '#14121c';
  const side = `hsl(${hue},80%,50%)`;
  px(g, 1, 26, 14, 2, '#00000050');
  px(g, 1, 0, 14, 27, body);
  px(g, 1, 0, 2, 27, side);
  px(g, 13, 0, 2, 27, side);
  px(g, 3, 1, 10, 4, `hsl(${hue},100%,${55 + Math.sin(t * 6 + seed) * 10}%)`); // marquee
  px(g, 4, 6, 8, 8, '#05010f');
  for (let i = 0; i < 6; i++) {
    const k = Math.floor(t * 4 + seed + i * 1.7);
    px(g, 4 + (k * 3 + i) % 7, 6 + (k + i * 5) % 7, 1, 1, `hsl(${(hue + i * 40) % 360},100%,65%)`);
  }
  px(g, 3, 15, 10, 4, '#2a2838');
  px(g, 5, 16, 1, 2, '#d8261c');
  px(g, 8, 17, 1, 1, '#ffd23f');
  px(g, 10, 17, 1, 1, '#4fb6ff');
  px(g, 6, 22, 4, 1, '#ff3b3b');
}

export function sofa(g: G, w: number, color: string) {
  px(g, 0, 4, w, 12, '#00000040');
  px(g, 0, 0, w, 14, color);
  px(g, 0, 0, w, 5, '#ffffff22');
  px(g, 0, 0, 3, 14, '#00000033');
  px(g, w - 3, 0, 3, 14, '#00000033');
  for (let x = 4; x < w - 4; x += 12) px(g, x, 6, 1, 7, '#00000033');
}

export function plant(g: G) {
  px(g, 4, 10, 8, 6, '#e8e4dc');
  px(g, 4, 10, 8, 1, '#c9c3b8');
  const leaves: Array<[number, number]> = [[7, 0], [4, 2], [10, 2], [2, 5], [6, 4], [11, 5], [8, 6], [3, 8], [10, 8]];
  for (const [x, y] of leaves) {
    px(g, x, y, 3, 3, '#2f8a4a');
    px(g, x, y, 1, 1, '#4fb36a');
  }
}

export function stool(g: G) {
  px(g, 4, 9, 8, 3, '#00000040');
  px(g, 3, 3, 10, 7, '#d8f24a');
  px(g, 3, 3, 10, 2, '#eaff8a');
  px(g, 7, 10, 2, 4, '#9aa3b5');
}

export function barCounter(g: G, w: number) {
  px(g, 0, 2, w, 14, '#00000040');
  px(g, 0, 0, w, 12, '#4a2a17');
  px(g, 0, 0, w, 4, '#e8e8ee');
  px(g, 0, 11, w, 1, '#d8f24a');
  for (let x = 8; x < w; x += 20) {
    px(g, x, 1, 2, 2, '#9fc3ee');
    px(g, x + 6, 1, 1, 2, '#ffb84f');
  }
}

/** Bottles on a back-bar shelf painted on a wall tile row. */
export function backBar(g: G, w: number) {
  px(g, 0, 8, w, 2, '#ffffff55');
  const cs = ['#7dffd9', '#ffb84f', '#ff4fd8', '#4fb6ff', '#d8f24a'];
  for (let x = 2; x < w - 2; x += 4) {
    const c = cs[(x / 4) % cs.length];
    px(g, x, 3, 2, 5, c);
    px(g, x, 1, 1, 2, c);
  }
}

export function pillar(g: G, t: number) {
  px(g, 2, 26, 12, 4, '#00000050');
  px(g, 2, 0, 12, 28, '#1a1f33');
  px(g, 2, 0, 3, 28, '#252c48');
  const on = 0.7 + Math.sin(t * 3) * 0.3;
  for (const y of [5, 14, 23]) px(g, 2, y, 12, 1, `rgba(216,242,74,${on})`);
}

export function rug(g: G, w: number, h: number) {
  px(g, 0, 0, w, h, '#3b2a6b');
  px(g, 2, 2, w - 4, h - 4, '#4b3a8b');
  for (let x = 4; x < w - 4; x += 6) px(g, x, h / 2, 3, 1, '#d8f24a88');
}

export function highTable(g: G) {
  px(g, 3, 12, 10, 3, '#00000040');
  px(g, 2, 2, 12, 9, '#1b2233');
  px(g, 2, 2, 12, 2, '#2c3a5c');
  px(g, 7, 11, 2, 4, '#9aa3b5');
}

export function reception(g: G, w: number) {
  px(g, 0, 3, w, 14, '#00000040');
  px(g, 0, 0, w, 14, '#1a2240');
  px(g, 0, 0, w, 4, '#c9d2e0');
  px(g, 0, 12, w, 1, '#4fb6ff');
  px(g, w / 2 - 4, 5, 8, 4, '#d8f24a');
}

// ------------------------------------------------------------------ character
/** 16×24 bowler sprite. dir: 0 down, 1 left, 2 right, 3 up. frame 0..3 (0 = idle). */
export function character(g: G, o: Outfit, dir: number, frame: number) {
  const step = frame === 0 ? 0 : [0, 1, 0, -1][frame % 4];
  const bob = frame % 2 ? 1 : 0;
  const y0 = bob;
  // Shadow.
  px(g, 3, 22, 10, 2, '#00000055');
  // Legs.
  const legL = step > 0 ? -1 : 0;
  const legR = step < 0 ? -1 : 0;
  px(g, 5, 16 + y0 + legL, 3, 6 - legL - y0, o.pants);
  px(g, 8, 16 + y0 + legR, 3, 6 - legR - y0, o.pants);
  px(g, 4, 21 + legL, 4, 2, '#f2f2f2');
  px(g, 8, 21 + legR, 4, 2, '#f2f2f2');
  // Body.
  px(g, 4, 9 + y0, 8, 8, o.shirt);
  px(g, 4, 9 + y0, 8, 1, '#ffffff33');
  px(g, 4, 15 + y0, 8, 2, '#00000022');
  // Arms swing opposite to the legs.
  if (dir === 1 || dir === 2) {
    const ax = dir === 1 ? 6 : 8;
    px(g, ax + step, 10 + y0, 2, 6, o.shirt);
    px(g, ax + step, 15 + y0, 2, 2, o.skin);
  } else {
    px(g, 2, 10 + y0 + step, 2, 5, o.shirt);
    px(g, 12, 10 + y0 - step, 2, 5, o.shirt);
    px(g, 2, 15 + y0 + step, 2, 2, o.skin);
    px(g, 12, 15 + y0 - step, 2, 2, o.skin);
  }
  // Head.
  px(g, 4, 1 + y0, 8, 8, o.skin);
  px(g, 4, 0 + y0, 8, 3, o.hair);
  if (dir === 3) px(g, 4, 0 + y0, 8, 7, o.hair);
  else if (dir === 0) {
    px(g, 4, 3 + y0, 1, 2, o.hair);
    px(g, 11, 3 + y0, 1, 2, o.hair);
    px(g, 6, 5 + y0, 1, 1, '#111');
    px(g, 9, 5 + y0, 1, 1, '#111');
    px(g, 7, 7 + y0, 2, 1, '#00000044');
  } else {
    const f = dir === 1 ? 4 : 11;
    const b = dir === 1 ? 10 : 4;
    px(g, b, 1 + y0, 2, 6, o.hair);
    px(g, dir === 1 ? 5 : 10, 5 + y0, 1, 1, '#111');
    px(g, f + (dir === 1 ? -1 : 1), 5 + y0, 1, 2, o.skin);
  }
}
