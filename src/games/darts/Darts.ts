import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { audio } from '../../audio/AudioEngine';
import { SwingTracker } from '../../game/SwingTracker';
import { clamp } from '../../utils/math';
import { createRng, gaussian } from '../../utils/random';
import { useWorldStore } from '../../world/worldStore';
import { apply501, BOARD_R, BULL_Y, DARTS_PER_TURN, fly, launch, OCHE, scoreAt, type DartsMode, type Flight, type Hit, type Vec3 } from './physics';
import { useDartsStore } from './store';
import { buildRoom } from './room';

/** Comfortable throwing speed (m/s): the arc the player's aim is trained for. */
const IDEAL = 6;
/** Flick speed (screen heights per second) that gives the trained throw. */
const FLICK = 2.2;
/** Slowest flick that still counts as a throw (below it the dart goes back to the hand). */
const MIN_FLICK = 0.9;
/** Human release scatter (rad) and how much a crooked flick turns the dart. */
const SCATTER = 0.006;
const WRIST = 0.12;
/** Where the hand holds the dart at rest (right-handed, just below the eye line). */
const HAND: Vec3 = { x: 0, y: 1.6, z: OCHE + 0.2 };
const PULL = 0.16; // m the hand moves back at full pull

interface Flying {
  mesh: THREE.Group;
  flight: Flight;
  t: number;
  hit: Hit;
}

/** A steel-tip dart pointing along -z: tip, tungsten barrel, shaft, flights. */
function makeDart(color: number) {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.z = z;
    m.castShadow = true;
    g.add(m);
    return m;
  };
  // Soft (plastic) tip for the electronic board; its end is the origin.
  add(new THREE.ConeGeometry(0.0022, 0.026, 10), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }), -0.013);
  add(new THREE.CylinderGeometry(0.0034, 0.0029, 0.05, 14), new THREE.MeshStandardMaterial({ color: 0x6d7078, metalness: 0.85, roughness: 0.35 }), 0.025);
  add(new THREE.CylinderGeometry(0.0016, 0.0019, 0.04, 8), new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.5 }), 0.07);
  const flight = new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide });
  const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.017, 0.012), new THREE.Vector2(0.017, 0.035), new THREE.Vector2(0, 0.03)]);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.ShapeGeometry(shape), flight);
    f.rotation.set(-Math.PI / 2, 0, 0);
    f.position.z = 0.062;
    const holder = new THREE.Group();
    holder.rotation.z = (i * Math.PI) / 2;
    holder.add(f);
    g.add(holder);
  }
  return g;
}

/**
 * Darts minigame. Grab anywhere to aim at that point of the board, pull back and flick
 * up to throw: the flick speed sets the dart speed (harder = higher, softer = lower,
 * as gravity decides) and a crooked flick sends it sideways. Outcomes come from the flight.
 */
