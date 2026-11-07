import * as THREE from 'three';
import { airHockeyTop, arcadeScreen, dartboard, darkWood, foosballPitch, painting, rug as rugTexture, signBoard } from './textures';

/** Furniture and machines for the hall. Every builder returns a group standing on y = 0. */

const std = (color: THREE.ColorRepresentation, roughness = 0.6, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
const glow = (color: THREE.ColorRepresentation, intensity = 2) =>
  new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, toneMapped: false });

const wood = new THREE.MeshStandardMaterial({ map: darkWood(), roughness: 0.45 });
const chrome = std(0xc9d2e0, 0.2, 0.9);
const black = std(0x111318, 0.5, 0.2);
const brass = std(0xc29a52, 0.3, 0.85);
const leather = std(0x5a2e1c, 0.55);

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** 9 ft pool table (2.54 × 1.27 m playing surface), long side along x. */
export function poolTable() {
  const g = new THREE.Group();
  const L = 2.54;
  const W = 1.27;
  const felt = std(0x0d6b4a, 0.9);
  g.add(mesh(new THREE.BoxGeometry(L + 0.1, 0.04, W + 0.1), felt, 0, 0.79, 0));
  // Cushions and rails.
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(L + 0.34, 0.08, 0.12), wood, 0, 0.83, s * (W / 2 + 0.11)));
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.08, W + 0.1), wood, s * (L / 2 + 0.11), 0.83, 0));
    g.add(mesh(new THREE.BoxGeometry(L, 0.05, 0.05), felt, 0, 0.82, s * (W / 2 + 0.02)));
  }
  g.add(mesh(new THREE.BoxGeometry(L + 0.3, 0.22, W + 0.3), wood, 0, 0.66, 0));
  // Six pockets with chrome caps.
  const pocket = new THREE.CylinderGeometry(0.065, 0.06, 0.09, 20);
  for (const px of [-L / 2, 0, L / 2])
    for (const pz of [-W / 2, W / 2]) {
      g.add(mesh(pocket, black, px, 0.8, pz + Math.sign(pz) * 0.02));
      g.add(mesh(new THREE.TorusGeometry(0.068, 0.012, 8, 20, Math.PI), chrome, px, 0.86, pz + Math.sign(pz) * 0.02));
    }
  // Legs.
  const leg = new THREE.CylinderGeometry(0.09, 0.07, 0.56, 12);
  for (const lx of [-1, 1]) for (const lz of [-1, 1]) g.add(mesh(leg, wood, lx * (L / 2 - 0.1), 0.28, lz * (W / 2 - 0.05)));
  // Racked balls and the cue ball.
  const colors = [0xf2c200, 0x1d4fc4, 0xd8261c, 0x5a2a8c, 0xf2701d, 0x13803c, 0x7a1418, 0x111111];
  const ball = new THREE.SphereGeometry(0.0286, 16, 12);
  let k = 0;
  for (let row = 0; row < 5; row++)
    for (let i = 0; i <= row; i++) {
      const m = new THREE.MeshPhysicalMaterial({ color: colors[k++ % colors.length], roughness: 0.15, clearcoat: 1 });
      g.add(mesh(ball, m, L / 4 + row * 0.05, 0.84, (i - row / 2) * 0.058));
    }
  g.add(mesh(ball, new THREE.MeshPhysicalMaterial({ color: 0xf8f6ee, roughness: 0.15, clearcoat: 1 }), -L / 4, 0.84, 0));
  // Cue resting on the table.
  const cue = mesh(new THREE.CylinderGeometry(0.006, 0.014, 1.45, 8), std(0xd9b27a, 0.4), -0.2, 0.86, -0.35);
  cue.rotation.z = Math.PI / 2;
  cue.rotation.y = 0.2;
  g.add(cue);
  return g;
}

/** Billiard lamp hanging over a table. */
export function poolLamp(color = 0x0f3b2a) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.7, 0.16, 0.4), std(color, 0.4, 0.4), 0, 0, 0));
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.02, 0.32), glow(0xfff2c8, 1.6), 0, -0.085, 0));
  for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 1.6), chrome, s * 0.6, 0.85, 0));
  return g;
}

