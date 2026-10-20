/**
 * Exams: building every case of an exam code, and the option order a learner (or a printed sheet) sees.
 */
import { createReference } from '../reference/gli.js';
import { examDescriptors } from './codes.js';
import { prepareCase } from './prepare.js';
import { buildItems, displayOptions } from './items.js';
import { mixSeed } from './shuffle.js';

/** @param {Record<string, object>} datasets @param {object} adapters @param {{ equation: string, skills: string[] }} def */
export function makeContext(datasets, adapters, def) {
  return { datasets, resolve: createReference(datasets).resolveReference, adapters, equation: def.equation, skills: def.skills };
}

/** Every case of the exam with its prepared interpretation and items (with keys). */
export function buildExamCases(def, ctx) {
  return examDescriptors(def).map((d, index) => {
    const prep = prepareCase(d, ctx);
    return { index, descriptor: d, prep, items: buildItems(prep, ctx) };
  });
}

/** Seed that orders the options for one learner; learner seed 0 is the printed sheet. */
export const orderSeedFor = (def, learnerSeed = 0) => (learnerSeed ? mixSeed(def.shuffleSeed, learnerSeed) : def.shuffleSeed >>> 0);

export const LETTERS = 'ABCDEFGHIJ';

/** Options in display order with letters, as printed on a sheet. */
export function lettered(item, def, caseIndex, learnerSeed = 0) {
  return displayOptions(item, orderSeedFor(def, learnerSeed), caseIndex).map((o, i) => ({ ...o, letter: LETTERS[i] }));
}
