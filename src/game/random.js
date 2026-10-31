// Random sources. Game code takes randomness as an `rng` function that returns
// a number in [0, 1), like Math.random. In play it is Math.random; tests,
// balance scripts and bug reports can pass a seeded one instead, so the same
// seed and the same state give the same result.

// Math.random, looked up on every call. Code that keeps an rng for a while
// (the combat engine, an encounter sim) uses this as its default, so a test
// that replaces Math.random later still controls it.
export const defaultRandom = () => Math.random();

// A small, fast seeded generator (mulberry32). Equal seeds give equal sequences.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
