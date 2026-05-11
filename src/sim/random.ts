export type RandomSource = {
  /** Returns a float in [0, 1). */
  next(): number;
  /** Returns an integer in [min, max]. */
  nextInt(min: number, max: number): number;
  /** Returns true with probability p. */
  chance(p: number): boolean;
};

export function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    nextInt: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
  };
}
