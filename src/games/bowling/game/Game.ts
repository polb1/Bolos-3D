import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { audio } from '../../../audio/AudioEngine';
import { BALL, HEAD_PIN_Z, LANE, PIT_Z, rackPositions } from '../constants';
import { net } from '../../../net/client';
import { BALL_COLORS, LB_TO_KG, QUALITY, type Settings } from '../../../config/settings';
import { PhysicsWorld, type LaunchParams } from '../physics/PhysicsWorld';
import { Alley } from '../scene/Alley';
import { Monitor } from '../scene/Monitor';
import { createBallMesh } from '../scene/pinMesh';
import { currentScore, turnState } from '../scoring/scoring';
import { useGameStore } from '../store/useGameStore';
import { useWorldStore } from '../../../world/worldStore';
import { clamp, damp } from '../../../utils/math';
import { createRng, gaussian } from '../../../utils/random';
import { Input } from './Input';
import { aiThrow, LADDER } from './ai';
import { describeRoll, nextPlayer } from './match';
import { PinRack } from './PinRack';
import { SwingTracker } from '../../../utils/SwingTracker';

const REST_Z = 1.8; // where the ball waits on the approach
const MAX_BACK_Z = 3.6; // furthest the ball can be pulled back
const LINE_Z = BALL.radius + 0.02; // the hand stops at the foul line
const MIN_THROW = 1.2; // m/s forward below which the ball is just put down again
const MAX_ANGLE = 0.06; // rad: wilder strokes are clamped (they would be gutter balls anyway)
const ARM_GAIN = 1.2; // the mouse stroke is shorter than a real arm swing: boost its speed a bit
const AIM_DAMP = 0.85; // sideways jitter of the mouse is larger than a bowler's: soften the angle
const AI_THINK = 1.4; // s the computer bowler lines up before throwing
const SPIN_RATE = 0.9; // wrist preset change per second while Q/E is held

/**
 * Online bowling messages (relayed by the room server, addressed with `to`). The bowler's
 * side is the authority: it sends the throw so the rival watches it live, then the pins
 * left standing, which the rival applies before scoring (two physics runs can differ).
 */
type BowlMsg =
  | { k: 'bseek' }
  | { k: 'bstart'; to: string; seed: number }
  | { k: 'bthrow'; to: string; t: number[] }
  | { k: 'bres'; to: string; standing: number[] }
  | { k: 'bquit'; to: string };
const RIVAL_WAIT = 25; // s without the rival's result before giving up on them

type Mode = 'idle' | 'aim' | 'grab' | 'rolling' | 'settling' | 'result' | 'sweep';

/**
 * Orchestrates renderer, physics, pins, ball and turn flow.
 * React only renders the UI; it talks to the game through the store and the
 * public methods below.
 */
