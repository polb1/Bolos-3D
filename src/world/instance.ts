import type { World } from './World';
import type { World as World3D } from '../world3d/World';

/** The single hall instance, set once its canvas is mounted. */
export const worldRef: { current: World | World3D | null } = { current: null };
