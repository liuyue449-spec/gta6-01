// A tiny seeded random generator: the same seed always gives the same city,
// the same traffic and the same screenshot scene. Written from the well-known
// mulberry32 recurrence, re-expressed here so the whole game is deterministic
// from one seed number. Every helper takes the generator as its first
// argument, so no module ever touches Math.random for game content.

export function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** A value in [min, max) from a seeded generator. */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** One element of an array, chosen by a seeded generator. */
export function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}

/** An integer in [min, max] from a seeded generator. */
export function intRange(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** True with probability `p` (0..1), from a seeded generator. */
export function chance(random, p) {
  return random() < p;
}

/**
 * A stable 0..1 hash of two world coordinates. The renderer uses it to vary
 * rooftops, windows and waves deterministically without storing anything:
 * the same corner of the city decorates itself the same way every frame.
 */
export function hash2(x, y) {
  let h = (Math.round(x) * 374761393 + Math.round(y) * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
