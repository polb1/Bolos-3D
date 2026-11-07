import * as THREE from 'three';
import * as P from './props';
import { darkWood, plaster, wainscot, woodFloor } from './textures';

/**
 * A corner of the games lounge for the minigame scenes, in the same warm style as the hall:
 * oak floor, plaster over wood panelling, a beamed ceiling, pendant lamps and a few
 * things on the walls. The room spans x ∈ [-w/2, w/2] and z ∈ [back, back + d].
 */
export function buildLounge(opts: { w: number; d: number; h?: number; back: number; lamps?: Array<[number, number]>; decor?: boolean }) {
  const { w, d, back } = opts;
  const h = opts.h ?? 3.2;
  const root = new THREE.Group();
  const front = back + d;
  const cz = back + d / 2;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: woodFloor([w / 1.6, d / 1.6]), roughness: 0.5, color: 0xd8ccc0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = cz;
  floor.receiveShadow = true;
  root.add(floor);

  const plasterMat = new THREE.MeshStandardMaterial({ map: plaster([w / 4, h / 3.5]), roughness: 0.95 });
  const panelMat = new THREE.MeshStandardMaterial({ map: wainscot([w / 1.3, 1]), roughness: 0.6 });
  const rail = new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.5 });
  // Four walls facing in: [centre x, centre z, length, rotation].
  const walls: Array<[number, number, number, number]> = [
    [0, back, w, 0],
    [0, front, w, Math.PI],
    [-w / 2, cz, d, Math.PI / 2],
    [w / 2, cz, d, -Math.PI / 2],
  ];
  for (const [x, z, len, rot] of walls) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, h), plasterMat);
    wall.position.set(x, h / 2, z);
    wall.rotation.y = rot;
    wall.receiveShadow = true;
    root.add(wall);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.1), panelMat);
    panel.position.set(x + Math.sin(rot) * 0.01, 0.55, z + Math.cos(rot) * 0.01);
    panel.rotation.y = rot;
    root.add(panel);
    const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), rail);
    r.position.set(x + Math.sin(rot) * 0.025, 1.1, z + Math.cos(rot) * 0.025);
    r.rotation.y = rot;
    root.add(r);
  }

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: darkWood([w / 5, d / 5]), roughness: 0.8, color: 0x8a6a55 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, h, cz);
  root.add(ceiling);
  const beamMat = new THREE.MeshStandardMaterial({ map: darkWood([3, 1]), roughness: 0.7 });
  for (let x = -w / 2 + 1; x < w / 2; x += 2.5) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, d), beamMat);
    b.position.set(x, h - 0.13, cz);
    root.add(b);
  }

  for (const [x, z] of opts.lamps ?? []) {
    const p = P.pendant(0x2c3a2f, Math.max(0.4, h - 2.3));
    p.position.set(x, h, z);
    root.add(p);
  }

  if (opts.decor !== false) {
    // A painting on each side wall, plants in the far corners, a bookshelf on the left.
    const art = (seed: number, x: number, z: number, rot: number) => {
      const f = P.frame(seed);
      f.position.set(x, 2.0, z);
      f.rotation.y = rot;
      root.add(f);
    };
    art(5, -w / 2 + 0.03, cz - d * 0.15, Math.PI / 2);
    art(13, w / 2 - 0.03, cz - d * 0.15, -Math.PI / 2);
    for (const s of [-1, 1]) {
      const pl = P.plant();
      pl.position.set(s * (w / 2 - 0.45), 0, back + 0.45);
      root.add(pl);
    }
    const shelf = P.bookshelf(1.4, 2.0);
    shelf.position.set(-w / 2 + 0.2, 0, cz + d * 0.2);
    shelf.rotation.y = Math.PI / 2;
    root.add(shelf);
  }

  root.add(new THREE.HemisphereLight(0xffe6c8, 0x3a2414, 0.55));
  return root;
}
