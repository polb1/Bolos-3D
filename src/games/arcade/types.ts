/** 0 up, 1 right, 2 down, 3 left. */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export interface ArcadeInput {
  /** Last direction asked for (arrows/WASD or a swipe). */
  dir: Dir | null;
  /** Held horizontal keys: -1, 0 or 1. */
  steer: number;
  /** Pointer x over the screen (0..1) while it is being dragged, else null. */
  pointer: number | null;
  /** Space / tap this frame. */
  fire: boolean;
}

/** A cabinet game: plain logic plus a 2D canvas painter. */
export interface ArcadeGame {
  score: number;
  lives: number;
  over: boolean;
  /** Short line under the score (level, hint…). */
  status: string;
  step(dt: number, input: ArcadeInput): void;
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void;
}
