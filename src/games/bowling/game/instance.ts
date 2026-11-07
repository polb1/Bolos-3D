import type { Game } from './Game';

/** The single running game, set once the canvas is mounted. */
export const gameRef: { current: Game | null } = { current: null };
