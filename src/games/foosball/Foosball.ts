import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { audio } from '../../audio/AudioEngine';
import { QUALITY } from '../../config/settings';
import { useGameStore } from '../bowling/store/useGameStore';
import { buildLounge } from '../../world3d/lounge';
import { darkWood, foosballPitch } from '../../world3d/textures';
import { useWorldStore } from '../../world/worldStore';
import { aiControl, AI_LEVELS, BALL_R, GOAL, GOALS_TO_WIN, L, Table, W } from './physics';
import { useFoosStore } from './store';

const FIELD_Y = 0.8;
const ROD_Y = 0.9;
const HAND_SPEED = 2.2; // m/s the player's rods can slide

const std = (color: THREE.ColorRepresentation, roughness = 0.5, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/**
 * Foosball against the AI. The player has the red team at the near end (camera behind the
 * red goal) and attacks away from the camera. Move the mouse / finger sideways to slide all
 * your rods at once, click / tap or Space to kick. Physics x maps to scene -z, z to scene x.
 */
export class Foosball {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 30);
  private readonly ray = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ROD_Y);
  table = new Table();
  private rods: THREE.Group[] = [];
  private ball!: THREE.Mesh;
  /** Where the player wants the rods, -1…1 across the table. */
  aim = 0;
  private keys = { l: false, r: false };
  private pause = 0;
  /** The AI reacts to where the ball was a moment ago. */
  private seen: { t: number; x: number; z: number }[] = [];
  private time = 0;
  private bannerN = 0;
  private lastVx = 0;
  private raf = 0;
  private last = performance.now();

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
    this.build();

    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      this.point(e);
      if (this.live()) this.kickAll();
    });
    el.addEventListener('pointermove', (e) => this.point(e));
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.loop();
  }

  private build() {
    this.scene.add(buildLounge({ w: 6, d: 6, back: -3.5, lamps: [[0, 0]] }));
    const lamp = new THREE.PointLight(0xffe2b0, 6, 4, 1.5);
    lamp.position.set(0, 2.1, 0);
    lamp.castShadow = true;
    this.scene.add(lamp);
    const wood = new THREE.MeshStandardMaterial({ map: darkWood(), roughness: 0.45 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };
    // Cabinet: body under the field, side walls, and end walls around the goal mouths.
    add(new THREE.BoxGeometry(W + 0.12, 0.3, L + 0.12), wood, 0, FIELD_Y - 0.15, 0);
    const field = add(new THREE.PlaneGeometry(L, W), new THREE.MeshStandardMaterial({ map: foosballPitch(), roughness: 0.85 }), 0, FIELD_Y + 0.001, 0);
    field.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    const side = (W - GOAL) / 2;
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.06, 0.2, L + 0.12), wood, s * (W / 2 + 0.03), FIELD_Y + 0.1, 0);
      for (const k of [-1, 1]) add(new THREE.BoxGeometry(side, 0.2, 0.06), wood, k * (GOAL / 2 + side / 2), FIELD_Y + 0.1, s * (L / 2 + 0.03));
      add(new THREE.BoxGeometry(GOAL, 0.12, 0.06), wood, 0, FIELD_Y + 0.14, s * (L / 2 + 0.03));
      add(new THREE.BoxGeometry(GOAL, 0.08, 0.05), std(0x111111, 0.9), 0, FIELD_Y + 0.04, s * (L / 2 + 0.08));
    }
    for (const lx of [-1, 1]) for (const lz of [-1, 1]) add(new THREE.BoxGeometry(0.09, FIELD_Y - 0.3, 0.09), wood, lx * (W / 2 - 0.02), (FIELD_Y - 0.3) / 2, lz * (L / 2 - 0.05));

    const chrome = std(0xc9d2e0, 0.2, 0.9);
    const skin = std(0xf1c7a5, 0.6);
    const teams = [std(0xc4301c, 0.4), std(0x1d4fc4, 0.4)];
    const rodGeo = new THREE.CylinderGeometry(0.008, 0.008, W + 0.7, 10);
    for (const r of this.table.rods) {
      const g = new THREE.Group();
      g.position.set(0, ROD_Y, -r.x);
      const rod = new THREE.Mesh(rodGeo, chrome);
      rod.rotation.z = Math.PI / 2;
      g.add(rod);
      // Handle on the owner's side of the table.
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 12), std(0x15151a, 0.6));
      h.rotation.z = Math.PI / 2;
      h.position.x = (r.team ? -1 : 1) * (W / 2 + 0.36);
      g.add(h);
      for (const z0 of r.base) {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.075, 0.022), teams[r.team]);
        body.position.set(z0, -0.035, 0);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 10), skin);
        head.position.set(z0, 0.02, 0);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.026), std(0x222222, 0.6));
        foot.position.set(z0, -0.08, 0);
        for (const m of [body, head, foot]) {
          m.castShadow = true;
          g.add(m);
        }
      }
      this.scene.add(g);
      this.rods.push(g);
    }
    this.ball = add(new THREE.SphereGeometry(BALL_R, 20, 14), std(0xf4f1e8, 0.35), 0, FIELD_Y + BALL_R, 0);
  }

  private live() {
    return useWorldStore.getState().place === 'foosball' && useFoosStore.getState().screen === 'playing';
  }

  private point(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const p = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(this.plane, p)) this.aim = Math.min(1, Math.max(-1, p.x / (W / 2 - 0.05)));
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.live()) return;
    const down = e.type === 'keydown';
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.keys.l = down;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.keys.r = down;
    else if (e.code === 'Space' && down) this.kickAll();
    else return;
    e.preventDefault();
  };

  kickAll() {
    for (const r of this.table.rods) if (r.team === 0) this.table.kick(r);
  }

  start(level = useFoosStore.getState().level) {
    this.table = new Table();
    this.table.serve();
    this.pause = 1;
    this.aim = 0;
    this.seen = [];
    useFoosStore.getState().set({ screen: 'playing', level, score: [0, 0], banner: { text: '¡A jugar!', mine: true, n: ++this.bannerN } });
    audio.hockeyBuzzer('start');
  }

  quit() {
    useFoosStore.getState().set({ screen: 'menu', banner: null });
  }

  private resize = () => {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Portrait: widen the view so the whole table width stays on screen.
    this.camera.fov = Math.max(50, (2 * Math.atan(Math.tan((24 * Math.PI) / 180) / this.camera.aspect) * 180) / Math.PI);
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 2.0, 1.15);
    this.camera.lookAt(0, FIELD_Y, -0.12);
  };

  /** One simulation + render step (exposed for browser testing). */
  frame(dt: number) {
    const st = useFoosStore.getState();
    const t = this.table;
    if (st.screen === 'playing') {
      this.time += dt;
      if (this.keys.l !== this.keys.r) this.aim = Math.min(1, Math.max(-1, this.aim + (this.keys.r ? 2.5 : -2.5) * dt));
      for (const r of t.rods) if (r.team === 0) t.drive(r, this.aim * r.range, HAND_SPEED, dt);
      this.seen.push({ t: this.time, x: t.ball.x, z: t.ball.z });
      while (this.seen.length > 1 && this.seen[1].t <= this.time - AI_LEVELS[st.level].react) this.seen.shift();
      aiControl(t, 1, st.level, dt, this.seen[0]);
      if (this.pause > 0) this.pause -= dt;
      else {
        t.step(dt);
        // The ball turning round along the table is a hit: tick.
        if (Math.sign(t.ball.vx) !== Math.sign(this.lastVx) && Math.abs(t.ball.vx) > 0.3) audio.hockeyHit('mallet', Math.abs(t.ball.vx));
        this.lastVx = t.ball.vx;
        if (t.goal !== null) this.scored(t.goal);
      }
    }
    t.rods.forEach((r, i) => {
      this.rods[i].position.x = r.slide;
      this.rods[i].rotation.x = r.angle;
    });
    const b = t.ball;
    this.ball.position.set(b.z, FIELD_Y + BALL_R, -b.x);
    this.ball.rotation.x -= (b.vx * dt) / BALL_R;
    this.ball.rotation.z -= (b.vz * dt) / BALL_R;
    this.renderer.render(this.scene, this.camera);
  }

  private scored(team: 0 | 1) {
    const t = this.table;
    const st = useFoosStore.getState();
    const mine = team === 0;
    audio.hockeyGoal(mine);
    st.set({ score: [t.score[0], t.score[1]], banner: { text: mine ? '¡GOL!' : 'Gol de la IA', mine, n: ++this.bannerN } });
    if (t.score[team] >= GOALS_TO_WIN) {
      audio.hockeyBuzzer(mine ? 'win' : 'lose');
      this.pause = 99;
      t.goal = null;
      t.ball = { x: 0, z: 0, vx: 0, vz: 0 };
      window.setTimeout(() => st.set({ screen: 'end', result: mine ? `¡Ganas ${t.score[0]}–${t.score[1]}!` : `Gana la IA ${t.score[1]}–${t.score[0]}`, banner: null }), 1200);
      return;
    }
    this.pause = 1.2;
    t.serve();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (useWorldStore.getState().place === 'foosball') this.frame(dt);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    this.renderer.dispose();
  }
}
