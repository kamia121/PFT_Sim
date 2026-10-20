/**
 * Deterministic shuffling and seed mixing for the quiz. Every call uses a named stream from
 * src/core/prng.js, so a shuffle never shifts any draw used by case generation.
 */
import { createStream } from '../core/prng.js';

/** Mixes two unsigned 32-bit integers into one. */
export function mixSeed(a, b) {
  let h = (a >>> 0) ^ Math.imul((b >>> 0) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

/** Fisher-Yates shuffle of a copy; the order is a pure function of (seed, name). */
export function shuffled(items, seed, name) {
  const rng = createStream(seed >>> 0, name);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** One element chosen deterministically from a non-empty array. */
export function pick(items, seed, name) {
  return items[createStream(seed >>> 0, name).int(0, items.length - 1)];
}
