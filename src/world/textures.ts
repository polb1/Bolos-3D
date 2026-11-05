import * as THREE from 'three';

/** Procedural textures for the hall (no external image assets, like the rest of the project). */

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

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Classic arcade carpet: dark base with scattered neon shapes. */
export function arcadeCarpet(repeat: [number, number]) {
  const [c, g] = canvas(512, 512);
  const rnd = seeded(5);
  g.fillStyle = '#0d1022';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(255,255,255,${rnd() * 0.04})`;
    g.fillRect(rnd() * 512, rnd() * 512, 2, 2);
  }
  const colors = ['#d8f24a', '#4fb6ff', '#ff4fd8', '#ffb84f', '#7dffd9'];
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = colors[i % colors.length];
    g.globalAlpha = 0.28;
    g.lineWidth = 3;
    const x = rnd() * 512;
    const y = rnd() * 512;
    const s = 8 + rnd() * 14;
    g.beginPath();
    const kind = i % 4;
    if (kind === 0) g.arc(x, y, s, 0, Math.PI * 2);
    else if (kind === 1) g.rect(x - s, y - s, s * 1.4, s * 1.4);
    else if (kind === 2) {
      g.moveTo(x, y - s);
      g.lineTo(x + s, y + s);
      g.lineTo(x - s, y + s);
      g.closePath();
    } else {
      g.moveTo(x - s, y);
      for (let k = 0; k < 4; k++) g.lineTo(x - s + (k + 1) * (s / 2), y + (k % 2 ? -s / 2 : s / 2));
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  return tex(c, repeat);
}

/** Polished tiles for the bar area. */
export function tiles(repeat: [number, number]) {
  const [c, g] = canvas(256, 256);
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? '#1c1f2b' : '#2a2e3d';
      g.fillRect(x * 128, y * 128, 128, 128);
    }
  g.strokeStyle = '#0a0b10';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  g.beginPath();
  g.moveTo(128, 0);
  g.lineTo(128, 256);
  g.moveTo(0, 128);
  g.lineTo(256, 128);
  g.stroke();
  return tex(c, repeat);
}

/** Acoustic wall panels with a subtle vertical rhythm. */
export function wallPanels(repeat: [number, number]) {
  const [c, g] = canvas(256, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#141a33');
  grd.addColorStop(1, '#0b0f20');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 3, 256);
  g.fillStyle = 'rgba(255,255,255,0.03)';
  for (let x = 4; x < 256; x += 64) g.fillRect(x, 0, 2, 256);
  return tex(c, repeat);
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

/** Glowing neon lettering on a transparent background. */
export function neonText(text: string, color: string, font = 'bold 120px "Segoe UI", system-ui, sans-serif') {
  const [m] = canvas(1, 1);
  const mg = m.getContext('2d')!;
  mg.font = font;
  const w = Math.ceil(mg.measureText(text).width) + 120;
  const [c, g] = canvas(w, 220);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  for (const blur of [40, 20, 8]) {
    g.shadowBlur = blur;
    g.fillStyle = color;
    g.fillText(text, w / 2, 110);
  }
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.globalAlpha = 0.85;
  g.fillText(text, w / 2, 110);
  const t = tex(c);
  return { texture: t, aspect: w / 220 };
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

/** Soft light pool painted on the floor under lamps and signs. */
export function lightPool(color: string) {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
