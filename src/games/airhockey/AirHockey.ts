import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { audio } from '../../audio/AudioEngine';
import { useWorldStore } from '../../world/worldStore';
import { AI_PROFILES, HockeyAI } from './ai';
import { HockeyPhysics, malletBounds, TABLE, type Mallet, type Side } from './physics';
import { applyGoal, MATCH_TIME, newScore, serveTo, timeUp, type Mode } from './rules';
import { PUCK_SPEEDS, useHockeyStore } from './store';
import { buildArena } from './arena';
import { buildTable, COLORS, SURFACE_Y, type TableParts } from './table';
import { net } from '../../net/client';

const SEND_EVERY = 1 / 30; // s between online state messages
const RIVAL_TIMEOUT = 5; // s without messages before the rival counts as gone
/** How far ahead to project the host's puck (roughly one-way latency). */
const LEAD = 0.05;

/** Online messages. `hs` host state, `gm` guest mallet, `hit` guest hit, `quit` leaving. */
type HockeyMsg =
  | { k: 'hs'; to: string; p: [number, number, number, number, number]; m: [number, number]; t: number; sc: [number, number, number, number]; h: number }
  | { k: 'gm'; to: string; m: [number, number] }
  | { k: 'hit'; to: string; p: [number, number, number, number]; h: number }
  | { k: 'quit'; to: string };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const KEYS_P1: Record<string, [number, number]> = { KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0] };
const KEYS_P2: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const KEY_SPEED = 1.8; // m/s of the hand when steering with keys
const HUMAN_SPEED = 10; // responsive: the mallet stays under the cursor
const HUMAN_ACCEL = 450;

/**
 * The air hockey minigame: scene, input and match flow around HockeyPhysics.
 * The simulation never reads from the meshes; they just mirror it each frame.
 */
