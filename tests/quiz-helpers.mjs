import { loadDatasets } from '../src/reference/load.js';
import { createReference } from '../src/reference/gli.js';
import { NO_ADAPTERS } from '../src/quiz/adapters.js';
import { prepareCase } from '../src/quiz/prepare.js';
import { buildItems } from '../src/quiz/items.js';
import { ARCHETYPES } from '../src/core/descriptor.js';
import { SKILLS } from '../src/quiz/codes.js';

export const datasets = await loadDatasets();
export const resolve = createReference(datasets).resolveReference;
export const makeCtx = (over = {}) => ({ datasets, resolve, equation: 'GLIglobal', adapters: NO_ADAPTERS, skills: SKILLS, ...over });

/** Prepared case and items for a descriptor. */
export function build(descriptor, over = {}) {
  const ctx = makeCtx(over);
  const prep = prepareCase(descriptor, ctx);
  return { ctx, prep, items: buildItems(prep, ctx) };
}

/** A spread of descriptors covering every archetype, technique and panel. */
export function sweep(perArchetype = 6) {
  const out = [];
  for (const archetype of ARCHETYPES) for (let i = 0; i < perArchetype; i++) out.push({ seed: 1000 + i * 37, archetype, severity: 1 + (i % 3), technique: ['good', 'fair', 'poor'][i % 3], panel: i % 5 === 4 ? 'spirometry' : 'full' });
  return out;
}
