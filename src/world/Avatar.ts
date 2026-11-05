import * as THREE from 'three';
import { blobShadow } from './textures';
import type { Outfit } from './worldStore';

const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 14);

/**
 * Procedural third-person character (faces +z). Joints are pivots so the
 * walk / run / idle / interact cycles are pure rotations, blended by speed.
 */
export class Avatar {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly chest = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly knees: THREE.Group[] = [];
  private readonly arms: THREE.Group[] = [];
  private readonly elbows: THREE.Group[] = [];
  private readonly mats = {
    skin: new THREE.MeshStandardMaterial({ roughness: 0.65 }),
    shirt: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    pants: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    hair: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
  };
  private phase = 0;
  private interactT = 0;

  constructor(outfit: Outfit) {
    const { skin, shirt, pants, hair } = this.mats;
    const shoe = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
    const sole = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

    this.hips.position.y = 0.92;
    this.body.add(this.hips);
    // Legs: thigh → knee → shin → shoe.
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * 0.1, 0, 0);
      const thigh = new THREE.Mesh(capsule(0.075, 0.3), pants);
      thigh.position.y = -0.22;
      leg.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      const shin = new THREE.Mesh(capsule(0.065, 0.3), pants);
      shin.position.y = -0.2;
      knee.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.24), shoe);
      foot.position.set(0, -0.42, 0.05);
      const soleM = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.025, 0.25), sole);
      soleM.position.set(0, -0.46, 0.05);
      knee.add(foot, soleM);
      leg.add(knee);
      this.hips.add(leg);
      this.legs.push(leg);
      this.knees.push(knee);
    }
    // Torso.
    this.chest.position.y = 0.05;
    this.hips.add(this.chest);
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), pants);
    pelvis.scale.set(1.15, 0.6, 0.85);
    this.hips.add(pelvis);
    const torso = new THREE.Mesh(capsule(0.17, 0.32), shirt);
    torso.position.y = 0.25;
    torso.scale.set(1.12, 1, 0.75);
    this.chest.add(torso);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 16), shirt);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.5;
    this.chest.add(collar);
    // Head.
    this.head.position.y = 0.6;
    this.chest.add(this.head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 12), skin);
    neck.position.y = -0.04;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 18), skin);
    skull.position.y = 0.12;
    skull.scale.set(0.95, 1.08, 1);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.138, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    cap.position.y = 0.135;
    cap.rotation.x = -0.25;
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), eyeMat);
      eye.position.set(s * 0.045, 0.13, 0.118);
      this.head.add(eye);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), skin);
      ear.position.set(s * 0.125, 0.11, 0);
      ear.scale.set(0.5, 1, 0.8);
      this.head.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), skin);
    nose.position.set(0, 0.095, 0.13);
    this.head.add(neck, skull, cap, nose);
    // Arms: shoulder → elbow → forearm → hand.
    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(s * 0.24, 0.43, 0);
      const sleeve = new THREE.Mesh(capsule(0.06, 0.12), shirt);
      sleeve.position.y = -0.08;
      const upper = new THREE.Mesh(capsule(0.048, 0.2), skin);
      upper.position.y = -0.16;
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      const fore = new THREE.Mesh(capsule(0.042, 0.2), skin);
      fore.position.y = -0.13;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), skin);
      hand.position.y = -0.28;
      hand.scale.set(0.8, 1, 0.6);
      elbow.add(fore, hand);
      arm.add(sleeve, upper, elbow);
      arm.rotation.z = s * 0.08;
      this.chest.add(arm);
      this.arms.push(arm);
      this.elbows.push(elbow);
    }
    this.body.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.root.add(this.body);

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: blobShadow(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.015;
    this.root.add(shadow);
    this.setOutfit(outfit);
  }

  setOutfit(o: Outfit) {
    this.mats.skin.color.set(o.skin);
    this.mats.shirt.color.set(o.shirt);
    this.mats.pants.color.set(o.pants);
    this.mats.hair.color.set(o.hair);
  }

  /** Plays the reach-out gesture used when starting an activity. */
  interact() {
    this.interactT = 0.6;
  }

  /**
   * @param speed horizontal speed (m/s); walk ≈ 2, run ≈ 5
   */
  update(dt: number, speed: number, time: number) {
    const run = THREE.MathUtils.clamp((speed - 2.4) / 2, 0, 1);
    const move = THREE.MathUtils.clamp(speed / 2, 0, 1);
    // Stride frequency grows with speed; the phase keeps feet in step with the ground.
    this.phase += dt * speed * (run ? 3.2 : 3.6);
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const swing = move * (0.55 + run * 0.35);

    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      this.legs[i].rotation.x = side * s * swing;
      // Knee bends on the leg's forward/back pass (never backwards).
      this.knees[i].rotation.x = Math.max(0, side * -c) * swing * 1.3 + move * 0.05;
      this.arms[i].rotation.x = -side * s * swing * (0.8 + run * 0.3);
      this.elbows[i].rotation.x = -(0.15 + move * 0.35 + run * 0.6);
    }
    // Bob, lean and idle breathing.
    const bob = Math.abs(c) * 0.05 * move * (1 + run);
    this.body.position.y = bob - move * 0.02;
    this.chest.rotation.x = 0.04 * move + run * 0.18;
    this.chest.rotation.y = s * 0.12 * move;
    const breathe = (1 - move) * Math.sin(time * 2.2) * 0.012;
    this.chest.scale.set(1, 1 + breathe, 1 + breathe);
    this.head.rotation.x = -this.chest.rotation.x * 0.6;
    this.head.rotation.y = (1 - move) * Math.sin(time * 0.6) * 0.25;

    if (this.interactT > 0) {
      this.interactT = Math.max(0, this.interactT - dt);
      const k = Math.sin((1 - this.interactT / 0.6) * Math.PI);
      this.arms[1].rotation.x = -1.4 * k;
      this.elbows[1].rotation.x = -0.2 * k;
      this.chest.rotation.x += 0.12 * k;
    }
  }
}
