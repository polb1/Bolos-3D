import * as THREE from 'three';
import { BOARD_R, BULL_Y, ORDER, R } from './physics';

/** Bar corner with an electronic (soft-tip) dart machine. Everything is procedural. */

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement, repeat?: [number, number]) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

/**
 * Electronic board face: deep red/blue segments made of tiny cells, darker singles like a real soft-tip board (numbers are lit on the panel). Returns the colour
 * map and a bump map (cell holes) so the light picks up the honeycomb.
 */
function electronicBoard() {
  const N = 2048;
  const [c, g] = canvas(N, N);
  const [bc, bg] = canvas(N, N);
  const cx = N / 2;
  const px = cx / BOARD_R; // pixels per metre (canvas edge = board edge)
  g.fillStyle = '#0d0d12';
  g.fillRect(0, 0, N, N);
  const ring = (r0: number, r1: number, a0: number, a1: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, cx, r1 * px, a0, a1);
    g.arc(cx, cx, r0 * px, a1, a0, true);
    g.closePath();
    g.fill();
  };
  const RED = '#c8102e';
  const BLUE = '#0b3fb3';
  const RED2 = '#9e0c24';
  const BLUE2 = '#082f86';
  for (let i = 0; i < 20; i++) {
    const a0 = -Math.PI / 2 + ((i - 0.5) * Math.PI * 2) / 20;
    const a1 = a0 + (Math.PI * 2) / 20;
    const even = i % 2 === 0;
    ring(R.outer, R.trebleIn, a0, a1, even ? RED2 : BLUE2);
    ring(R.trebleOut, R.doubleIn, a0, a1, even ? RED2 : BLUE2);
    ring(R.trebleIn, R.trebleOut, a0, a1, even ? BLUE : RED);
    ring(R.doubleIn, R.doubleOut, a0, a1, even ? BLUE : RED);
  }
  ring(R.bull, R.outer, 0, Math.PI * 2, BLUE);
  ring(0, R.bull, 0, Math.PI * 2, RED);
  // Cells: each one gets a lighter rim and a dark hole (colour), and a pit (bump).
  bg.fillStyle = '#fff';
  bg.fillRect(0, 0, N, N);
  const step = 15;
  for (let y = step / 2; y < N; y += step * 0.866)
    for (let x = ((Math.round(y / (step * 0.866)) % 2) * step) / 2; x < N; x += step) {
      if (Math.hypot(x - cx, y - cx) > R.doubleOut * px - 3) continue;
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.beginPath();
      g.arc(x, y, step * 0.46, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.beginPath();
      g.arc(x, y, step * 0.24, 0, Math.PI * 2);
      g.fill();
      bg.fillStyle = '#000';
      bg.beginPath();
      bg.arc(x, y, step * 0.3, 0, Math.PI * 2);
      bg.fill();
    }
  const map = tex(c);
  const bump = new THREE.CanvasTexture(bc);
  bump.anisotropy = 8;
  return { map, bump };
}

/** Raised plastic spider: ring wires and radial dividers sitting on the face. */
function spider() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xe6e8ee, roughness: 0.35, metalness: 0.1 });
  for (const r of [R.bull, R.outer, R.trebleIn, R.trebleOut, R.doubleIn, R.doubleOut]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0011, 6, Math.max(48, Math.round(r * 1200))), mat);
    t.position.z = 0.001;
    g.add(t);
  }
  const len = R.doubleOut - R.outer;
  const geo = new THREE.BoxGeometry(0.0016, len, 0.0026);
  for (let i = 0; i < 20; i++) {
    const a = ((i - 0.5) * Math.PI * 2) / 20;
    const m = new THREE.Mesh(geo, mat);
    const r = R.outer + len / 2;
    m.position.set(Math.sin(a) * r, Math.cos(a) * r, 0.0013);
    m.rotation.z = -a;
    g.add(m);
  }
  return g;
}

