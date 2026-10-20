/**
 * Case drawing for practice and exams. Archetype weights are teaching choices, not prevalence, and
 * copy the practice mix of the learner page (src/app/main.js).
 */
import { ARCHETYPES } from '../core/descriptor.js';
import { shuffled } from './shuffle.js';

export const PRACTICE_MIX = [['normal', 14], ['obstruction', 22], ['restriction-parenchymal', 10], ['restriction-extraparenchymal', 6], ['mixed', 8], ['nonspecific', 8], ['low-dlco', 7], ['anemia', 4], ['obesity-low-erv', 7], ['bd-discordant', 8]];
export const TECHNIQUE_NAMES = ['good', 'fair', 'poor'];
export const PANEL_NAMES = ['full', 'spirometry'];

/** Weighted index from non-negative weights and a uniform draw in [0, 1). */
export function weightedIndex(weights, u) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = u * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/**
 * Draws one case descriptor. The number and order of draws is fixed, so the same stream gives the same case.
 * @param {() => number} u uniform source on [0, 1)
 * @param {{ archetypes: string[], technique: number[], panel: number[], scenario?: string, forceArchetype?: string }} opts
 */
export function drawDescriptor(u, opts) {
  const pool = PRACTICE_MIX.filter(([a]) => opts.archetypes.includes(a));
  if (!pool.length) throw new RangeError('no archetype selected');
  const drawn = pool[weightedIndex(pool.map(([, w]) => w), u())][0];
  const archetype = opts.forceArchetype ?? drawn;
  const seed = Math.floor(u() * 4294967296) >>> 0;
  const severity = 1 + Math.floor(u() * 3);
  const technique = TECHNIQUE_NAMES[weightedIndex(opts.technique, u())];
  const panel = PANEL_NAMES[weightedIndex(opts.panel, u())];
  const d = { seed, archetype, severity, technique, panel };
  if (opts.scenario && opts.scenario !== 'none') d.scenarioLevel = opts.scenario;
  return d;
}

/**
 * Archetype for each exam position: every selected topic appears once, in an order fixed by the exam
 * seed, before any topic repeats; later positions follow the practice weights.
 * @param {number} n @param {string[]} selected @param {number} seed @param {() => number} u
 */
export function examArchetypes(n, selected, seed, u) {
  const pool = ARCHETYPES.filter((a) => selected.includes(a));
  const first = shuffled(pool, seed, 'quiz-exam-topics');
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i < first.length) out.push(first[i]);
    else {
      const w = PRACTICE_MIX.filter(([a]) => pool.includes(a));
      out.push(w[weightedIndex(w.map(([, x]) => x), u())][0]);
    }
  }
  return shuffled(out, seed, 'quiz-exam-order');
}
