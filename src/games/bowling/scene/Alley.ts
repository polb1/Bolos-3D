import { darkWood, plaster, wainscot } from '../../../world3d/textures';
import * as THREE from 'three';
import { HEAD_PIN_Z, LANE, PIT_Z, rackPositions } from '../constants';
import type { QualityPreset, Settings } from '../../../config/settings';
import { carpetTexture, laneWoodTexture, maskingTexture } from './textures';
import { createPinGeometry, createPinMaterial } from './pinMesh';

const HW = LANE.width / 2;
const GW = LANE.gutterWidth;
export const LANE_SPACING = LANE.width + 2 * GW + 0.14;
const LANE_NUMBER = 7;

/**
 * Static scenery of the bowling centre: the player's lane plus neighbouring
 * lanes, pin decks, masking units, lights and ceiling.
 */
export class Alley {
  readonly group = new THREE.Group();
  readonly key: THREE.DirectionalLight;
  private readonly deckSpot: THREE.SpotLight;
  private readonly woodMat: THREE.MeshPhysicalMaterial;
  private readonly neighbours = new THREE.Group();
  private woodTone: Settings['wood'] | null = null;
  private readonly anisotropy: number;

  constructor(renderer: THREE.WebGLRenderer) {
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.woodMat = new THREE.MeshPhysicalMaterial({
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 0.9,
    });

    const lane = this.buildLane(LANE_NUMBER, true);
    this.group.add(lane, this.neighbours);
    this.buildRoom();

    // Lighting: soft fill, a long key light for lane/ball shadows, a spot on the pins.
    this.group.add(new THREE.HemisphereLight(0xffe6c8, 0x24150a, 0.55));
    this.key = new THREE.DirectionalLight(0xfff1dc, 1.6);
    this.key.position.set(0.6, 9, -6.5);
    this.key.target.position.set(0, 0, -10.5);
    const cam = this.key.shadow.camera;
    cam.left = -1.6;
    cam.right = 1.6;
    cam.top = 13;
    cam.bottom = -13;
    cam.near = 1;
    cam.far = 25;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.group.add(this.key, this.key.target);

    this.deckSpot = new THREE.SpotLight(0xfff0dc, 18, 6, 0.6, 0.5, 1.4);
    this.deckSpot.position.set(0, 2.6, HEAD_PIN_Z + 1.4);
    this.deckSpot.target.position.set(0, 0, HEAD_PIN_Z - 0.4);
    this.deckSpot.shadow.bias = -0.0005;
    this.group.add(this.deckSpot, this.deckSpot.target);
  }

