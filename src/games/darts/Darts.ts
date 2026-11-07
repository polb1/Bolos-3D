import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { audio } from '../../audio/AudioEngine';
import { SwingTracker } from '../../game/SwingTracker';
import { clamp } from '../../utils/math';
import { createRng, gaussian } from '../../utils/random';
import { net } from '../../net/client';
import { buildLounge } from '../../world3d/lounge';
import { dartboard } from '../../world3d/textures';
import { useWorldStore } from '../../world/worldStore';
import { aiTarget, apply501, BOARD_R, bedCentre, BULL_Y, DARTS_PER_TURN, fly, launch, LEGS_TO_WIN, OCHE, scoreAt, type DartsMode, type Flight, type Hit, type Vec3 } from './physics';
import { rulesPoster } from './room';
import { useDartsStore, type Opponent } from './store';

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
const HAND: Vec3 = { x: 0, y: 1.6, z: OCHE + 0.28 };
const PULL = 0.16; // m the hand moves back at full pull

interface Flying {
  mesh: THREE.Group;
  flight: Flight;
  t: number;
  hit: Hit;
}

/** AI aim error (m, per axis) for easy / medium / expert: about 50, 30 and 20 darts per 501 leg (simulated). */
const AI_SIGMA = [0.028, 0.014, 0.0075];
const AI_NAMES = ['IA Fácil', 'IA Media', 'IA Experta'];
const AI_HAND: Vec3 = { x: 0.04, y: 1.62, z: OCHE + 0.2 };
const RIVAL_COLOR = 0xff5a5a;

