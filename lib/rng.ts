// Deterministic PRNG (mulberry32). We keep the 32-bit state in game state so a
// game can be reproduced / debugged, and so undo can restore randomness.

export function mulberry32(state: number): { next: () => number; state: () => number } {
  let a = state >>> 0;
  return {
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state() {
      return a >>> 0;
    },
  };
}

/** Pure single-step: returns a float in [0,1) and the next state. */
export function nextRandom(state: number): { value: number; state: number } {
  const r = mulberry32(state);
  const value = r.next();
  return { value, state: r.state() };
}

export function randomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}

/** Fisher–Yates shuffle driven by the deterministic RNG. Returns new state. */
export function shuffle<T>(arr: T[], state: number): { result: T[]; state: number } {
  const result = arr.slice();
  let s = state;
  for (let i = result.length - 1; i > 0; i--) {
    const r = nextRandom(s);
    s = r.state;
    const j = Math.floor(r.value * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return { result, state: s };
}
