/**
 * Case sampling for the technologist-report and challenge tests. Cases are large (tracings), so they are visited one at a time
 * and never kept; callers keep only what they measure. Failures are collected with a short message and a count, so that a
 * failing test prints a line and not an object.
 */
import { loadDatasets } from '../../src/reference/load.js';
import { createReference } from '../../src/reference/gli.js';
import { buildCase } from '../../src/core/case.js';
import { ARCHETYPES } from '../../src/core/descriptor.js';
import { interpret } from '../../src/interpret/interpret.js';

export const ds = await loadDatasets();
export const { resolveReference } = createReference(ds);
export { ARCHETYPES, buildCase, interpret };

export const TECHNIQUES = ['good', 'fair', 'poor'];
export const LEVELS = ['none', 'light', 'moderate', 'heavy'];

/**
 * Descriptor input of the k-th case of an archetype. Seeds differ between archetypes (a stream is keyed by seed alone, so the
 * same seed would repeat the same draws in every archetype); technique, scenario level and panel cycle independently with k.
 */
export function sampleInput(archetype, k) {
  return {
    seed: k * 10 + ARCHETYPES.indexOf(archetype),
    archetype,
    technique: TECHNIQUES[k % 3],
    scenarioLevel: LEVELS[Math.floor(k / 3) % 4],
    panel: k % 7 === 0 ? 'spirometry' : 'full',
  };
}

/**
 * @param {number} nSeeds cases 1..nSeeds for each of the ten archetypes
 * @param {(c: object, input: object) => void} fn
 */
export function forEachCase(nSeeds, fn) {
  for (const archetype of ARCHETYPES) for (let k = 1; k <= nSeeds; k++) {
    const input = sampleInput(archetype, k);
    fn(buildCase(input, ds), input);
  }
}

/** Collects failures by name: a count and the first message, so that output stays short. */
export function failureLog() {
  const fails = new Map();
  return {
    check(name, ok, message = '') {
      if (ok) return;
      const f = fails.get(name) ?? { count: 0, first: message };
      f.count++;
      fails.set(name, f);
    },
    report(name) {
      const f = fails.get(name);
      return f ? `${name}: ${f.count} failures, first: ${String(f.first).slice(0, 160)}` : '';
    },
    has: (name) => fails.has(name),
  };
}

/** Deep freeze, to show that a function does not write to what it reads. */
export function deepFreeze(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x) && !ArrayBuffer.isView(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
}
