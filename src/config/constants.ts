/**
 * Regulation dimensions (USBC), in metres / kilograms.
 * World axes: X across the lane, Y up, the ball travels towards -Z.
 * The foul line sits at z = 0.
 */
export const LANE = {
  width: 1.0541, // 41.5"
  length: 18.288, // foul line → head pin (60')
  deckLength: 0.88, // head pin → pit edge (34 3/16")
  approachLength: 4.6,
  gutterWidth: 0.235,
  gutterDepth: 0.06,
  boardCount: 39,
  /** Oil pattern length; the lane is slick until here, then dry (this is what makes a ball hook). */
  oilLength: 12.2,
  arrowsAt: 4.57, // 15'
} as const;

export const HEAD_PIN_Z = -LANE.length;
export const PIT_Z = HEAD_PIN_Z - LANE.deckLength;
export const PIN_SPACING = 0.3048; // 12" centre to centre

export const PIN = {
  height: 0.381,
  mass: 1.53,
  /** Lathe profile (radius, height) of a regulation pin, bottom → top. */
  profile: [
    [0.0, 0.0],
    [0.0254, 0.0],
    [0.0405, 0.0254],
    [0.0538, 0.0635],
    [0.0605, 0.1143],
    [0.0602, 0.1453],
    [0.0545, 0.1810],
    [0.0400, 0.2224],
    [0.0255, 0.2540],
    [0.0228, 0.2710],
    [0.0258, 0.2920],
    [0.0318, 0.3200],
    [0.0320, 0.3450],
    [0.0255, 0.3650],
    [0.0130, 0.3780],
    [0.0, 0.381],
  ] as ReadonlyArray<readonly [number, number]>,
} as const;

export const BALL = {
  radius: 0.1085, // 8.5" diameter
  defaultMass: 6.8, // 15 lb
  /** Ball speed (m/s) at 0 % and 100 % power. Real throws run ~6–10 m/s. */
  minSpeed: 4.2,
  maxSpeed: 10.2,
  /** Maximum side-rotation (rad/s) at full spin input. */
  maxSpin: 20,
  startZ: -0.35,
  /** Max lateral start offset from centre. */
  maxOffset: LANE.width / 2 - 0.12,
  /** Max launch angle (rad) either side. */
  maxAngle: 0.035,
} as const;

export const PHYSICS = {
  gravity: -9.81,
  step: 1 / 240,
  oilFriction: 0.02,
  dryFriction: 0.26,
  pinFriction: 0.45,
  pinRestitution: 0.36,
  ballRestitution: 0.2,
  laneRestitution: 0.15,
} as const;

/** Rack positions (x, z) for pins 1–10. */
export function rackPositions(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const dz = PIN_SPACING * Math.cos(Math.PI / 6);
  for (let row = 0; row < 4; row++) {
    for (let k = 0; k <= row; k++) {
      out.push([(k - row / 2) * PIN_SPACING, HEAD_PIN_Z - row * dz]);
    }
  }
  return out;
}
