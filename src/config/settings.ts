export type Quality = 'baja' | 'media' | 'alta';
export type CameraMode = 'clasica' | 'aerea';

export interface Settings {
  players: 1 | 2;
  names: [string, string];
  ballWeight: 12 | 14 | 15 | 16;
  ballColor: string;
  wood: string;
  crowd: boolean;
  quality: Quality;
  camera: CameraMode;
}

export const DEFAULT_SETTINGS: Settings = {
  players: 1,
  names: ['Jugador 1', 'Jugador 2'],
  ballWeight: 15,
  ballColor: 'rubi',
  wood: 'clara',
  crowd: true,
  quality: 'alta',
  camera: 'clasica',
};

export const BALL_COLORS: Record<string, { label: string; base: string; swirl: string; price?: number }> = {
  rubi: { label: 'Rubí', base: '#b3122e', swirl: '#ff5a6e' },
  oceano: { label: 'Océano', base: '#123d9e', swirl: '#4fb6ff' },
  lima: { label: 'Lima', base: '#5d7a0c', swirl: '#d8f24a' },
  noche: { label: 'Noche', base: '#16161c', swirl: '#6a5cff' },
  oro: { label: 'Oro', base: '#a06a08', swirl: '#ffd23f' },
  perla: { label: 'Perla', base: '#c9cdd8', swirl: '#ffffff' },
  // Shop items: bought with coins earned in matches.
  galaxia: { label: 'Galaxia', base: '#1a0b3d', swirl: '#ff4fd8', price: 40 },
  lava: { label: 'Lava', base: '#3a0a00', swirl: '#ff8a00', price: 40 },
  menta: { label: 'Menta', base: '#0b5c4a', swirl: '#7dffd9', price: 60 },
  arcoiris: { label: 'Arcoíris', base: '#2b2bd6', swirl: '#ffe14f', price: 100 },
};

/** Lane finishes: board colour (RGB) and grain colour. */
export const WOODS: Record<string, { label: string; base: [number, number, number]; grain: string; price?: number }> = {
  clara: { label: 'Arce clara', base: [222, 178, 122], grain: '120,70,30' },
  oscura: { label: 'Nogal oscura', base: [150, 92, 52], grain: '60,30,10' },
  cerezo: { label: 'Cerezo rojo', base: [176, 74, 52], grain: '70,20,10', price: 40 },
  ebano: { label: 'Ébano', base: [58, 44, 40], grain: '20,10,5', price: 60 },
  hielo: { label: 'Hielo azul', base: [150, 190, 225], grain: '40,70,110', price: 80 },
  neon: { label: 'Neón lima', base: [150, 190, 50], grain: '50,70,10', price: 100 },
};

/** Coins given to each player who scores over the threshold in a finished match. */
export const COIN_THRESHOLD = 100;
export const COIN_REWARD = 20;

export const LB_TO_KG = 0.4536;

export interface QualityPreset {
  pixelRatio: number;
  shadows: boolean;
  shadowMap: number;
  antialias: boolean;
  neighbours: number;
}

export const QUALITY: Record<Quality, QualityPreset> = {
  baja: { pixelRatio: 1, shadows: false, shadowMap: 512, antialias: false, neighbours: 1 },
  media: { pixelRatio: 1.5, shadows: true, shadowMap: 1024, antialias: true, neighbours: 2 },
  alta: { pixelRatio: 2, shadows: true, shadowMap: 2048, antialias: true, neighbours: 3 },
};
