import * as THREE from 'three';
import { BALL, PIN } from '../config/constants';
import { ballTexture, pinTexture } from './textures';

let pinGeo: THREE.BufferGeometry | null = null;
let pinMat: THREE.MeshPhysicalMaterial | null = null;

/** Lathe of the regulation pin profile; UVs mapped by height so the stripes land on the neck. */
export function createPinGeometry(): THREE.BufferGeometry {
  if (pinGeo) return pinGeo;
  const curve = new THREE.SplineCurve(PIN.profile.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getPoints(48);
  pts[0].set(0, 0);
  pts[pts.length - 1].set(0, PIN.height);
  const geo = new THREE.LatheGeometry(pts, 28);
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setY(i, pos.getY(i) / PIN.height);
  geo.computeVertexNormals();
  pinGeo = geo;
  return geo;
}

export function createPinMaterial(): THREE.MeshPhysicalMaterial {
  pinMat ??= new THREE.MeshPhysicalMaterial({
    map: pinTexture(),
    roughness: 0.28,
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
  });
  return pinMat;
}

export function createPinMesh(): THREE.Mesh {
  const m = new THREE.Mesh(createPinGeometry(), createPinMaterial());
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function createBallMesh(base: string, swirl: string): THREE.Mesh {
  const mat = new THREE.MeshPhysicalMaterial({
    map: ballTexture(base, swirl),
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.2,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(BALL.radius, 48, 32), mat);
  m.castShadow = true;
  return m;
}
