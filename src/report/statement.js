/**
 * Interpretation statement for the report's interpretation box, shown only after the learner has
 * checked their answers. It is the final statement of the narrative composer (src/interpret/narrative.js),
 * with the verification notes returned separately for the "Notes on this simulation" block. A key-based
 * statement is the fallback if the composer throws.
 */
import { PATTERNS } from '../interpret/interpret.js';
import { composeNarrative } from '../interpret/narrative.js';
import { MEASURES, hbKnown } from '../app/format.js';
import { conciseSummary, conciseText } from './concise.js';

/**
 * @param {object} caseData result of buildCase
 * @param {object} interp result of interpret()
 * @param {object} [cmp] result of compareEquations(), for reclassification between equations
 * @returns {string}
 */
export function statementFor(caseData, interp, cmp = null) {
  return interpretationFor(caseData, interp, cmp).text;
}

/**
 * The interpretation for the report: a concise summary (impression first, then labelled lines), the notes on the simulation that belong under it,
 * and the longer supporting explanation of the teaching narrative, kept apart.
 * @returns {{ text: string, notes: string[], parts: { impression: string, lines: { label: string, text: string }[] }|null, supporting: string }}
 *   `text` is the concise summary as plain text (the impression, then one line per item); `supporting` the narrative statement ('' when there is none).
 */
export function interpretationFor(caseData, interp, cmp = null) {
  try {
    const narrative = composeNarrative({ caseData, interp, cmp, seed: caseData.descriptor?.seed ?? 0 });
    if (narrative?.finalStatement) {
      const parts = conciseSummary({ caseData, interp, cmp, caveats: narrative.caveats });
      return { text: conciseText(parts), notes: narrative.notes ?? [], parts, supporting: narrative.finalStatement };
    }
  } catch { /* fall through to the key-based statement */ }
  return { text: keyStatement(caseData, interp, cmp), notes: [], parts: null, supporting: '' };
}

function keyStatement(caseData, interp, cmp) {
  const out = [];
  const sev = interp.severity?.scored ? `, ${interp.severity.id} by the FEV1 z-score` : '';
  out.push(`${PATTERNS[interp.pattern]}${sev}.`);
  if (interp.bd) out.push(`Bronchodilator response is ${interp.bd.rule2022.significant ? 'significant' : 'not significant'} by the ERS/ATS 2022 criterion (change above 10% of predicted).`);
  if (interp.dlco) out.push(hbKnown(caseData.dlco) ? `Hemoglobin-adjusted DLCO is ${interp.dlco.category}.` : `DLCO, without hemoglobin adjustment because none was available, is ${interp.dlco.category}.`);
  if (interp.qualityLimited) out.push('Test quality limits confidence in these values.');
  if (cmp?.labelChanges?.length) out.push(`Classification differs between GLI-2012 and GLI Global for ${cmp.labelChanges.map((c) => MEASURES[c.measure].label).join(', ')}.`);
  return out.join(' ');
}
