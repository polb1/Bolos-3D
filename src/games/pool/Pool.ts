import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { audio } from '../../audio/AudioEngine';
import { QUALITY } from '../../config/settings';
import { net } from '../../net/client';
import { canvas, tex } from '../../utils/canvas';
import { clamp } from '../../utils/math';
import { createRng } from '../../utils/random';
import { buildLounge } from '../../world3d/lounge';
import { useWorldStore } from '../../world/worldStore';
import { useGameStore } from '../bowling/store/useGameStore';
import { chooseShot } from './ai';
import { CORNER, freeSpot, L, MAX_SPEED, moving, POCKETS, R, SIDE, step, W, type Ball, type ShotEvents } from './physics';
import { judge, newRack, type PoolState } from './rules';
import { usePoolStore, type PoolOpponent } from './store';

/** Height of the cloth. */
const SY = 0.8;
const STEP = 1 / 600;
const AI_NAMES = ['IA Fácil', 'IA Media', 'IA Experta'];
const BALL_COLORS = ['#f4f1e6', '#f2c200', '#1d4fc4', '#d8261c', '#5a2a8c', '#f2701d', '#13803c', '#7a1418', '#111111'];

/** Online pool messages (relayed by the room server, addressed with `to`). */
type PoolMsg =
  | { k: 'pseek' }
  | { k: 'pstart'; to: string; seed: number }
  | { k: 'paim'; to: string; a: number; c: number[] }
  | { k: 'pshot'; to: string; v: number[]; c?: number[] }
  | { k: 'pstate'; to: string; s: PoolState }
  | { k: 'pquit'; to: string };

const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** Accepts a rival's table only if it has the right shape and sane numbers. */
function validState(s: unknown): PoolState | null {
  const o = s as PoolState;
  if (!o || !Array.isArray(o.balls) || o.balls.length !== 16) return null;
  if (!o.balls.every((b) => b && num(b.x, -2, 2) && num(b.z, -2, 2) && typeof b.in === 'boolean')) return null;
  if (![0, 1].includes(o.turn) || !Array.isArray(o.groups) || o.groups.length !== 2) return null;
  if (!o.groups.every((g) => g === null || g === 'solid' || g === 'stripe')) return null;
  if (!['none', 'kitchen', 'table'].includes(o.inHand) || ![null, 0, 1].includes(o.winner)) return null;
  return {
    balls: o.balls.map((b) => ({ x: b.x, z: b.z, vx: 0, vz: 0, in: b.in })),
    turn: o.turn, groups: [o.groups[0], o.groups[1]], inHand: o.inHand, breakShot: !!o.breakShot, winner: o.winner,
    msg: typeof o.msg === 'string' ? o.msg.slice(0, 60) : '',
  };
}

