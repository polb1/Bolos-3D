/** Small seeded PRNG (mulberry32) so physical variation is reproducible in tests. */
export type Rng = () => number;

export function createRng(seed = (Math.random() * 2 ** 32) >>> 0): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normally distributed sample (Box–Muller). */
export function gaussian(rng: Rng, sigma = 1): number {
  const u = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()) * sigma;
}

export const range = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng();
