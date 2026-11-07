import * as THREE from 'three';
import { HEAD_PIN_Z, rackPositions } from '../games/bowling/constants';
import { createBallMesh, createPinMesh } from '../games/bowling/scene/pinMesh';
import { laneWoodTexture } from '../games/bowling/scene/textures';
import { box, type Box } from '../world/collide';
import * as P from './props';
import { HOCKEY_TABLES } from './activities';
import { brick, darkWood, plaster, wainscot, woodFloor } from './textures';

/** Hall footprint: x ∈ [-HX, HX], z ∈ [-HZ, HZ]. */
export const HX = 16;
export const HZ = 14;
export const H = 4.2; // ceiling height
const T = 0.4; // wall thickness
const WAINSCOT = 1.1; // height of the wood panelling

export const SPAWN = { x: 5.5, z: 11.2, yaw: Math.PI };

const std = (color: THREE.ColorRepresentation, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const WARM = 0xffcf96;

/**
 * The games hall: a warm, lived-in games lounge (wood, plaster, brick, lamps and rugs)
 * with the seven play zones. Exposes the collision boxes (for the player) and the
 * occluders (for the camera).
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
    this.decor();
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

  /** Painted wooden signboard on a wall or hanging. */
  private sign(text: string, h: number, x: number, y: number, z: number, rotY: number) {
    const s = P.woodSign(text, h);
    s.position.set(x, y, z);
    s.rotation.y = rotY;
    this.group.add(s);
    return s;
  }

  /** Something hung on a wall: the wall at x = ±HX or z = ±HZ, facing into the room. */
  private onWall(o: THREE.Object3D, wall: 'n' | 's' | 'e' | 'w', along: number, y: number) {
    const inset = 0.03;
    if (wall === 'n') this.put(o, along, -HZ + inset, 0);
    if (wall === 's') this.put(o, along, HZ - inset, Math.PI);
    if (wall === 'w') this.put(o, -HX + inset, along, Math.PI / 2);
    if (wall === 'e') this.put(o, HX - inset, along, -Math.PI / 2);
    o.position.y = y;
  }

  private shell() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX, 2 * HZ), new THREE.MeshStandardMaterial({ map: woodFloor([20, 17.5]), roughness: 0.5, color: 0xd8ccc0 }));
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ map: plaster([8, 1.2]), roughness: 0.95 });
    const panelMat = new THREE.MeshStandardMaterial({ map: wainscot([24, 1]), roughness: 0.6 });
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
      // Wood panelling on the inner face, with a moulded rail on top.
      const p = new THREE.Mesh(new THREE.BoxGeometry(w > d ? w : 0.04, WAINSCOT, w > d ? 0.04 : d), panelMat);
      const inward = (v: number) => v - Math.sign(v) * (T / 2 + 0.02);
      p.position.set(w > d ? x : inward(x), WAINSCOT / 2, w > d ? inward(z) : z);
      this.group.add(p);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w > d ? w : 0.07, 0.05, w > d ? 0.07 : d), std(0x4a2c18, 0.5));
      rail.position.set(p.position.x, WAINSCOT, p.position.z);
      this.group.add(rail);
    }

    // Warm wooden ceiling with exposed beams.
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX, 2 * HZ), new THREE.MeshStandardMaterial({ map: darkWood([6, 6]), roughness: 0.8, color: 0x8a6a55 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = H;
    this.group.add(ceiling);
    const beamMat = new THREE.MeshStandardMaterial({ map: darkWood([4, 1]), roughness: 0.7 });
    for (let x = -14; x <= 14; x += 4) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 2 * HZ), beamMat);
      b.position.set(x, H - 0.15, 0);
      this.group.add(b);
    }

    // Structural pillars, wood-clad with a brass band.
    for (const [x, z] of [[-4, -3], [4, -3], [-4, 6.5], [4, 6.5]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, H, 0.6), new THREE.MeshStandardMaterial({ map: darkWood([1, 3]), roughness: 0.6 }));
      p.position.set(x, H / 2, z);
      this.group.add(p);
      this.occluders.push(p);
      this.colliders.push(box(x, z, 0.6, 0.6));
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.06, 0.64), std(0xc29a52, 0.3, 0.85));
      band.position.set(x, WAINSCOT, z);
      this.group.add(band);
    }
    this.sign('VIRTUAL ARCADE', 0.55, 0, 3.3, -HZ + 0.05, 0);
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
      const mask = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 0.1), new THREE.MeshStandardMaterial({ map: darkWood(), roughness: 0.6 }));
      mask.position.set(x, 1.6, -HZ + 2.6);
      this.group.add(mask);
      this.sign(String(i + 1), 0.4, x, 1.6, -HZ + 2.66, 0);
      // Ball return with a couple of balls.
      if (i < 2) {
        const ret = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.9), new THREE.MeshStandardMaterial({ map: darkWood(), roughness: 0.5 }));
        ret.position.set(x + 1, 0.35, -5.4);
        this.group.add(ret);
        this.colliders.push(box(x + 1, -5.4, 0.4, 0.9));
        ['#b3122e', '#123d9e'].forEach((c, k) => {
          const b = createBallMesh(c, '#ffffff');
          b.position.set(x + 1, 0.81, -5.65 + k * 0.4);
          this.group.add(b);
        });
      }
    }
    // One warm light over the pin decks.
    const spot = new THREE.SpotLight(WARM, 30, 9, 0.9, 0.6);
    spot.position.set(-10, 3.6, -HZ + 4);
    spot.target.position.set(-10, 0, -HZ + 1.2);
    this.group.add(spot, spot.target);
    // Lanes and the approach area.
    this.colliders.push(box(-10, (z0 + z1) / 2, 6.4, len));
    const approach = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.6), laneMat);
    approach.rotation.x = -Math.PI / 2;
    approach.position.set(-10, 0.011, z0 + 1.3);
    this.group.add(approach);
    const foul = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.005, 0.03), std(0x8a1a12, 0.6));
    foul.position.set(-10, 0.015, z0);
    this.group.add(foul);
    this.put(P.bench(0x6b2f22), -11.5, -2.6, Math.PI, [1.8, 0.5]);
    this.put(P.bench(0x6b2f22), -8.5, -2.6, Math.PI, [1.8, 0.5]);
    this.sign('BOLERA', 0.5, -10, 3.2, -HZ + 0.06, 0);
  }

  private billiards() {
    for (const x of [7.5, 12.5]) {
      this.put(P.poolTable(), x, -10.6, 0, [2.9, 1.6]);
      const lamp = P.poolLamp();
      lamp.position.set(x, 2.35, -10.6);
      this.group.add(lamp);
      const l = new THREE.PointLight(0xffe2b0, 7, 4.5, 1.5);
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
    this.sign('BILLAR', 0.45, 10, 3.2, -HZ + 0.06, 0);
  }

  private airHockey() {
    HOCKEY_TABLES.forEach((t, i) => this.put(P.airHockeyTable(i ? 0x3a6bb0 : 0xa8343f), t.x, t.z, 0, [2.2, 1.15]));
    this.sign('AIR HOCKEY', 0.4, HX - 0.06, 3.0, 2.2, -Math.PI / 2);
  }

  private foosball() {
    this.put(P.foosballTable(), -1.6, 0, 0, [1.4, 1.3]);
    this.put(P.foosballTable(), 2.6, 0, 0, [1.4, 1.3]);
    // Hanging double-sided board between the two tables.
    for (const r of [0, Math.PI]) this.sign('FUTBOLÍN', 0.36, 0.5, 2.9, -0.2 + (r ? -0.03 : 0.03), r);
    for (const s of [-1, 1]) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, H - 3.1), std(0x222222, 0.5, 0.5));
      chain.position.set(0.5 + s * 0.7, (H + 3.1) / 2, -0.2);
      this.group.add(chain);
    }
  }

  private darts() {
    [0, 2.5, 5].forEach((z) => {
      this.put(P.dartCabinet(), -HX + 0.07, z, Math.PI / 2);
      const oche = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.6), std(0xc29a52, 0.3, 0.85));
      oche.position.set(-HX + 2.37, 0.01, z);
      this.group.add(oche);
      // Small brass picture light above each board.
      const l = new THREE.SpotLight(WARM, 6, 3.5, 0.6, 0.5);
      l.position.set(-HX + 0.8, 2.7, z);
      l.target.position.set(-HX, 1.73, z);
      this.group.add(l, l.target);
    });
    // High tables for the dart players.
    for (const z of [1.25, 3.75]) {
      const t = new THREE.Group();
      const top = new THREE.MeshStandardMaterial({ map: darkWood(), roughness: 0.45 });
      t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 24), top).translateY(1.05));
      t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.05, 10), std(0x2a2a2a, 0.4, 0.6)).translateY(0.52));
      t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 20), std(0x2a2a2a, 0.4, 0.6)));
      this.put(t, -11.4, z, 0, [0.7, 0.7]);
    }
    this.sign('DARDOS', 0.4, -HX + 0.06, 3.0, 2.5, Math.PI / 2);
  }

  private arcade() {
    const games: Array<[number, string]> = [[300, 'PINBALL'], [190, 'RACER'], [20, 'INVADERS'], [120, 'BLOCKS']];
    games.forEach(([hue, title], i) => this.put(P.arcadeCabinet(i + 3, hue, title), HX - 0.45, 8.6 + i * 1.0, -Math.PI / 2, [0.8, 0.75]));
    games.slice(0, 2).forEach(([hue, title], i) => this.put(P.arcadeCabinet(i + 9, (hue + 60) % 360, title), 10.2 + i * 1.0, HZ - 0.45, Math.PI, [0.75, 0.8]));
    this.sign('RECREATIVAS', 0.38, HX - 0.06, 3.0, 10.1, -Math.PI / 2);
  }

  /** Reading corner: rug, velvet sofas, armchair, books and a floor lamp. */
  private lounge() {
    const rug = P.rug(4.2, 3.2, ['#8a3b2a', '#3f2a1e', '#d8b98a']);
    rug.position.set(-12.8, 0.006, 11);
    this.group.add(rug);
    this.put(P.sofa(0x5b6b3a), -12.5, 12.9, Math.PI, [2, 0.85]);
    this.put(P.sofa(0x7a3b2a), -15.1, 10, Math.PI / 2, [2, 0.85]);
    this.put(P.armchair(0xb07a3a), -10.6, 9.4, -1.07, [0.85, 0.8]); // facing the coffee table
    this.put(P.coffeeTable(), -12.6, 10.5, 0, [1.1, 0.65]);
    this.put(P.floorLamp(), -15.2, 12.9, 0, [0.4, 0.4]);
    this.put(P.sideTable(), -11.1, 12.9, 0, [0.5, 0.5]);
    this.onWall(P.bookshelf(1.8, 2.2), 'w', 7.6, 0);
    this.onWall(P.frame(21, 1.1, 0.8), 's', -12.5, 2.3);
    const l = new THREE.PointLight(WARM, 8, 7, 1.5);
    l.position.set(-13, 2.4, 11.2);
    this.group.add(l);
    this.sign('SALÓN', 0.32, -12.5, 3.25, HZ - 0.06, Math.PI);
  }

  private bar() {
    // Exposed brick behind the bar.
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(7.4, H), new THREE.MeshStandardMaterial({ map: brick([6, 4]), roughness: 0.95 }));
    wall.position.set(-4.5, H / 2, HZ - 0.025);
    wall.rotation.y = Math.PI;
    this.group.add(wall);
    this.put(P.barCounter(4.6), -4.5, 11.4, Math.PI, [4.7, 0.8]);
    this.put(P.backBar(4.6), -4.5, HZ - 0.3, Math.PI, [4.6, 0.6]);
    for (let i = 0; i < 5; i++) this.put(P.barStool(), -6.4 + i * 0.95, 10.5, 0, [0.4, 0.4]);
    for (const x of [-6, -4.5, -3]) {
      const p = P.pendant(0x2c3a2f, 1.5);
      p.position.set(x, H, 11.4);
      this.group.add(p);
    }
    const l = new THREE.PointLight(WARM, 10, 7, 1.5);
    l.position.set(-4.5, 2.5, 11.6);
    this.group.add(l);
    this.sign('BAR', 0.45, -4.5, 3.3, HZ - 0.08, Math.PI);
  }

  private entrance() {
    const x = 5.5;
    const frameMat = new THREE.MeshStandardMaterial({ map: darkWood(), roughness: 0.5 });
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.7, 0.14), frameMat);
      post.position.set(x + s * 1.32, 1.35, HZ - 0.06);
      this.group.add(post);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 0.14), frameMat);
    top.position.set(x, 2.7, HZ - 0.06);
    this.group.add(top);
    // Glass double door with a warm street glow behind it.
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.6), new THREE.MeshStandardMaterial({ color: 0x8aa0a8, emissive: 0x6a4a2a, emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.3 }));
    door.position.set(x, 1.3, HZ - 0.02);
    door.rotation.y = Math.PI;
    this.group.add(door);
    const mid = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.6, 0.06), frameMat);
    mid.position.set(x, 1.3, HZ - 0.05);
    this.group.add(mid);
    const mat = P.rug(2.6, 1.4, ['#4a3a2a', '#2a1f16', '#8a6a4a']);
    mat.position.set(x, 0.006, HZ - 0.8);
    this.group.add(mat);
    this.sign('BIENVENIDOS', 0.3, x, 3.1, HZ - 0.06, Math.PI);
  }

  /** Paintings, plants and rugs that make it feel lived in. */
  private decor() {
    const art: Array<[number, 'n' | 's' | 'e' | 'w', number]> = [
      [3, 'n', 2.5], [5, 'n', -3], [8, 'w', -4], [13, 'w', -8.5], [15, 'e', -4.5], [9, 's', 0.5], [27, 's', 10],
    ];
    for (const [seed, wall, along] of art) this.onWall(P.frame(seed), wall, along, 2.2);
    for (const [x, z] of [[-15.2, 13.2], [-9.4, 13.3], [-15.2, -2.2], [7.8, 13.2], [15.2, -2.6], [15.2, 6.9], [-3.3, -3.6], [3.3, -3.6]]) this.put(P.plant(), x, z, 0, [0.5, 0.5]);
    // Rugs under the foosball tables and in front of the arcade.
    const r1 = P.rug(7.2, 3.6, ['#2f4a5a', '#1f2f3a', '#c9a46a']);
    r1.position.set(0.5, 0.006, 0.2);
    this.group.add(r1);
    const r2 = P.rug(3, 4.6, ['#5a2a3a', '#2a1a20', '#d8b98a']);
    r2.rotation.z = Math.PI / 2;
    r2.position.set(13.4, 0.006, 10.3);
    this.group.add(r2);
    // Pendant lamps over the middle of the room (only a few carry real lights).
    for (const [x, z] of [[-1.6, 0], [2.6, 0], [0.5, 6.5], [0.5, -6.5], [6, 3], [-7, 3.5], [9.5, 9.5], [6.5, -3.5]]) {
      const p = P.pendant(0x3b2a1e, 1.2);
      p.position.set(x, H, z);
      this.group.add(p);
    }
  }

  private lights() {
    this.group.add(new THREE.HemisphereLight(0xffe6c8, 0x3a2414, 0.6));
    this.group.add(new THREE.AmbientLight(0x6a4a3a, 0.25));
    for (const [x, z] of [[0.5, 0], [0.5, 6.5], [0.5, -6.5], [8, 3], [-7, 3.5], [11, 9.5]]) {
      const l = new THREE.PointLight(WARM, 16, 11, 1.4);
      l.position.set(x, H - 1.5, z);
      this.group.add(l);
    }
  }
}