/** Air hockey table with an LED rim, long side along x. */
export function airHockeyTable(rim: number) {
  const g = new THREE.Group();
  const L = 2.2;
  const W = 1.15;
  g.add(mesh(new THREE.BoxGeometry(L, 0.66, W), std(0x1b2233, 0.5, 0.3), 0, 0.42, 0));
  const top = mesh(new THREE.PlaneGeometry(L - 0.12, W - 0.12), new THREE.MeshStandardMaterial({ map: airHockeyTop(), roughness: 0.25 }), 0, 0.79, 0);
  top.rotation.x = -Math.PI / 2;
  g.add(top);
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(L, 0.06, 0.06), std(0xdfe6f2, 0.3, 0.5), 0, 0.81, s * (W / 2 - 0.03)));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.06, W), std(0xdfe6f2, 0.3, 0.5), s * (L / 2 - 0.03), 0.81, 0));
    g.add(mesh(new THREE.BoxGeometry(L + 0.01, 0.025, 0.02), std(rim, 0.4, 0.3), 0, 0.72, s * (W / 2 + 0.005)));
    // Goal slots and score displays at each end.
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.03, 0.34), black, s * (L / 2 - 0.03), 0.825, 0));
    const score = mesh(new THREE.BoxGeometry(0.04, 0.16, 0.3), glow(s < 0 ? 0xff3355 : 0x3a8bff, 0.5), s * (L / 2 + 0.02), 1.0, 0);
    g.add(score);
  }
  const mallet = (x: number, c: number) => {
    const m = new THREE.Group();
    m.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 24), std(c, 0.35), 0, 0, 0));
    m.add(mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.06, 16), std(c, 0.35), 0, 0.04, 0));
    m.position.set(x, 0.805, 0.1);
    return m;
  };
  g.add(mallet(-0.75, 0xe1263f), mallet(0.75, 0x1f6fe0));
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 24), std(0xff4f1f, 0.3), 0.1, 0.8, -0.15));
  // Legs.
  for (const lx of [-1, 1]) for (const lz of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), black, lx * (L / 2 - 0.1), 0.05, lz * (W / 2 - 0.1)));
  return g;
}

/** Foosball table: 8 rods with red and blue players, long side along x. */
export function foosballTable() {
  const g = new THREE.Group();
  const L = 1.4;
  const W = 0.76;
  g.add(mesh(new THREE.BoxGeometry(L, 0.3, W), wood, 0, 0.78, 0));
  const field = mesh(new THREE.PlaneGeometry(L - 0.08, W - 0.08), new THREE.MeshStandardMaterial({ map: foosballPitch(), roughness: 0.8 }), 0, 0.8, 0);
  field.rotation.x = -Math.PI / 2;
  g.add(field);
  // Walls of the box above the pitch, open in the middle so the field is visible.
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(L, 0.16, 0.04), wood, 0, 0.99, s * (W / 2 - 0.02)));
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.16, W), wood, s * (L / 2 - 0.02), 0.99, 0));
  }
  for (const lx of [-1, 1]) for (const lz of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.64, 0.08), wood, lx * (L / 2 - 0.08), 0.32, lz * (W / 2 - 0.08)));
  // Rods across the table (along z), players hanging from them.
  const rod = new THREE.CylinderGeometry(0.008, 0.008, W + 0.5, 8);
  const handle = new THREE.CylinderGeometry(0.018, 0.018, 0.1, 10);
  const figures = [1, 2, 3, 5, 5, 3, 2, 1];
  const red = std(0xd8261c, 0.4);
  const blue = std(0x1d4fc4, 0.4);
  figures.forEach((n, i) => {
    const x = -L / 2 + 0.11 + (i * (L - 0.22)) / 7;
    const team = i === 0 || i === 1 || i === 3 || i === 5 ? red : blue;
    const r = mesh(rod, chrome, x, 0.93, 0);
    r.rotation.x = Math.PI / 2;
    g.add(r);
    const side = team === red ? -1 : 1;
    const h = mesh(handle, black, x, 0.93, side * (W / 2 + 0.25));
    h.rotation.x = Math.PI / 2;
    g.add(h);
    for (let k = 0; k < n; k++) {
      const z = (k - (n - 1) / 2) * ((W - 0.16) / Math.max(n, 2));
      g.add(mesh(new THREE.BoxGeometry(0.025, 0.1, 0.035), team, x, 0.88, z));
      g.add(mesh(new THREE.SphereGeometry(0.018, 10, 8), std(0xf1c7a5, 0.6), x, 0.945, z));
    }
  });
  g.add(mesh(new THREE.SphereGeometry(0.017, 12, 10), std(0xffffff, 0.4), 0.05, 0.818, 0.06));
  return g;
}

