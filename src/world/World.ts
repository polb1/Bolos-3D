import { useHockeyStore } from '../games/airhockey/store';
import { useDartsStore } from '../games/darts/store';
import { useFoosStore } from '../games/foosball/store';
import { usePoolStore } from '../games/pool/store';
import { audio } from '../audio/AudioEngine';
import { useGameStore } from '../games/bowling/store/useGameStore';
import { ACTIVITIES, nearestActivity, type Activity } from './activities';
import { resolve, type Box } from './collide';
import { drawStatic, MAP_H, MAP_W, PROPS, ROOMS, roomAt, solids, SPAWN } from './map';
import { character, px, TILE } from './sprites';
import { OUTFITS, useWorldStore } from './worldStore';
import { net } from '../net/client';

const WALK = 4.2; // tiles / s
const RUN = 7.5;
const RADIUS = 0.3; // feet circle, tiles
const FADE_MS = 380;
const VIEW_TILES = 18; // roughly how many tiles fit vertically

/**
 * The arcade hall as a top-down pixel-art map of rooms. The minigames stay 3D:
 * walking up to one and pressing E hands the screen over to it.
 */
export class World {
  private readonly canvas = document.createElement('canvas');
  private readonly g = this.canvas.getContext('2d')!;
  private readonly staticLayer = document.createElement('canvas');
  private readonly sprite = document.createElement('canvas');
  private readonly boxes: Box[];
  private readonly pos = { x: SPAWN.x, z: SPAWN.y };
  private vx = 0;
  private vy = 0;
  private dir = 3; // 0 down, 1 left, 2 right, 3 up
  private anim = 0;
  private interactT = 0;
  private time = 0;
  private last = performance.now();
  private busy = false;
  private raf = 0;
  private scale = 3;
  private room = '';
  private readonly keys = new Set<string>();
  /** Virtual joystick from the touch UI, x/y in [-1, 1] (y up = forward). */
  readonly stick = { x: 0, y: 0, run: false };

  constructor(private readonly host: HTMLElement) {
    this.canvas.style.imageRendering = 'pixelated';
    host.appendChild(this.canvas);
    this.staticLayer.width = MAP_W * TILE;
    this.staticLayer.height = MAP_H * TILE;
    drawStatic(this.staticLayer.getContext('2d')!);
    this.sprite.width = 16;
    this.sprite.height = 24;
    this.boxes = solids().map(([x, y, w, h]) => ({ minX: x, maxX: x + w, minZ: y, maxZ: y + h }));

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.loop();
  }

  // ------------------------------------------------------------------ public API (UI)
  get live() {
    return useWorldStore.getState().place === 'world';
  }

  private get exploring() {
    return this.live && useWorldStore.getState().screen === 'explore';
  }

  /** Enters the hall from the title screen. */
  enter() {
    audio.unlock();
    audio.setAmbience(useGameStore.getState().settings.crowd);
    const w = useWorldStore.getState();
    net.connect(w.name, w.outfit);
    w.setScreen('explore');
  }

  pause() {
    this.keys.clear();
    useWorldStore.getState().setScreen('paused');
  }

  resume() {
    useWorldStore.getState().setScreen('explore');
  }

  toTitle() {
    useWorldStore.getState().setScreen('title');
  }

  /** E / touch button: start the activity in range. */
  interact() {
    const w = useWorldStore.getState();
    if (!this.exploring || this.busy || !w.nearby) return;
    const a = ACTIVITIES.find((x) => x.id === w.nearby)!;
    if (!a.place) {
      audio.ui();
      w.showToast(`${a.name} · en construcción, ¡muy pronto!`);
      return;
    }
    this.start(a);
  }

  private start(a: Activity) {
    const w = useWorldStore.getState();
    this.busy = true;
    this.interactT = 0.35;
    audio.ui();
    w.setFade(true);
    window.setTimeout(() => {
      w.setPlace(a.place!);
      if (a.place === 'bowling') useGameStore.getState().setScreen('menu');
      if (a.place === 'airhockey') useHockeyStore.getState().setScreen('menu');
      if (a.place === 'darts') useDartsStore.getState().set({ screen: 'menu' });
      if (a.place === 'foosball') useFoosStore.getState().set({ screen: 'menu' });
      if (a.place === 'pool' && usePoolStore.getState().screen !== 'playing') usePoolStore.getState().set({ screen: 'menu' });
      w.setFade(false);
      this.busy = false;
    }, FADE_MS);
  }

  /** Back to the hall from an activity: the character is where it was left. */
  leave() {
    const w = useWorldStore.getState();
    w.setFade(true);
    window.setTimeout(() => {
      w.setPlace('world');
      w.setScreen('explore');
      audio.setAmbience(useGameStore.getState().settings.crowd);
      this.last = performance.now();
      w.setFade(false);
    }, FADE_MS);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }

  // ------------------------------------------------------------------ input
  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.live || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    const w = useWorldStore.getState();
    if (e.code === 'Escape') {
      if (w.screen === 'explore') this.pause();
      else if (w.screen === 'paused') this.resume();
      return;
    }
    if (w.screen !== 'explore') return;
    this.keys.add(e.code);
    if ((e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') && !e.repeat) this.interact();
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

  private onBlur = () => this.keys.clear();

  // ------------------------------------------------------------------ loop
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    // Keep the room updated (and remote players moving) even while inside a minigame.
    net.tick(dt, { x: this.pos.x, y: this.pos.z, dir: this.dir, moving: this.anim > 0, place: useWorldStore.getState().place });
    if (!this.live) return; // an activity owns the screen; the hall is frozen as left
    this.frame(dt);
  };

  /** One simulation + render step. */
  frame(dt: number) {
    this.time += dt;
    const w = useWorldStore.getState();
    if (w.screen === 'explore') this.move(dt);
    else this.vx = this.vy = 0;

    const near = w.screen === 'explore' ? nearestActivity(this.pos.x, this.pos.z)?.id ?? null : null;
    if (near !== w.nearby) w.setNearby(near);
    const room = roomAt(this.pos.x, this.pos.z)?.name ?? this.room; // doorways keep the last room
    if (room !== this.room) {
      this.room = room;
      if (w.screen === 'explore' && room) w.showToast(room);
    }
    this.render(w.screen, near);
  }

  private move(dt: number) {
    const k = this.keys;
    let ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + this.stick.x;
    let iy = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - this.stick.y;
    const mag = Math.min(1, Math.hypot(ix, iy));
    if (mag > 0.01) {
      const n = Math.hypot(ix, iy);
      ix /= n;
      iy /= n;
    }
    const running = k.has('ShiftLeft') || k.has('ShiftRight') || this.stick.run;
    const speed = this.busy ? 0 : (running ? RUN : WALK) * mag;
    const a = 1 - Math.exp(-(mag > 0.01 ? 18 : 22) * dt);
    this.vx += (ix * speed - this.vx) * a;
    this.vy += (iy * speed - this.vy) * a;
    this.pos.x += this.vx * dt;
    this.pos.z += this.vy * dt;
    resolve(this.pos, RADIUS, this.boxes);

    const sp = Math.hypot(this.vx, this.vy);
    if (sp > 0.3) {
      this.dir = Math.abs(this.vx) > Math.abs(this.vy) ? (this.vx < 0 ? 1 : 2) : this.vy < 0 ? 3 : 0;
      const before = Math.floor(this.anim);
      this.anim += dt * sp * 2.2;
      // A footfall on every other animation frame (each foot touching down).
      if (Math.floor(this.anim) !== before && Math.floor(this.anim) % 2 === 0) {
        const floor = roomAt(this.pos.x, this.pos.z)?.floor;
        audio.step(floor === 'bowling' || floor === 'bar' || floor === 'darts' || floor === 'hockey');
      }
    } else this.anim = 0;
    this.interactT = Math.max(0, this.interactT - dt);
  }

  // ------------------------------------------------------------------ render
  private render(screen: string, near: string | null) {
    const g = this.g;
    const W = this.canvas.width;
    const H = this.canvas.height;
    let s = this.scale;
    let cx = this.pos.x * TILE;
    let cy = this.pos.z * TILE - 8;
    if (screen === 'title' || screen === 'controls' || screen === 'stats' || screen === 'loading') {
      // Slow pan over the map behind the menus.
      cx = (MAP_W * TILE) / 2 + Math.sin(this.time * 0.08) * 220;
      cy = (MAP_H * TILE) / 2 + Math.cos(this.time * 0.06) * 120;
    } else if (screen === 'character') {
      s = this.scale * 2;
      cx -= 40;
    }
    const vw = W / s;
    const vh = H / s;
    // Keep the view on the map (or centred if the map is smaller than the screen).
    const clamp = (c: number, v: number, size: number) => (size <= v ? size / 2 : Math.min(Math.max(c, v / 2), size - v / 2));
    cx = clamp(cx, vw, MAP_W * TILE);
    cy = clamp(cy, vh, MAP_H * TILE);
    const ox = Math.round(cx - vw / 2);
    const oy = Math.round(cy - vh / 2);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    px(g, 0, 0, W, H, '#05060d');
    g.setTransform(s, 0, 0, s, -ox * s, -oy * s);
    g.drawImage(this.staticLayer, 0, 0);

    // Activity markers on the floor.
    for (const a of ACTIVITIES) {
      const on = a.id === near;
      const r = (on ? 10 + Math.sin(this.time * 6) : 6) | 0;
      g.strokeStyle = a.color + (on ? 'ee' : '55');
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(Math.round(a.x * TILE), Math.round(a.y * TILE), r, r * 0.5, 0, 0, Math.PI * 2);
      g.stroke();
    }

    // Depth-sorted props and the player (by bottom edge).
    const items: Array<{ y: number; draw: () => void }> = [];
    for (const p of PROPS) {
      if (p.layer !== 'sort') continue;
      if (p.x > ox + vw || p.x + p.w < ox || p.y > oy + vh || p.y + p.h < oy) continue;
      items.push({
        y: p.y + p.h,
        draw: () => {
          g.save();
          g.translate(p.x, p.y);
          p.draw(g, p.animated ? this.time : 0);
          g.restore();
        },
      });
    }
    const outfit = OUTFITS[useWorldStore.getState().outfit]?.outfit ?? OUTFITS[0].outfit;
    const frame = this.interactT > 0 ? 1 : this.anim ? 1 + (Math.floor(this.anim) % 4) : 0;
    const sg = this.sprite.getContext('2d')!;
    // Other players in the room, drawn like us with their own outfit.
    for (const p of net.peers.values()) {
      const fx = Math.round(p.x * TILE);
      const fy = Math.round(p.y * TILE);
      items.push({
        y: fy,
        draw: () => {
          sg.clearRect(0, 0, 16, 24);
          character(sg, OUTFITS[p.outfit]?.outfit ?? OUTFITS[0].outfit, p.dir, p.anim ? 1 + (Math.floor(p.anim) % 4) : 0);
          g.globalAlpha = p.place === 'world' ? 1 : 0.55; // playing a minigame: shown faded where they left
          g.drawImage(this.sprite, fx - 8, fy - 23);
          g.globalAlpha = 1;
        },
      });
    }
    const feetY = Math.round(this.pos.z * TILE);
    items.push({
      y: feetY + 0.5,
      draw: () => {
        sg.clearRect(0, 0, 16, 24);
        character(sg, outfit, this.interactT > 0 ? 3 : this.dir, frame);
        g.drawImage(this.sprite, Math.round(this.pos.x * TILE) - 8, feetY - 23);
      },
    });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    // Rooms you are not in sit in the dark, so the map reads room by room.
    if (screen === 'explore' || screen === 'paused') {
      g.fillStyle = '#05060dad';
      for (const r of ROOMS) if (r.name !== this.room) g.fillRect((r.x0 + 1) * TILE, (r.y0 + 1) * TILE, (r.x1 - r.x0 - 1) * TILE, (r.y1 - r.y0 - 1) * TILE);
    }

    // Name tags over remote players, in screen pixels so the text stays crisp.
    if (net.peers.size && (screen === 'explore' || screen === 'paused')) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.font = `bold ${Math.max(11, s * 4)}px ui-sans-serif, system-ui, sans-serif`;
      g.textAlign = 'center';
      for (const p of net.peers.values()) {
        const tx = (p.x * TILE - ox) * s;
        const ty = (p.y * TILE - 27 - oy) * s;
        const label = p.place === 'world' ? p.name : `${p.name} · ${p.place === 'bowling' ? 'bolos' : 'air hockey'}`;
        g.fillStyle = '#000000aa';
        const wdt = g.measureText(label).width + 10;
        g.fillRect(tx - wdt / 2, ty - s * 4 - 6, wdt, s * 4 + 8);
        g.fillStyle = '#eaf2ff';
        g.fillText(label, tx, ty);
      }
      g.setTransform(s, 0, 0, s, -ox * s, -oy * s);
    }

    // Bouncing arrow over the player when an activity is in range.
    if (near) {
      const a = ACTIVITIES.find((x) => x.id === near)!;
      const bx = Math.round(this.pos.x * TILE);
      const by = feetY - 34 + Math.round(Math.sin(this.time * 6) * 2);
      g.fillStyle = a.color;
      for (let i = 0; i < 4; i++) g.fillRect(bx - 3 + i, by + i, 7 - i * 2, 1);
      g.fillRect(bx - 1, by - 4, 3, 4);
    }
  }

  private resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // Integer zoom keeps every pixel square.
    // Fit ~VIEW_TILES tall and at least ~12 wide, so portrait phones still see the room.
    this.scale = Math.max(2, Math.round(Math.min(this.canvas.height / (VIEW_TILES * TILE), this.canvas.width / (12 * TILE))));
  };
}