  applySettings(s: Settings, q: QualityPreset) {
    if (s.wood !== this.woodTone) {
      this.woodMat.map?.dispose();
      const tex = laneWoodTexture(s.wood, this.anisotropy);
      tex.repeat.set(1, 6);
      this.woodMat.map = tex;
      this.woodMat.needsUpdate = true;
      this.woodTone = s.wood;
    }
    this.key.castShadow = q.shadows;
    this.key.shadow.mapSize.set(q.shadowMap / 4, q.shadowMap * 2);
    this.key.shadow.map?.dispose();
    this.key.shadow.map = null;
    this.deckSpot.castShadow = q.shadows && q.shadowMap >= 2048;
    this.deckSpot.shadow.mapSize.set(1024, 1024);

    if (this.neighbours.children.length === q.neighbours * 2) return;
    this.neighbours.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat.emissiveMap) mat.map?.dispose(); // per-lane masking texture; other maps are shared
    });
    this.neighbours.clear();
    for (let k = 1; k <= q.neighbours; k++) {
      for (const s of [-1, 1]) {
        const n = this.buildLane(LANE_NUMBER + s * k, false);
        n.position.x = s * k * LANE_SPACING;
        this.neighbours.add(n);
      }
    }
  }

  // ------------------------------------------------------------------ lane
  private buildLane(number: number, main: boolean): THREE.Group {
    const g = new THREE.Group();
    const laneLen = -PIT_Z;

    // Lane surface (foul line → pit) and approach.
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(LANE.width, laneLen), this.woodMat);
    lane.rotation.x = -Math.PI / 2;
    lane.position.z = -laneLen / 2;
    lane.receiveShadow = true;
    const approach = new THREE.Mesh(new THREE.PlaneGeometry(LANE.width + 2 * GW + 0.1, LANE.approachLength), this.woodMat);
    approach.rotation.x = -Math.PI / 2;
    approach.position.set(0, -0.001, LANE.approachLength / 2);
    approach.receiveShadow = true;
    g.add(lane, approach);

    this.addMarkings(g);

    // Gutters: shallow metal channels.
    const gutterGeo = new THREE.CylinderGeometry(GW / 2, GW / 2, laneLen, 20, 1, true, -Math.PI / 2, Math.PI);
    const gutterMat = new THREE.MeshStandardMaterial({ color: 0x3a4250, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const gut = new THREE.Mesh(gutterGeo, gutterMat);
      gut.rotation.x = Math.PI / 2;
      gut.scale.set(1, 1, LANE.gutterDepth / (GW / 2));
      gut.position.set(s * (HW + GW / 2), 0, -laneLen / 2);
      gut.receiveShadow = true;
      g.add(gut);

      // Capping between lanes and tall kickbacks beside the pin deck.
      const capLen = laneLen + 0.2;
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.07, capLen),
        new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.4, metalness: 0.1 }),
      );
      cap.position.set(s * (HW + GW + 0.035), 0.035, -capLen / 2 + 0.1);
      g.add(cap);

      const kick = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.9, 2.9),
        new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.6 }),
      );
      kick.position.set(s * (HW + GW + 0.03), 0.45, HEAD_PIN_Z - 0.85);
      kick.receiveShadow = true;
      g.add(kick);
    }

    // Pit and dark pinsetter cavity.
    const pit = new THREE.Mesh(
      new THREE.BoxGeometry(LANE.width + 2 * GW + 0.1, 0.42, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x05070d, roughness: 1 }),
    );
    pit.position.set(0, -0.21 - 0.03, PIT_Z - 0.9);
    const curtain = new THREE.Mesh(
      new THREE.PlaneGeometry(LANE.width + 2 * GW + 0.14, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x0d0806, roughness: 1 }),
    );
    curtain.position.set(0, 0.5, PIT_Z - 1.62);
    g.add(pit, curtain);

    // Masking unit with lane number.
    const mask = new THREE.Mesh(
      new THREE.PlaneGeometry(LANE.width + 2 * GW + 0.14, 0.62),
      new THREE.MeshStandardMaterial({ map: maskingTexture(number), emissive: 0xffffff, emissiveIntensity: 0.35, emissiveMap: null }),
    );
    (mask.material as THREE.MeshStandardMaterial).emissiveMap = (mask.material as THREE.MeshStandardMaterial).map;
    mask.position.set(0, 1.25, PIT_Z - 0.35);
    g.add(mask);

    if (!main) {
      // Neighbour lanes show a static rack (no physics).
      const pins = new THREE.InstancedMesh(createPinGeometry(), createPinMaterial(), 10);
      const m = new THREE.Matrix4();
      rackPositions().forEach(([x, z], i) => pins.setMatrixAt(i, m.makeTranslation(x, 0, z)));
      g.add(pins);
    }
    return g;
  }

  private addMarkings(g: THREE.Group) {
    const bw = LANE.width / LANE.boardCount;
    const dark = new THREE.MeshStandardMaterial({ color: 0x3b1a0c, roughness: 0.5 });
    // Foul line.
    const foul = new THREE.Mesh(new THREE.PlaneGeometry(LANE.width + 2 * GW + 0.1, 0.022), new THREE.MeshStandardMaterial({ color: 0x0b0b0b }));
    foul.rotation.x = -Math.PI / 2;
    foul.position.set(0, 0.001, 0);
    g.add(foul);

    // Targeting arrows (chevron, boards 5–35) and guide dots.
    const arrow = new THREE.Shape();
    arrow.moveTo(0, -0.11);
    arrow.lineTo(bw * 0.55, 0.06);
    arrow.lineTo(-bw * 0.55, 0.06);
    arrow.closePath();
    const arrowGeo = new THREE.ShapeGeometry(arrow);
    for (let n = 5; n <= 35; n += 5) {
      const x = HW - (n - 0.5) * bw;
      const fromCentre = Math.abs(n - 20) / 5;
      const a = new THREE.Mesh(arrowGeo, dark);
      a.rotation.x = -Math.PI / 2;
      a.position.set(x, 0.0012, -LANE.arrowsAt - 0.9 + fromCentre * 0.3);
      g.add(a);
    }
    const dotGeo = new THREE.CircleGeometry(0.009, 12);
    for (const n of [3, 5, 8, 11, 14, 26, 29, 32, 35, 37]) {
      const x = HW - (n - 0.5) * bw;
      for (const z of [-2.13, 1.8, 3.6]) {
        const d = new THREE.Mesh(dotGeo, dark);
        d.rotation.x = -Math.PI / 2;
        d.position.set(x, 0.0012, z);
        g.add(d);
      }
    }
    // Pin spots on the deck.
    for (const [x, z] of rackPositions()) {
      const s = new THREE.Mesh(new THREE.CircleGeometry(0.026, 16), dark);
      s.rotation.x = -Math.PI / 2;
      s.position.set(x, 0.0012, z);
      g.add(s);
    }
  }

  // ------------------------------------------------------------------ room
  private buildRoom() {
    const width = LANE_SPACING * 9;
    // Settee/approach floor.
    const carpet = carpetTexture();
    carpet.repeat.set(width / 2, 3);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, 6), new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.01, LANE.approachLength + 3);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Ceiling with rows of light panels.
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, 30), new THREE.MeshStandardMaterial({ map: darkWood([4, 10]), color: 0x6a5040, roughness: 0.9 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 3.4, -8);
    this.group.add(ceiling);
    const panelGeo = new THREE.PlaneGeometry(width * 0.95, 0.12);
    const panelMat = new THREE.MeshBasicMaterial({ color: 0xfff0d8 });
    for (let z = 2; z > -20; z -= 3.2) {
      const p = new THREE.Mesh(panelGeo, panelMat);
      p.rotation.x = Math.PI / 2;
      p.position.set(0, 3.39, z);
      this.group.add(p);
    }

    // Side walls: plaster over wood panelling, like the rest of the lounge.
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 3.4), new THREE.MeshStandardMaterial({ map: plaster([8, 1]), color: 0x9a8a78, roughness: 0.95 }));
      wall.rotation.y = -s * Math.PI / 2;
      wall.position.set((s * width) / 2, 1.7, -8);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(30, 1.1), new THREE.MeshStandardMaterial({ map: wainscot([24, 1]), roughness: 0.6 }));
      panel.rotation.y = -s * Math.PI / 2;
      panel.position.set((s * width) / 2 - s * 0.01, 0.55, -8);
      this.group.add(wall, panel);
    }

    // Back wall behind the bowler.
    const back = new THREE.Mesh(new THREE.PlaneGeometry(width, 3.4), new THREE.MeshStandardMaterial({ map: plaster([3, 1]), color: 0x9a8a78, roughness: 0.95 }));
    back.rotation.y = Math.PI;
    back.position.set(0, 1.7, LANE.approachLength + 6);
    this.group.add(back);
  }
}