/** Pub dartboard in a wooden cabinet with its doors open (hung on a wall, faces +z). */
export function dartCabinet() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.66, 0.66, 0.1), wood, 0, 1.73, 0));
  g.add(mesh(new THREE.BoxGeometry(0.6, 0.6, 0.02), std(0x101010, 0.8), 0, 1.73, 0.05));
  g.add(mesh(new THREE.CircleGeometry(0.23, 48), new THREE.MeshStandardMaterial({ map: dartboard(), roughness: 0.85 }), 0, 1.73, 0.065));
  // Open doors with a chalk scoreboard inside.
  for (const s of [-1, 1]) {
    const door = new THREE.Group();
    door.add(mesh(new THREE.BoxGeometry(0.33, 0.66, 0.025), wood, s * 0.165, 0, 0));
    door.add(mesh(new THREE.BoxGeometry(0.27, 0.56, 0.005), std(0x1d2b22, 0.95), s * 0.165, 0, 0.014));
    door.position.set(s * 0.33, 1.73, 0.06);
    door.rotation.y = -s * 1.35;
    g.add(door);
  }
  // Darts stuck in the board.
  for (const [x, y] of [[0.03, 0.06], [-0.05, -0.02], [0.08, -0.07]] as const) {
    const d = new THREE.Group();
    d.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 6), chrome, 0, 0, 0.045));
    d.add(mesh(new THREE.ConeGeometry(0.014, 0.03, 3), std(0xb3122e, 0.5), 0, 0, 0.1));
    d.children.forEach((c) => (c.rotation.x = Math.PI / 2));
    d.position.set(x, 1.73 + y, 0.07);
    g.add(d);
  }
  return g;
}

/** Upright arcade cabinet (faces +z) with a lit marquee and attract screen. */
export function arcadeCabinet(seed: number, hue: number, title: string) {
  const g = new THREE.Group();
  const color = new THREE.Color().setHSL(hue / 360, 0.75, 0.45);
  // Side profile extruded across the width.
  const p = new THREE.Shape();
  p.moveTo(-0.4, 0);
  p.lineTo(0.4, 0);
  p.lineTo(0.4, 0.95);
  p.lineTo(0.22, 1.05);
  p.lineTo(0.16, 1.62);
  p.lineTo(0.28, 1.95);
  p.lineTo(-0.4, 1.95);
  p.closePath();
  const sideGeo = new THREE.ExtrudeGeometry(p, { depth: 0.72, bevelEnabled: false });
  const body = mesh(sideGeo, std(0x14121c, 0.5, 0.2));
  body.rotation.y = -Math.PI / 2;
  body.position.x = -0.36;
  g.add(body);
  // Coloured side art stripes.
  for (const s of [-1, 1]) {
    const stripe = mesh(new THREE.BoxGeometry(0.005, 1.7, 0.08), std(color, 0.5), s * 0.362, 1.05, 0);
    stripe.rotation.x = -0.1;
    g.add(stripe);
  }
  const screen = mesh(new THREE.PlaneGeometry(0.56, 0.5), new THREE.MeshBasicMaterial({ map: arcadeScreen(seed, hue), toneMapped: false }), 0, 1.34, 0.2);
  screen.rotation.x = -0.2;
  g.add(screen);
  const sign = signBoard(title);
  const marquee = mesh(new THREE.PlaneGeometry(0.62, 0.62 / sign.aspect), new THREE.MeshStandardMaterial({ map: sign.texture, roughness: 0.6 }), 0, 1.8, 0.27);
  marquee.rotation.x = -0.35;
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.24, 0.02), std(0x050508, 0.3), 0, 1.79, 0.255).rotateX(-0.35));
  g.add(marquee);
  // Control panel: joystick and buttons.
  const panel = mesh(new THREE.BoxGeometry(0.72, 0.05, 0.3), std(0x22202e, 0.4), 0, 1.0, 0.3);
  panel.rotation.x = 0.25;
  g.add(panel);
  g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08), chrome, -0.18, 1.07, 0.32));
  g.add(mesh(new THREE.SphereGeometry(0.025, 12, 10), std(0xd8261c, 0.3), -0.18, 1.11, 0.32));
  [0xffd23f, 0x4fb6ff, 0x7dffb0].forEach((c, i) => g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 14), std(c, 0.35), 0.04 + i * 0.08, 1.05, 0.33)));
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.06, 0.01), glow(0xff8a3b, 0.6), 0, 0.55, 0.405));
  return g;
}

