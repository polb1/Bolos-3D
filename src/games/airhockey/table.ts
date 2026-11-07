import * as THREE from 'three';
import { TABLE } from './physics';

/** Height of the playing surface above the floor (m). */
export const SURFACE_Y = 0.8;

const W = TABLE.width;
const L = TABLE.length;
const RAIL_W = 0.07;
const RAIL_H = 0.035;

export const COLORS = { p1: 0xd8f24a, p2: 0xff4f6e, puck: 0xff3b3b, navy: 0x0a1020 };

/** Glossy playfield: air-hole grid and the usual markings, all drawn on a canvas. */
function surfaceTexture() {
  const px = 512;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px * 2;
  const g = c.getContext('2d')!;
  const k = px / W; // pixels per metre
  const grd = g.createRadialGradient(px / 2, px, 50, px / 2, px, px * 1.2);
  grd.addColorStop(0, '#e6eef8');
  grd.addColorStop(1, '#bfd0e4');
  g.fillStyle = grd;
  g.fillRect(0, 0, px, px * 2);

  g.fillStyle = '#9fb4cc';
  const step = 0.025 * k;
  for (let y = step / 2; y < px * 2; y += step) for (let x = step / 2; x < px; x += step) g.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);

  g.lineWidth = 5;
  g.strokeStyle = '#e0313f';
  g.beginPath();
  g.moveTo(0, px);
  g.lineTo(px, px);
  g.stroke();
  g.beginPath();
  g.arc(px / 2, px, 0.12 * k, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#e0313f';
  g.beginPath();
  g.arc(px / 2, px, 0.02 * k, 0, Math.PI * 2);
  g.fill();
  // Goal creases.
  for (const y of [0, px * 2]) {
    g.beginPath();
    g.arc(px / 2, y, 0.2 * k, 0, Math.PI * 2);
    g.stroke();
  }
  // Attack lines.
  g.strokeStyle = '#2f6fe0';
  g.lineWidth = 4;
  for (const y of [px * 0.5, px * 1.5]) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(px, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function malletMesh(color: number) {
  const r = TABLE.malletR;
  const pts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(r, 0),
    new THREE.Vector2(r, 0.014),
    new THREE.Vector2(r * 0.8, 0.022),
    new THREE.Vector2(0.02, 0.03),
    new THREE.Vector2(0.018, 0.06),
    new THREE.Vector2(0.024, 0.07),
    new THREE.Vector2(0.02, 0.082),
    new THREE.Vector2(0, 0.086),
  ];
  const mesh = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 40),
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
  );
  mesh.castShadow = true;
  return mesh;
}

/** Score panel drawn on a canvas so it can be redrawn on every goal. */
export class Scoreboard {
  readonly mesh: THREE.Mesh;
  private g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;

  constructor() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 160;
    this.g = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    this.draw(0, 0);
  }

  draw(a: number, b: number, label = 'AIR HOCKEY') {
    const g = this.g;
    g.fillStyle = '#05080f';
    g.fillRect(0, 0, 512, 160);
    g.font = 'bold 22px ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#9fc3ee';
    g.fillText(label, 256, 32);
    g.font = 'bold 96px ui-monospace, monospace';
    g.fillStyle = '#ff4f6e';
    g.fillText(String(b), 128, 136);
    g.fillStyle = '#d8f24a';
    g.fillText(String(a), 384, 136);
    g.fillStyle = '#334';
    g.fillRect(254, 60, 4, 80);
    this.tex.needsUpdate = true;
  }
}

export interface TableParts {
  root: THREE.Group;
  puck: THREE.Mesh;
  mallets: [THREE.Mesh, THREE.Mesh];
  leds: THREE.MeshStandardMaterial[];
  scoreboard: Scoreboard;
}

