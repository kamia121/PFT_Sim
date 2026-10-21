/**
 * The technologist's report: what the person who ran the study writes on the printout, and the engine's
 * own computed quality against which that statement is measured. Teaching simulator only.
 *
 * Contract: docs/REPORT-FIRST-PLAN.md ("The technologist's quality report"). The RtReport is a pure function of
 * the case and its seed (random stream label `rt-report`); nothing in the case, its report or its key depends on it.
 */

/** @typedef {'accurate'|'software'|'generic'|'optimistic'|'pessimistic'|'stale'|'silent'} Honesty */

/** @typedef {object} RtReport
 * @property {1} version
 * @property {'accurate'|'software'|'generic'|'optimistic'|'pessimistic'|'stale'|'silent'} honesty
 * @property {string[]} interpretationLines comment lines that bear on interpretation (medication, smoking, hemoglobin, bronchodilator timing, effort word), in print order
 * @property {string[]} qualityLines the quality statement lines ([] when silent); shown or withheld by the visibility rule
 * @property {string} closing 'Official interpretation to follow.'
 * @property {{ pre: {fev1:string,fvc:string}|null, post: {fev1:string,fvc:string}|null, dlco: 'acceptable'|'not-acceptable'|null, pleth: 'acceptable'|'not-acceptable'|null }} stated
 * @property {{ pre: {fev1:string,fvc:string}, post: {fev1:string,fvc:string}|null, dlco: {acceptable:boolean, reasons:string[]}|null, pleth: {acceptable:boolean, reasons:string[]}|null }} truth the engine's computed grades and acceptability
 * @property {{ pre: {index:number, kind:'best'|'flawed', faults:string[]}, post: {index:number, kind:'best'|'flawed', faults:string[]}|null, pleth: {trial:number}|null, dlco: {test:number}|null }} representative maneuver, trial or test shown on page 1 (0-based index into case.spirometry.*.maneuvers and case.pleth.trials); 'best' is the maneuver with the largest FEV1 plus FVC among the acceptable ones, 'flawed' is an unacceptable one drawn instead; the flawed kind never applies to plethysmography
 * @property {boolean} needsDetails true when the details change an answer for this case
 * @property {string[]} detailsReasons plain-language reasons, shown only after the answers are checked
 */

/**
 * Notes on the fields (additive to the plan, no change of shape):
 * - `stated.*` is null when the statement says nothing about that part (a silent or generic statement, or a test the
 *   technologist did not mention). A stale statement can carry a non-null `stated.post` or `stated.dlco` for a test that
 *   truth does not have (`truth.post` or `truth.dlco` null).
 * - `truth.dlco.reasons` and `truth.pleth.reasons` are lower-case fragments without a final period, empty when acceptable.
 * - `representative.*.faults` are fault ids of src/core/quality.js (`faultWording(id)` gives the text) that make the
 *   displayed maneuver unacceptable, empty for an acceptable maneuver.
 * - Indices are 0-based. `representative.dlco.test` is 0 because one single-breath test is simulated.
 */

/**
 * @param {object} caseData a case from buildCase
 * @returns {RtReport}
 */
export function buildRtReport(caseData) {
  void caseData;
  throw new Error('buildRtReport: not implemented yet; develop against tests/helpers/rt-stub.mjs');
}

/**
 * The maneuver, trial and test shown on the summary page.
 * @param {object} caseData a case from buildCase
 * @returns {RtReport['representative']}
 */
export function representativeFor(caseData) {
  void caseData;
  throw new Error('representativeFor: not implemented yet; develop against tests/helpers/rt-stub.mjs');
}
