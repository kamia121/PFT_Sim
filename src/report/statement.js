/**
 * Interpretation statement for the report's interpretation box, shown only after the learner has
 * checked their answers. This is a deterministic placeholder built from the interpretation key.
 * The narrative module (src/interpret/narrative.js, thread NARR) is meant to replace it:
 * the integrator should call composeNarrative({ caseData, interp, cmp, seed }) and return its
 * finalStatement from this function.
 */
import { PATTERNS } from '../interpret/interpret.js';
import { MEASURES } from '../app/format.js';

/**
 * @param {object} caseData result of buildCase
 * @param {object} interp result of interpret()
 * @param {object} [cmp] result of compareEquations(), for reclassification between equations
 * @returns {string}
 */
export function statementFor(caseData, interp, cmp = null) {
  const out = [];
  const sev = interp.severity?.scored ? `, ${interp.severity.id} by the FEV1 z-score` : '';
  out.push(`${PATTERNS[interp.pattern]}${sev}.`);
  if (interp.bd) out.push(`Bronchodilator response is ${interp.bd.rule2022.significant ? 'significant' : 'not significant'} by the ERS/ATS 2022 criterion (change above 10% of predicted).`);
  if (interp.dlco) out.push(`Hemoglobin-adjusted DLCO is ${interp.dlco.category}.`);
  if (interp.qualityLimited) out.push('Test quality limits confidence in these values.');
  if (cmp?.labelChanges?.length) out.push(`Classification differs between GLI-2012 and GLI Global for ${cmp.labelChanges.map((c) => MEASURES[c.measure].label).join(', ')}.`);
  return out.join(' ');
}
