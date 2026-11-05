export type Quality = 'baja' | 'media' | 'alta';
export type CameraMode = 'clasica' | 'aerea';

export interface Settings {
  players: 1 | 2;
  names: [string, string];
  ballWeight: 12 | 14 | 15 | 16;
  ballColor: string;
  wood: 'clara' | 'oscura';
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

export const BALL_COLORS: Record<string, { label: string; base: string; swirl: string }> = {
  rubi: { label: 'Rubí', base: '#b3122e', swirl: '#ff5a6e' },
  oceano: { label: 'Océano', base: '#123d9e', swirl: '#4fb6ff' },
  lima: { label: 'Lima', base: '#5d7a0c', swirl: '#d8f24a' },
  noche: { label: 'Noche', base: '#16161c', swirl: '#6a5cff' },
  oro: { label: 'Oro', base: '#a06a08', swirl: '#ffd23f' },
  perla: { label: 'Perla', base: '#c9cdd8', swirl: '#ffffff' },
};

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
