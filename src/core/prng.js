/**
 * Seeded pseudo-random streams for case generation.
 *
 * Algorithm: sfc32 (Chris Doty-Humphrey) with state expanded from a 32-bit seed through splitmix32.
 * Each named stream is seeded from hash(streamName) combined with the case seed, so adding or
 * removing a draw in one stream never shifts the draws of another. Math.random is never used.
 * Changing anything in this file changes every case and requires a generator version increment.
 */

/** @param {number} seed @returns {() => number} splitmix32 step returning an unsigned 32-bit integer */
function splitmix32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/** FNV-1a 32-bit hash of a string. */
function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * @typedef {object} Stream
 * @property {() => number} uniform   uniform on [0, 1)
 * @property {() => number} normal    standard normal (Box-Muller, two uniforms per draw)
 * @property {(lo: number, hi: number) => number} range  uniform on [lo, hi)
 * @property {(lo: number, hi: number) => number} int     integer uniform on [lo, hi] inclusive
 * @property {(p: number) => boolean} chance
 */

/**
 * @param {number} seed unsigned 32-bit integer case seed
 * @param {string} name stream name, for example "demographics" or "maneuver-3"
 * @returns {Stream}
 */
export function createStream(seed, name) {
  const expand = splitmix32((seed ^ hashString(name)) >>> 0);
  let a = expand(), b = expand(), c = expand(), d = expand();
  const uniform = () => {
    const t0 = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const t = (t0 + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  const normal = () => {
    const u1 = Math.max(uniform(), 1e-12);
    const u2 = uniform();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  return {
    uniform,
    normal,
    range: (lo, hi) => lo + (hi - lo) * uniform(),
    int: (lo, hi) => lo + Math.floor(uniform() * (hi - lo + 1)),
    chance: (p) => uniform() < p,
  };
}
