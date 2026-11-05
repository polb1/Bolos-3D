import * as THREE from 'three';
import { HEAD_PIN_Z, LANE, PIN, PIT_Z, rackPositions } from '../config/constants';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { createPinMesh } from '../scene/pinMesh';
import { easeInOut } from '../utils/math';

const RACK_Z = HEAD_PIN_Z - 0.4; // centre of the triangle
const PARKED_Y = 1.9; // machinery rests out of sight behind the masking unit
const GUARD_Y = 0.1; // sweep bar down on the deck
const GUARD_Z = HEAD_PIN_Z + 0.42; // in front of the head pin
const SWEEP_END_Z = PIT_Z - 0.15;
const GRIP_Y = PIN.height + 0.03; // table height when its cups hold the pin heads
const LIFT = 0.5;

interface Dead {
  mesh: THREE.Mesh;
  /** Pins still upright when the bar reaches them get knocked over backwards. */
  upright: boolean;
  tip: number;
  q0: THREE.Quaternion;
  fall: number;
}

interface Step {
  d: number;
  start?: () => void;
  tick: (k: number) => void;
}

const lyingBack = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

/**
 * Keeps the ten pin meshes in sync with their rigid bodies and plays the
 * pinsetter cycle the way a real machine does it: the guard drops, the table
 * lifts the standing pins, the sweep pushes the deadwood into the pit, and the
 * table sets the pins (or a fresh rack) back on their spots.
 */
export class PinRack {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.Mesh[];
  private readonly sweepBar: THREE.Group;
  private readonly table: THREE.Group;
  private steps: Step[] = [];
  private step = 0;
  private t = 0;
  private dead: Dead[] = [];
  private held: Array<{ index: number; x: number; z: number; q: THREE.Quaternion }> = [];
  private fresh = false;
  private dt = 0;
  private onDone: (() => void) | null = null;

