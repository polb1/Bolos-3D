import type { World } from './World';

/** The single hall instance, set once its canvas is mounted. */
export const worldRef: { current: World | null } = { current: null };