export class Darts {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.02, 30);
  private readonly ray = new THREE.Raycaster();
  private readonly boardPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly tracker = new SwingTracker();
  private readonly rng = createRng();
  private readonly hand: THREE.Group;
  private readonly aimDot: THREE.Mesh;
  private stuck: THREE.Group[] = [];
  private flying: Flying | null = null;
  private grab: { id: number; y0: number; aim: Vec3 } | null = null;
  private pull = 0;
  private turnOver = 0;
  private raf = 0;
  private last = performance.now();
  private bannerN = 0;
  private display: (big: string, small: string) => void = () => {};
  /** Last aim point, so the sight stays where the player left it. */
  private aim: Vec3 = { x: 0, y: BULL_Y, z: 0 };

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0c0818);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();
    this.buildRoom();

    this.hand = makeDart(0xd8f24a);
    this.scene.add(this.hand);
    // Sight: where the dart should land with your normal throw (the circle is the usual spread).
    const sightMat = new THREE.MeshBasicMaterial({ color: 0xd8f24a, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });
    this.aimDot = new THREE.Mesh(new THREE.RingGeometry(0.024, 0.031, 48), sightMat);
    this.aimDot.add(new THREE.Mesh(new THREE.CircleGeometry(0.005, 16), sightMat));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(0.026, 48), new THREE.MeshBasicMaterial({ color: 0xd8f24a, transparent: true, opacity: 0.22, depthWrite: false, depthTest: false }));
    this.aimDot.add(fill);
    this.aimDot.renderOrder = 2;
    this.scene.add(this.aimDot);
    this.restHand();

    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.loop();
  }

  private buildRoom() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xffd9b0, 0x1a0f0a, 0.5));
    const room = buildRoom();
    this.display = room.setDisplay;
    s.add(room.root);
    // Throw line (oche).
    const oche = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.012, 0.04), new THREE.MeshStandardMaterial({ color: 0xd8f24a, emissive: 0x6a7a10, roughness: 0.5 }));
    oche.position.set(0, 0.006, OCHE);
    s.add(oche);
    useDartsStore.subscribe((st) => this.display(String(st.points), `R${st.round}`));
  }

  // ------------------------------------------------------------------ flow
  start(mode: DartsMode) {
    audio.unlock();
    for (const d of this.stuck) this.scene.remove(d);
    this.stuck = [];
    this.flying && this.scene.remove(this.flying.mesh);
    this.flying = null;
    this.turnOver = 0;
    const p = mode === '501' ? 501 : 0;
    useDartsStore.getState().set({ screen: 'playing', mode, points: p, turnStart: p, round: 1, hits: [], banner: null, darts: 0 });
    this.restHand();
  }

  private get live() {
    return useWorldStore.getState().place === 'darts' && useDartsStore.getState().screen === 'playing';
  }

  private banner(text: string, kind: 'hit' | 'bust' | 'win' | 'miss') {
    useDartsStore.getState().set({ banner: { text, kind, n: ++this.bannerN } });
  }

  /** Throws from the hand towards `aim` at `speed` m/s, turned `sideways` rad (+ right). Public for testing. */
  throwDart(aim: Vec3, speed: number, sideways: number) {
    const st = useDartsStore.getState();
    if (this.flying || this.turnOver || st.screen !== 'playing') return;
    const from = { x: this.hand.position.x, y: this.hand.position.y, z: this.hand.position.z };
    const v = launch(from, aim, speed, IDEAL, sideways + gaussian(this.rng, SCATTER));
    v.y += gaussian(this.rng, SCATTER) * speed;
    const flight = fly(from, v);
    const hit = flight.end === 'board' ? scoreAt(flight.at.x, flight.at.y) : { score: 0, mult: 0, label: 'FUERA' };
    const mesh = makeDart(0xd8f24a);
    this.scene.add(mesh);
    this.flying = { mesh, flight, t: 0, hit };
    this.hand.visible = false;
    audio.release();
  }

  /** The flying dart reached its end: stick it, score it, move the turn on. */
  private land(f: Flying) {
    const st = useDartsStore.getState();
    const { flight, hit, mesh } = f;
    if (flight.end === 'board') {
      audio.dartHit(clamp(Math.hypot(flight.v.x, flight.v.y, flight.v.z) / IDEAL, 0.3, 1.2));
      this.stuck.push(mesh);
    } else {
      // Bounced off the wall or fell short: it ends on the floor below.
      audio.hockeyHit('rail', 3);
      mesh.position.set(flight.at.x, 0.006, Math.max(0.15, flight.at.z));
      mesh.rotation.set(0, this.rng() * Math.PI * 2, 0); // lying flat
      this.stuck.push(mesh);
    }
    const hits = [...st.hits, hit];
    const darts = st.darts + 1;
    if (st.mode === '501') {
      const r = apply501(st.points, hit);
      if (r.bust) {
        this.banner('¡PASADO!', 'bust');
        st.set({ hits, darts, points: st.turnStart });
        this.turnOver = 1.6;
        return;
      }
      st.set({ hits, darts, points: r.left });
      if (r.won) {
        this.banner(`¡CIERRE! ${hit.label}`, 'win');
        audio.strike(true);
        window.setTimeout(() => useDartsStore.getState().set({ screen: 'end' }), 1800);
        this.turnOver = 99;
        return;
      }
    } else st.set({ hits, darts, points: st.points + hit.score });
    this.banner(hit.score ? `${hit.label} · ${hit.score}` : hit.label, hit.score ? 'hit' : 'miss');
    if (hits.length >= DARTS_PER_TURN) this.turnOver = 1.6;
    else this.restHand();
  }

  /** Darts collected from the board: next turn. */
  private nextTurn() {
    for (const d of this.stuck) this.scene.remove(d);
    this.stuck = [];
    const st = useDartsStore.getState();
    st.set({ hits: [], round: st.round + 1, turnStart: st.points, banner: null });
    audio.sweep();
    this.restHand();
  }

  private restHand() {
    this.hand.visible = true;
    this.hand.position.set(HAND.x, HAND.y, HAND.z);
    this.hand.rotation.set(0.12, -0.06, 0);
    this.pull = 0;
  }

  // ------------------------------------------------------------------ input
  private toBoard(e: PointerEvent): Vec3 | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const p = this.ray.ray.intersectPlane(this.boardPlane, new THREE.Vector3());
    if (!p) return null;
    // Aim no further than just off the board.
    const dx = p.x;
    const dy = p.y - BULL_Y;
    const d = Math.hypot(dx, dy);
    const k = d > BOARD_R * 1.4 ? (BOARD_R * 1.4) / d : 1;
    return { x: dx * k, y: BULL_Y + dy * k, z: 0 };
  }

  private onDown = (e: PointerEvent) => {
    if (!this.live || this.grab || this.flying || this.turnOver) return;
    const aim = this.toBoard(e);
    if (!aim) return;
    this.grab = { id: e.pointerId, y0: e.clientY, aim };
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
    this.tracker.reset();
    this.tracker.add(e.timeStamp / 1000, 0, 0);
    this.aim = aim;
  };

  private onMove = (e: PointerEvent) => {
    const g = this.grab;
    if (!g) {
      // Hover (mouse): the sight follows the pointer.
      const a = this.live && e.pointerType === 'mouse' ? this.toBoard(e) : null;
      if (a) this.aim = a;
      return;
    }
    if (e.pointerId !== g.id) return;
    const h = this.renderer.domElement.clientHeight || 1;
    const events = e.getCoalescedEvents?.() ?? [];
    for (const c of events.length ? events : [e]) this.tracker.add(c.timeStamp / 1000, (c.clientX - 0) / h, (c.clientY - g.y0) / h);
    // Hand: pulled back (and a bit down) as the pointer goes down, forward as it comes up.
    this.pull = clamp((e.clientY - g.y0) / (h * 0.25), -0.4, 1);
  };

  private onUp = (e: PointerEvent) => {
    const g = this.grab;
    if (!g || e.pointerId !== g.id) return;
    this.grab = null;
    const rel = this.tracker.release();
    if (!rel || rel.forward < MIN_FLICK) {
      this.pull = 0; // not a throw: the dart stays in the hand
      return;
    }
    // Strongly compressed: a finger flick varies far more than a trained arm does.
    const speed = IDEAL * clamp((rel.forward / FLICK) ** 0.12, 0.6, 1.3);
    this.throwDart(g.aim, speed, clamp(rel.angle * WRIST, -0.15, 0.15));
  };

  private onCancel = (e: PointerEvent) => {
    if (this.grab?.id !== e.pointerId) return;
    this.grab = null;
    this.pull = 0;
  };

  // ------------------------------------------------------------------ frame
  private resize = () => {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Portrait: keep the machine's width (about ±9.5° from the eye) filling the screen.
    this.camera.fov = Math.max(30, (2 * Math.atan(Math.tan((9.5 * Math.PI) / 180) / aspect) * 180) / Math.PI);
    this.camera.position.set(0, 1.68, OCHE + 0.6);
    this.camera.lookAt(0, BULL_Y - 0.12, 0);
    this.camera.updateProjectionMatrix();
  };

  /** One simulation + render step (exposed for browser testing). */
  frame(dt: number) {
    if (this.turnOver > 0 && this.turnOver < 90 && (this.turnOver -= dt) <= 0) {
      this.turnOver = 0;
      this.nextTurn();
    }
    const f = this.flying;
    if (f) {
      f.t += dt;
      const path = f.flight.path;
      const i = Math.min(path.length - 1, Math.floor(f.t / f.flight.dt));
      const p = path[i];
      const q = path[Math.max(0, i - 2)];
      f.mesh.position.set(p.x, p.y, p.z);
      if (i > 1) f.mesh.lookAt(q.x, q.y, q.z); // +z (the tail) trails along the path
      if (i >= path.length - 1) {
        this.flying = null;
        this.land(f);
      }
    }
    this.aimDot.visible = this.live && !this.flying && !this.turnOver;
    this.aimDot.position.set(this.aim.x, this.aim.y, 0.003);
    if (this.hand.visible) {
      const target = HAND.z + this.pull * PULL;
      this.hand.position.z += (target - this.hand.position.z) * Math.min(1, dt * 25);
      this.hand.position.y += (HAND.y - this.pull * 0.05 - this.hand.position.y) * Math.min(1, dt * 25);
      if (this.grab) {
        // Tip points at the aim while held.
        const a = this.grab.aim;
        const h = this.hand.position;
        this.hand.lookAt(2 * h.x - a.x, 2 * h.y - a.y - 0.25, 2 * h.z - a.z);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (useWorldStore.getState().place === 'darts') this.frame(dt);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }
}