/** Lounge sofa (faces +z). */
export function sofa(color: number) {
  const g = new THREE.Group();
  const fabric = std(color, 0.95);
  g.add(mesh(new THREE.BoxGeometry(2, 0.42, 0.85), fabric, 0, 0.21, 0));
  g.add(mesh(new THREE.BoxGeometry(2, 0.5, 0.22), fabric, 0, 0.6, -0.32));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.2, 0.3, 0.85), fabric, s * 0.9, 0.55, 0));
  for (const s of [-1, 0, 1]) g.add(mesh(new THREE.BoxGeometry(0.58, 0.12, 0.6), std(new THREE.Color(color).multiplyScalar(1.25), 0.95), s * 0.6, 0.47, 0.06));
  return g;
}

/** Low wooden coffee table with a couple of things on it. */
export function coffeeTable() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.06, 0.65), wood, 0, 0.42, 0));
  for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.39, 0.06), wood, x * 0.48, 0.195, z * 0.26));
  g.add(mesh(new THREE.BoxGeometry(0.28, 0.04, 0.2), std(0x7a3b2a, 0.8), -0.2, 0.47, 0.05)); // books
  g.add(mesh(new THREE.BoxGeometry(0.26, 0.03, 0.19), std(0x2f4a5a, 0.8), -0.2, 0.505, 0.05).rotateY(0.3));
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.09, 14), std(0xf3efe6, 0.4), 0.25, 0.495, -0.08)); // mug
  return g;
}

export function plant() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.45, 16), std(0xb3623a, 0.85), 0, 0.225, 0));
  const leaf = std(0x2f8a4a, 0.8);
  for (let i = 0; i < 7; i++) {
    const l = mesh(new THREE.IcosahedronGeometry(0.22 + (i % 3) * 0.04, 0), leaf, Math.sin(i * 2.4) * 0.15, 0.6 + i * 0.12, Math.cos(i * 2.4) * 0.15);
    l.scale.y = 1.4;
    g.add(l);
  }
  return g;
}

/** Wooden bar stool with a leather seat. */
export function barStool() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.08, 20), leather, 0, 0.78, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const leg = mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.76, 8), wood, Math.cos(a) * 0.13, 0.37, Math.sin(a) * 0.13);
    leg.rotation.set(Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08);
    g.add(leg);
  }
  g.add(mesh(new THREE.TorusGeometry(0.15, 0.012, 8, 20), brass, 0, 0.3, 0).rotateX(Math.PI / 2));
  return g;
}

/** Bar counter with an LED kick strip (length along x, customers on +z). */
export function barCounter(length: number) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(length, 1.05, 0.6), wood, 0, 0.525, 0));
  g.add(mesh(new THREE.BoxGeometry(length + 0.1, 0.06, 0.75), new THREE.MeshPhysicalMaterial({ map: darkWood([3, 1]), roughness: 0.25, clearcoat: 0.8 }), 0, 1.08, 0.05));
  // Brass foot rail.
  const rail = mesh(new THREE.CylinderGeometry(0.025, 0.025, length, 12), brass, 0, 0.22, 0.42);
  rail.rotation.z = Math.PI / 2;
  g.add(rail);
  // Glasses on top.
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.9, roughness: 0.05, transparent: true, opacity: 0.4 });
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 12), glass, -length / 2 + 0.6 + i * 1.1, 1.16, 0.1));
  return g;
}

/** Back-bar: wooden shelves of bottles against the wall (faces +z). */
export function backBar(length: number) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(length, 0.9, 0.5), wood, 0, 0.45, 0.08));
  g.add(mesh(new THREE.BoxGeometry(length, 1.4, 0.06), wood, 0, 1.6, -0.12));
  const colors = [0x6b3a12, 0x2f5a2a, 0x8a6a2a, 0xd9cfb8, 0x3a1f12, 0x7a2a1a];
  for (const y of [1.25, 1.75]) {
    g.add(mesh(new THREE.BoxGeometry(length - 0.1, 0.04, 0.26), wood, 0, y, 0));
    for (let i = 0; i < Math.floor(length / 0.2); i++) {
      const c = colors[(i * 7 + Math.round(y * 10)) % colors.length];
      const b = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.08, transmission: 0.35, thickness: 0.05 });
      g.add(mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.24, 10), b, -length / 2 + 0.2 + i * 0.2, y + 0.14, 0.02));
      g.add(mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.08, 8), b, -length / 2 + 0.2 + i * 0.2, y + 0.3, 0.02));
    }
  }
  // Warm strip under the top board lights the bottles from above.
  g.add(mesh(new THREE.BoxGeometry(length - 0.2, 0.015, 0.03), glow(0xffc27a, 0.8), 0, 2.2, 0.08));
  return g;
}

