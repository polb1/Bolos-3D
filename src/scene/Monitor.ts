import * as THREE from 'three';
import { PIN_SPACING, rackPositions } from '../config/constants';

const W = 960;
const H = 540;
const LIME = '#eca337';
const CYAN = '#e5b483';
const GOLD = '#ffd23f';

export type Celebration = 'strike' | 'spare';

interface CartoonPin {
  x: number;
  y: number;
  s: number;
  rot: number;
  vx: number;
  vy: number;
  vr: number;
  depth: number;
}

interface Confetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  color: string;
}

/** Duration of a celebration clip, in seconds. */
export const CLIP_LENGTH = 3.4;
const IMPACT = 0.6;

/**
 * The overhead TV found above every lane in a real bowling centre. Between
 * throws it shows the bowler's score; after a strike or spare it plays a short
 * cartoon clip (our own procedural animation, drawn on a canvas each frame).
 */
export class Monitor {
  readonly group = new THREE.Group();
  /** Where the camera should sit to frame the screen, and what it looks at. */
  readonly viewPos = new THREE.Vector3();
  readonly viewTarget = new THREE.Vector3();
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private clip: { kind: Celebration; title: string; sub: string; t: number; pins: CartoonPin[]; confetti: Confetti[]; hit: boolean } | null = null;
  private idleKey = '';
  onImpact: (() => void) | null = null;

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    const sw = 1.2;
    const sh = sw * (H / W);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    screen.position.z = 0.026;
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(sw + 0.08, sh + 0.08, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.4, metalness: 0.5 }),
    );
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7), new THREE.MeshStandardMaterial({ color: 0x3a2416, metalness: 0.6 }));
    mount.position.set(0, sh / 2 + 0.35, -0.05);
    const tv = new THREE.Group();
    tv.add(bezel, screen, mount);
    tv.rotation.x = -0.22; // tilted down towards the bowler
    this.group.add(tv);
    this.group.position.set(0, 2.78, 0.4);

    // Camera framing: straight in front of the screen.
    const normal = new THREE.Vector3(0, 0, 1).applyEuler(tv.rotation);
    this.viewTarget.copy(this.group.position);
    this.viewPos.copy(this.group.position).addScaledVector(normal, 1.0);
    this.drawIdle('BOLERA 3D', '', 0, 1);
  }

  get playing() {
    return this.clip !== null;
  }

  /** Score card shown between throws (redrawn only when it changes). */
  showIdle(name: string, total: number, frame: number) {
    if (this.clip) return;
    this.drawIdle(name, 'TOTAL', total, frame);
  }

  private drawIdle(name: string, label: string, total: number, frame: number) {
    const key = `${name}|${total}|${frame}`;
    if (key === this.idleKey) return;
    this.idleKey = key;
    const g = this.ctx;
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#281e13');
    bg.addColorStop(1, '#16100a');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#e2c6ab';
    g.font = '700 40px system-ui, sans-serif';
    g.fillText(name.toUpperCase(), W / 2, 110);
    if (label) {
      g.fillStyle = '#ffe27a';
      g.font = '900 200px system-ui, sans-serif';
      g.fillText(String(total), W / 2, 280);
      g.fillStyle = '#c7a98b';
      g.font = '700 30px system-ui, sans-serif';
      g.fillText(`${label} · FRAME ${frame}`, W / 2, 430);
    } else {
      g.fillStyle = '#fcf4ed';
      g.font = '900 120px system-ui, sans-serif';
      g.fillText('BOLERA', W / 2 - 80, 290);
      g.fillStyle = LIME;
      g.fillText('3D', W / 2 + 230, 290);
    }
    this.texture.needsUpdate = true;
  }

  /** Starts a clip; `pins` are the rack indices that were standing before the throw. */
  play(kind: Celebration, title: string, sub: string, pins: number[]) {
    const rack = rackPositions();
    const headZ = rack[0][1];
    const cartoon = pins.map((i) => {
      const [x, z] = rack[i];
      const depth = Math.round((headZ - z) / (PIN_SPACING * Math.cos(Math.PI / 6)));
      const s = 1 - depth * 0.1;
      return { x: W / 2 + (x / PIN_SPACING) * 120 * s, y: 410 - depth * 34, s, rot: 0, vx: 0, vy: 0, vr: 0, depth };
    });
    cartoon.sort((a, b) => b.depth - a.depth); // back rows first
    this.clip = { kind, title, sub, t: -0.55, pins: cartoon, confetti: [], hit: false };
    this.idleKey = '';
  }

  stop() {
    this.clip = null;
  }

  update(dt: number) {
    const c = this.clip;
    if (!c) return;
    c.t += dt;
    if (c.t > CLIP_LENGTH) {
      this.clip = null;
      return;
    }
    if (c.t < 0) return; // camera still travelling to the screen
    if (!c.hit && c.t >= IMPACT) this.impact(c);
    for (const p of c.pins) {
      if (!c.hit) break;
      p.vy += 1500 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (const f of c.confetti) {
      f.vy = Math.min(f.vy + 300 * dt, 260);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
    }
    this.drawClip(c);
    this.texture.needsUpdate = true;
  }

  private impact(c: NonNullable<Monitor['clip']>) {
    c.hit = true;
    const power = c.kind === 'strike' ? 1 : 0.8;
    for (const p of c.pins) {
      const dir = p.x < W / 2 ? -1 : 1;
      p.vx = dir * (200 + Math.random() * 500) * power + (Math.random() - 0.5) * 200;
      p.vy = -(500 + Math.random() * 600) * power;
      p.vr = (Math.random() - 0.5) * 24;
    }
    const colors = c.kind === 'strike' ? [LIME, GOLD, '#ffffff', '#ff5a6e', CYAN] : [CYAN, '#ffffff', LIME];
    for (let i = 0; i < (c.kind === 'strike' ? 140 : 70); i++) {
      c.confetti.push({
        x: Math.random() * W,
        y: -20 - Math.random() * 400,
        vx: (Math.random() - 0.5) * 80,
        vy: 60 + Math.random() * 120,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 10,
        color: colors[i % colors.length],
      });
    }
    this.onImpact?.();
  }

  // ------------------------------------------------------------------ drawing
  private drawClip(c: NonNullable<Monitor['clip']>) {
    const g = this.ctx;
    const t = c.t;
    const accent = c.kind === 'strike' ? LIME : CYAN;
    const shake = c.hit && t < IMPACT + 0.3 ? (1 - (t - IMPACT) / 0.3) * 14 : 0;

    g.save();
    g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // Backdrop: deck seen from the front with lights.
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2d2216');
    bg.addColorStop(0.62, '#3e2f1f');
    bg.addColorStop(0.62, '#c99a5e');
    bg.addColorStop(1, '#8a5d2e');
    g.fillStyle = bg;
    g.fillRect(-20, -20, W + 40, H + 40);

    // Rotating rays once the pins are hit.
    if (c.hit) {
      const k = Math.min(1, (t - IMPACT) / 0.4);
      g.save();
      g.translate(W / 2, H * 0.42);
      g.rotate(t * 0.6);
      g.globalAlpha = 0.18 * k;
      g.fillStyle = accent;
      for (let i = 0; i < 16; i++) {
        g.rotate((Math.PI * 2) / 16);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(-60, -900);
        g.lineTo(60, -900);
        g.closePath();
        g.fill();
      }
      g.restore();
    }

    for (const p of c.pins) this.drawPin(p.x, p.y, p.s, p.rot);

    // Ball rolling in from the bottom, shrinking with distance.
    if (t < IMPACT + 0.25) {
      const k = Math.min(1, t / IMPACT);
      const e = k * k;
      const bx = W / 2 + Math.sin(k * 3) * 30 * (1 - k);
      const by = H + 120 - e * (H + 120 - 360);
      const br = 130 - e * 85;
      const grad = g.createRadialGradient(bx - br * 0.35, by - br * 0.35, br * 0.1, bx, by, br);
      grad.addColorStop(0, '#ff6b7e');
      grad.addColorStop(1, '#7a0a1c');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(bx, by, br, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1a0006';
      for (const [ox, oy, r] of [[-0.22, -0.3, 0.1], [0.12, -0.32, 0.1], [-0.04, 0.05, 0.12]]) {
        g.beginPath();
        g.arc(bx + ox * br, by + oy * br, r * br, 0, Math.PI * 2);
        g.fill();
      }
    }

    // White flash on impact.
    if (c.hit && t < IMPACT + 0.25) {
      g.fillStyle = `rgba(255,255,255,${0.7 * (1 - (t - IMPACT) / 0.25)})`;
      g.fillRect(-20, -20, W + 40, H + 40);
    }

    for (const f of c.confetti) {
      g.save();
      g.translate(f.x, f.y);
      g.rotate(f.rot);
      g.fillStyle = f.color;
      g.fillRect(-6, -3, 12, 6);
      g.restore();
    }

    // Title with an elastic pop.
    if (t > IMPACT + 0.2) {
      const k = Math.min(1, (t - IMPACT - 0.2) / 0.5);
      const pop = 1 + Math.sin(k * Math.PI) * 0.25 * (1 - k) + (1 - k) * -0.6;
      g.save();
      g.translate(W / 2, H * 0.4);
      g.scale(pop, pop);
      g.rotate(Math.sin(t * 3) * 0.03);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '900 150px system-ui, sans-serif';
      g.lineWidth = 16;
      g.strokeStyle = '#1b150f';
      g.strokeText(c.title, 0, 0);
      g.fillStyle = accent;
      g.fillText(c.title, 0, 0);
      g.font = '800 38px system-ui, sans-serif';
      g.lineWidth = 8;
      g.strokeText(c.sub, 0, 110);
      g.fillStyle = '#ffffff';
      g.fillText(c.sub, 0, 110);
      g.restore();
    }

    // Fade to black at the end.
    if (t > CLIP_LENGTH - 0.35) {
      g.fillStyle = `rgba(26,18,12,${(t - (CLIP_LENGTH - 0.35)) / 0.35})`;
      g.fillRect(-20, -20, W + 40, H + 40);
    }
    g.restore();
  }

  /** Cartoon bowling pin: white body, red neck stripes, base at (x, y). */
  private drawPin(x: number, y: number, s: number, rot: number) {
    const g = this.ctx;
    const h = 150 * s;
    const w = 46 * s;
    g.save();
    g.translate(x, y - h / 2);
    g.rotate(rot);
    g.translate(0, h / 2);
    g.beginPath();
    g.moveTo(-w * 0.32, 0);
    g.bezierCurveTo(-w * 0.75, -h * 0.25, -w * 0.62, -h * 0.5, -w * 0.2, -h * 0.66);
    g.bezierCurveTo(-w * 0.12, -h * 0.72, -w * 0.38, -h * 0.9, 0, -h);
    g.bezierCurveTo(w * 0.38, -h * 0.9, w * 0.12, -h * 0.72, w * 0.2, -h * 0.66);
    g.bezierCurveTo(w * 0.62, -h * 0.5, w * 0.75, -h * 0.25, w * 0.32, 0);
    g.closePath();
    const grad = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    grad.addColorStop(0, '#e6e0da');
    grad.addColorStop(0.4, '#ffffff');
    grad.addColorStop(1, '#ccc4bc');
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 3 * s;
    g.strokeStyle = '#1b150f';
    g.stroke();
    g.fillStyle = '#d0142a';
    g.fillRect(-w * 0.22, -h * 0.7, w * 0.44, h * 0.035);
    g.fillRect(-w * 0.24, -h * 0.75, w * 0.48, h * 0.035);
    g.restore();
  }
}