/** Online darts messages (relayed by the room server, addressed with `to`). */
type DartsMsg = { k: 'dseek' } | { k: 'dstart'; to: string } | { k: 'dthrow'; to: string; f: number[]; v: number[] } | { k: 'dquit'; to: string };

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
  add(new THREE.ConeGeometry(0.0012, 0.03, 8), new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.9, roughness: 0.3 }), -0.015); // tip (its end is the origin)
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
  private stuck: THREE.Group[] = [];
  private flying: Flying | null = null;
  private grab: { id: number; y0: number; aim: Vec3 } | null = null;
  private pull = 0;
  private turnOver = 0;
  private raf = 0;
  private last = performance.now();
  private bannerN = 0;
  /** AI: seconds until its next dart. */
  private aiT = 0;
  /** Online: rival id, throws waiting to be shown, and seek announce timer. */
  private rival: string | null = null;
  private queue: { f: Vec3; v: Vec3 }[] = [];
  private seekT = 0;
  private firstStarter: 0 | 1 = 0;
  private poster!: THREE.Mesh;
  /** 0 = at the oche, 1 = in front of the rules poster. */
  private view = 0;
  private readonly gameCam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x1a120c);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();
    this.buildRoom();

    this.hand = makeDart(0xd8f24a);
    this.scene.add(this.hand);
    this.restHand();
    net.onGame((from, data) => this.onNet(from, data as DartsMsg));

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
    const spot = new THREE.SpotLight(0xffe2b8, 12, 6, 0.32, 0.6, 1.4);
    spot.position.set(0, 2.6, 1.0);
    spot.target.position.set(0, BULL_Y, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0005;
    s.add(spot, spot.target);
    // The board hangs in a corner of the games lounge.
    s.add(buildLounge({ w: 5, d: 5.5, back: -0.05, h: 3, lamps: [[-1.4, 2.6], [1.4, 2.6]] }));

    // Cabinet behind the board, catch ring, board face.
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.04), new THREE.MeshStandardMaterial({ color: 0x1a0f08, roughness: 0.8 }));
    cab.position.set(0, BULL_Y, -0.03);
    cab.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(BOARD_R + 0.02, BOARD_R + 0.02, 0.04, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, side: THREE.DoubleSide }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, BULL_Y, -0.01);
    const face = new THREE.Mesh(new THREE.CircleGeometry(BOARD_R, 96), new THREE.MeshStandardMaterial({ map: dartboard(), roughness: 0.85 }));
    face.position.set(0, BULL_Y, 0);
    face.receiveShadow = true;
    // Throw line (oche).
    const oche = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.012, 0.04), new THREE.MeshStandardMaterial({ color: 0xd8f24a, emissive: 0x6a7a10, roughness: 0.5 }));
    oche.position.set(0, 0.006, OCHE);
    // Rules poster on the wall, left of the board.
    this.poster = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.364), new THREE.MeshStandardMaterial({ map: rulesPoster(), roughness: 0.8 }));
    this.poster.position.set(-0.6, 1.72, -0.045);
    s.add(cab, ring, face, oche, this.poster);
  }

  // ------------------------------------------------------------------ flow
  /** Solo game (`opponent` 'solo'), or a 501 match against the AI / an online rival. */
  start(mode: DartsMode, opponent: Opponent = 'solo', rival?: { id: string; name: string; first: boolean }) {
    audio.unlock();
    this.clearBoard();
    if (this.flying) this.scene.remove(this.flying.mesh);
    this.flying = null;
    this.turnOver = 0;
    this.queue = [];
    this.rival = rival?.id ?? null;
    const st = useDartsStore.getState();
    const me = useWorldStore.getState().name || 'Tú';
    const p = mode === '501' ? 501 : 0;
    const who = rival && !rival.first ? 1 : 0;
    this.firstStarter = who;
    st.set({
      screen: 'playing', mode, opponent, points: p, turnStart: p, round: 1, hits: [], banner: null, darts: 0, poster: false,
      names: [me, opponent === 'ai' ? AI_NAMES[st.level] : (rival?.name ?? 'Rival')], scores: [501, 501], legs: [0, 0], who,
    });
    this.beginVisit();
  }

  /** Online: look for another player who is also looking (lower id hosts and throws first). */
  seek() {
    audio.unlock();
    useDartsStore.getState().set({ screen: 'seek' });
    this.seekT = 0;
  }

  /** Leaves the current game (tells an online rival). */
  quit() {
    if (this.rival && useDartsStore.getState().screen === 'playing') net.sendGame({ k: 'dquit', to: this.rival } satisfies DartsMsg);
    this.rival = null;
    useDartsStore.getState().set({ screen: 'menu', poster: false });
  }

  private onNet(from: string, m: DartsMsg) {
    if (!m || typeof m !== 'object') return;
    const st = useDartsStore.getState();
    if (m.k === 'dseek' && st.screen === 'seek' && net.id && net.id < from) {
      net.sendGame({ k: 'dstart', to: from } satisfies DartsMsg);
      this.start('501', 'online', { id: from, name: net.peers.get(from)?.name ?? 'Rival', first: true });
    } else if (m.k === 'dstart' && m.to === net.id && st.screen === 'seek') {
      this.start('501', 'online', { id: from, name: net.peers.get(from)?.name ?? 'Rival', first: false });
    } else if (m.k === 'dthrow' && m.to === net.id && from === this.rival) {
      const vec = (a: unknown, lo: number, hi: number): Vec3 | null => {
        if (!Array.isArray(a) || a.length !== 3 || !a.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi)) return null;
        return { x: a[0], y: a[1], z: a[2] };
      };
      const f = vec(m.f, -5, 5);
      const v = vec(m.v, -20, 20);
      if (f && v && f.z > 1) this.queue.push({ f, v });
    } else if (m.k === 'dquit' && m.to === net.id && from === this.rival) this.rivalGone();
  }

  private rivalGone() {
    this.rival = null;
    const st = useDartsStore.getState();
    if (st.screen === 'playing') st.set({ screen: 'end', result: `${st.names[1]} ha dejado la partida` });
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
    if (this.flying || this.turnOver || st.screen !== 'playing' || st.who !== 0) return;
    const from = { x: this.hand.position.x, y: this.hand.position.y, z: this.hand.position.z };
    const v = launch(from, aim, speed, IDEAL, sideways + gaussian(this.rng, SCATTER));
    v.y += gaussian(this.rng, SCATTER) * speed;
    if (this.rival) {
      // Rounded before flying so both sides simulate exactly the same numbers.
      const r = (n: number) => Math.round(n * 1e5) / 1e5;
      for (const o of [from, v]) (['x', 'y', 'z'] as const).forEach((k) => (o[k] = r(o[k])));
      net.sendGame({ k: 'dthrow', to: this.rival, f: [from.x, from.y, from.z], v: [v.x, v.y, v.z] } satisfies DartsMsg);
    }
    this.launchDart(from, v, 0xd8f24a);
    this.hand.visible = false;
  }

  /** The AI picks its bed and throws with its level's aim error. */
  private aiThrow() {
    const st = useDartsStore.getState();
    const t = st.mode === '501' ? aiTarget(st.points) : { n: 20, mult: 3 };
    const c = bedCentre(t.n, t.mult);
    const s = AI_SIGMA[st.level] ?? AI_SIGMA[1];
    const aim = { x: c.x + gaussian(this.rng, s), y: c.y + gaussian(this.rng, s), z: 0 };
    this.launchDart(AI_HAND, launch(AI_HAND, aim, IDEAL, IDEAL, 0), RIVAL_COLOR);
  }

  private launchDart(from: Vec3, v: Vec3, color: number) {
    const flight = fly(from, v);
    const hit = flight.end === 'board' ? scoreAt(flight.at.x, flight.at.y) : { score: 0, mult: 0, label: 'FUERA' };
    const mesh = makeDart(color);
    this.scene.add(mesh);
    this.flying = { mesh, flight, t: 0, hit };
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
    const match = st.opponent !== 'solo';
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
        this.turnOver = 99;
        if (!match) {
          window.setTimeout(() => useDartsStore.getState().set({ screen: 'end', result: '' }), 1800);
          return;
        }
        const w = st.who;
        const legs: [number, number] = [st.legs[0], st.legs[1]];
        legs[w]++;
        st.set({ legs });
        window.setTimeout(() => {
          const now = useDartsStore.getState();
          if (now.screen !== 'playing') return;
          if (legs[w] >= LEGS_TO_WIN) now.set({ screen: 'end', result: `${now.names[w]} gana ${legs[w]}-${legs[1 - w]}` });
          else this.nextLeg();
        }, 2200);
        return;
      }
    } else st.set({ hits, darts, points: st.points + hit.score });
    this.banner(hit.score ? `${hit.label} · ${hit.score}` : hit.label, hit.score ? 'hit' : 'miss');
    if (hits.length >= DARTS_PER_TURN) this.turnOver = 1.6;
    else if (st.who === 0) this.restHand();
    else this.aiT = 0.9;
  }

  private clearBoard() {
    for (const d of this.stuck) this.scene.remove(d);
    this.stuck = [];
  }

  /** Darts collected from the board: next visit (the other player's, in a match). */
  private nextTurn() {
    this.clearBoard();
    const st = useDartsStore.getState();
    if (st.opponent === 'solo') {
      st.set({ hits: [], round: st.round + 1, turnStart: st.points, banner: null });
      this.restHand();
    } else {
      const scores: [number, number] = [st.scores[0], st.scores[1]];
      scores[st.who] = st.points;
      const who = (1 - st.who) as 0 | 1;
      st.set({ scores, who, hits: [], banner: null, round: who === this.legStarter() ? st.round + 1 : st.round });
      this.beginVisit();
    }
    audio.sweep();
  }

  /** Who opens the current leg: legs alternate from the first starter, as in competition. */
  private legStarter(): 0 | 1 {
    const { legs } = useDartsStore.getState();
    return ((this.firstStarter + legs[0] + legs[1]) % 2) as 0 | 1;
  }

  /** New leg: both back to 501, the other player opens. */
  private nextLeg() {
    this.clearBoard();
    this.turnOver = 0;
    useDartsStore.getState().set({ scores: [501, 501], who: this.legStarter(), hits: [], round: 1, banner: null });
    audio.sweep();
    this.beginVisit();
  }

  /** Sets up the visit of `who`: their points shown, the hand or the rival ready. */
  private beginVisit() {
    const st = useDartsStore.getState();
    if (st.opponent !== 'solo') {
      st.set({ points: st.scores[st.who], turnStart: st.scores[st.who] });
      this.banner(st.who === 0 ? 'Tu turno' : `Turno de ${st.names[1]}`, 'hit');
    }
    if (st.who === 0) this.restHand();
    else {
      this.hand.visible = false;
      this.aiT = 1.2;
    }
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

  /** Opens or closes the rules poster close-up. */
  setPoster(open: boolean) {
    audio.ui();
    useDartsStore.getState().set({ poster: open });
  }

  private onDown = (e: PointerEvent) => {
    if (useDartsStore.getState().poster) return this.setPoster(false);
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    if (this.live && !this.grab && this.ray.intersectObject(this.poster).length) return this.setPoster(true);
    if (!this.live || this.grab || this.flying || this.turnOver || useDartsStore.getState().who !== 0) return;
    const aim = this.toBoard(e);
    if (!aim) return;
    this.grab = { id: e.pointerId, y0: e.clientY, aim };
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
    this.tracker.reset();
    this.tracker.add(e.timeStamp / 1000, 0, 0);
  };

  private onMove = (e: PointerEvent) => {
    const g = this.grab;
    if (!g || e.pointerId !== g.id) return;
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
    // Strongly compressed: 5% more speed already lands ~10 cm higher, and a finger flick
    // varies far more than a trained arm (a hard flick at T20 used to sail over the board).
    const speed = IDEAL * clamp((rel.forward / FLICK) ** 0.05, 0.85, 1.08);
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
    // Portrait: keep the machine's width (about ±13° from the eye, poster included) filling the screen.
    this.camera.fov = Math.max(30, (2 * Math.atan(Math.tan((13 * Math.PI) / 180) / aspect) * 180) / Math.PI);
    this.gameCam.pos.set(0, 1.68, OCHE + 0.6);
    this.gameCam.look.set(0, BULL_Y - 0.12, 0);
    this.camera.updateProjectionMatrix();
    this.placeCamera();
  };

  /** Blends the oche view and a close-up that fits the whole poster on screen. */
  private placeCamera() {
    const c = this.camera;
    const P = this.poster.position;
    const g = this.gameCam;
    const p = (this.poster.geometry as THREE.PlaneGeometry).parameters;
    const tv = Math.tan((c.fov * Math.PI) / 360);
    const d = Math.max(p.height / 2 / tv, p.width / 2 / (tv * c.aspect)) * 1.12;
    const k = this.view * this.view * (3 - 2 * this.view);
    c.position.lerpVectors(g.pos, new THREE.Vector3(P.x, P.y, P.z + d), k);
    c.lookAt(new THREE.Vector3().lerpVectors(g.look, P, k));
  }

  /** One simulation + render step (exposed for browser testing). */
  frame(dt: number) {
    const st = useDartsStore.getState();
    if (st.screen === 'seek' && (this.seekT -= dt) <= 0) {
      this.seekT = 1;
      net.sendGame({ k: 'dseek' } satisfies DartsMsg);
    }
    if (st.screen === 'playing' && st.who === 1 && !this.flying && !this.turnOver) {
      if (st.opponent === 'ai' && (this.aiT -= dt) <= 0) this.aiThrow();
      const q = st.opponent === 'online' ? this.queue.shift() : undefined;
      if (q) this.launchDart(q.f, q.v, RIVAL_COLOR);
    }
    if (this.rival && st.screen === 'playing' && net.id && !net.peers.has(this.rival)) this.rivalGone();
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
    const want = useDartsStore.getState().poster ? 1 : 0;
    if (want !== this.view) {
      this.view = want > this.view ? Math.min(1, this.view + dt * 1.4) : Math.max(0, this.view - dt * 1.4);
    }
    this.placeCamera();
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