/** Painted wooden signboard (faces +z), `height` m tall. */
export function woodSign(text: string, height: number) {
  const { texture, aspect } = signBoard(text);
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(height * aspect + 0.04, height + 0.04, 0.04), wood, 0, 0, -0.025));
  g.add(mesh(new THREE.PlaneGeometry(height * aspect, height), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.65 }), 0, 0, 0.0));
  return g;
}

/** Pendant lamp: cord, metal shade and a warm bulb (y = 0 is the ceiling). */
export function pendant(color = 0x2c3a2f, drop = 1.4) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, drop), black, 0, -drop / 2, 0));
  const shade = mesh(new THREE.ConeGeometry(0.26, 0.22, 24, 1, true), new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide }), 0, -drop - 0.08, 0);
  g.add(shade);
  g.add(mesh(new THREE.SphereGeometry(0.06, 14, 10), glow(0xffd9a0, 1.6), 0, -drop - 0.16, 0));
  return g;
}

/** Floor lamp with a fabric shade. */
export function floorLamp() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 20), brass, 0, 0.015, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.5), brass, 0, 0.77, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.17, 0.24, 0.3, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xf3e3c3, emissive: 0xffc98a, emissiveIntensity: 0.5, side: THREE.DoubleSide, roughness: 0.9 }), 0, 1.58, 0));
  return g;
}

/** Upholstered armchair (faces +z). */
export function armchair(color: number) {
  const g = new THREE.Group();
  const f = std(color, 0.95);
  g.add(mesh(new THREE.BoxGeometry(0.85, 0.4, 0.8), f, 0, 0.3, 0));
  g.add(mesh(new THREE.BoxGeometry(0.85, 0.55, 0.18), f, 0, 0.72, -0.31));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.16, 0.28, 0.8), f, s * 0.36, 0.62, 0));
  g.add(mesh(new THREE.BoxGeometry(0.56, 0.1, 0.6), std(new THREE.Color(color).multiplyScalar(1.15), 0.95), 0, 0.53, 0.05));
  for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.1, 8), wood, x * 0.36, 0.05, z * 0.33));
  return g;
}

/** Bookshelf full of books (against a wall, faces +z). */
export function bookshelf(width = 1.6, height = 2.1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(width, height, 0.04), wood, 0, height / 2, -0.15));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.04, height, 0.34), wood, s * (width / 2 - 0.02), height / 2, 0));
  const shelves = 5;
  const colors = [0x7a2a1a, 0x2f4a5a, 0x8a6a2a, 0x3a5a2a, 0xd9cfb8, 0x4a2a4a, 0x1f2f4a];
  let k = 0;
  for (let i = 0; i <= shelves; i++) {
    const y = 0.04 + (i * (height - 0.08)) / shelves;
    g.add(mesh(new THREE.BoxGeometry(width - 0.04, 0.03, 0.32), wood, 0, y, 0));
    if (i === shelves) break;
    let x = -width / 2 + 0.06;
    while (x < width / 2 - 0.12) {
      const w = 0.03 + ((k * 37) % 5) * 0.008;
      const h = 0.22 + ((k * 13) % 4) * 0.025;
      if ((k * 7) % 11 === 3) x += 0.08; // gap between books
      else g.add(mesh(new THREE.BoxGeometry(w, h, 0.22), std(colors[k % colors.length], 0.85), x + w / 2, y + 0.015 + h / 2, 0.02));
      x += w + 0.004;
      k++;
    }
  }
  return g;
}

/** Framed painting for a wall (faces +z). */
export function frame(seed: number, w = 0.9, h = 0.68) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.04), std(0x2a1a10, 0.5), 0, 0, -0.02));
  g.add(mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: painting(seed), roughness: 0.7 }), 0, 0, 0.001));
  return g;
}

/** Rug lying on the floor (w along x, d along z). */
export function rug(w: number, d: number, colors: [string, string, string]) {
  const m = mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: rugTexture(...colors), roughness: 1 }), 0, 0.006, 0);
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Small round side table. */
export function sideTable() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 24), wood, 0, 0.6, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.58, 10), wood, 0, 0.3, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 20), wood, 0, 0.015, 0));
  return g;
}

/** Bench for the bowlers' area. */
export function bench(color: number) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.8, 0.1, 0.5), std(color, 0.9), 0, 0.45, 0));
  g.add(mesh(new THREE.BoxGeometry(1.8, 0.45, 0.08), std(color, 0.9), 0, 0.75, -0.22));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.45, 0.45), wood, s * 0.8, 0.22, 0));
  return g;
}
