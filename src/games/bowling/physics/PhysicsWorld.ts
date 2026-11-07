import RAPIER from '@dimforge/rapier3d-compat';
import { BALL, LANE, PHYSICS, PIN, PIT_Z, rackPositions } from '../constants';
import { gaussian, range, type Rng } from '../../../utils/random';
import { pinHullPoints } from './pinShape';

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };

export interface BodyPose {
  position: Vec3;
  rotation: Quat;
}

export interface LaunchParams {
  /** Lateral start position (m from lane centre, + = right). */
  x: number;
  /** Release point along the lane (defaults to just past the foul line). */
  z?: number;
  /** Launch angle (rad, + = towards the right). */
  angle: number;
  /** Release speed (m/s). */
  speed: number;
  /** Side rotation in [-1, 1] (+ = ball curves right). */
  spin: number;
  mass: number;
}

export type ImpactKind = 'ball-pin' | 'pin-pin' | 'pin-lane' | 'ball-wall';

export interface ImpactEvent {
  kind: ImpactKind;
  force: number;
  position: Vec3;
}

type Tag = 'ball' | 'pin' | 'lane' | 'wall';

let rapierReady: Promise<void> | null = null;
export function initRapier(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

/**
 * The bowling lane as a rigid-body simulation. Everything the player sees —
 * hook, deflection, pin action — comes from this world; nothing is scripted.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  private readonly events = new RAPIER.EventQueue(true);
  private readonly tags = new Map<number, Tag>();
  private ball: RAPIER.RigidBody | null = null;
  private pins: Array<RAPIER.RigidBody | null> = [];
  /** Peak tilt (rad) of each pin since the last delivery. */
  private maxTilt: number[] = [];
  private accumulator = 0;
  private rng: Rng | null = null;
  /** Lateral slope of the lane (rad) as a function of z: real lanes are never perfectly flat. */
  private slope: (z: number) => number = () => 0;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 });
    this.world.timestep = PHYSICS.step;
    this.buildLane();
  }

  /**
   * Enables real-world imperfections: per-pin mass/spot/surface tolerances and
   * a gently uneven lane. `null` gives the ideal, fully deterministic lane.
   */
  setVariation(rng: Rng | null) {
    this.rng = rng;
    if (!rng) {
      this.slope = () => 0;
      return;
    }
    // A few thousandths of a radian, like the tolerances allowed on real lanes.
    const bias = gaussian(rng, 0.0006);
    const waves = [0, 1].map(() => ({ a: range(rng, 0.0004, 0.0014), k: range(rng, 0.25, 0.7), p: rng() * Math.PI * 2 }));
    this.slope = (z) => bias + waves.reduce((sum, w) => sum + w.a * Math.sin(z * w.k + w.p), 0);
  }

  // ---------------------------------------------------------------- static geometry
  private fixedBox(hx: number, hy: number, hz: number, x: number, y: number, z: number, friction: number, tag: Tag, restitution: number = PHYSICS.laneRestitution) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setFriction(friction)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(restitution),
      body,
    );
    this.tags.set(col.handle, tag);
  }

  private buildLane() {
    const hw = LANE.width / 2;
    const t = 0.1; // slab thickness
    const deckEnd = PIT_Z;
    const oilEnd = -LANE.oilLength;

    // Approach (behind the foul line) and oiled front part of the lane.
    const frontLen = LANE.approachLength - oilEnd;
    this.fixedBox(hw, t, frontLen / 2, 0, -t, LANE.approachLength - frontLen / 2, PHYSICS.oilFriction, 'lane');
    // Dry back end and pin deck.
    const backLen = oilEnd - deckEnd;
    this.fixedBox(hw, t, backLen / 2, 0, -t, oilEnd - backLen / 2, PHYSICS.dryFriction, 'lane');

    // Gutters: lowered channels on each side, open into the pit.
    const gw = LANE.gutterWidth;
    const len = -deckEnd + 0.5;
    for (const s of [-1, 1]) {
      this.fixedBox(gw / 2, t, len / 2, s * (hw + gw / 2), -LANE.gutterDepth - t, deckEnd + len / 2 - 0.5, 0.3, 'lane');
      // Divider / kickback wall beyond the gutter.
      this.fixedBox(0.03, 0.35, (len + 1.6) / 2, s * (hw + gw + 0.03), 0.25, deckEnd + (len - 1.6) / 2 - 0.5, 0.3, 'wall', 0.15);
    }

    // Pit: lower floor, padded back cushion.
    const pitW = hw + gw + 0.06;
    this.fixedBox(pitW, t, 0.9, 0, -0.42 - t, deckEnd - 0.9, 0.6, 'wall', 0.1);
    this.fixedBox(pitW, 0.6, 0.05, 0, 0.1, deckEnd - 1.65, 0.6, 'wall', 0.05);
    for (const s of [-1, 1]) this.fixedBox(0.05, 0.6, 0.9, s * (pitW + 0.05), 0.1, deckEnd - 0.9, 0.6, 'wall', 0.1);
  }

  // ---------------------------------------------------------------- pins
  private createPin(x: number, z: number, jitter = true): RAPIER.RigidBody {
    const r = this.rng;
    // Regulation tolerances: 1.45–1.64 kg, spotted within a few millimetres.
    const mass = r ? range(r, 1.45, 1.64) : PIN.mass;
    if (r && jitter) {
      x += gaussian(r, 0.0025);
      z += gaussian(r, 0.0025);
    }
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, 0.0005, z)
        .setLinearDamping(0.02)
        .setAngularDamping(0.06)
        .setCanSleep(true),
    );
    const desc = RAPIER.ColliderDesc.convexHull(pinHullPoints())!
      .setFriction(PHYSICS.pinFriction + (r ? gaussian(r, 0.04) : 0))
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(PHYSICS.pinRestitution + (r ? gaussian(r, 0.03) : 0))
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(8)
      .setMass(mass);
    const col = this.world.createCollider(desc, body);
    this.tags.set(col.handle, 'pin');
    return body;
  }

  /** Sets a full rack of ten pins (removing any previous ones). */
  resetRack() {
    this.clearPins();
    this.pins = rackPositions().map(([x, z]) => this.createPin(x, z));
    this.resetTilt();
  }

  /** Puts pins back upright exactly where the pinsetter respots them. */
  restorePins(spots: Array<{ index: number; x: number; z: number }>) {
    this.removePins(spots.map((s) => s.index));
    for (const s of spots) this.pins[s.index] = this.createPin(s.x, s.z, false);
    this.resetTilt();
  }

  /** Removes the given pins (deadwood sweep). */
  removePins(indices: number[]) {
    for (const i of indices) {
      const body = this.pins[i];
      if (!body) continue;
      for (let c = 0; c < body.numColliders(); c++) this.tags.delete(body.collider(c).handle);
      this.world.removeRigidBody(body);
      this.pins[i] = null;
    }
  }

  private clearPins() {
    this.removePins(this.pins.map((_, i) => i));
    this.pins = [];
  }

  pinCount() {
    return this.pins.length;
  }

  pinPose(i: number): BodyPose | null {
    const b = this.pins[i];
    if (!b) return null;
    return { position: b.translation(), rotation: b.rotation() };
  }

  /** A pin is down once it has tilted over or left the pin deck. */
  isPinDown(i: number): boolean {
    const b = this.pins[i];
    if (!b) return true;
    const q = b.rotation();
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    const p = b.translation();
    const offDeck = p.y < -0.03 || p.z < PIT_Z || Math.abs(p.x) > LANE.width / 2 + 0.02;
    return upY < 0.85 || offDeck;
  }

  private tilt(b: RAPIER.RigidBody): number {
    const q = b.rotation();
    return Math.acos(Math.max(-1, Math.min(1, 1 - 2 * (q.x * q.x + q.z * q.z))));
  }

  resetTilt() {
    this.maxTilt = this.pins.map((b) => (b ? this.tilt(b) : 0));
  }

  /** Pins that rocked noticeably during the delivery but are still standing. */
  wobblers(minDeg = 3): number[] {
    const min = (minDeg * Math.PI) / 180;
    return this.standingPins().filter((i) => this.maxTilt[i] > min);
  }

  standingPins(): number[] {
    return this.pins.flatMap((b, i) => (b && !this.isPinDown(i) ? [i] : []));
  }

  // ---------------------------------------------------------------- ball
  launchBall(p: LaunchParams) {
    this.removeBall();
    const r = BALL.radius;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.x, r + 0.002, p.z ?? BALL.startZ)
        .setCcdEnabled(true)
        .setLinearDamping(0.012)
        .setAngularDamping(0.03)
        .setCanSleep(false),
    );
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.ball(r)
        .setFriction(1)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(PHYSICS.ballRestitution)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(15)
        .setMass(p.mass),
      body,
    );
    this.tags.set(col.handle, 'ball');

    const vx = Math.sin(p.angle) * p.speed;
    const vz = -Math.cos(p.angle) * p.speed;
    body.setLinvel({ x: vx, y: 0, z: vz }, true);
    // Released skidding with some forward roll; the side rotation (around the
    // travel axis) only bites once the ball reaches the dry part of the lane.
    body.setAngvel({ x: (-0.35 * p.speed) / r, y: 0, z: -p.spin * BALL.maxSpin }, true);
    this.ball = body;
  }

  removeBall() {
    if (!this.ball) return;
    for (let c = 0; c < this.ball.numColliders(); c++) this.tags.delete(this.ball.collider(c).handle);
    this.world.removeRigidBody(this.ball);
    this.ball = null;
  }

  ballPose(): BodyPose | null {
    return this.ball ? { position: this.ball.translation(), rotation: this.ball.rotation() } : null;
  }

  ballVelocity(): Vec3 | null {
    return this.ball ? this.ball.linvel() : null;
  }

  // ---------------------------------------------------------------- simulation
  /** Advances the simulation by `dt` seconds using a fixed timestep. */
  step(dt: number, onImpact?: (e: ImpactEvent) => void) {
    this.accumulator += Math.min(dt, 0.1);
    let n = 0;
    while (this.accumulator >= PHYSICS.step && n < 40) {
      this.applyLaneSlope();
      this.world.step(this.events);
      this.accumulator -= PHYSICS.step;
      n++;
      this.pins.forEach((b, i) => {
        if (b && !b.isSleeping()) this.maxTilt[i] = Math.max(this.maxTilt[i] ?? 0, this.tilt(b));
      });
      this.events.drainContactForceEvents((e) => {
        if (!onImpact) return;
        const a = this.tags.get(e.collider1());
        const b = this.tags.get(e.collider2());
        const kind = classify(a, b);
        if (!kind) return;
        const pinBody = this.world.getCollider(a === 'pin' ? e.collider1() : e.collider2())?.parent();
        const position = pinBody ? pinBody.translation() : (this.ball?.translation() ?? { x: 0, y: 0, z: 0 });
        onImpact({ kind, force: e.totalForceMagnitude(), position });
      });
    }
    if (n === 40) this.accumulator = 0;
  }

  /** Gravity component along the lane's cross slope pushes a rolling ball sideways. */
  private applyLaneSlope() {
    const b = this.ball;
    if (!b) return;
    const p = b.translation();
    if (p.y > BALL.radius + 0.02 || p.z < PIT_Z || Math.abs(p.x) > LANE.width / 2) return;
    const impulse = b.mass() * -PHYSICS.gravity * this.slope(p.z) * PHYSICS.step;
    b.applyImpulse({ x: impulse, y: 0, z: 0 }, true);
  }

  /** True when nothing on the deck is moving noticeably. */
  pinsAtRest(threshold = 0.05): boolean {
    return this.pins.every((b) => {
      if (!b || b.isSleeping()) return true;
      const v = b.linvel();
      const w = b.angvel();
      return Math.hypot(v.x, v.y, v.z) < threshold && Math.hypot(w.x, w.y, w.z) < threshold * 4;
    });
  }

  dispose() {
    this.world.free();
    this.events.free();
  }
}

function classify(a?: Tag, b?: Tag): ImpactKind | null {
  const has = (t: Tag) => a === t || b === t;
  if (has('ball') && has('pin')) return 'ball-pin';
  if (a === 'pin' && b === 'pin') return 'pin-pin';
  if (has('pin')) return 'pin-lane';
  if (has('ball') && has('wall')) return 'ball-wall';
  return null;
}