/** Pool ball texture: solid colour or white with a band, and the number in white circles. */
function ballTexture(id: number) {
  const [c, g] = canvas(256, 128);
  const col = BALL_COLORS[id > 8 ? id - 8 : id];
  g.fillStyle = id > 8 ? '#f4f1e6' : col;
  g.fillRect(0, 0, 256, 128);
  if (id > 8) {
    g.fillStyle = col;
    g.fillRect(0, 34, 256, 60);
  }
  if (id > 0)
    for (const u of [64, 192]) {
      g.fillStyle = '#f4f1e6';
      g.beginPath();
      g.ellipse(u, 64, 22, 26, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      g.font = 'bold 28px Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(id), u, 66);
    }
  return tex(c);
}

/**
 * Pool minigame (8-ball). Drag to aim (or point at the target in the top view), pull the
 * cue back on the power strip (or hold Space) and let go to strike. Outcomes come from the
 * 2D physics in `physics.ts`; online, the shooter's result is the one both keep.
 */
export class Pool {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.02, 40);
  private readonly ray = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(SY + R));
  private readonly rng = createRng();
  private readonly meshes: THREE.Mesh[] = [];
  private readonly cue = new THREE.Group();
  private readonly guide: THREE.Line;
  private readonly guide2: THREE.Line;
  private readonly ghost: THREE.Mesh;
  /** Balls as drawn: the rules state between shots, a running copy while they roll. */
  private balls: Ball[] = [];
  private shot: { balls: Ball[]; ev: ShotEvents; n: number; mine: boolean } | null = null;
  /** Online: the shooter's resulting table, applied once our own replay stops. */
  private pending: PoolState | null = null;
  private aim = 0;
  private pull = 0;
  private charging = false;
  private drag: { id: number; x: number; ball: boolean } | null = null;
  private keys = new Set<string>();
  private aiT = 0;
  private aiShot: { v: { x: number; z: number }; cue?: { x: number; z: number } } | null = null;
  private rival: string | null = null;
  private seekT = 0;
  private aimSendT = 0;
  private lastAim = '';
  private endT = 0;
  private bannerN = 0;
  private raf = 0;
  private last = performance.now();
  private readonly camPos = new THREE.Vector3(-2, SY + 1.5, 0);
  private readonly camLook = new THREE.Vector3(0, SY, 0);
  private breaker: 0 | 1 = 0;
  /** Lamp shade over the table (hidden from the top view, it would block it). */
  private shade!: THREE.Mesh;

  constructor(private host: HTMLElement) {
    const q = QUALITY[useGameStore.getState().settings.quality];
    this.renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x1a120c);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();
    this.buildRoom();

    const sphere = new THREE.SphereGeometry(R, 28, 18);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(sphere, new THREE.MeshPhysicalMaterial({ map: ballTexture(i), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }));
      m.castShadow = true;
      m.rotation.set(this.rng() * 6, this.rng() * 6, this.rng() * 6);
      this.meshes.push(m);
      this.scene.add(m);
    }
    // Cue: tip at the group's origin, butt towards -x.
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.015, 1.45, 12), new THREE.MeshStandardMaterial({ color: 0xd9b27a, roughness: 0.4 }));
    stick.rotation.z = Math.PI / 2;
    stick.position.x = -0.725;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0066, 0.0066, 0.012, 12), new THREE.MeshStandardMaterial({ color: 0x3a6fb0, roughness: 0.8 }));
    tip.rotation.z = Math.PI / 2;
    tip.position.x = -0.006;
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0152, 0.42, 12), new THREE.MeshStandardMaterial({ color: 0x2a140a, roughness: 0.5 }));
    butt.rotation.z = Math.PI / 2;
    butt.position.x = -1.24;
    stick.castShadow = true;
    this.cue.add(stick, tip, butt);
    this.scene.add(this.cue);

    const lineMat = new THREE.LineDashedMaterial({ color: 0xfff4d8, dashSize: 0.02, gapSize: 0.015, transparent: true, opacity: 0.8 });
    this.guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineMat);
    this.guide2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineMat);
    this.ghost = new THREE.Mesh(new THREE.RingGeometry(R * 0.92, R, 32), new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0.7 }));
    this.ghost.rotation.x = -Math.PI / 2;
    this.scene.add(this.guide, this.guide2, this.ghost);

    net.onGame((from, data) => this.onNet(from, data as PoolMsg));
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.loop();
  }

  private buildRoom() {
    const s = this.scene;
    s.add(buildLounge({ w: 7, d: 7, back: -3.5, h: 3.2, lamps: [[-2.6, -2.6], [2.6, -2.6]] }));
    // Low lamp over the table, as in any bar.
    const lamp = new THREE.SpotLight(0xffe6c0, 9, 5, 0.9, 0.5, 1.2);
    lamp.position.set(0, SY + 1.5, 0);
    lamp.target.position.set(0, SY, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.bias = -0.0004;
    s.add(lamp, lamp.target, new THREE.HemisphereLight(0xfff0dd, 0x2a1a10, 0.25));
    const shade = (this.shade = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.4), new THREE.MeshStandardMaterial({ color: 0x0f3b2a, roughness: 0.6, side: THREE.DoubleSide })));
    shade.position.set(0, SY + 1.62, 0);
    s.add(shade);

    const felt = new THREE.MeshStandardMaterial({ color: 0x0b5a3c, roughness: 0.95 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a2e16, roughness: 0.45 });
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      b.castShadow = b.receiveShadow = true;
      s.add(b);
      return b;
    };
    box(L + 0.1, 0.04, W + 0.1, felt, 0, SY - 0.02, 0);
    box(L + 0.5, 0.24, W + 0.5, wood, 0, SY - 0.16, 0);
    // Cushions (felt) between the pocket mouths, then the wooden rails.
    const ch = 0.045;
    const longLen = L / 2 - CORNER - SIDE;
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) box(longLen, ch, 0.05, felt, sx * (SIDE + longLen / 2), SY + ch / 2, sz * (W / 2 + 0.025));
      box(0.05, ch, W - 2 * CORNER, felt, sz * (L / 2 + 0.025), SY + ch / 2, 0);
      box(L + 0.5, 0.06, 0.2, wood, 0, SY + 0.02, sz * (W / 2 + 0.15));
      box(0.2, 0.06, W + 0.1, wood, sz * (L / 2 + 0.15), SY + 0.02, 0);
    }
    // Pockets: black holes in the cloth corners and middles.
    const hole = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
    for (const p of POCKETS) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.07, 24), hole);
      m.position.set(p.x, SY - 0.03, p.z);
      s.add(m);
    }
    // Diamonds on the rails.
    const dia = new THREE.MeshStandardMaterial({ color: 0xf4ead0, roughness: 0.3 });
    for (let i = 1; i < 8; i++)
      if (i !== 4) for (const sz of [-1, 1]) box(0.012, 0.004, 0.012, dia, -L / 2 + (i * L) / 8, SY + 0.052, sz * (W / 2 + 0.15));
    for (let i = 1; i < 4; i++) for (const sx of [-1, 1]) box(0.012, 0.004, 0.012, dia, sx * (L / 2 + 0.15), SY + 0.052, -W / 2 + (i * W) / 4);
    // Head string spot and foot spot.
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.008, 12), new THREE.MeshBasicMaterial({ color: 0xd8e8d0 }));
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(L / 4, SY + 0.001, 0);
    s.add(spot);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.16, SY - 0.28, 0.16, wood, sx * (L / 2), (SY - 0.28) / 2, sz * (W / 2));
  }

  // ------------------------------------------------------------------ flow
  private get st() {
    return usePoolStore.getState();
  }

  /** Player whose cue this device moves now (both, in a two-player game on one device). */
  private get myTurn() {
    const { game, opponent, me } = this.st;
    if (!game || this.shot || game.winner !== null) return false;
    if (opponent === 'ai') return game.turn === 0;
    if (opponent === 'online') return game.turn === me;
    return true;
  }

  start(opponent: PoolOpponent, rival?: { id: string; name: string; host: boolean; seed: number }) {
    audio.unlock();
    this.rival = rival?.id ?? null;
    const myName = useWorldStore.getState().name || 'Tú';
    const st = this.st;
    const names: [string, string] =
      opponent === 'ai' ? [myName, AI_NAMES[st.level]] : opponent === 'online' ? (rival!.host ? [myName, rival!.name] : [rival!.name, myName]) : opponent === 'local' ? ['Jugador 1', 'Jugador 2'] : [myName, ''];
    this.breaker = 0;
    st.set({ screen: 'playing', opponent, names, me: opponent === 'online' ? (rival!.host ? 0 : 1) : opponent === 'local' ? null : 0, result: '', banner: null });
    this.rackUp(rival ? createRng(rival.seed) : this.rng);
  }

  private rackUp(rnd: () => number) {
    const g = newRack(rnd, this.breaker);
    this.shot = null;
    this.pending = null;
    this.aiShot = null;
    this.endT = 0;
    this.setGame(g);
    this.aim = 0;
    this.say(this.turnText(g));
  }

  /** Online: look for another player who is also looking (lower id hosts and breaks). */
  seek() {
    audio.unlock();
    this.st.set({ screen: 'seek' });
    this.seekT = 0;
  }

  quit() {
    if (this.rival && this.st.screen === 'playing') net.sendGame({ k: 'pquit', to: this.rival } satisfies PoolMsg);
    this.rival = null;
    this.st.set({ screen: 'menu', game: null, rolling: false });
  }

  private setGame(g: PoolState) {
    this.balls = g.balls.map((b) => ({ ...b }));
    this.st.set({ game: g, rolling: false });
    this.aiT = 1.1;
  }

  private turnText(g: PoolState) {
    const { names, opponent, me } = this.st;
    if (opponent === 'solo') return g.inHand === 'kitchen' ? 'Saque: coloca la blanca y rompe' : 'Tu tiro';
    const mine = opponent === 'online' ? g.turn === me : opponent === 'ai' ? g.turn === 0 : false;
    const who = mine ? 'Tu turno' : `Turno de ${names[g.turn]}`;
    return g.inHand === 'table' ? `${who} · bola en mano` : g.breakShot ? `${who} · saque` : who;
  }

  private say(text: string) {
    if (text) this.st.set({ banner: { text, n: ++this.bannerN } });
  }

  private onNet(from: string, m: PoolMsg) {
    if (!m || typeof m !== 'object') return;
    const st = this.st;
    if (m.k === 'pseek' && st.screen === 'seek' && net.id && net.id < from) {
      const seed = Math.floor(Math.random() * 2 ** 31);
      net.sendGame({ k: 'pstart', to: from, seed } satisfies PoolMsg);
      this.start('online', { id: from, name: net.peers.get(from)?.name ?? 'Rival', host: true, seed });
      return;
    }
    if (!('to' in m) || m.to !== net.id) return;
    if (m.k === 'pstart' && st.screen === 'seek' && num(m.seed, 0, 2 ** 31)) {
      this.start('online', { id: from, name: net.peers.get(from)?.name ?? 'Rival', host: false, seed: m.seed });
      return;
    }
    if (from !== this.rival || st.screen !== 'playing') return;
    if (m.k === 'pquit') return this.rivalGone();
    const g = st.game;
    if (!g || g.turn === st.me) return;
    if (m.k === 'paim' && num(m.a, -10, 10) && Array.isArray(m.c) && !this.shot) {
      this.aim = m.a;
      if (g.inHand !== 'none' && num(m.c[0], -2, 2) && num(m.c[1], -2, 2) && freeSpot(this.balls, m.c[0], m.c[1], g.inHand === 'kitchen')) Object.assign(this.balls[0], { x: m.c[0], z: m.c[1] });
    } else if (m.k === 'pshot' && !this.shot && Array.isArray(m.v) && num(m.v[0], -MAX_SPEED, MAX_SPEED) && num(m.v[1], -MAX_SPEED, MAX_SPEED)) {
      const c = Array.isArray(m.c) && num(m.c[0], -2, 2) && num(m.c[1], -2, 2) ? { x: m.c[0], z: m.c[1] } : undefined;
      this.run({ x: m.v[0], z: m.v[1] }, c, false);
    } else if (m.k === 'pstate') this.adopt(m.s);
  }

  /** The shooter's table after their shot: applied now, or when our replay of it stops. */
  private adopt(raw: unknown) {
    const s = validState(raw);
    if (!s) return;
    if (this.shot) this.pending = s;
    else this.after(s);
  }

  private rivalGone() {
    this.rival = null;
    if (this.st.screen === 'playing') this.st.set({ screen: 'end', result: `${this.st.names[this.st.me === 0 ? 1 : 0]} ha dejado la partida` });
  }

  /** Strikes the cue ball (ours, the AI's or a replay of the rival's). */
  private run(v: { x: number; z: number }, cue: { x: number; z: number } | undefined, mine: boolean) {
    const g = this.st.game;
    if (!g) return;
    if (mine && this.rival) net.sendGame({ k: 'pshot', to: this.rival, v: [v.x, v.z], c: cue && [cue.x, cue.z] } satisfies PoolMsg);
    const balls = g.balls.map((b) => ({ ...b }));
    if (cue) Object.assign(balls[0], cue);
    balls[0].vx = v.x;
    balls[0].vz = v.z;
    this.balls = balls;
    this.shot = { balls, ev: { first: null, pocketed: [], rail: false }, n: 0, mine };
    this.pull = 0;
    this.st.set({ rolling: true, power: 0 });
    audio.hockeyHit('mallet', 2 + Math.sqrt(v.x * v.x + v.z * v.z));
  }

  /** Everything stopped: judge it (or take the shooter's verdict online). */
  private settle() {
    const s = this.shot!;
    this.shot = null;
    const g = this.st.game!;
    for (const b of s.balls) b.vx = b.vz = 0;
    if (this.st.opponent === 'online' && !s.mine) {
      // The shooter decides; wait for their table if it has not arrived yet.
      if (this.pending) this.after(this.pending);
      else this.st.set({ rolling: false });
      return;
    }
    let next = judge(g, s.balls, s.ev);
    if (this.st.opponent === 'solo') {
      // Practice: always your shot; a new rack when the table is cleared.
      next = { ...next, turn: 0, winner: null, msg: next.winner !== null ? 'Bola 8 dentro' : next.msg };
      if (next.balls.every((b, i) => i === 0 || b.in)) return this.rackUp(this.rng);
    }
    if (this.rival) net.sendGame({ k: 'pstate', to: this.rival, s: next } satisfies PoolMsg);
    this.after(next);
  }

  private after(next: PoolState) {
    const prev = this.st.game;
    this.pending = null;
    this.shot = null;
    if (prev && !prev.groups[prev.turn] && next.groups[prev.turn] && next.msg && !next.msg.startsWith('Falta')) {
      const { names, opponent, me } = this.st;
      const mine = opponent === 'online' ? prev.turn === me : opponent === 'ai' ? prev.turn === 0 : opponent === 'solo';
      next = { ...next, msg: `${mine ? 'Tus bolas' : `${names[prev.turn]} va con`}: ${next.msg}` };
    }
    this.setGame(next);
    this.say(next.msg || this.turnText(next));
    if (next.msg && next.winner === null) window.setTimeout(() => this.st.game === next && this.say(this.turnText(next)), 1600);
    if (next.winner !== null) {
      const { names, opponent, me } = this.st;
      const mine = opponent === 'online' ? next.winner === me : opponent === 'ai' ? next.winner === 0 : true;
      audio.hockeyBuzzer(mine ? 'win' : 'lose');
      this.endT = 2.2;
      this.st.set({ result: opponent === 'local' ? `Gana ${names[next.winner]}` : mine ? '¡Has ganado!' : `Gana ${names[next.winner]}` });
    } else if (next.msg.startsWith('Falta')) audio.foul();
  }

  /** Next rack (the other player breaks). */
  rematch() {
    if (this.st.opponent === 'online') return; // online: back to seek from the end screen
    this.breaker = (1 - this.breaker) as 0 | 1;
    this.st.set({ screen: 'playing', result: '' });
    this.rackUp(this.rng);
  }

  // ------------------------------------------------------------------ shooting
  /** Cue pulled back (0..1) from the power strip. */
  setPull(p: number) {
    if (!this.myTurn) return;
    this.pull = clamp(p, 0, 1);
    this.st.set({ power: this.pull });
  }

  /** Releases the cue with the current pull. */
  strike() {
    const p = this.pull;
    this.pull = 0;
    this.st.set({ power: 0 });
    if (!this.myTurn || p < 0.03) return;
    const sp = 0.25 + (MAX_SPEED - 0.25) * p ** 1.6;
    const g = this.st.game!;
    this.run({ x: Math.cos(this.aim) * sp, z: Math.sin(this.aim) * sp }, g.inHand !== 'none' ? { x: this.balls[0].x, z: this.balls[0].z } : undefined, true);
  }

  toggleCam() {
    audio.ui();
    this.st.set({ cam: this.st.cam === '3d' ? 'top' : '3d' });
  }

  private toTable(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    return this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
  }

  private onDown = (e: PointerEvent) => {
    if (!this.live || this.drag || !this.myTurn) return;
    const p = this.toTable(e);
    const c = this.balls[0];
    const g = this.st.game!;
    const ball = !!p && g.inHand !== 'none' && (p.x - c.x) ** 2 + (p.z - c.z) ** 2 < (R * 3) ** 2;
    this.drag = { id: e.pointerId, x: e.clientX, ball };
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
    if (!ball && this.st.cam === 'top' && p) this.aim = Math.atan2(p.z - c.z, p.x - c.x);
  };

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId || !this.myTurn) return;
    const c = this.balls[0];
    const p = this.toTable(e);
    if (d.ball) {
      const g = this.st.game!;
      if (p && freeSpot(this.balls, p.x, p.z, g.inHand === 'kitchen')) Object.assign(c, { x: p.x, z: p.z });
    } else if (this.st.cam === 'top') {
      if (p) this.aim = Math.atan2(p.z - c.z, p.x - c.x);
    } else {
      // Fine aim: a full screen width turns the cue about 70°.
      this.aim += ((e.clientX - d.x) / (this.renderer.domElement.clientWidth || 1)) * 1.2;
      d.x = e.clientX;
    }
  };

  private onUp = (e: PointerEvent) => {
    if (this.drag?.id === e.pointerId) this.drag = null;
  };

  private onKey = (e: KeyboardEvent) => {
    if (!this.live || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    const down = e.type === 'keydown';
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);
    if (e.code === 'KeyC' && down && !e.repeat) this.toggleCam();
    if (e.code === 'Space') {
      e.preventDefault();
      if (down && !e.repeat && this.myTurn) this.charging = true;
      if (!down && this.charging) {
        this.charging = false;
        this.strike();
      }
    }
  };

  private get live() {
    return useWorldStore.getState().place === 'pool' && this.st.screen === 'playing';
  }

  // ------------------------------------------------------------------ frame
  private resize = () => {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  /** Where the cue ball's path first meets a ball (ghost centre) or a cushion. */
  private trace(): { end: THREE.Vector3; hit: number } {
    const c = this.balls[0];
    const dx = Math.cos(this.aim);
    const dz = Math.sin(this.aim);
    let t = Infinity;
    let hit = -1;
    this.balls.forEach((b, i) => {
      if (!i || b.in) return;
      const ox = b.x - c.x;
      const oz = b.z - c.z;
      const along = ox * dx + oz * dz;
      const perp2 = ox * ox + oz * oz - along * along;
      if (along <= 0 || perp2 > 4 * R * R) return;
      const d = along - Math.sqrt(4 * R * R - perp2);
      if (d < t) (t = d), (hit = i);
    });
    const ex = L / 2 - R;
    const ez = W / 2 - R;
    const wall = Math.min(dx > 0 ? (ex - c.x) / dx : dx < 0 ? (-ex - c.x) / dx : Infinity, dz > 0 ? (ez - c.z) / dz : dz < 0 ? (-ez - c.z) / dz : Infinity);
    if (wall < t) (t = wall), (hit = -1);
    return { end: new THREE.Vector3(c.x + dx * t, SY + R, c.z + dz * t), hit };
  }

  frame(dt: number) {
    const st = this.st;
    if (st.screen === 'seek' && (this.seekT -= dt) <= 0) {
      this.seekT = 1;
      net.sendGame({ k: 'pseek' } satisfies PoolMsg);
    }
    if (this.rival && st.screen === 'playing' && net.id && !net.peers.has(this.rival)) this.rivalGone();
    const g = st.game;

    // Keyboard aim and power.
    if (this.myTurn && this.live) {
      const turn = (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0) - (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0);
      this.aim -= turn * dt * (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 0.08 : 0.7);
      if (this.charging) this.setPull(Math.min(1, this.pull + dt * 0.8));
    }
    // Online: show the rival where we aim.
    if (this.rival && this.myTurn && (this.aimSendT -= dt) <= 0) {
      this.aimSendT = 0.1;
      const msg = { k: 'paim', to: this.rival, a: Math.round(this.aim * 1e4) / 1e4, c: [this.balls[0].x, this.balls[0].z] } satisfies PoolMsg;
      const s = JSON.stringify(msg);
      if (s !== this.lastAim) net.sendGame(msg), (this.lastAim = s);
    }
    // AI turn: think, line up, strike.
    if (g && st.opponent === 'ai' && g.turn === 1 && g.winner === null && !this.shot && st.screen === 'playing' && (this.aiT -= dt) <= 0) {
      if (!this.aiShot) {
        this.aiShot = chooseShot(g, st.level, this.rng);
        if (this.aiShot.cue) Object.assign(this.balls[0], this.aiShot.cue);
        this.aim = Math.atan2(this.aiShot.v.z, this.aiShot.v.x);
        this.aiT = 0.9;
      } else {
        const s = this.aiShot;
        this.aiShot = null;
        this.run(s.v, s.cue, false);
      }
    }
    if (this.aiShot) this.pull = Math.min(0.5, this.pull + dt * 0.6);
    // Roll the balls in fixed steps (same sequence as `simulate`, so replays match).
    const s = this.shot;
    if (s) {
      const steps = Math.round(dt / STEP);
      for (let i = 0; i < steps && moving(s.balls) && s.n < 600 * 40; i++, s.n++)
        step(s.balls, s.ev, (kind, v) => {
          if (kind === 'pocket') audio.dartHit(0.8);
          else if (v > 0.15) audio.hockeyHit(kind === 'ball' ? 'mallet' : 'rail', v * 2);
        });
      if (!moving(s.balls) || s.n >= 600 * 40) this.settle();
    }
    if (this.endT > 0 && (this.endT -= dt) <= 0) st.set({ screen: 'end' });
    this.draw(dt);
  }

  private draw(dt: number) {
    const st = this.st;
    // Balls: move, roll (rotation from the distance travelled), hide when pocketed.
    this.balls.forEach((b, i) => {
      const m = this.meshes[i];
      m.visible = !b.in && !!st.game;
      const dx = b.x - m.position.x;
      const dz = b.z - m.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 1e-6 && d < 0.5) m.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dz / d, 0, -dx / d), d / R));
      m.position.set(b.x, SY + R, b.z);
    });
    // Cue and guide while someone is lining up.
    const g = st.game;
    const aiming = !!g && !this.shot && g.winner === null && st.screen === 'playing';
    const c = this.balls[0];
    this.cue.visible = aiming && !!c && !c.in;
    this.guide.visible = this.guide2.visible = this.ghost.visible = aiming && this.myTurn && this.cue.visible;
    if (this.cue.visible) {
      const back = R + 0.015 + this.pull * 0.28;
      this.cue.position.set(c.x - Math.cos(this.aim) * back, SY + R + 0.012 + this.pull * 0.01, c.z - Math.sin(this.aim) * back);
      this.cue.rotation.set(0, -this.aim, -0.06);
    }
    if (this.guide.visible) {
      const { end, hit } = this.trace();
      this.guide.geometry.setFromPoints([new THREE.Vector3(c.x, SY + R, c.z), end]);
      this.guide.computeLineDistances();
      this.ghost.position.set(end.x, SY + 0.002, end.z);
      this.ghost.visible = hit > 0;
      this.guide2.visible = hit > 0;
      if (hit > 0) {
        const b = this.balls[hit];
        const nx = b.x - end.x;
        const nz = b.z - end.z;
        const n = Math.sqrt(nx * nx + nz * nz) || 1;
        this.guide2.geometry.setFromPoints([new THREE.Vector3(b.x, SY + R, b.z), new THREE.Vector3(b.x + (nx / n) * 0.25, SY + R, b.z + (nz / n) * 0.25)]);
        this.guide2.computeLineDistances();
      }
    }
    this.placeCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private placeCamera(dt: number) {
    const cam = this.camera;
    const c = this.balls[0] ?? { x: -L / 4, z: 0 };
    const aspect = cam.aspect;
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    this.shade.visible = this.st.cam !== 'top';
    if (this.st.cam === 'top') {
      // Straight down; the table's length across the screen's long side.
      const portrait = aspect < 1;
      const halfLong = L / 2 + 0.3;
      const halfShort = W / 2 + 0.3;
      const tv = Math.tan((cam.fov * Math.PI) / 360);
      const h = portrait ? Math.max(halfLong / tv, halfShort / (tv * aspect)) : Math.max(halfShort / tv, halfLong / (tv * aspect));
      pos = new THREE.Vector3(0, SY + h, 0.0001);
      look = new THREE.Vector3(0, SY, 0);
      cam.up.set(portrait ? 1 : 0, 0, portrait ? 0 : -1);
    } else {
      cam.up.set(0, 1, 0);
      const dx = Math.cos(this.aim);
      const dz = Math.sin(this.aim);
      if (this.shot) {
        // Balls rolling: rise behind the shot to follow the table.
        pos = new THREE.Vector3(-dx * 2.2, SY + 1.7, -dz * 2.2);
        look = new THREE.Vector3(0, SY, 0);
      } else {
        const far = aspect < 1 ? 1.3 : 0.95;
        pos = new THREE.Vector3(c.x - dx * far, SY + 0.32 + (aspect < 1 ? 0.15 : 0), c.z - dz * far);
        look = new THREE.Vector3(c.x + dx * 0.7, SY, c.z + dz * 0.7);
      }
    }
    const snap = this.st.cam === 'top';
    const k = snap ? 1 : 1 - Math.exp(-dt * (this.shot ? 2.5 : 10));
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (useWorldStore.getState().place === 'pool') this.frame(dt);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    this.renderer.dispose();
  }
}