/** Front panel around the board: blue grid, lit numbers and a ring of bulbs. */
function boardPanel(w: number, h: number) {
  const [c, g] = canvas(1024, Math.round((1024 * h) / w));
  const s = 1024 / w; // px per metre
  const cx = 512;
  const cy = c.height / 2;
  const grad = g.createRadialGradient(cx, cy, 50, cx, cy, 700);
  grad.addColorStop(0, '#1c3f9a');
  grad.addColorStop(1, '#0a1640');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(120,170,255,0.18)';
  g.lineWidth = 1;
  for (let x = 0; x < c.width; x += 16) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x, c.height), g.stroke());
  for (let y = 0; y < c.height; y += 16) (g.beginPath(), g.moveTo(0, y), g.lineTo(c.width, y), g.stroke());
  const rNum = (BOARD_R + 0.05) * s;
  g.font = `bold ${Math.round(0.034 * s)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 20; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 20;
    g.fillStyle = '#f4f6ff';
    g.shadowColor = '#9fc3ff';
    g.shadowBlur = 10;
    g.fillText(String(ORDER[i]), cx + Math.cos(a) * rNum, cy + Math.sin(a) * rNum);
    const b = a + Math.PI / 20;
    g.fillStyle = i % 2 ? '#ffcf4a' : '#ff6a3d';
    g.shadowColor = g.fillStyle;
    g.beginPath();
    g.arc(cx + Math.cos(b) * (rNum + 0.035 * s), cy + Math.sin(b) * (rNum + 0.035 * s), 0.006 * s, 0, Math.PI * 2);
    g.fill();
  }
  g.shadowBlur = 0;
  return tex(c);
}

function bricks() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#3a2a24';
  g.fillRect(0, 0, 512, 512);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 16; row++)
    for (let col = -1; col < 5; col++) {
      const x = col * 128 + (row % 2) * 64 + 3;
      const l = 17 + rnd() * 10;
      g.fillStyle = `hsl(${10 + rnd() * 12}, ${35 + rnd() * 15}%, ${l}%)`;
      g.fillRect(x, row * 32 + 3, 122, 26);
    }
  return tex(c, [5, 2.4]);
}

function planks() {
  const [c, g] = canvas(512, 512);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `hsl(28, ${35 + rnd() * 10}%, ${16 + rnd() * 7}%)`;
    g.fillRect(i * 64, 0, 64, 512);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(i * 64, 0, 2, 512);
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      const x = i * 64 + 8 + rnd() * 48;
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 6, 170, x - 6, 340, x + 3, 512);
      g.stroke();
    }
  }
  return tex(c, [4, 4]);
}

function label(text: string, w: number, h: number, color: string, bg: string, font: string) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 12;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
  return tex(c);
}

export interface DartsRoom {
  root: THREE.Group;
  /** Electronic board face mesh (darts stick into it). */
  board: THREE.Mesh;
  /** Redraws the LED scoreboard on top of the machine. */
  setDisplay(big: string, small: string): void;
}

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);

export function buildRoom(): DartsRoom {
  const root = new THREE.Group();
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    return m;
  };

  // --- bar: brick wall, wooden floor, wainscot, neon and pendant lamps
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), std({ map: bricks(), roughness: 0.95 }));
  wall.position.set(0, 2, -0.55);
  wall.receiveShadow = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), std({ map: planks(), roughness: 0.75 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 3.5;
  floor.receiveShadow = true;
  root.add(wall, floor);
  box(9, 0.9, 0.04, std({ color: 0x2a160c, roughness: 0.6 }), 0, 0.45, -0.52);
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ map: label('BAR', 256, 86, '#ff4fa3', 'rgba(0,0,0,0)', 'bold 64px sans-serif'), transparent: true }));
  neon.position.set(-1.25, 2.35, -0.53);
  const neon2 = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.2), new THREE.MeshBasicMaterial({ map: label('DARTS · 501', 384, 90, '#4fd8ff', 'rgba(0,0,0,0)', 'bold 52px sans-serif'), transparent: true }));
  neon2.position.set(1.2, 2.2, -0.53);
  root.add(neon, neon2);
  const pink = new THREE.PointLight(0xff4fa3, 1.2, 3);
  pink.position.set(-1.25, 2.3, -0.3);
  const cyan = new THREE.PointLight(0x4fd8ff, 1.0, 3);
  cyan.position.set(1.35, 2.2, -0.3);
  root.add(pink, cyan);
  for (const x of [-1.6, 1.6]) {
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.14, 24, 1, true), std({ color: 0x0f3b26, metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide }));
    shade.position.set(x, 2.55, 1.2);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe1a8 }));
    bulb.position.set(x, 2.5, 1.2);
    const l = new THREE.PointLight(0xffc98a, 2.2, 4.5);
    l.position.set(x, 2.45, 1.2);
    root.add(shade, bulb, l);
  }

  // --- electronic dart machine (board face at z = 0)
  const black = std({ color: 0x111116, roughness: 0.55, metalness: 0.2 });
  const W = 0.78;
  const D = 0.45;
  const back = -D + 0.02;
  box(W + 0.08, 0.06, D + 0.15, black, 0, 0.03, back + D / 2 + 0.05); // plinth
  box(W, 0.95, D + 0.1, black, 0, 0.53, back + (D + 0.1) / 2); // lower body
  // Blue front of the lower body with the brand plate.
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.12, 0.72), std({ map: label('VIRTUAL DART', 512, 512, '#9fc3ff', '#123a9a', 'bold 54px sans-serif'), roughness: 0.4 }));
  front.position.set(0, 0.5, back + D + 0.1 + 0.002);
  root.add(front);
  // Console shelf with buttons.
  const shelf = box(W, 0.05, 0.3, black, 0, 1.04, back + D - 0.02);
  shelf.rotation.x = 0.25;
  const btns: Array<[number, number]> = [[-0.2, 0xff3040], [-0.07, 0x3f7bff], [0.06, 0x3f7bff], [0.2, 0xff3040]];
  for (const [x, col] of btns) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 20), std({ color: col, emissive: col, emissiveIntensity: 0.8 }));
    b.position.set(x, 1.075, back + D + 0.02);
    b.rotation.x = 0.25;
    root.add(b);
  }
  // Upper cabinet with the board panel.
  box(W, 1.0, D - 0.02, black, 0, 1.6, back + (D - 0.02) / 2 - 0.02);
  const panelH = 0.86;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.08, panelH), std({ map: boardPanel(W - 0.08, panelH), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.25 }));
  panel.material.emissiveMap = panel.material.map;
  panel.position.set(0, BULL_Y - 0.02, -0.012);
  root.add(panel);
  const face = electronicBoard();
  const board = new THREE.Mesh(new THREE.CircleGeometry(BOARD_R, 128), std({ map: face.map, bumpMap: face.bump, bumpScale: 1.2, roughness: 0.45, metalness: 0.05 }));
  board.position.set(0, BULL_Y, 0);
  board.receiveShadow = true;
  const wires = spider();
  wires.position.set(0, BULL_Y, 0);
  // Moulded black surround standing proud of the face.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(BOARD_R + 0.004, 0.009, 12, 96), std({ color: 0x0c0c10, roughness: 0.4 }));
  rim.position.set(0, BULL_Y, 0);
  root.add(board, wires, rim);
  // Side cheeks so the panel sits recessed.
  for (const s of [-1, 1]) box(0.04, 1.0, 0.08, black, s * (W / 2 - 0.02), 1.6, 0.0);
  // LED scoreboard box on top.
  box(W + 0.04, 0.24, 0.32, black, 0, 2.22, -0.12);
  const [lc, lg] = canvas(512, 128);
  const ledTex = tex(lc);
  const led = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, 0.18), new THREE.MeshBasicMaterial({ map: ledTex }));
  led.position.set(0, 2.22, 0.041);
  root.add(led);
  const setDisplay = (big: string, small: string) => {
    lg.fillStyle = '#060304';
    lg.fillRect(0, 0, 512, 128);
    lg.font = 'bold 84px monospace';
    lg.textBaseline = 'middle';
    lg.textAlign = 'right';
    lg.fillStyle = '#ff2a2a';
    lg.shadowColor = '#ff2a2a';
    lg.shadowBlur = 14;
    lg.fillText(big, 300, 68);
    lg.font = 'bold 36px monospace';
    lg.textAlign = 'left';
    lg.fillStyle = '#5dff7a';
    lg.shadowColor = '#5dff7a';
    lg.fillText(small, 330, 68);
    lg.shadowBlur = 0;
    ledTex.needsUpdate = true;
  };
  setDisplay('501', 'R1');

  // Soft light on the board from the machine's own top lamp.
  const lamp = new THREE.SpotLight(0xfff4e6, 3.5, 2.5, 0.75, 0.5, 1.2);
  lamp.position.set(0, 2.15, 0.35);
  lamp.target.position.set(0, BULL_Y, 0);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0005;
  root.add(lamp, lamp.target);

  // Throw line on the floor.
  return { root, board, setDisplay };
}
