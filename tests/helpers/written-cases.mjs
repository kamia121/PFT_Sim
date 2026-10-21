/** Real generated cases (descriptors fixed here; each test asserts the key it relies on) and a one-call grade. */
import { ds, resolveReference } from '../report-helpers.mjs';
import { buildCase } from '../../src/core/case.js';
import { interpret } from '../../src/interpret/interpret.js';
import { gradeWritten } from '../../src/written/index.js';

export const CASES = {
  normal: { seed: 1, archetype: 'normal', severity: 1, technique: 'good', panel: 'full' },
  normalLimited: { seed: 164, archetype: 'normal', severity: 1, technique: 'good' },
  normalDlcoLow: { seed: 5, archetype: 'normal', severity: 1, technique: 'good', panel: 'full' },
  mild: { seed: 1, archetype: 'obstruction', severity: 1, technique: 'good', panel: 'full' },
  moderateLowDlco: { seed: 22, archetype: 'obstruction', severity: 1, technique: 'good', panel: 'full' },
  severe: { seed: 1, archetype: 'obstruction', severity: 3, technique: 'good', panel: 'full' },
  bdSignificant: { seed: 4, archetype: 'obstruction', severity: 1, technique: 'good', panel: 'full' },
  preservedFev1: { seed: 164, archetype: 'obstruction', severity: 1, technique: 'good' }, // key fev1-normal, severityAlso mild, BD significant
  mildBoundary: { seed: 99, archetype: 'obstruction', severity: 1, technique: 'good' }, // key mild, severityAlso fev1-normal
  moderateBoundary: { seed: 164, archetype: 'obstruction', severity: 2, technique: 'good' }, // key moderate, severityAlso mild
  severeBoundary: { seed: 99, archetype: 'obstruction', severity: 3, technique: 'good' }, // key severe, severityAlso moderate
  lowFvcNoVolumes: { seed: 16, archetype: 'obstruction', severity: 1, technique: 'good', panel: 'spirometry' },
  prism: { seed: 2, archetype: 'restriction-parenchymal', severity: 2, technique: 'good', panel: 'spirometry' }, // PRISm under both equations
  prismOtherNormal: { seed: 2, archetype: 'restriction-parenchymal', severity: 1, technique: 'good', panel: 'spirometry' }, // PRISm under GLI Global, a different pattern under GLI-2012
  restriction: { seed: 1, archetype: 'restriction-parenchymal', severity: 1, technique: 'good', panel: 'full' },
  nonspecific: { seed: 3, archetype: 'restriction-extraparenchymal', severity: 1, technique: 'good', panel: 'full' },
  mixed: { seed: 1, archetype: 'mixed', severity: 1, technique: 'good', panel: 'full' },
  bdUninterpretable: { seed: 1, archetype: 'normal', technique: 'poor', severity: 2, scenarioLevel: 'moderate' }, // a post study exists; its FEV1 is missing
  cohbMeasured: { seed: 57, archetype: 'normal', severity: 2, technique: 'good', scenarioLevel: 'light' },
  cohbUnmeasured: { seed: 17, archetype: 'normal', severity: 2, technique: 'good', scenarioLevel: 'light' },
  pattern2012: { seed: 23, archetype: 'normal', severity: 1, technique: 'good', panel: 'full' },
};

export function setup(descriptor, equation = 'GLIglobal') {
  const caseData = buildCase(descriptor, ds);
  const other = equation === 'GLIglobal' ? 'GLI2012' : 'GLIglobal';
  const interp = interpret(caseData.report, resolveReference, equation);
  const interpOther = interpret(caseData.report, resolveReference, other);
  return { caseData, interp, interpOther, equation };
}

/** Grade `text` on a named case; returns the result with `.by(domain)` giving the groups of that domain's items. */
export function grade(name, text, equation = 'GLIglobal') {
  const s = setup(CASES[name], equation);
  const r = gradeWritten({ text, ...s });
  r.by = (domain) => r.items.filter((i) => i.domain === domain).map((i) => i.group);
  r.one = (domain) => r.by(domain)[0] ?? 'none';
  r.s = s;
  return r;
}
