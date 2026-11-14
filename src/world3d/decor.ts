import * as THREE from 'three';
import type { DecorKind } from '../net/protocol';
import { canvas, tex } from '../utils/canvas';
import * as P from './props';
import { dartboard, israelFlag } from './textures';

/**
 * Decorations the admin can put up. Wall items face +z with their centre at the origin;
 * floor items stand on y = 0. Pictures are real photos from public/decor/.
 */
export const DECOR: Record<DecorKind, { name: string; wall: boolean }> = {
  cuadro: { name: 'Cuadro', wall: true },
  'bandera-es': { name: 'Bandera de España', wall: true },
  'bandera-il': { name: 'Bandera de Israel', wall: true },
  'foto-sanchez': { name: 'Foto de Pedro Sánchez', wall: true },
  'emoji-china': { name: 'Emoji con bandera china', wall: true },
  reloj: { name: 'Reloj de pared', wall: true },
  espejo: { name: 'Espejo', wall: true },
  diana: { name: 'Diana', wall: true },
  planta: { name: 'Planta', wall: false },
  estanteria: { name: 'Estantería', wall: false },
  sillon: { name: 'Sillón', wall: false },
  lampara: { name: 'Lámpara de pie', wall: false },
};

const std = (color: THREE.ColorRepresentation, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const loader = new THREE.TextureLoader();
const photos = new Map<string, THREE.Texture>();

/** A photo from public/decor/ in a dark wooden frame, sized to the image once it loads. */
export function photo(file: string, h = 0.8, caption = '') {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.04), std(0x2a1a10, 0.5));
  frame.position.z = -0.02;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }));
  pic.position.z = 0.002;
  g.add(frame, pic);
  if (caption) {
    // Credit plaque under the picture (the licences ask for it).
    const [c, cg] = canvas(512, 64);
    cg.fillStyle = '#2a1a10';
    cg.fillRect(0, 0, 512, 64);
    cg.fillStyle = '#e8d6b0';
    cg.font = '28px Georgia, serif';
    cg.textAlign = 'center';
    cg.textBaseline = 'middle';
    cg.fillText(caption, 256, 33);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.05), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.6 }));
    plaque.position.set(0, -h / 2 - 0.09, 0.005);
    g.add(plaque);
  }
  const fit = (t: THREE.Texture) => {
    const img = t.image as { width: number; height: number };
    const w = (h * img.width) / img.height;
    pic.scale.set(w, h, 1);
    frame.scale.set(w + 0.08, h + 0.08, 1);
    (pic.material as THREE.MeshStandardMaterial).map = t;
    (pic.material as THREE.MeshStandardMaterial).needsUpdate = true;
  };
  const cached = photos.get(file);
  if (cached) fit(cached);
  else
    loader.load(`./decor/${file}`, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      photos.set(file, t);
      fit(t);
    });
  return g;
}

function spainFlag() {
  const [c, g] = canvas(450, 300);
  g.fillStyle = '#aa151b';
  g.fillRect(0, 0, 450, 300);
  g.fillStyle = '#f1bf00';
  g.fillRect(0, 75, 450, 150);
  return tex(c);
}

/** Flag hung from a wooden pole (faces +z). */
function flag(map: THREE.Texture, w = 1.1, ratio = 8 / 11) {
  const g = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, w * ratio, 12, 1), new THREE.MeshStandardMaterial({ map, roughness: 0.9, side: THREE.DoubleSide }));
  cloth.position.set(0, -(w * ratio) / 2, 0.03);
  const p = cloth.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 9) * 0.015); // gentle folds
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, w + 0.16, 10), std(0x5a3820, 0.5));
  pole.rotation.z = Math.PI / 2;
  pole.position.set(0, 0.01, 0.04);
  g.add(cloth, pole);
  return g;
}

function clock() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#f4ead8';
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2a1a10';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 30px Georgia, serif';
  for (let i = 1; i <= 12; i++) g.fillText(String(i), 128 + Math.sin((i * Math.PI) / 6) * 95, 128 - Math.cos((i * Math.PI) / 6) * 95);
  const grp = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 40), std(0x4a2c18, 0.5));
  rim.rotation.x = Math.PI / 2;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.21, 40), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.7 }));
  face.position.z = 0.026;
  grp.add(rim, face);
  // Hands set to the real time when built.
  const now = new Date();
  for (const [len, ang] of [[0.11, ((now.getHours() % 12) + now.getMinutes() / 60) / 12], [0.17, now.getMinutes() / 60]]) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.012, len, 0.004), std(0x111111));
    hand.geometry.translate(0, len / 2, 0);
    hand.position.z = 0.03;
    hand.rotation.z = -ang * Math.PI * 2;
    grp.add(hand);
  }
  return grp;
}

function mirror() {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.04), std(0xc29a52, 0.3, 0.85));
  frame.position.z = -0.02;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1), std(0xdfe6ea, 0.03, 1));
  glass.position.z = 0.002;
  g.add(frame, glass);
  return g;
}

function board() {
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.03), std(0x2a1a10, 0.6));
  back.position.z = -0.02;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.23, 48), new THREE.MeshStandardMaterial({ map: dartboard(), roughness: 0.8 }));
  face.position.z = 0.02;
  g.add(back, face);
  return g;
}

/** Builds one decoration; `v` picks the painting. */
export function buildDecor(kind: DecorKind, v = 0): THREE.Object3D {
  switch (kind) {
    case 'cuadro':
      return P.frame(30 + v, 0.9, 0.68);
    case 'bandera-es':
      return flag(spainFlag(), 1.1, 2 / 3);
    case 'bandera-il':
      return flag(israelFlag());
    case 'foto-sanchez':
      return photo('sanchez.jpg', 0.8, 'Foto: La Moncloa (CC BY)');
    case 'emoji-china':
      return photo('emoji-flag.avif', 0.6, 'Imagen: Freepik');
    case 'reloj':
      return clock();
    case 'espejo':
      return mirror();
    case 'diana':
      return board();
    case 'planta':
      return P.plant();
    case 'estanteria':
      return P.bookshelf(1.4, 2.0);
    case 'sillon':
      return P.armchair(0x6b2f22);
    case 'lampara':
      return P.floorLamp();
  }
}
