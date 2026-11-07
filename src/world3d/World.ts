import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { audio } from '../audio/AudioEngine';
import { QUALITY } from '../config/settings';
import { useGameStore } from '../games/bowling/store/useGameStore';
import { damp } from '../utils/math';
import { ACTIVITIES, nearestActivity, type Activity } from './activities';
import { Avatar } from './Avatar';
import { resolve } from '../world/collide';
import { H as CEILING, Hall, SPAWN } from './Hall';
import { OUTFITS, useWorldStore } from '../world/worldStore';
import { useHockeyStore } from '../games/airhockey/store';
import { useDartsStore } from '../games/darts/store';
import { net } from '../net/client';
import { hockeyRef } from '../games/airhockey/instance';
import { HockeyLobby, NET_OFFSET, SPOT_R, SPOTS, useLobbyStore } from './hockeyLobby';

const WALK = 2.1;
const RUN = 4.8;
const RADIUS = 0.32;
const EYE = 1.45; // camera pivot height above the floor
const MIN_DIST = 1.6;
const MAX_DIST = 7;
const FADE_MS = 380;

/** A remote player: their avatar plus a floating name tag. */
interface Ghost {
  avatar: Avatar;
  tag: THREE.Sprite;
  label: string;
  outfit: number;
  lastX: number;
  lastZ: number;
}

/**
 * The arcade hall: renderer, loop, third-person character and camera, and the
 * hand-off to activities. Only runs while the hall is the live place.
 */
