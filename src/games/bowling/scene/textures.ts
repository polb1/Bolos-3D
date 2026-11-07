import { canvas, seeded } from '../../../utils/canvas';
import { WOODS } from '../../../config/settings';
import * as THREE from 'three';
import { LANE } from '../constants';

/** All textures are drawn procedurally on canvases: no external image assets. */

/** Maple/pine boards running along the lane; repeats along its length. */
export function laneWoodTexture(tone: string, anisotropy: number) {
  const [c, g] = canvas(1024, 1024);
  const wood = WOODS[tone] ?? WOODS.clara;
  const rnd = seeded(tone === 'clara' ? 7 : 11);
  const boards = LANE.boardCount;
  const bw = c.width / boards;
  const base = wood.base;
  for (let b = 0; b < boards; b++) {
    const k = 0.86 + rnd() * 0.22;
    g.fillStyle = `rgb(${base[0] * k},${base[1] * k},${base[2] * k})`;
    g.fillRect(b * bw, 0, bw + 1, c.height);
    // Grain streaks.
    for (let s = 0; s < 14; s++) {
      g.strokeStyle = `rgba(${wood.grain},${0.05 + rnd() * 0.1})`;
      g.lineWidth = 0.6 + rnd() * 1.2;
      const x = b * bw + rnd() * bw;
      g.beginPath();
      g.moveTo(x, 0);
      for (let y = 0; y <= c.height; y += 64) g.lineTo(x + Math.sin(y * 0.01 + s) * 1.6, y);
      g.stroke();
    }
    // Board seams and staggered butt joints.
    g.fillStyle = 'rgba(40,20,5,0.35)';
    g.fillRect(b * bw, 0, 1.2, c.height);
    g.fillRect(b * bw, rnd() * c.height, bw, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

/** Pin: white maple with the two classic red neck stripes. v = height / pin height. */
export function pinTexture() {
  const [c, g] = canvas(64, 512);
  g.fillStyle = '#f7f4ee';
  g.fillRect(0, 0, 64, 512);
  const stripe = (from: number, to: number) => {
    g.fillStyle = '#c4121f';
    g.fillRect(0, 512 * (1 - to), 64, 512 * (to - from));
  };
  stripe(0.655, 0.685);
  stripe(0.71, 0.74);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Reactive-resin ball with swirls and three finger holes. */
export function ballTexture(base: string, swirl: string) {
  const [c, g] = canvas(1024, 512);
  const rnd = seeded(base.length * 97 + swirl.charCodeAt(1));
  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);
  g.globalAlpha = 0.5;
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = i % 3 === 0 ? swirl : 'rgba(0,0,0,0.6)';
    g.lineWidth = 4 + rnd() * 18;
    g.beginPath();
    let x = rnd() * c.width;
    let y = rnd() * c.height;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rnd() - 0.5) * 300;
      y += (rnd() - 0.5) * 160;
      g.quadraticCurveTo(x + (rnd() - 0.5) * 200, y + (rnd() - 0.5) * 120, x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  // Finger holes (two fingers + thumb) near the equator.
  const hole = (x: number, y: number, r: number) => {
    const grad = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    grad.addColorStop(0, '#000');
    grad.addColorStop(0.75, '#0a0a0a');
    grad.addColorStop(1, 'rgba(255,255,255,0.35)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, r, r * 1.6, 0, 0, Math.PI * 2);
    g.fill();
  };
  hole(500, 210, 13);
  hole(540, 210, 13);
  hole(520, 290, 15);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Masking unit panel above the pins. */
export function maskingTexture(lane: number) {
  const [c, g] = canvas(1024, 256);
  const grad = g.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, '#2a160e');
  grad.addColorStop(0.5, '#4a2818');
  grad.addColorStop(1, '#2a160e');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(236,163,55,0.9)';
  g.lineWidth = 6;
  for (let i = -4; i < 12; i++) {
    g.beginPath();
    g.moveTo(i * 110, 256);
    g.lineTo(i * 110 + 180, 0);
    g.globalAlpha = 0.12;
    g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#f6ead8';
  g.font = '900 96px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('BOLERA', 470, 128);
  g.fillStyle = '#eca337';
  g.fillText('·', 750, 128);
  g.font = '700 54px system-ui, sans-serif';
  g.fillStyle = '#e2c6ab';
  g.fillText(String(lane), 70, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Dark patterned carpet for the approach/settee area. */
export function carpetTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#3a1c16';
  g.fillRect(0, 0, 256, 256);
  const cols = ['#6a2a22', '#c98a3a', '#2f4a3a', '#8a5a3a'];
  const rnd = seeded(3);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = cols[i % cols.length];
    g.globalAlpha = 0.35;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(rnd() * 256, rnd() * 256, 4 + rnd() * 14, 0, Math.PI * (0.5 + rnd()));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