export class AirHockey {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.05, 50);
  private readonly table: TableParts;
  private readonly ray = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SURFACE_Y);
  private readonly rings: Array<{ mesh: THREE.Mesh; t: number }> = [];
  private physics = new HockeyPhysics();
  private ai: HockeyAI;
  private keys = new Set<string>();
  /** Pointer id -> side it steers (two players can share a touch screen). */
  private pointers = new Map<number, Side>();
  private raf = 0;
  private last = performance.now();
  private hum = false;
  /** Seconds until the next serve (after a goal or at kick-off). */
  private serveIn = 0;
  private serveSide: Side = 1;
  private endIn = 0;
  private flash = 0;
  private flashColor = new THREE.Color(COLORS.p1);
  private stall = 0;
  private timeAcc = 0;
  // Online state.
  private remote = { x: 0, z: 0 };
  private sendT = 0;
  private lastHeard = 0;
  /** Guest: hits sent so far; host: last guest hit applied (echoed back so stale states are ignored). */
  private hitSeq = 0;
  private lastHitSent = 0;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x1a120c);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();

    const spot = new THREE.SpotLight(0xffe8c8, 16, 8, 0.6, 0.5, 1.2);
    spot.position.set(0.3, SURFACE_Y + 2.6, 0.4);
    spot.target.position.set(0, SURFACE_Y, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.0004;
    this.scene.add(spot, spot.target);
    this.scene.add(buildArena());

    this.table = buildTable();
    this.scene.add(this.table.root);

    // Hit rings: a small pool of flat, additive circles.
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.04, 0.05, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      this.rings.push({ mesh, t: 1 });
    }

    this.ai = new HockeyAI(this.physics.mallets[1], AI_PROFILES.normal);
    this.reset('ai');

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointer);
    el.addEventListener('pointermove', this.onPointer);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.loop();
    net.onGame((from, data) => this.onNet(from, data as HockeyMsg));
  }

  // ------------------------------------------------------------------ online
  /** Starts a match against another player; blue (host) simulates, red (guest) predicts. */
  startOnline(role: 'host' | 'guest', rival: { id: string; name: string }) {
    audio.unlock();
    const st = useHockeyStore.getState();
    st.set({ mode: 'online', online: { role, rival: rival.id, rivalName: rival.name, rivalLeft: false }, score: newScore(st.settings.target), time: 0, lastGoal: null });
    this.reset('online');
    // Same feel for both players regardless of their local settings.
    this.physics = new HockeyPhysics({ maxPuckSpeed: PUCK_SPEEDS.normal });
    for (const m of this.physics.mallets) (m.maxSpeed = HUMAN_SPEED), (m.maxAccel = HUMAN_ACCEL);
    this.physics.puck.live = false;
    this.remote = { x: 0, z: role === 'host' ? -0.7 : 0.7 };
    this.hitSeq = 0;
    this.lastHeard = performance.now();
    st.setScreen('playing');
    if (role === 'host') {
      this.serveSide = Math.random() < 0.5 ? 1 : -1;
      this.serveIn = 2;
    }
    audio.hockeyBuzzer('start');
  }

  /** Leaving an online match tells the rival. */
  quitOnline() {
    const o = useHockeyStore.getState().online;
    if (o && !o.rivalLeft) net.sendGame({ k: 'quit', to: o.rival } satisfies HockeyMsg);
    useHockeyStore.getState().set({ online: null, mode: 'ai' });
  }

  private onNet(from: string, m: HockeyMsg) {
    const st = useHockeyStore.getState();
    const o = st.online;
    if (!o || from !== o.rival || !m || (m as { to?: string }).to !== net.id || st.mode !== 'online') return;
    this.lastHeard = performance.now();
    const ph = this.physics;
    const p = ph.puck;
    if (m.k === 'quit') return this.rivalGone();
    if (o.role === 'host') {
      if (m.k === 'gm') this.remote = { x: num(m.m?.[0]), z: num(m.m?.[1]) };
      else if (m.k === 'hit' && p.z < 0.15) {
        // The guest's own hit is authoritative: take its puck state.
        Object.assign(p, { x: num(m.p?.[0]), z: num(m.p?.[1]), vx: num(m.p?.[2]), vz: num(m.p?.[3]), live: true });
        this.hitSeq = Math.max(this.hitSeq, num(m.h));
      }
      return;
    }
    if (m.k !== 'hs') return;
    this.remote = { x: num(m.m?.[0]), z: num(m.m?.[1]) };
    const [x, z, vx, vz, live] = (m.p ?? []).map(num);
    // Ignore states sent before the host saw our latest hit.
    if (num(m.h) >= this.hitSeq) {
      const me = ph.mallets[1];
      const hx = x + vx * LEAD;
      const hz = z + vz * LEAD;
      const err = Math.hypot(hx - p.x, hz - p.z);
      const mine = p.z < 0 && Math.hypot(p.x - me.x, p.z - me.z) < 0.22; // our mallet is on it: trust local
      if (!live) Object.assign(p, { x, z, vx: 0, vz: 0, live: false });
      else if (!p.live || err > 0.25) Object.assign(p, { x: hx, z: hz, vx, vz, live: true });
      else if (!mine) {
        p.x += (hx - p.x) * 0.3;
        p.z += (hz - p.z) * 0.3;
        p.vx = vx;
        p.vz = vz;
      }
    }
    const [p1, p2, golden, winner] = (m.sc ?? []).map(num);
    const prev = st.score;
    const win: Side | null = winner === 1 || winner === -1 ? winner : null;
    if (p1 !== prev.p1 || p2 !== prev.p2 || !!golden !== prev.golden || win !== prev.winner) {
      const score = { ...prev, p1, p2, golden: !!golden, winner: win };
      const scorer: Side | null = p1 > prev.p1 ? 1 : p2 > prev.p2 ? -1 : null;
      st.set({ score, ...(scorer ? { lastGoal: { scorer, n: (st.lastGoal?.n ?? 0) + 1 } } : {}) });
      if (scorer) this.goalFx(scorer, score);
      if (score.winner && !this.endIn) this.endIn = 1.4;
    }
    st.set({ time: num(m.t) });
  }

  private rivalGone() {
    const st = useHockeyStore.getState();
    if (!st.online || st.online.rivalLeft) return;
    st.set({ online: { ...st.online, rivalLeft: true } });
    this.physics.puck.live = false;
    if (st.screen === 'playing' || st.screen === 'paused') st.setScreen('end');
  }

  /** Online part of a frame: drive the rival's mallet, exchange state, watch for drops. */
  private syncOnline(dt: number) {
    const st = useHockeyStore.getState();
    const o = st.online!;
    const ph = this.physics;
    const host = o.role === 'host';
    const other = ph.mallets[host ? 1 : 0];
    other.tx = this.remote.x;
    other.tz = this.remote.z;
    if (!net.peers.has(o.rival) || performance.now() - this.lastHeard > RIVAL_TIMEOUT * 1000) return this.rivalGone();
    if ((this.sendT -= dt) > 0) return;
    this.sendT = SEND_EVERY;
    const r = (v: number) => Math.round(v * 1000) / 1000;
    if (host) {
      const p = ph.puck;
      const s = st.score;
      const me = ph.mallets[0];
      net.sendGame({
        k: 'hs', to: o.rival, p: [r(p.x), r(p.z), r(p.vx), r(p.vz), p.live ? 1 : 0], m: [r(me.x), r(me.z)],
        t: Math.round(st.time * 10) / 10, sc: [s.p1, s.p2, s.golden ? 1 : 0, s.winner ?? 0], h: this.hitSeq,
      } satisfies HockeyMsg);
    } else {
      const me = ph.mallets[1];
      net.sendGame({ k: 'gm', to: o.rival, m: [r(me.x), r(me.z)] } satisfies HockeyMsg);
    }
  }

  // ------------------------------------------------------------------ public API (UI)
  get live() {
    return useWorldStore.getState().place === 'airhockey';
  }

  start(mode: Mode) {
    audio.unlock();
    this.reset(mode);
    const st = useHockeyStore.getState();
    st.set({ mode, score: newScore(st.settings.target), time: 0, lastGoal: null });
    st.setScreen('playing');
    this.serveSide = mode === 'training' ? 1 : Math.random() < 0.5 ? 1 : -1;
    this.serveIn = 1.2;
    audio.hockeyBuzzer('start');
  }

  restart() {
    this.start(useHockeyStore.getState().mode);
  }

  pause() {
    if (useHockeyStore.getState().mode === 'online') return; // the rival keeps playing: no pause online
    if (useHockeyStore.getState().screen === 'playing') useHockeyStore.getState().setScreen('paused');
  }

  resume() {
    if (useHockeyStore.getState().screen === 'paused') {
      useHockeyStore.getState().setScreen('playing');
      this.last = performance.now();
    }
  }

  /** One step of `dt` seconds (dev/testing; the loop does this every frame). */
  frame(dt: number) {
    this.update(dt);
    this.render(dt);
  }

  // ------------------------------------------------------------------ setup
  private reset(mode: Mode) {
    const s = useHockeyStore.getState().settings;
    this.physics = new HockeyPhysics({ maxPuckSpeed: PUCK_SPEEDS[s.puckSpeed] });
    const [m1, m2] = this.physics.mallets;
    for (const m of [m1, m2]) {
      m.maxSpeed = HUMAN_SPEED * s.sensitivity;
      m.maxAccel = HUMAN_ACCEL * s.sensitivity;
    }
    m2.active = mode !== 'training';
    // Online: blue home side vs red visitors (as the circles in the hall).
    const tint = mode === 'online' ? [0x3a8bff, 0xff3b4f] : [COLORS.p1, COLORS.p2];
    this.table.mallets.forEach((m, i) => (m.material as THREE.MeshStandardMaterial).color.set(tint[i]));
    this.table.mallets[1].visible = m2.active;
    this.ai = new HockeyAI(m2, AI_PROFILES[s.difficulty]);
    this.physics.puck.live = false;
    this.physics.puck.z = 0;
    this.pointers.clear();
    this.serveIn = this.endIn = this.flash = this.stall = 0;
    this.table.scoreboard.draw(0, 0, this.boardLabel(mode));
    this.setLeds(null);
    this.placeCamera(mode);
  }

  private placeCamera(mode: Mode) {
    const aspect = this.camera.aspect;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    if (mode === 'versus') {
      // Straight down with the table lying across the screen: P1 left, P2 right.
      const h = Math.max(1.35 / 2 / tan, 2.5 / 2 / (tan * aspect));
      this.camera.up.set(-1, 0, 0);
      this.camera.position.set(0.0001, SURFACE_Y + h, 0);
    } else {
      // Behind and above your goal, the whole table in view; pulled back on narrow screens.
      const k = Math.max(1, 0.72 / aspect);
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(0, SURFACE_Y + 1.15 * k, TABLE.length / 2 + 1.05 * k);
    }
    this.camera.lookAt(0, SURFACE_Y, mode === 'versus' ? 0 : -0.02);
    this.camera.updateMatrixWorld();
  }

  private resize = () => {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.placeCamera(useHockeyStore.getState().mode);
  };

  // ------------------------------------------------------------------ input
  private get playing() {
    return this.live && useHockeyStore.getState().screen === 'playing';
  }

  private tablePoint(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    return this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
  }

  private onPointer = (e: PointerEvent) => {
    if (!this.playing) return;
    const p = this.tablePoint(e);
    if (!p) return;
    const mode = useHockeyStore.getState().mode;
    let side: Side = this.mySide;
    if (mode === 'versus') {
      // Each finger keeps the half it started in; the mouse steers whichever half it is over.
      const known = this.pointers.get(e.pointerId);
      side = known ?? (p.z >= 0 ? 1 : -1);
      if (e.pointerType !== 'mouse' && known === undefined) this.pointers.set(e.pointerId, side);
    }
    const m = this.physics.mallets[side === 1 ? 0 : 1];
    // The red player sees the table turned round: display coords are mirrored.
    const f = this.mySide;
    m.tx = p.x * f;
    m.tz = p.z * f;
  };

  /** The side this screen controls (red when joining an online match). */
  private get mySide(): Side {
    return useHockeyStore.getState().online?.role === 'guest' ? -1 : 1;
  }

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.live) return;
    const scr = useHockeyStore.getState().screen;
    if (e.code === 'Escape') {
      if (scr === 'playing') this.pause();
      else if (scr === 'paused') this.resume();
      return;
    }
    if (KEYS_P1[e.code] || KEYS_P2[e.code]) e.preventDefault();
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onBlur = () => this.keys.clear();

  /** Moves a mallet's target with the keyboard, in screen directions. */
  private steer(m: Mallet, map: Record<string, [number, number]>, dt: number) {
    let sx = 0;
    let sy = 0;
    for (const k of this.keys) if (map[k]) (sx += map[k][0]), (sy += map[k][1]);
    if (!sx && !sy) return;
    // Screen right/up projected onto the table.
    const e = this.camera.matrixWorld.elements;
    const rx = e[0], rz = e[2];
    let ux = e[4], uz = e[6];
    if (Math.hypot(ux, uz) < 0.2) (ux = -e[8]), (uz = -e[10]);
    const ul = Math.hypot(ux, uz);
    const rl = Math.hypot(rx, rz);
    const v = KEY_SPEED * useHockeyStore.getState().settings.sensitivity * dt * (m.side === this.mySide ? this.mySide : 1);
    const b = malletBounds(m.side);
    // Start from where the mallet is if the target ran away (e.g. after mouse use).
    if (Math.hypot(m.tx - m.x, m.tz - m.z) > 0.15) (m.tx = m.x), (m.tz = m.z);
    m.tx = Math.min(b.xMax, Math.max(b.xMin, m.tx + ((sx * rx) / rl + (sy * ux) / ul) * v));
    m.tz = Math.min(b.zMax, Math.max(b.zMin, m.tz + ((sx * rz) / rl + (sy * uz) / ul) * v));
  }

  // ------------------------------------------------------------------ loop
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    const live = this.live;
    if (live !== this.hum) {
      this.hum = live;
      audio.setAirHum(live);
    }
    if (!live) return;
    this.update(dt);
    this.render(dt);
  };

  private update(dt: number) {
    const st = useHockeyStore.getState();
    if (st.screen !== 'playing') return;
    const ph = this.physics;
    const [m1, m2] = ph.mallets;
    const online = st.mode === 'online';
    const guest = online && st.online?.role === 'guest';

    if (online) {
      this.steer(guest ? m2 : m1, { ...KEYS_P1, ...KEYS_P2 }, dt);
      this.syncOnline(dt);
      if (useHockeyStore.getState().screen !== 'playing') return;
    } else this.steer(m1, st.mode === 'versus' ? KEYS_P1 : { ...KEYS_P1, ...KEYS_P2 }, dt);
    if (st.mode === 'versus') this.steer(m2, KEYS_P2, dt);
    else if (st.mode === 'ai') this.ai.update(dt, ph);

    if (!guest && this.serveIn > 0 && (this.serveIn -= dt) <= 0) {
      ph.serve(this.serveSide, 0);
      this.ai.reset();
    }
    if (this.endIn > 0 && (this.endIn -= dt) <= 0) {
      st.setScreen('end');
      audio.hockeyBuzzer(st.mode === 'versus' || st.score.winner === this.mySide ? 'win' : 'lose');
      return;
    }

    for (const ev of ph.step(dt)) {
      if (ev.type === 'hit') {
        // Pushing the puck makes a burst of contacts: report at most one hit every 50 ms.
        if (guest && Math.hypot(ev.x - m2.x, ev.z - m2.z) < 0.12 && performance.now() - this.lastHitSent > 50) {
          this.lastHitSent = performance.now();
          // Our own hit: tell the host right away so both screens agree.
          const p = ph.puck;
          net.sendGame({ k: 'hit', to: st.online!.rival, p: [p.x, p.z, p.vx, p.vz], h: ++this.hitSeq } satisfies HockeyMsg);
        }
        audio.hockeyHit('mallet', ev.force);
        this.ring(ev.x * this.mySide, ev.z * this.mySide, ev.force);
      } else if (ev.type === 'wall') audio.hockeyHit('rail', ev.force);
      else if (ev.type === 'goal' && !guest) this.onGoal(ev.scorer);
    }

    // Training: a puck left dead in the empty far half comes back to you.
    const p = ph.puck;
    if (st.mode === 'training' && p.live && p.z < 0 && Math.hypot(p.vx, p.vz) < 0.15) {
      if ((this.stall += dt) > 1.2) (this.stall = 0), ph.serve(1, 0);
    } else this.stall = 0;

    if (!this.endIn && !guest) {
      this.timeAcc += dt;
      if (this.timeAcc >= 0.25) {
        const time = st.time + this.timeAcc;
        this.timeAcc = 0;
        st.set({ time });
        if (time >= MATCH_TIME && !st.score.golden) {
          const score = timeUp(st.score, st.mode);
          if (score !== st.score) {
            st.set({ score });
            if (score.winner) {
              this.endIn = 0.01;
              ph.puck.live = false;
            }
          }
        }
      }
    }
  }

  private onGoal(scorer: Side) {
    const st = useHockeyStore.getState();
    const score = applyGoal(st.score, scorer, st.mode);
    st.set({ score, lastGoal: { scorer, n: (st.lastGoal?.n ?? 0) + 1 } });
    this.goalFx(scorer, score);
    if (score.winner) this.endIn = 1.4;
    else {
      this.serveSide = serveTo(scorer, st.mode);
      this.serveIn = 1.1;
    }
  }

  private goalFx(scorer: Side, score: { p1: number; p2: number }) {
    const mode = useHockeyStore.getState().mode;
    audio.hockeyGoal(mode === 'versus' || mode === 'training' || scorer === this.mySide);
    this.table.scoreboard.draw(score.p1, score.p2, this.boardLabel(mode));
    this.flash = 1.2;
    this.flashColor.set(scorer === 1 ? COLORS.p1 : COLORS.p2);
  }

  private boardLabel(mode: Mode) {
    return mode === 'training' ? 'ENTRENAMIENTO' : mode === 'versus' ? 'J2 · J1' : mode === 'online' ? 'ROJO · AZUL' : 'IA · TÚ';
  }

  private ring(x: number, z: number, force: number) {
    const r = this.rings.find((q) => q.t >= 1) ?? this.rings[0];
    r.t = 0;
    r.mesh.position.set(x, SURFACE_Y + 0.002, z);
    r.mesh.visible = true;
    (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.8, 0.2 + force / 8);
  }

  private setLeds(color: THREE.Color | null, k = 1) {
    // Order from buildTable: two side strips, then the rival's end and yours.
    const base = [0xffc27a, 0xffc27a, COLORS.p2, COLORS.p1];
    this.table.leds.forEach((m, i) => {
      m.emissive.set(base[i]);
      if (color) m.emissive.lerp(color, k);
      m.emissiveIntensity = 0.7 + (color ? k * 2.5 : 0);
    });
  }

  private render(dt: number) {
    const { puck, mallets } = this.table;
    const ph = this.physics;
    puck.visible = ph.puck.live;
    const f = this.mySide;
    puck.position.set(ph.puck.x * f, SURFACE_Y + 0.004, ph.puck.z * f);
    ph.mallets.forEach((m, i) => mallets[i].position.set(m.x * f, SURFACE_Y, m.z * f));

    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t = Math.min(1, r.t + dt / 0.28);
      r.mesh.scale.setScalar(1 + r.t * 2.2);
      const mat = r.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity *= 1 - r.t * 0.25;
      if (r.t >= 1) r.mesh.visible = false;
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      // Blink three times, fading.
      const k = (this.flash / 1.2) * (0.5 + 0.5 * Math.cos(this.flash * Math.PI * 5));
      this.setLeds(this.flashColor, k);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