  constructor(private readonly physics: PhysicsWorld) {
    this.meshes = rackPositions().map(() => createPinMesh());
    this.group.add(...this.meshes);

    const metal = new THREE.MeshStandardMaterial({ color: 0x1b2a4a, metalness: 0.6, roughness: 0.35 });
    const width = LANE.width + 2 * LANE.gutterWidth + 0.02;
    // Sweep: a long bar on two side arms.
    this.sweepBar = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.13, 0.035), metal);
    bar.position.y = 0.065;
    bar.castShadow = true;
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, 0.03), metal);
      arm.position.set((s * width) / 2, 0.55, 0);
      this.sweepBar.add(arm);
    }
    this.sweepBar.add(bar);
    this.group.add(this.sweepBar);

    // Setting table: a plate with ten cups that grip the pin heads.
    this.table = new THREE.Group();
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(LANE.width + 0.1, 0.05, 1.15),
      new THREE.MeshStandardMaterial({ color: 0x141c30, metalness: 0.4, roughness: 0.5 }),
    );
    plate.position.set(0, 0.06, RACK_Z);
    plate.castShadow = true;
    this.table.add(plate);
    const cupGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.05, 16);
    const cupMat = new THREE.MeshStandardMaterial({ color: 0x2a3a60, metalness: 0.5, roughness: 0.4 });
    for (const [x, z] of rackPositions()) {
      const cup = new THREE.Mesh(cupGeo, cupMat);
      cup.position.set(x, 0.015, z);
      this.table.add(cup);
    }
    this.group.add(this.table);
    this.park();
  }

  private park() {
    this.sweepBar.position.set(0, PARKED_Y, GUARD_Z);
    this.table.position.y = PARKED_Y;
  }

  /** Instant full rack (new game). */
  reset() {
    this.physics.resetRack();
    this.steps = [];
    this.dead = [];
    this.held = [];
    this.park();
    this.sync();
  }

  get busy() {
    return this.steps.length > 0;
  }

  /** Copies rigid-body poses onto the meshes. */
  sync() {
    if (this.busy) return;
    this.meshes.forEach((m, i) => {
      const pose = this.physics.pinPose(i);
      m.visible = !!pose;
      if (!pose) return;
      m.position.set(pose.position.x, pose.position.y, pose.position.z);
      m.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
    });
  }

  /** Runs a pinsetter cycle; with `fresh` every pin is swept and a new rack is set. */
  cycle(fresh: boolean, done: () => void) {
    this.sync();
    this.fresh = fresh;
    this.onDone = done;
    const indices = this.meshes.map((_, i) => i).filter((i) => this.physics.pinPose(i));
    const standing = fresh ? [] : indices.filter((i) => !this.physics.isPinDown(i));
    this.held = standing.map((index) => {
      const m = this.meshes[index];
      return { index, x: m.position.x, z: m.position.z, q: new THREE.Quaternion() }; // re-spotted upright
    });
    this.dead = indices
      .filter((i) => !standing.includes(i))
      .map((i) => ({ mesh: this.meshes[i], upright: !this.physics.isPinDown(i), tip: 0, q0: this.meshes[i].quaternion.clone(), fall: 0 }));
    // The machine takes over: no physics on the deck until it is done.
    this.physics.removePins(indices);

    const lerp = THREE.MathUtils.lerp;
    const s: Step[] = [];
    let from = 0;
    const tableTo = (to: number, d: number, carry: boolean) =>
      s.push({
        d,
        start: () => (from = this.table.position.y),
        tick: (k) => {
          this.table.position.y = lerp(from, to, k);
          if (carry) this.carry();
        },
      });

    // 1. Guard drops in front of the pins.
    s.push({ d: 0.45, tick: (k) => (this.sweepBar.position.y = lerp(PARKED_Y, GUARD_Y, k)) });
    // 2. Table comes down, grips the standing pins and lifts them clear.
    if (this.held.length) {
      tableTo(GRIP_Y, 0.55, false);
      tableTo(GRIP_Y + LIFT, 0.5, true);
    }
    // 3. Sweep pushes the deadwood back into the pit, then returns.
    s.push({
      d: 0.9,
      tick: (k) => {
        this.sweepBar.position.z = lerp(GUARD_Z, SWEEP_END_Z, k);
        this.push();
      },
    });
    s.push({ d: 0.15, tick: () => this.push() });
    s.push({
      d: 0.55,
      start: () => this.dead.forEach((d) => (d.mesh.visible = false)),
      tick: (k) => (this.sweepBar.position.z = lerp(SWEEP_END_Z, GUARD_Z, k)),
    });
    // 4. Table sets the pins down: the same pins where they stood, or a new rack.
    if (fresh) {
      s.push({
        d: 0.01,
        tick: () => {
          this.held = rackPositions().map(([x, z], index) => ({ index, x, z, q: new THREE.Quaternion() }));
          this.held.forEach((h) => (this.meshes[h.index].visible = true));
          this.carry();
        },
      });
      tableTo(GRIP_Y, 0.85, true);
    } else if (this.held.length) {
      tableTo(GRIP_Y, 0.5, true);
    }
    if (this.held.length) tableTo(PARKED_Y, 0.6, false);
    // 5. Guard lifts: the lane is ready.
    s.push({ d: 0.4, tick: (k) => (this.sweepBar.position.y = lerp(GUARD_Y, PARKED_Y, k)) });

    this.steps = s;
    this.step = 0;
    this.t = 0;
    s[0].start?.();
  }

  /** Pins held by the table hang from it, base `GRIP_Y` below the plate. */
  private carry() {
    const y = this.table.position.y - GRIP_Y;
    for (const h of this.held) {
      const m = this.meshes[h.index];
      m.position.set(h.x, y + 0.0005, h.z);
      m.quaternion.copy(h.q);
    }
  }

  /** The sweep bar shoves every pin behind it; upright ones topple, all drop into the pit. */
  private push() {
    const barZ = this.sweepBar.position.z - 0.07;
    for (const d of this.dead) {
      const p = d.mesh.position;
      if (p.z > barZ) {
        p.z = barZ;
        if (d.upright) d.tip = Math.min(1, d.tip + this.dt * 5);
      }
      if (d.upright) d.mesh.quaternion.slerpQuaternions(d.q0, lyingBack, easeInOut(d.tip));
      if (p.z < PIT_Z) {
        d.fall = Math.min(1, d.fall + this.dt * 3);
        p.y = Math.max(-0.38, p.y - this.dt * (1.2 + d.fall * 2.5));
      } else if (d.tip > 0 && d.upright) {
        p.y = Math.max(0.06 * d.tip, p.y);
      }
    }
  }

  update(dt: number) {
    if (!this.busy) return;
    this.dt = dt;
    this.t += dt;
    let cur = this.steps[this.step];
    while (cur && this.t >= cur.d) {
      cur.tick(1);
      this.t -= cur.d;
      this.step++;
      cur = this.steps[this.step];
      cur?.start?.();
    }
    if (cur) {
      cur.tick(easeInOut(Math.min(1, this.t / cur.d)));
      return;
    }
    this.finish();
  }

  private finish() {
    this.steps = [];
    this.dead = [];
    if (this.fresh) this.physics.resetRack();
    else this.physics.restorePins(this.held.map(({ index, x, z }) => ({ index, x, z })));
    this.held = [];
    this.park();
    this.sync();
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }
}
