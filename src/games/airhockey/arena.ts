import type * as THREE from 'three';
import { buildLounge } from '../../world3d/lounge';

/** The room around the table: a corner of the games lounge, warm and lived in. */
export function buildArena(): THREE.Group {
  return buildLounge({ w: 7, d: 10, back: -5.5, h: 3.2, lamps: [[0, -1.3], [-2.2, 1.5], [2.2, 1.5]] });
}