export class World {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 80);
  private readonly hall = new Hall();
  private readonly avatar: Avatar;
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly markers = new Map<string, THREE.Group>();
  private readonly ghosts = new Map<string, Ghost>();
  private readonly spotRings = new Map<string, THREE.Mesh>();
  readonly lobby = new HockeyLobby((role, rival, table) => this.startOnline(role, rival, table));
  private readonly pos = { x: SPAWN.x, z: SPAWN.z };
  private readonly vel = new THREE.Vector2();
  private facing = SPAWN.yaw;
  private camYaw = SPAWN.yaw + Math.PI;
  private camPitch = 0.32;
  private dist = 4.2;
  private camDist = 4.2;
  private time = 0;
  private busy = false;
  /** Jump the camera behind the player on the next frame (no sweep through walls). */
  private snapCam = true;
  private raf = 0;
  private readonly keys = new Set<string>();
  /** Virtual joystick from the touch UI, x/y in [-1, 1] (y up = forward). */
  readonly stick = { x: 0, y: 0, run: false };
  private drag: { id: number; x: number; y: number } | null = null;
  /** Touch points on the canvas: one drags the camera, two pinch-zoom. */
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  /** Until the player zooms, portrait screens get a farther camera. */
  private zoomed = false;
  private readonly unsub: () => void;

  constructor(private readonly host: HTMLElement) {
    const quality = QUALITY[useGameStore.getState().settings.quality];
    this.renderer = new THREE.WebGLRenderer({ antialias: quality.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x1a120c);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    this.avatar = new Avatar(OUTFITS[useWorldStore.getState().outfit]?.outfit ?? OUTFITS[0].outfit);
    this.scene.add(this.hall.group, this.avatar.root);
    this.buildMarkers();
    this.buildSpots();

    const unsubQuality = useGameStore.subscribe((st, prev) => {
      if (st.settings.quality !== prev.settings.quality) this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[st.settings.quality].pixelRatio));
    });
    const unsubWorld = useWorldStore.subscribe((st, prev) => {
      if (st.outfit !== prev.outfit) this.avatar.setOutfit(OUTFITS[st.outfit].outfit);
      if (st.screen !== prev.screen && st.screen !== 'explore') this.keys.clear();
    });
    this.unsub = () => (unsubQuality(), unsubWorld());

    const c = this.renderer.domElement;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    c.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('pointerlockchange', this.onLockChange);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.loop();
  }

  // ------------------------------------------------------------------ public API (UI)
  get live() {
    const w = useWorldStore.getState();
    return w.place === 'world';
  }

  private get exploring() {
    return this.live && useWorldStore.getState().screen === 'explore';
  }

  /** Enters the hall from the title screen. */
  enter() {
    audio.unlock();
    audio.setAmbience(useGameStore.getState().settings.crowd);
    this.snapCam = true;
    const w = useWorldStore.getState();
    net.connect(w.name, w.outfit);
    w.setScreen('explore');
  }

  pause() {
    document.exitPointerLock?.();
    this.keys.clear();
    useWorldStore.getState().setScreen('paused');
  }

  resume() {
    useWorldStore.getState().setScreen('explore');
  }

  toTitle() {
    document.exitPointerLock?.();
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
    this.facing = Math.atan2(a.x - this.pos.x, a.z - this.pos.z) || this.facing;
    this.avatar.interact();
    audio.ui();
    document.exitPointerLock?.();
    w.setFade(true);
    window.setTimeout(() => {
      w.setPlace(a.place!);
      if (a.place === 'bowling') useGameStore.getState().setScreen('menu');
      if (a.place === 'airhockey') useHockeyStore.getState().setScreen('menu');
      if (a.place === 'darts') useDartsStore.getState().set({ screen: 'menu' });
      w.setFade(false);
      this.busy = false;
    }, FADE_MS);
  }

  /** Both players said ready on an air hockey table: open the online match. */
  private startOnline(role: 'host' | 'guest', rival: { id: string; name: string }, _table: number) {
    const w = useWorldStore.getState();
    this.busy = true;
    audio.ui();
    document.exitPointerLock?.();
    w.setFade(true);
    window.setTimeout(() => {
      w.setPlace('airhockey');
      hockeyRef.current?.startOnline(role, rival);
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
      this.clock.getDelta();
      w.setFade(false);
    }, FADE_MS);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.unsub();
    const c = this.renderer.domElement;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    c.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    c.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
    c.remove();
  }

  // ------------------------------------------------------------------ markers
  private buildMarkers() {
    for (const a of ACTIVITIES) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.5, 48),
        new THREE.MeshBasicMaterial({ color: a.color, transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.025;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 4), new THREE.MeshBasicMaterial({ color: a.color, toneMapped: false }));
      arrow.rotation.x = Math.PI;
      arrow.position.y = 2.25;
      arrow.visible = false;
      g.add(ring, arrow);
      g.position.set(a.x, 0, a.z);
      this.scene.add(g);
      this.markers.set(a.id, g);
    }
  }

  private updateMarkers(near: string | null) {
    for (const [id, g] of this.markers) {
      const on = id === near;
      const ring = g.children[0] as THREE.Mesh;
      const arrow = g.children[1];
      const pulse = 1 + Math.sin(this.time * 4) * 0.08;
      ring.scale.setScalar(on ? 1.5 * pulse : 1);
      (ring.material as THREE.MeshBasicMaterial).opacity = on ? 0.9 : 0.3;
      arrow.visible = on;
      arrow.position.y = 2.25 + Math.sin(this.time * 3) * 0.08;
      arrow.rotation.y = this.time * 2;
    }
  }

  // ------------------------------------------------------------------ online air hockey circles
  private buildSpots() {
    for (const s of SPOTS) {
      const color = s.side === 'blue' ? 0x3a8bff : 0xff3b4f;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(SPOT_R - 0.09, SPOT_R, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(s.x, 0.03, s.z);
      const fill = new THREE.Mesh(
        new THREE.CircleGeometry(SPOT_R - 0.09, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, toneMapped: false, depthWrite: false }),
      );
      fill.position.z = 0.001;
      ring.add(fill);
      this.scene.add(ring);
      this.spotRings.set(s.key, ring);
    }
  }

  private updateSpots() {
    const occupied = new Set<string>();
    const mine = useLobbyStore.getState().spot?.key;
    if (mine) occupied.add(mine);
    for (const p of net.peers.values()) {
      if (p.place !== 'world') continue;
      for (const s of SPOTS) if (Math.hypot(p.x - NET_OFFSET - s.x, p.y - NET_OFFSET - s.z) <= SPOT_R + 0.15) occupied.add(s.key);
    }
    for (const [key, ring] of this.spotRings) {
      const on = occupied.has(key);
      (ring.material as THREE.MeshBasicMaterial).opacity = on ? 0.95 : 0.45 + Math.sin(this.time * 3) * 0.1;
      ring.scale.setScalar(on ? 1 + Math.sin(this.time * 5) * 0.04 : 1);
    }
  }

  // ------------------------------------------------------------------ remote players
  private updateGhosts(dt: number) {
    for (const [id, g] of this.ghosts) {
      if (net.peers.has(id)) continue;
      this.scene.remove(g.avatar.root, g.tag);
      g.tag.material.map?.dispose();
      g.tag.material.dispose();
      this.ghosts.delete(id);
    }
    for (const p of net.peers.values()) {
      let g = this.ghosts.get(p.id);
      const x = p.x - NET_OFFSET;
      const z = p.y - NET_OFFSET;
      if (!g) {
        const avatar = new Avatar(OUTFITS[p.outfit]?.outfit ?? OUTFITS[0].outfit);
        const tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
        g = { avatar, tag, label: '', outfit: p.outfit, lastX: x, lastZ: z };
        this.scene.add(avatar.root, tag);
        this.ghosts.set(p.id, g);
      }
      if (g.outfit !== p.outfit) g.avatar.setOutfit(OUTFITS[(g.outfit = p.outfit)]?.outfit ?? OUTFITS[0].outfit);
      const label = p.place === 'world' ? p.name : `${p.name} · ${p.place === 'bowling' ? 'bolos' : p.place === 'darts' ? 'dardos' : 'air hockey'}`;
      if (label !== g.label) this.setTag(g, label);
      // Facing and gait come from how far the eased position moved this frame.
      const vx = (x - g.lastX) / Math.max(dt, 1e-3);
      const vz = (z - g.lastZ) / Math.max(dt, 1e-3);
      const speed = Math.hypot(vx, vz);
      if (speed > 0.2) g.avatar.root.rotation.y = Math.atan2(vx, vz);
      g.avatar.root.position.set(x, 0, z);
      g.avatar.update(dt, p.place === 'world' ? speed : 0, this.time);
      g.tag.position.set(x, 2.15, z);
      g.lastX = x;
      g.lastZ = z;
    }
  }

  private setTag(g: Ghost, label: string) {
    g.label = label;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    const font = 'bold 40px ui-sans-serif, system-ui, sans-serif';
    ctx.font = font;
    c.width = Math.ceil(ctx.measureText(label).width) + 32;
    c.height = 60;
    ctx.font = font;
    ctx.fillStyle = '#000000aa';
    ctx.beginPath();
    ctx.roundRect(0, 0, c.width, c.height, 14);
    ctx.fill();
    ctx.fillStyle = '#eaf2ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, c.width / 2, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    g.tag.material.map?.dispose();
    g.tag.material.map = tex;
    g.tag.material.needsUpdate = true;
    g.tag.scale.set((c.width / c.height) * 0.28, 0.28, 1);
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
    if (e.code === 'KeyE' && !e.repeat) this.interact();
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

  private onBlur = () => this.keys.clear();

  private onPointerDown = (e: PointerEvent) => {
    if (!this.exploring) return;
    if (e.pointerType === 'mouse' && !document.pointerLockElement) {
      // Pointer lock gives FPS-style mouse look; if refused, dragging still orbits.
      (this.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
    }
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        this.drag = null;
        this.pinch = this.pinchDist();
        return;
      }
    }
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };

  private pinchDist() {
    const [a, b] = [...this.touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.exploring) return;
    const t = this.touches.get(e.pointerId);
    if (t) {
      t.x = e.clientX;
      t.y = e.clientY;
      if (this.touches.size === 2) {
        const d = this.pinchDist();
        this.zoom((this.pinch - d) * 0.02);
        this.pinch = d;
        return;
      }
    }
    if (document.pointerLockElement === this.renderer.domElement) {
      this.look(e.movementX, e.movementY, 0.0025);
    } else if (this.drag && e.pointerId === this.drag.id) {
      this.look(e.clientX - this.drag.x, e.clientY - this.drag.y, e.pointerType === 'mouse' ? 0.005 : 0.007);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (this.drag?.id === e.pointerId) this.drag = null;
  };

  private onLockChange = () => {
    // Browsers swallow ESC to release the lock: treat that as "open the menu".
    if (!document.pointerLockElement && this.exploring && !this.busy) this.pause();
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.exploring) return;
    e.preventDefault();
    this.zoom(Math.sign(e.deltaY) * 0.5);
  };

  private look(dx: number, dy: number, k: number) {
    this.camYaw -= dx * k;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * k, -0.15, 1.2);
  }

  /** Two-finger pinch from the touch UI. */
  zoom(delta: number) {
    this.zoomed = true;
    this.dist = THREE.MathUtils.clamp(this.dist + delta, MIN_DIST, MAX_DIST);
  }

  // ------------------------------------------------------------------ loop
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.frame(Math.min(this.clock.getDelta(), 0.05));
  };

  /** One update + render step (also called by hand in browser tests, where rAF may be throttled). */
  frame(dt: number) {
    // Keep the room updated (and remote players moving) even while inside a minigame.
    const sp = this.vel.length();
    net.tick(dt, { x: this.pos.x + NET_OFFSET, y: this.pos.z + NET_OFFSET, dir: 0, moving: sp > 0.2, place: useWorldStore.getState().place });
    if (!this.live) return; // an activity owns the screen; the hall is frozen as left
    this.time += dt;
    const w = useWorldStore.getState();
    if (w.screen === 'explore') this.move(dt);
    else this.vel.multiplyScalar(0);
    this.avatar.update(dt, this.vel.length(), this.time);
    this.updateGhosts(dt);
    const exploring = w.screen === 'explore' && !this.busy;
    this.lobby.update(dt, exploring ? this.pos.x : null, exploring ? this.pos.z : null);
    this.updateSpots();

    const near = w.screen === 'explore' ? nearestActivity(this.pos.x, this.pos.z)?.id ?? null : null;
    if (near !== w.nearby) w.setNearby(near);
    this.updateMarkers(near);
    this.updateCamera(dt, w.screen);
    this.renderer.render(this.scene, this.camera);
  }

  private move(dt: number) {
    const k = this.keys;
    let fx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + this.stick.x;
    let fz = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + this.stick.y;
    const mag = Math.min(1, Math.hypot(fx, fz));
    if (mag > 0.01) {
      const n = Math.hypot(fx, fz);
      fx /= n;
      fz /= n;
    }
    const running = k.has('ShiftLeft') || k.has('ShiftRight') || this.stick.run;
    const speed = (running ? RUN : WALK) * mag;
    // Camera-relative: forward is where the camera looks.
    const fwdX = -Math.sin(this.camYaw);
    const fwdZ = -Math.cos(this.camYaw);
    const tx = (fwdX * fz - fwdZ * fx) * speed;
    const tz = (fwdZ * fz + fwdX * fx) * speed;
    const a = damp(mag > 0.01 ? 10 : 14, dt);
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.y += (tz - this.vel.y) * a;
    if (this.busy) this.vel.multiplyScalar(0);

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    resolve(this.pos, RADIUS, this.hall.colliders);
    this.avatar.root.position.set(this.pos.x, 0, this.pos.z);

    if (this.vel.lengthSq() > 0.04) {
      const target = Math.atan2(this.vel.x, this.vel.y);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * damp(12, dt);
    }
    this.avatar.root.rotation.y = this.facing;
  }

  private updateCamera(dt: number, screen: string) {
    const pivot = new THREE.Vector3(this.pos.x, EYE, this.pos.z);
    if (screen === 'title' || screen === 'loading' || screen === 'character' || screen === 'controls' || screen === 'stats') {
      // Slow cinematic orbit around the hall behind the menus.
      const t = this.time * 0.07;
      this.camera.position.set(Math.sin(t) * 9, 2.3, Math.cos(t) * 7); // below the pendant lamps
      this.camera.lookAt(0, 1, -1);
      if (screen === 'character') {
        this.camera.position.set(this.pos.x - Math.sin(this.facing) * -2.4, 1.4, this.pos.z + Math.cos(this.facing) * 2.4);
        this.camera.lookAt(this.pos.x, 1.05, this.pos.z);
      }
      this.avatar.root.position.set(this.pos.x, 0, this.pos.z);
      this.avatar.root.rotation.y = this.facing;
      return;
    }
    const dir = new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch));
    // Keep the camera on the near side of walls and pillars.
    this.raycaster.set(pivot, dir);
    this.raycaster.far = this.dist;
    const hit = this.raycaster.intersectObjects(this.hall.occluders, false)[0];
    const want = hit ? Math.max(0.4, hit.distance - 0.25) : this.dist;
    if (this.snapCam) this.camDist = want;
    this.camDist += (want - this.camDist) * (want < this.camDist ? 1 : damp(6, dt));
    const camPos = pivot.clone().addScaledVector(dir, this.camDist);
    camPos.y = Math.min(camPos.y, CEILING - 0.3);
    if (this.snapCam) this.camera.position.copy(camPos);
    else this.camera.position.lerp(camPos, damp(18, dt));
    this.snapCam = false;
    this.camera.lookAt(pivot.x, pivot.y - 0.15, pivot.z);
  }

  private resize = () => {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 72 : 60;
    if (!this.zoomed) this.dist = w / h < 1 ? 5.4 : 4.2;
    this.camera.updateProjectionMatrix();
  };
}