/** Builds the arcade table: cabinet, rails, goal slots, LEDs, legs and the overhead scoreboard. */
export function buildTable(): TableParts {
  const root = new THREE.Group();
  const S = SURFACE_Y;

  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(W, L),
    new THREE.MeshPhysicalMaterial({ map: surfaceTexture(), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = S;
  surface.receiveShadow = true;
  root.add(surface);

  const body = new THREE.MeshPhysicalMaterial({ color: 0x2a1a12, roughness: 0.45, metalness: 0.1, clearcoat: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe6f0, roughness: 0.15, metalness: 1 });
  const rail = new THREE.MeshPhysicalMaterial({ color: 0x151515, roughness: 0.3, clearcoat: 1 });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.castShadow = b.receiveShadow = true;
    root.add(b);
    return b;
  };

  // Cabinet under the surface.
  box(W + RAIL_W * 2, 0.22, L + RAIL_W * 2, body, 0, S - 0.111, 0);
  // Side rails with a chrome cap.
  for (const s of [-1, 1]) {
    box(RAIL_W, RAIL_H, L + RAIL_W * 2, rail, s * (W / 2 + RAIL_W / 2), S + RAIL_H / 2, 0);
    box(RAIL_W, 0.006, L + RAIL_W * 2, chrome, s * (W / 2 + RAIL_W / 2), S + RAIL_H + 0.003, 0);
  }
  // End rails, split by the goal slots.
  const seg = (W - TABLE.goal) / 2;
  for (const sz of [-1, 1])
    for (const sx of [-1, 1]) {
      const x = sx * (TABLE.goal / 2 + seg / 2);
      const z = sz * (L / 2 + RAIL_W / 2);
      box(seg, RAIL_H, RAIL_W, rail, x, S + RAIL_H / 2, z);
      box(seg, 0.006, RAIL_W, chrome, x, S + RAIL_H + 0.003, z);
    }
  // Goal slot: a dark pocket the puck drops into.
  const hole = new THREE.MeshStandardMaterial({ color: 0x020306, roughness: 1 });
  for (const sz of [-1, 1]) {
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(TABLE.goal, RAIL_W), hole);
    slot.rotation.x = -Math.PI / 2;
    slot.position.set(0, S + 0.001, sz * (L / 2 + RAIL_W / 2));
    root.add(slot);
  }

  // LED strips along the cabinet; their colour flashes on goals.
  const leds: THREE.MeshStandardMaterial[] = [];
  for (const s of [-1, 1]) {
    const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: COLORS.p1, emissiveIntensity: 0.9 });
    leds.push(m);
    box(0.012, 0.018, L + RAIL_W * 2 - 0.04, m, s * (W / 2 + RAIL_W + 0.004), S - 0.05, 0).castShadow = false;
  }
  for (const s of [-1, 1]) {
    const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: s > 0 ? COLORS.p1 : COLORS.p2, emissiveIntensity: 0.9 });
    leds.push(m);
    box(W + RAIL_W * 2 - 0.04, 0.018, 0.012, m, 0, S - 0.05, s * (L / 2 + RAIL_W + 0.004)).castShadow = false;
  }

  // Legs with chrome feet.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      box(0.09, S - 0.22, 0.09, body, sx * (W / 2 - 0.02), (S - 0.22) / 2, sz * (L / 2 - 0.05));
      box(0.13, 0.02, 0.13, chrome, sx * (W / 2 - 0.02), 0.01, sz * (L / 2 - 0.05));
    }

  // Overhead scoreboard at the far end, on chrome posts.
  const scoreboard = new Scoreboard();
  const zb = -(L / 2 + RAIL_W + 0.08);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 12), chrome);
    post.position.set(s * 0.42, S + 0.14, zb);
    root.add(post);
  }
  box(0.96, 0.32, 0.05, body, 0, S + 0.42, zb - 0.03);
  scoreboard.mesh.position.set(0, S + 0.42, zb);
  root.add(scoreboard.mesh);

  const puck = new THREE.Mesh(
    new THREE.CylinderGeometry(TABLE.puckR, TABLE.puckR, 0.008, 40),
    new THREE.MeshPhysicalMaterial({ color: COLORS.puck, roughness: 0.3, clearcoat: 1 }),
  );
  puck.castShadow = true;
  root.add(puck);
  const mallets: [THREE.Mesh, THREE.Mesh] = [malletMesh(COLORS.p1), malletMesh(COLORS.p2)];
  root.add(...mallets);

  return { root, puck, mallets, leds, scoreboard };
}
