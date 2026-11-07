import { canvas, seeded, tex } from '../utils/canvas';
import * as THREE from 'three';

/** Procedural textures for the hall (no external image assets, like the rest of the project). */

/** Warm oak plank floor (planks along x, staggered joints). */
export function woodFloor(repeat: [number, number]) {
  const [c, g] = canvas(512, 512);
  const rnd = seeded(7);
  const rows = 10;
  const h = 512 / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 300;
    while (x < 512) {
      const w = 320 + rnd() * 260;
      const l = 34 + rnd() * 5;
      g.fillStyle = `hsl(${30 + rnd() * 4},${34 + rnd() * 8}%,${l}%)`;
      g.fillRect(x, r * h, w, h);
      // Grain.
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(60,30,10,${0.06 + rnd() * 0.1})`;
        g.lineWidth = 1 + rnd() * 1.5;
        const y = r * h + rnd() * h;
        g.beginPath();
        g.moveTo(x, y);
        for (let xx = 0; xx <= w; xx += 24) g.lineTo(x + xx, y + Math.sin((xx + k * 40) * 0.02) * 2);
        g.stroke();
      }
      g.fillStyle = 'rgba(30,15,5,0.55)';
      g.fillRect(x, r * h, 2, h);
      x += w;
    }
    g.fillStyle = 'rgba(30,15,5,0.5)';
    g.fillRect(0, r * h, 512, 2);
  }
  // Wrap the left edge onto the right so joints tile.
  return tex(c, repeat);
}

/** Warm limewash plaster for the upper walls. */
export function plaster(repeat: [number, number]) {
  const [c, g] = canvas(256, 256);
  const rnd = seeded(11);
  g.fillStyle = '#e9dcc6';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(255,250,240,${rnd() * 0.12})` : `rgba(150,120,90,${rnd() * 0.07})`;
    const r = 4 + rnd() * 18;
    g.beginPath();
    g.arc(rnd() * 256, rnd() * 256, r, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c, repeat);
}

/** Wood panelling (wainscot) for the lower walls. */
export function wainscot(repeat: [number, number]) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#5a3720';
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 64) {
    g.fillStyle = '#4a2c18';
    g.fillRect(x + 8, 20, 48, 216);
    g.fillStyle = 'rgba(255,220,180,0.08)';
    g.fillRect(x + 8, 20, 48, 3);
    g.fillRect(x + 8, 20, 3, 216);
  }
  g.fillStyle = '#6b4428';
  g.fillRect(0, 0, 256, 12);
  return tex(c, repeat);
}

/** Old red brick for the accent wall behind the bar. */
export function brick(repeat: [number, number]) {
  const [c, g] = canvas(256, 256);
  const rnd = seeded(3);
  g.fillStyle = '#cdbba3';
  g.fillRect(0, 0, 256, 256);
  const bh = 32;
  for (let r = 0; r < 8; r++)
    for (let k = -1; k < 4; k++) {
      const x = k * 64 + (r % 2 ? 32 : 0);
      g.fillStyle = `hsl(${10 + rnd() * 12},${40 + rnd() * 15}%,${30 + rnd() * 12}%)`;
      g.fillRect(x + 2, r * bh + 2, 60, bh - 4);
    }
  return tex(c, repeat);
}

/** Woven rug with a border and a simple geometric centre. */
export function rug(base: string, border: string, accent: string) {
  const [c, g] = canvas(512, 340);
  g.fillStyle = border;
  g.fillRect(0, 0, 512, 340);
  g.fillStyle = base;
  g.fillRect(26, 26, 460, 288);
  g.strokeStyle = accent;
  g.lineWidth = 6;
  g.strokeRect(44, 44, 424, 252);
  g.lineWidth = 4;
  for (let i = 0; i < 5; i++) {
    const s = 30 + i * 22;
    g.beginPath();
    g.moveTo(256, 170 - s);
    g.lineTo(256 + s * 1.4, 170);
    g.lineTo(256, 170 + s);
    g.lineTo(256 - s * 1.4, 170);
    g.closePath();
    g.stroke();
  }
  const rnd = seeded(17);
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.06})`;
    g.fillRect(rnd() * 512, rnd() * 340, 2, 2);
  }
  return tex(c);
}

/** A simple painting: soft landscape bands, so the walls have something to look at. */
export function painting(seed: number) {
  const [c, g] = canvas(256, 192);
  const rnd = seeded(seed);
  const hue = Math.floor(rnd() * 360);
  const sky = g.createLinearGradient(0, 0, 0, 192);
  sky.addColorStop(0, `hsl(${hue},45%,72%)`);
  sky.addColorStop(1, `hsl(${(hue + 30) % 360},55%,82%)`);
  g.fillStyle = sky;
  g.fillRect(0, 0, 256, 192);
  g.fillStyle = `hsl(${(hue + 40) % 360},60%,85%)`;
  g.beginPath();
  g.arc(60 + rnd() * 140, 50 + rnd() * 30, 18 + rnd() * 10, 0, Math.PI * 2);
  g.fill();
  for (let band = 0; band < 3; band++) {
    g.fillStyle = `hsl(${(hue + 90 + band * 20) % 360},${30 + band * 8}%,${55 - band * 13}%)`;
    g.beginPath();
    g.moveTo(0, 192);
    const base = 100 + band * 30;
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, base + Math.sin(x * 0.03 + rnd() * 6) * (14 - band * 3));
    g.lineTo(256, 192);
    g.fill();
  }
  return tex(c);
}

/** Painted wooden signboard text (no glow): cream letters on stained wood. */
export function signBoard(text: string) {
  const font = 'bold 86px Georgia, "Times New Roman", serif';
  const [m] = canvas(1, 1);
  const mg = m.getContext('2d')!;
  mg.font = font;
  const w = Math.ceil(mg.measureText(text).width) + 110;
  const [c, g] = canvas(w, 150);
  g.fillStyle = '#3d2414';
  g.fillRect(0, 0, w, 150);
  const rnd = seeded(text.length * 31);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(20,8,2,${0.1 + rnd() * 0.2})`;
    g.lineWidth = 1 + rnd() * 2;
    const y = rnd() * 150;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y + (rnd() - 0.5) * 6);
    g.stroke();
  }
  g.strokeStyle = '#c9a46a';
  g.lineWidth = 5;
  g.strokeRect(12, 12, w - 24, 126);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#f1e2c2';
  g.fillText(text, w / 2, 80);
  return { texture: tex(c), aspect: w / 150 };
}

