import * as THREE from 'three';
import { HEAD_PIN_Z, rackPositions } from '../config/constants';
import { createBallMesh, createPinMesh } from '../scene/pinMesh';
import { laneWoodTexture } from '../scene/textures';
import { box, type Box } from '../world/collide';
import * as P from './props';
import { HOCKEY_TABLES } from './activities';
import { arcadeCarpet, lightPool, tiles, wallPanels } from './textures';

/** Hall footprint: x ∈ [-HX, HX], z ∈ [-HZ, HZ]. */
export const HX = 16;
export const HZ = 14;
const H = 5;
const T = 0.4; // wall thickness

export const SPAWN = { x: 5.5, z: 11.2, yaw: Math.PI };

const std = (color: THREE.ColorRepresentation, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const glow = (color: THREE.ColorRepresentation, i = 2) => new THREE.MeshStandardMaterial({ color: 0, emissive: color, emissiveIntensity: i, toneMapped: false });

/**
 * The arcade hall: building shell, the seven zones, lights and signage.
 * Exposes the collision boxes (for the player) and the occluders (for the camera).
 */
export class Hall {
  readonly group = new THREE.Group();
  readonly colliders: Box[] = [];
  readonly occluders: THREE.Object3D[] = [];

  constructor() {
    this.shell();
    this.bowling();
    this.billiards();
    this.airHockey();
    this.foosball();
    this.darts();
    this.arcade();
    this.lounge();
    this.bar();
    this.entrance();
    this.lights();
  }

  /** Places an object and blocks a floor footprint for the player. */
  private put(o: THREE.Object3D, x: number, z: number, rotY = 0, block?: [number, number]) {
    o.position.set(x, o.position.y, z);
    o.rotation.y = rotY;
    this.group.add(o);
    if (block) {
      const [w, d] = Math.abs(Math.sin(rotY)) > 0.5 ? [block[1], block[0]] : block;
      this.colliders.push(box(x, z, w, d));
    }
    return o;
  }

  private sign(text: string, color: string, h: number, x: number, y: number, z: number, rotY: number, light = true) {
    const s = P.neonSign(text, color, h);
    s.position.set(x, y, z);
    s.rotation.y = rotY;
    this.group.add(s);
    if (light) {
      const l = new THREE.PointLight(color, 6, 7, 1.6);
      l.position.set(x + Math.sin(rotY) * 0.8, y - 0.4, z + Math.cos(rotY) * 0.8);
      this.group.add(l);
    }
  }

  private shell() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX, 2 * HZ), new THREE.MeshStandardMaterial({ map: arcadeCarpet([14, 12]), roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ map: wallPanels([12, 2]), roughness: 0.85 });
    const walls: Array<[number, number, number, number]> = [
      [0, -HZ - T / 2, 2 * HX + 2 * T, T],
      [0, HZ + T / 2, 2 * HX + 2 * T, T],
      [-HX - T / 2, 0, T, 2 * HZ],
      [HX + T / 2, 0, T, 2 * HZ],
    ];
    for (const [x, z, w, d] of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat);
      m.position.set(x, H / 2, z);
      this.group.add(m);
      this.occluders.push(m);
      this.colliders.push(box(x, z, w, d));
    }
    // LED strips along the base and top of every wall.
    const strip = (len: number, color: number, x: number, y: number, z: number, rotY: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.03), glow(color, 2.5));
      m.position.set(x, y, z);
      m.rotation.y = rotY;
      this.group.add(m);
    };
    for (const [y, c] of [[0.08, 0x4fb6ff], [H - 0.35, 0xb06bff]] as const) {
      strip(2 * HX, c, 0, y, -HZ + 0.02, 0);
      strip(2 * HX, c, 0, y, HZ - 0.02, 0);
      strip(2 * HZ, c, -HX + 0.02, y, 0, Math.PI / 2);
      strip(2 * HZ, c, HX - 0.02, y, 0, Math.PI / 2);
    }

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX, 2 * HZ), std(0x070912, 1));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = H;
    this.group.add(ceiling);
    // Ceiling light panels.
    const panel = new THREE.BoxGeometry(2.4, 0.05, 0.5);
    for (let x = -12; x <= 12; x += 6)
      for (let z = -10; z <= 10; z += 5) {
        const p = new THREE.Mesh(panel, glow(0xdfe8ff, 0.9));
        p.position.set(x, H - 0.03, z);
        this.group.add(p);
      }

    // Structural pillars wrapped in LED rings.
    for (const [x, z] of [[-4, -3], [4, -3], [-4, 6.5], [4, 6.5]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, H, 0.6), std(0x1a1f33, 0.5, 0.3));
      p.position.set(x, H / 2, z);
      this.group.add(p);
      this.occluders.push(p);
      this.colliders.push(box(x, z, 0.6, 0.6));
      for (const y of [0.9, 2.6, 4.2]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.05, 0.64), glow(0xd8f24a, 1.8));
        r.position.set(x, y, z);
        this.group.add(r);
      }
    }
    this.sign('VIRTUAL ARCADE', '#d8f24a', 0.9, 0, 3.9, -HZ + 0.05, 0, true);
  }

  /** Three short lanes into the north wall; the real simulator opens from here. */
  private bowling() {
    const woodTex = laneWoodTexture('clara', 8);
    woodTex.wrapT = THREE.RepeatWrapping;
    woodTex.repeat.set(1, 3);
    const laneMat = new THREE.MeshPhysicalMaterial({ map: woodTex, roughness: 0.25, clearcoat: 0.8 });
    const z0 = -6.4;
    const z1 = -HZ;
    const len = z0 - z1;
    for (const [i, x] of [-12, -10, -8].entries()) {
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(1.05, len), laneMat);
      lane.rotation.x = -Math.PI / 2;
      lane.position.set(x, 0.012, (z0 + z1) / 2);
      this.group.add(lane);
      for (const s of [-1, 1]) {
        const gutter = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 12, 1, true, 0, Math.PI), std(0x9aa3b5, 0.3, 0.8));
        gutter.rotation.x = Math.PI / 2;
        gutter.rotation.y = Math.PI;
        gutter.position.set(x + s * 0.65, 0.12, (z0 + z1) / 2);
        this.group.add(gutter);
      }
      // Pin deck: the same pins as the simulator, rack shifted to the end of this short lane.
      for (const [px, pz] of rackPositions()) {
        const pin = createPinMesh();
        pin.position.set(x + px, 0.012, -HZ + 1.6 + (pz - HEAD_PIN_Z));
        this.group.add(pin);
      }
      const mask = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 0.1), std(0x0b1226, 0.6));
      mask.position.set(x, 1.6, -HZ + 2.6);
      this.group.add(mask);
      this.sign(String(i + 1), '#d8f24a', 0.5, x, 1.6, -HZ + 2.66, 0, false);
      const spot = new THREE.SpotLight(0xffffff, 18, 6, 0.6, 0.5);
      spot.position.set(x, 3, -HZ + 3.5);
      spot.target.position.set(x, 0, -HZ + 1.2);
      this.group.add(spot, spot.target);
      // Ball return with a couple of balls.
      const ret = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.9), std(0x1b2a4a, 0.4, 0.5));
      ret.position.set(x + 1, 0.35, -5.4);
      if (i < 2) {
        this.group.add(ret);
        this.colliders.push(box(x + 1, -5.4, 0.4, 0.9));
        ['#b3122e', '#123d9e'].forEach((c, k) => {
          const b = createBallMesh(c, '#ffffff');
          b.position.set(x + 1, 0.81, -5.65 + k * 0.4);
          this.group.add(b);
        });
      }
    }
    // Dividers between lanes and the playing area.
    this.colliders.push(box(-10, (z0 + z1) / 2, 6.4, len));
    const approach = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.6), laneMat);
    approach.rotation.x = -Math.PI / 2;
    approach.position.set(-10, 0.011, z0 + 1.3);
    this.group.add(approach);
    const foul = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.005, 0.03), glow(0xff3b3b, 1.5));
    foul.position.set(-10, 0.015, z0);
    this.group.add(foul);
    this.put(P.bench(0x1d4fc4), -11.5, -2.6, Math.PI, [1.8, 0.5]);
    this.put(P.bench(0x1d4fc4), -8.5, -2.6, Math.PI, [1.8, 0.5]);
    this.sign('BOWLING', '#d8f24a', 1, -10, 3.6, -HZ + 0.06, 0);
  }

  private billiards() {
    for (const x of [7.5, 12.5]) {
      this.put(P.poolTable(), x, -10.6, 0, [2.9, 1.6]);
      const lamp = P.poolLamp();
      lamp.position.set(x, 2.35, -10.6);
      this.group.add(lamp);
      const l = new THREE.PointLight(0xfff0c8, 8, 4, 1.5);
      l.position.set(x, 2.1, -10.6);
      this.group.add(l);
    }
    // Cue rack on the wall.
    const rack = new THREE.Group();
    rack.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.1), std(0x4a2a17)));
    for (let i = 0; i < 6; i++) {
      const cue = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.015, 1.45, 8), std(0xd9b27a, 0.4));
      cue.position.set(-0.5 + i * 0.2, 0.62, 0.06);
      rack.add(cue);
    }
    rack.position.set(10, 0.4, -HZ + 0.1);
    this.group.add(rack);
    this.sign('BILLAR', '#4fb6ff', 0.8, 10, 3.6, -HZ + 0.06, 0);
    this.floorGlow('#4fb6ff', 10, -10, 7);
  }

  private airHockey() {
    HOCKEY_TABLES.forEach((t, i) => this.put(P.airHockeyTable(i ? 0x3a8bff : 0xff3355), t.x, t.z, 0, [2.2, 1.15]));
    this.sign('AIR HOCKEY', '#ff4f6e', 0.6, HX - 0.06, 3.4, 2.2, -Math.PI / 2);
    this.floorGlow('#ff4f6e', 13.5, 2.2, 6);
  }

  private foosball() {
    this.put(P.foosballTable(), -1.6, 0, 0, [1.4, 1.3]);
    this.put(P.foosballTable(), 2.6, 0, 0, [1.4, 1.3]);
    const l = new THREE.PointLight(0x7dffb0, 6, 6, 1.5);
    l.position.set(0.5, 3, 0);
    this.group.add(l);
    const hang = P.neonSign('FUTBOLÍN', '#7dffb0', 0.5);
    hang.position.set(0.5, 3.2, -0.2);
    this.group.add(hang);
    const back = hang.clone();
    back.rotation.y = Math.PI;
    this.group.add(back);
    this.floorGlow('#7dffb0', 0.5, 0.4, 6);
  }

  private darts() {
    [0, 2.5, 5].forEach((z, i) => {
      this.put(P.dartCabinet([0xffb84f, 0xff4fd8, 0x4fb6ff][i]), -HX + 0.07, z, Math.PI / 2);
      const oche = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.6), glow(0xffb84f, 1.5));
      oche.position.set(-HX + 2.37, 0.01, z);
      this.group.add(oche);
    });
    // High tables for the dart players.
    for (const z of [1.25, 3.75]) {
      const t = new THREE.Group();
      t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 24), std(0x1b2233, 0.3, 0.5)).translateY(1.05));
      t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.05, 10), std(0xc9d2e0, 0.2, 0.9)).translateY(0.52));
      t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 20), std(0xc9d2e0, 0.2, 0.9)));
      this.put(t, -11.4, z, 0, [0.7, 0.7]);
    }
    this.sign('DARDOS', '#ffb84f', 0.7, -HX + 0.06, 3.3, 2.5, Math.PI / 2);
    this.floorGlow('#ffb84f', -13, 2.5, 6);
  }

  private arcade() {
    const games: Array<[number, string]> = [[300, 'PINBALL'], [190, 'RACER'], [20, 'INVADERS'], [120, 'BLOCKS']];
    games.forEach(([hue, title], i) => this.put(P.arcadeCabinet(i + 3, hue, title), HX - 0.45, 8.6 + i * 1.0, -Math.PI / 2, [0.8, 0.75]));
    games.slice(0, 2).forEach(([hue, title], i) => this.put(P.arcadeCabinet(i + 9, (hue + 60) % 360, title), 10.2 + i * 1.0, HZ - 0.45, Math.PI, [0.75, 0.8]));
    this.sign('ARCADE', '#b06bff', 0.8, HX - 0.06, 3.3, 10.1, -Math.PI / 2);
    this.floorGlow('#b06bff', 12.8, 10.6, 6);
  }

  private lounge() {
    this.put(P.sofa(0x3b2a6b), -12.5, 12.9, Math.PI, [2, 0.85]);
    this.put(P.sofa(0x3b2a6b), -15.1, 10, Math.PI / 2, [2, 0.85]);
    this.put(P.coffeeTable(), -12.6, 10.5, 0, [1, 1]);
    for (const [x, z] of [[-15.2, 13.2], [-9.8, 13.2], [-15.2, -2.2], [7.8, 13.2], [15.2, -2.6]]) this.put(P.plant(), x, z, 0, [0.5, 0.5]);
    this.sign('CHILL ZONE', '#7dffd9', 0.5, -12.5, 3.2, HZ - 0.06, Math.PI, false);
    const l = new THREE.PointLight(0x7dffd9, 5, 6, 1.5);
    l.position.set(-12.5, 2.6, 11);
    this.group.add(l);
  }

  private bar() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 5), new THREE.MeshStandardMaterial({ map: tiles([7, 5]), roughness: 0.25, metalness: 0.1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(-4.5, 0.008, 11.5);
    this.group.add(floor);
    this.put(P.barCounter(4.6), -4.5, 11.4, Math.PI, [4.7, 0.8]);
    this.put(P.backBar(4.6), -4.5, HZ - 0.2, Math.PI, [4.6, 0.4]);
    for (let i = 0; i < 5; i++) this.put(P.barStool(), -6.4 + i * 0.95, 10.5, 0, [0.4, 0.4]);
    this.sign('BAR', '#ff4fd8', 0.8, -4.5, 3.4, HZ - 0.06, Math.PI);
  }

  private entrance() {
    // Glass doors with a lit frame in the south wall.
    const x = 5.5;
    const frame = glow(0xd8f24a, 2);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.08), frame);
      post.position.set(x + s * 1.3, 1.3, HZ - 0.05);
      this.group.add(post);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.68, 0.08, 0.08), frame);
    top.position.set(x, 2.6, HZ - 0.05);
    this.group.add(top);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.55), new THREE.MeshStandardMaterial({ color: 0x1b3f73, emissive: 0x0d2347, roughness: 0.1, metalness: 0.6 }));
    door.position.set(x, 1.28, HZ - 0.02);
    door.rotation.y = Math.PI;
    this.group.add(door);
    this.sign('ENTRADA', '#d8f24a', 0.35, x, 3, HZ - 0.06, Math.PI, false);
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.4), std(0x111422, 1));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(x, 0.006, HZ - 0.8);
    this.group.add(mat);
  }

  private floorGlow(color: string, x: number, z: number, size: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: lightPool(color), transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    this.group.add(m);
  }

  private lights() {
    this.group.add(new THREE.HemisphereLight(0x9fb8ff, 0x1a1030, 0.9));
    this.group.add(new THREE.AmbientLight(0x404a70, 0.6));
    for (const [x, z] of [[-8, 6], [6, 6], [0, -8], [-10, -1]]) {
      const l = new THREE.PointLight(0xdfe8ff, 14, 14, 1.4);
      l.position.set(x, 4.4, z);
      this.group.add(l);
    }
  }
}