export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 80);
  private readonly physics = new PhysicsWorld();
  private readonly rng = createRng();
  private readonly alley: Alley;
  private readonly rack: PinRack;
  private readonly swing = new SwingTracker();
  private readonly monitor = new Monitor();
  private resultWait = 0;
  private lastFoul = false;
  private fanfare: (() => void) | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BALL.radius);
  private readonly held = new THREE.Vector3(0, BALL.radius, REST_Z);
  private grabOffset = new THREE.Vector3();
  private restX = 0;
  private aimCamX = 0;
  private readonly input: Input;
  private ball: THREE.Mesh;
  private ballColor = '';
  private mode: Mode = 'idle';
  private paused = false;
  private clock = new THREE.Clock();
  private time = 0;
  private modeTime = 0;
  private standingBefore: number[] = [];
  private gutter = false;
  private slowTime = 0;
  private restTime = 0;
  private strikeStreak: number[] = [];
  /** One-ball roll-off after a tied game against the AI: pins per player this round. */
  private rolloff: number[] | null = null;
  private camTarget = new THREE.Vector3(0, 0.3, -12);
  private camLook = new THREE.Vector3(0, 0.3, -12);
  private raf = 0;
  /** Online: rival throws and results not yet played, and the seek announce timer. */
  private rivalThrows: LaunchParams[] = [];
  private rivalResults: number[][] = [];
  private seekT = 0;
  private readonly unsub: () => void;

  constructor(private readonly host: HTMLElement) {
    const s = useGameStore.getState().settings;
    const q = QUALITY[s.quality];
    this.renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x1a120c);
    this.scene.fog = new THREE.Fog(0x1a120c, 26, 60);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    this.alley = new Alley(this.renderer);
    this.rack = new PinRack(this.physics);
    this.ball = createBallMesh('#b3122e', '#ff5a6e');
    this.scene.add(this.alley.group, this.rack.group, this.ball, this.monitor.group);
    this.monitor.onImpact = () => {
      audio.crash();
      this.fanfare?.();
      this.fanfare = null;
    };
    this.physics.setVariation(this.rng);
    this.rack.reset();

    this.camera.position.set(0, 1.6, 3.5);
    this.applySettings(s);
    this.unsub = useGameStore.subscribe((st, prev) => {
      if (st.settings !== prev.settings) this.applySettings(st.settings);
      if (st.muted !== prev.muted) audio.setMuted(st.muted);
      if (st.screen !== prev.screen) this.onScreen(st.screen, prev.screen);
    });
    audio.setMuted(useGameStore.getState().muted);

    this.input = new Input(this.renderer.domElement, {
      active: () => useWorldStore.getState().place === 'bowling',
      grab: (x, y, t) => this.grab(x, y, t),
      move: (x, y, t) => this.drag(x, y, t),
      release: () => this.release(),
      spin: (d) => this.nudgeSpin(d),
      camera: () => this.toggleCamera(),
      mute: () => useGameStore.getState().toggleMute(),
      pause: () => this.togglePause(),
      skip: () => this.skipClip(),
    });

    window.addEventListener('resize', this.resize);
    this.resize();
    net.onGame((from, data) => this.onNet(from, data as BowlMsg));
    this.loop();
  }

  // ------------------------------------------------------------------ public API (UI)
  setTouchSpin(v: number) {
    this.input.setTouchSpin(v);
  }

  /** `seed` (online) makes both sides play on the same lane imperfections. */
  startMatch(seed?: number) {
    const st = useGameStore.getState();
    if (seed === undefined) st.setOnline(null);
    this.monitor.stop();
    st.newMatch();
    this.rolloff = null;
    this.rivalThrows = [];
    this.rivalResults = [];
    this.strikeStreak = st.players.map(() => 0);
    this.physics.setVariation(seed === undefined ? this.rng : createRng(seed)); // every match is played on a slightly different lane
    this.rack.reset();
    this.physics.removeBall();
    this.restX = 0;
    this.beginAim();
    st.setScreen('playing');
  }

  /** Online: look for someone else looking in the room (the lower id hosts and bowls first). */
  seek() {
    audio.unlock();
    useGameStore.getState().setOnline(null);
    useGameStore.getState().setScreen('seek');
    this.seekT = 0;
  }

  private startOnline(rival: string, first: boolean, seed: number) {
    const st = useGameStore.getState();
    st.setLadder(null);
    st.setOnline({ rival, name: net.peers.get(rival)?.name ?? 'Rival', first });
    this.startMatch(seed);
  }

  private send(m: BowlMsg) {
    net.sendGame(m);
  }

  private onNet(from: string, m: BowlMsg) {
    if (!m || typeof m !== 'object') return;
    const st = useGameStore.getState();
    if (m.k === 'bseek' && st.screen === 'seek' && net.id && net.id < from) {
      const seed = (Math.random() * 2 ** 32) >>> 0;
      this.send({ k: 'bstart', to: from, seed });
      this.startOnline(from, true, seed);
      return;
    }
    if (m.k === 'bstart' && m.to === net.id && st.screen === 'seek' && Number.isInteger(m.seed)) {
      this.startOnline(from, false, m.seed >>> 0);
      return;
    }
    if (from !== st.online?.rival || !('to' in m) || m.to !== net.id) return;
    const ok = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
    if (m.k === 'bthrow') {
      const t = m.t;
      if (Array.isArray(t) && t.length === 6 && ok(t[0], -1, 1) && ok(t[1], 0, 4) && ok(t[2], -0.3, 0.3) && ok(t[3], 0, 15) && ok(t[4], -1.5, 1.5) && ok(t[5], 3, 9))
        this.rivalThrows.push({ x: t[0], z: t[1], angle: t[2], speed: t[3], spin: t[4], mass: t[5] });
    } else if (m.k === 'bres') {
      if (Array.isArray(m.standing) && m.standing.length <= 10 && m.standing.every((i) => Number.isInteger(i) && ok(i, 0, 9)))
        this.rivalResults.push([...new Set(m.standing)]);
    } else if (m.k === 'bquit') this.rivalLeft();
  }

  private rivalLeft() {
    const st = useGameStore.getState();
    if (!st.online) return;
    st.setOnline(null);
    if (st.screen === 'playing' || st.screen === 'paused') {
      this.mode = 'idle';
      this.monitor.stop();
      this.physics.removeBall();
      audio.stopRoll();
      st.rivalGone();
    }
  }

  private remoteTurn() {
    const st = useGameStore.getState();
    return !!st.players[st.current]?.remote;
  }

  /** Makes the deck match the pins the rival's side left standing (their physics run decides). */
  private applyRivalResult(standing: number[]) {
    const local = this.physics.standingPins();
    const spots = rackPositions();
    this.physics.removePins(local.filter((i) => !standing.includes(i)));
    const up = standing.filter((i) => !local.includes(i) && this.standingBefore.includes(i));
    if (up.length) this.physics.restorePins(up.map((index) => ({ index, x: spots[index][0], z: spots[index][1] })));
  }

  /** Skips the TV celebration clip. */
  skipClip() {
    if (!this.monitor.playing) return;
    this.monitor.stop();
    this.fanfare = null;
  }

  nudgeSpin(delta: number) {
    if ((this.mode !== 'aim' && this.mode !== 'grab') || this.aiTurn()) return;
    const aim = useGameStore.getState().aim;
    useGameStore.getState().setAim({ spin: clamp(aim.spin + delta, -1, 1) });
  }

  // ------------------------------------------------------------------ drag & throw
  /** Projects a screen point onto the plane the ball rolls on. */
  private floorPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.floor, new THREE.Vector3());
  }

  private grab(clientX: number, clientY: number, time: number): boolean {
    audio.unlock();
    if (this.monitor.playing) {
      this.skipClip();
      return false;
    }
    if (this.mode !== 'aim' || this.paused || useGameStore.getState().screen !== 'playing' || this.aiTurn()) return false;
    const p = this.floorPoint(clientX, clientY);
    if (!p || Math.hypot(p.x - this.held.x, p.z - this.held.z) > 0.5) return false;
    this.grabOffset.copy(this.held).sub(p);
    this.mode = 'grab';
    this.modeTime = 0;
    this.swing.reset();
    this.swing.add(time / 1000, this.held.x, this.held.z);
    useGameStore.getState().setPhase('grab');
    return true;
  }

  private drag(clientX: number, clientY: number, time: number) {
    if (this.mode !== 'grab') return;
    const p = this.floorPoint(clientX, clientY);
    if (!p) return;
    p.add(this.grabOffset);
    const maxX = LANE.width / 2 - BALL.radius * 0.5;
    const x = clamp(p.x, -maxX, maxX);
    if (p.z <= LINE_Z) {
      // Reaching the foul line ends the swing: the ball leaves the hand right there,
      // with the hand's real velocity (the sample is unclamped so speed isn't lost).
      this.swing.add(time / 1000, x, p.z);
      this.held.set(x, BALL.radius, LINE_Z);
      this.release();
      return;
    }
    this.held.set(x, BALL.radius, Math.min(p.z, MAX_BACK_Z));
    this.swing.add(time / 1000, this.held.x, this.held.z);
  }

  private release() {
    if (this.mode !== 'grab') return;
    const r = this.swing.release();
    if (!r || r.forward < MIN_THROW) {
      // Not a throw: the ball is put down where it is.
      this.held.z = Math.max(this.held.z, 0.3);
      this.restX = this.held.x;
      this.mode = 'aim';
      useGameStore.getState().setPhase('aim');
      return;
    }
    const st = useGameStore.getState();
    const g = this.rng;
    // The hand is never perfectly repeatable: a little release noise on top of the stroke.
    const angle = clamp(r.angle * AIM_DAMP, -MAX_ANGLE, MAX_ANGLE) + gaussian(g, 0.003);
    const speed = clamp(r.speed * ARM_GAIN * (1 + gaussian(g, 0.025)), BALL.minSpeed * 0.6, BALL.maxSpeed * 1.1);
    const spin = clamp(st.aim.spin + r.curve * 1.6 + gaussian(g, 0.08), -1.2, 1.2);
    if (st.online) {
      // Rounded before rolling so both sides start from exactly the same numbers.
      const q = (n: number) => Math.round(n * 1e5) / 1e5;
      const t = [q(this.held.x), q(this.held.z), q(angle), q(speed), q(spin), q(st.settings.ballWeight * LB_TO_KG)];
      this.send({ k: 'bthrow', to: st.online.rival, t });
      this.held.x = t[0];
      this.held.z = t[1];
      this.launch(t[2], t[3], t[4], t[5]);
      return;
    }
    this.launch(angle, speed, spin);
  }

  private aiTurn() {
    const st = useGameStore.getState();
    const p = st.players[st.current];
    return p?.ai !== undefined || !!p?.remote;
  }

  /** The computer bowler throws: it only picks a line, the physics does the rest. */
  private aiRelease() {
    const st = useGameStore.getState();
    const t = aiThrow(this.physics.standingPins(), LADDER[st.players[st.current].ai!], this.rng);
    this.held.set(t.x, BALL.radius, LINE_Z);
    this.launch(t.angle, t.speed, t.spin);
  }

  private launch(angle: number, speed: number, spin: number, mass = useGameStore.getState().settings.ballWeight * LB_TO_KG) {
    const st = useGameStore.getState();
    st.setLastThrow({ kmh: speed * 3.6, angleDeg: (angle * 180) / Math.PI, spin });
    this.restX = this.held.x;
    this.physics.resetTilt();
    this.physics.launchBall({ x: this.held.x, z: this.held.z, angle, speed, spin, mass });
    this.mode = 'rolling';
    this.modeTime = 0;
    this.slowTime = 0;
    st.setPhase('rolling');
    st.setCine(true);
    audio.release();
  }

  toggleCamera() {
    const { settings, updateSettings } = useGameStore.getState();
    updateSettings({ camera: settings.camera === 'clasica' ? 'aerea' : 'clasica' });
  }

  togglePause() {
    const st = useGameStore.getState();
    if (st.screen === 'playing') st.setScreen('paused');
    else if (st.screen === 'paused') st.setScreen('playing');
  }

  quitToMenu() {
    const online = useGameStore.getState().online;
    if (online) this.send({ k: 'bquit', to: online.rival });
    useGameStore.getState().setOnline(null);
    this.mode = 'idle';
    this.monitor.stop();
    this.physics.removeBall();
    audio.stopRoll();
    this.rack.reset();
    const st = useGameStore.getState();
    st.clearBanner();
    st.setCine(false);
    st.setScreen('menu');
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.unsub();
    this.input.dispose();
    window.removeEventListener('resize', this.resize);
    this.physics.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ------------------------------------------------------------------ settings
  private applySettings(s: Settings) {
    const q = QUALITY[s.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.alley.applySettings(s, q);
    if (s.ballColor !== this.ballColor) {
      const c = BALL_COLORS[s.ballColor] ?? BALL_COLORS.rubi;
      const mat = this.ball.material as THREE.MeshPhysicalMaterial;
      const next = createBallMesh(c.base, c.swirl);
      mat.map?.dispose();
      mat.dispose();
      this.ball.material = next.material;
      this.ballColor = s.ballColor;
    }
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    audio.setAmbience(s.crowd && this.mode !== 'idle');
  }

  private onScreen(screen: string, prev: string) {
    this.paused = screen === 'paused';
    if (screen === 'playing' && prev === 'paused') this.clock.getDelta();
    if (screen === 'paused' && this.mode === 'grab') {
      this.mode = 'aim';
      this.held.z = Math.max(this.held.z, 0.3);
      useGameStore.getState().setPhase('aim');
    }
    audio.setAmbience(useGameStore.getState().settings.crowd && (screen === 'playing' || screen === 'paused'));
  }

  // ------------------------------------------------------------------ turn flow
  private beginAim() {
    const st = useGameStore.getState();
    this.mode = 'aim';
    this.modeTime = 0;
    this.gutter = false;
    this.standingBefore = this.physics.standingPins();
    this.held.set(this.restX, BALL.radius, REST_Z);
    this.aimCamX = this.restX;
    st.setPhase('aim');
    st.setCine(false);
  }

  private scoreRoll(foul: boolean) {
    const st = useGameStore.getState();
    const player = st.current;
    if (this.rolloff) {
      const knocked = foul ? 0 : this.standingBefore.length - this.physics.standingPins().length;
      this.rolloff.push(knocked);
      st.setCine(false);
      this.lastFoul = false;
      st.showBanner({ title: `${knocked} ${knocked === 1 ? 'bolo' : 'bolos'}`, sub: `Desempate · ${st.players[player].name}`, kind: knocked === 10 ? 'strike' : 'count' });
      this.resultWait = 1.7;
      return;
    }
    const before = st.players[player].rolls;
    const state = turnState(before);
    const standingAfter = this.physics.standingPins();
    const knocked = foul ? 0 : this.standingBefore.length - standingAfter.length;
    st.addRoll(player, { pins: knocked, foul: foul || undefined });

    const strike = !foul && state.freshRack && knocked === 10;
    this.strikeStreak[player] = strike ? (this.strikeStreak[player] ?? 0) + 1 : 0;
    const outcome = describeRoll({
      knocked,
      freshRack: state.freshRack,
      standingAfter,
      foul,
      gutter: this.gutter,
      streak: this.strikeStreak[player],
      frame: state.frame,
    });
    const wobbled = foul ? [] : this.physics.wobblers();
    const sub =
      wobbled.length && outcome.kind !== 'gutter'
        ? wobbled.length === 1
          ? `¡El ${wobbled[0] + 1} se tambaleó y aguantó!`
          : `¡${wobbled.map((i) => i + 1).join('-')} se tambalearon y aguantaron!`
        : outcome.sub;
    const crowd = st.settings.crowd;
    st.setCine(false);
    this.lastFoul = foul;
    if (outcome.kind === 'strike' || outcome.kind === 'spare') {
      // Like a real alley: the overhead TV plays a celebration clip.
      const kind = outcome.kind;
      this.monitor.play(kind, outcome.title, sub, this.standingBefore);
      this.fanfare = () => (kind === 'strike' ? audio.strike(crowd) : audio.spare(crowd));
      st.setTv(true);
      this.resultWait = 0.25;
    } else {
      st.showBanner({ title: outcome.title, sub, kind: outcome.kind });
      this.resultWait = 1.7;
    }
  }

  private afterRoll(foul: boolean) {
    const st = useGameStore.getState();
    st.clearBanner();
    st.setTv(false);
    this.physics.removeBall();
    const prevPlayer = st.current;
    const next = nextPlayer(st.players);
    if (next === -1) {
      const tieBreak = this.rollOffStep();
      if (tieBreak === 'done') return;
      if (tieBreak !== null) {
        // Roll-off continues: next bowler gets a full rack.
        this.mode = 'sweep';
        audio.sweep();
        this.rack.cycle(true, () => {
          st.setCurrent(tieBreak);
          this.beginAim();
        });
        return;
      }
      this.mode = 'idle';
      st.finishMatch();
      return;
    }
    const ts = turnState(st.players[next].rolls);
    // A foul on the first ball respots the pins; a change of bowler always gets a full rack.
    const fresh = ts.freshRack || next !== prevPlayer || foul;
    this.mode = 'sweep';
    audio.sweep();
    this.rack.cycle(fresh, () => {
      st.setCurrent(next);
      this.beginAim();
    });
  }

  /**
   * Tied game against the AI → one ball each at a full rack, repeated while tied.
   * Returns who bowls next in the roll-off, 'done' once it is decided, or null if there is none.
   */
  private rollOffStep(): number | 'done' | null {
    const st = useGameStore.getState();
    const [a, b] = st.players.map((p) => currentScore(p.rolls));
    if ((st.ladder === null && !st.online) || st.players.length !== 2 || a !== b) return null;
    if (!this.rolloff || this.rolloff.length === 2) {
      if (this.rolloff && this.rolloff[0] !== this.rolloff[1]) {
        const winner = this.rolloff[0] > this.rolloff[1] ? 0 : 1;
        this.rolloff = null;
        this.mode = 'idle';
        st.finishMatch(winner);
        return 'done';
      }
      if (!this.rolloff) st.showBanner({ title: '¡EMPATE!', sub: 'Desempate: una bola cada uno, gana quien tire más bolos', kind: 'split' });
      this.rolloff = [];
      return 0;
    }
    return 1;
  }

  // ------------------------------------------------------------------ loop
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (useWorldStore.getState().place !== 'bowling') return void this.clock.getDelta(); // the hall owns the screen
    this.frame(Math.min(this.clock.getDelta(), 0.1));
  };

  /** One update + render step (also driven by hand in browser tests, where rAF may be throttled). */
  frame(dt: number) {
    if (!this.paused) this.update(dt);
    this.render(dt);
  }

  private update(dt: number) {
    this.time += dt;
    this.modeTime += dt;
    const st = useGameStore.getState();
    if (st.screen === 'seek' && (this.seekT -= dt) <= 0) {
      this.seekT = 1;
      this.send({ k: 'bseek' });
    }
    if (st.online && net.id && !net.peers.has(st.online.rival)) this.rivalLeft();

    if (this.mode === 'aim' || this.mode === 'grab') {
      this.input.poll();
      if (this.input.spinHeld) this.nudgeSpin(this.input.spinHeld * SPIN_RATE * dt);
      if (this.mode === 'aim' && this.remoteTurn()) {
        const t = this.modeTime > 0.3 ? this.rivalThrows.shift() : undefined;
        if (t) {
          this.held.set(t.x, BALL.radius, t.z ?? LINE_Z);
          this.launch(t.angle, t.speed, t.spin, t.mass);
        }
      } else if (this.mode === 'aim' && this.aiTurn() && this.modeTime > AI_THINK) this.aiRelease();
    }

    if (this.mode === 'rolling' || this.mode === 'settling') {
      this.physics.step(dt, (e) => audio.impact(e.kind, e.force));
      const pose = this.physics.ballPose();
      const vel = this.physics.ballVelocity();
      if (pose && vel) {
        const speed = Math.hypot(vel.x, vel.z);
        const p = pose.position;
        if (p.z > HEAD_PIN_Z + 0.3 && Math.abs(p.x) > LANE.width / 2 + 0.01 && !this.gutter) {
          this.gutter = true;
          audio.gutter();
        }
        audio.updateRoll(p.y > -0.05 ? speed : 0, Math.abs(p.z - this.camera.position.z));
        if (this.mode === 'rolling') {
          this.slowTime = speed < 0.15 ? this.slowTime + dt : 0;
          if (p.z < PIT_Z - 0.2 || p.y < -0.15 || this.slowTime > 0.6 || this.modeTime > 10) {
            this.mode = 'settling';
            this.modeTime = 0;
            this.restTime = 0;
            st.setPhase('settling');
            audio.stopRoll();
          }
        }
      }
      if (this.mode === 'settling') {
        this.restTime = this.physics.pinsAtRest() ? this.restTime + dt : 0;
        if ((this.restTime > 0.5 && this.modeTime > 1.2) || this.modeTime > 5) {
          // Online, the bowler's side decides what fell: the rival's result is awaited and applied.
          const online = st.online;
          const remote = !!online && this.remoteTurn();
          const res = remote ? this.rivalResults.shift() : undefined;
          if (remote && !res) {
            if (this.modeTime > RIVAL_WAIT) this.rivalLeft();
          } else {
            if (res) this.applyRivalResult(res);
            else if (online) this.send({ k: 'bres', to: online.rival, standing: this.physics.standingPins() });
            this.mode = 'result';
            this.modeTime = 0;
            this.scoreRoll(false);
          }
        }
      }
    }

    if (this.mode === 'result') {
      if (!this.monitor.playing) {
        if (st.tv) st.setTv(false);
        this.resultWait -= dt;
        if (this.resultWait <= 0) this.afterRoll(this.lastFoul);
      }
    }
    this.monitor.update(dt);
    const p = st.players[st.current];
    if (p) this.monitor.showIdle(p.name, currentScore(p.rolls), Math.min(turnState(p.rolls).frame + 1, 10));

    this.rack.update(dt);
    this.rack.sync();
  }

  private render(dt: number) {
    const st = useGameStore.getState();
    const pose = this.physics.ballPose();

    // Ball mesh: physics pose once thrown, otherwise in the bowler's hand.
    const inHand = this.mode === 'aim' || this.mode === 'grab';
    this.ball.visible = inHand || !!pose;
    if (pose && !inHand) {
      this.ball.position.set(pose.position.x, pose.position.y, pose.position.z);
      this.ball.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
    } else if (inHand) {
      this.ball.position.lerp(this.held, this.mode === 'grab' ? 1 : damp(10, dt));
      this.ball.rotation.set(0, 0, this.time * st.aim.spin * 2);
    }

    this.updateCamera(dt, pose?.position);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(dt: number, ball?: { x: number; y: number; z: number }) {
    const st = useGameStore.getState();
    const aerial = st.settings.camera === 'aerea';
    const aimX = this.aimCamX;
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    const deckView = () => {
      pos.set(0, aerial ? 2.6 : 0.95, HEAD_PIN_Z + (aerial ? 2.2 : 3.1));
      look.set(0, 0.15, HEAD_PIN_Z - 0.45);
    };

    if (this.monitor.playing) {
      pos.copy(this.monitor.viewPos);
      look.copy(this.monitor.viewTarget);
    } else if (this.mode === 'idle' || st.screen === 'menu' || st.screen === 'setup' || st.screen === 'loading') {
      const t = this.time * 0.12;
      pos.set(Math.sin(t) * 1.3, 1.5 + Math.sin(t * 0.7) * 0.2, 3.2);
      look.set(0, 0.3, -12);
    } else if (this.mode === 'aim' || this.mode === 'grab') {
      // Fixed while aiming so the drag maps consistently onto the lane.
      if (aerial) {
        pos.set(aimX * 0.4, 3.6, REST_Z + 3.2);
        look.set(0, 0, -8);
      } else {
        pos.set(aimX * 0.5, 1.45, REST_Z + 2.7);
        look.set(aimX * 0.2, 0, -11);
      }
    } else if (this.mode === 'rolling' && ball) {
      const z = Math.max(ball.z + (aerial ? 3.2 : 2.6), HEAD_PIN_Z + 3.1);
      pos.set(ball.x * 0.6, aerial ? 2.8 : 0.85 + Math.max(0, (z - HEAD_PIN_Z) * 0.02), z);
      look.set(ball.x * 0.4, 0.15, Math.min(ball.z - 6, HEAD_PIN_Z - 0.45));
    } else deckView();

    const k = damp(this.mode === 'rolling' || this.monitor.playing ? 5 : 3, dt);
    this.camera.position.lerp(pos, k);
    this.camTarget.copy(look);
    this.camLook.lerp(this.camTarget, k);
    this.camera.lookAt(this.camLook);
  }

  private resize = () => {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 72 : 50;
    this.camera.updateProjectionMatrix();
  };
}