/** Wood for bars, tables and frames. */
export function darkWood(repeat: [number, number] = [1, 1]) {
  const [c, g] = canvas(256, 256);
  const rnd = seeded(13);
  g.fillStyle = '#4a2a17';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 80; i++) {
    g.strokeStyle = `rgba(${20 + rnd() * 30},${10 + rnd() * 10},5,${0.2 + rnd() * 0.3})`;
    g.lineWidth = 1 + rnd() * 2;
    const y = rnd() * 256;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
    g.stroke();
  }
  return tex(c, repeat);
}

/** Regulation dartboard face: 20 sectors, doubles, trebles and bull. */
export function dartboard() {
  const [c, g] = canvas(512, 512);
  const cx = 256;
  const R = 205;
  g.fillStyle = '#111';
  g.beginPath();
  g.arc(cx, cx, 256, 0, Math.PI * 2);
  g.fill();
  const order = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  const ring = (r0: number, r1: number, a0: number, a1: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, cx, r1, a0, a1);
    g.arc(cx, cx, r0, a1, a0, true);
    g.closePath();
    g.fill();
  };
  const s = R / 170; // board radius 170 mm
  for (let i = 0; i < 20; i++) {
    const a0 = -Math.PI / 2 + ((i - 0.5) * Math.PI * 2) / 20;
    const a1 = a0 + (Math.PI * 2) / 20;
    const dark = i % 2 === 0;
    ring(16 * s, 162 * s, a0, a1, dark ? '#151515' : '#efe2c2');
    ring(99 * s, 107 * s, a0, a1, dark ? '#d1252b' : '#11833b');
    ring(162 * s, 170 * s, a0, a1, dark ? '#d1252b' : '#11833b');
    g.save();
    g.translate(cx, cx);
    g.rotate((a0 + a1) / 2 + Math.PI / 2);
    g.fillStyle = '#fff';
    g.font = 'bold 22px sans-serif';
    g.textAlign = 'center';
    g.fillText(String(order[i]), 0, -R - 12);
    g.restore();
  }
  ring(0, 16 * s, 0, Math.PI * 2, '#11833b');
  ring(0, 6.35 * s, 0, Math.PI * 2, '#d1252b');
  g.strokeStyle = '#c0c0c0';
  g.lineWidth = 1.2;
  for (const r of [6.35, 16, 99, 107, 162, 170]) {
    g.beginPath();
    g.arc(cx, cx, r * s, 0, Math.PI * 2);
    g.stroke();
  }
  return tex(c);
}

/** Attract-mode screen for an arcade cabinet. */
export function arcadeScreen(seed: number, hue: number) {
  const [c, g] = canvas(256, 320);
  const rnd = seeded(seed);
  g.fillStyle = '#05010f';
  g.fillRect(0, 0, 256, 320);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `hsl(${(hue + rnd() * 120) % 360},90%,${50 + rnd() * 20}%)`;
    const s = 4 + Math.floor(rnd() * 3) * 4;
    g.fillRect(Math.floor((rnd() * 256) / 4) * 4, Math.floor((rnd() * 240) / 4) * 4, s, s);
  }
  g.fillStyle = `hsl(${hue},100%,65%)`;
  g.font = 'bold 30px monospace';
  g.textAlign = 'center';
  g.fillText('INSERT', 128, 270);
  g.fillText('COIN', 128, 302);
  for (let y = 0; y < 320; y += 3) {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, y, 256, 1);
  }
  return tex(c);
}

/** Air hockey playfield markings. */
export function airHockeyTop() {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#eef3fb';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let x = 6; x < 512; x += 12) for (let y = 6; y < 256; y += 12) g.fillRect(x, y, 1.5, 1.5);
  g.lineWidth = 4;
  g.strokeStyle = '#e1263f';
  g.beginPath();
  g.moveTo(256, 0);
  g.lineTo(256, 256);
  g.stroke();
  g.beginPath();
  g.arc(256, 128, 46, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = '#1f6fe0';
  for (const x of [0, 512]) {
    g.beginPath();
    g.arc(x, 128, 70, 0, Math.PI * 2);
    g.stroke();
  }
  return tex(c);
}

/** Foosball pitch. */
export function foosballPitch() {
  const [c, g] = canvas(512, 280);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#1f8a3a' : '#239a41';
    g.fillRect(i * 64, 0, 64, 280);
  }
  g.strokeStyle = '#ffffff';
  g.lineWidth = 4;
  g.strokeRect(8, 8, 496, 264);
  g.beginPath();
  g.moveTo(256, 8);
  g.lineTo(256, 272);
  g.stroke();
  g.beginPath();
  g.arc(256, 140, 40, 0, Math.PI * 2);
  g.stroke();
  g.strokeRect(8, 80, 50, 120);
  g.strokeRect(454, 80, 50, 120);
  return tex(c);
}

/** Soft round contact shadow. */
export function blobShadow() {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
