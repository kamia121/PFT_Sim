/**
 * Fixed stand-ins for the technologist's report and the challenge list, so that the summary, details and practice
 * threads can develop without the generator. The values describe one poor-technique case whose statement overstates the
 * quality: grades A and B stated over grades D and E, a cough-spoiled representative loop, and an unacceptable DLCO test.
 * The shapes are those of src/core/rt-report.js (RtReport) and src/challenges/index.js (Challenge).
 */

const isPlain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
function merge(base, extra) {
  if (!isPlain(base) || !isPlain(extra)) return extra === undefined ? base : extra;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) out[k] = isPlain(v) && isPlain(base[k]) ? merge(base[k], v) : v;
  return out;
}

/** @returns {import('../../src/core/rt-report.js').RtReport} */
const baseReport = () => ({
  version: 1,
  honesty: 'optimistic',
  interpretationLines: [
    'Albuterol 400 µg by metered-dose inhaler with spacer; post-bronchodilator spirometry started 15 min after the dose.',
    'Last cigarette about 45 min before the test.',
    'Hemoglobin 13.4 g/dL entered for the DLCO adjustment.',
    'Effort: good.',
  ],
  qualityLines: [
    'Test quality: Pre: FEV₁ - A, FVC - A; Post: FEV₁ - B, FVC - A.',
    'DLCO test acceptable.',
    'Plethysmography acceptable and repeatable.',
  ],
  closing: 'Official interpretation to follow.',
  stated: { pre: { fev1: 'A', fvc: 'A' }, post: { fev1: 'B', fvc: 'A' }, dlco: 'acceptable', pleth: 'acceptable' },
  truth: {
    pre: { fev1: 'D', fvc: 'C' },
    post: { fev1: 'E', fvc: 'D' },
    dlco: { acceptable: false, reasons: ['Valsalva maneuver during the breath-hold'] },
    pleth: { acceptable: true, reasons: [] },
  },
  representative: {
    pre: { index: 2, kind: 'flawed', faults: ['cough'] },
    post: { index: 0, kind: 'best', faults: [] },
    pleth: { trial: 1 },
    dlco: { test: 0 },
  },
  needsDetails: true,
  detailsReasons: [
    'The statement gives higher grades than the maneuver list supports: a cough in the first second makes the FEV₁ of maneuvers 2, 3 and 5 before the bronchodilator unacceptable.',
    'The flow-volume loop on the summary page is maneuver 3, which carries a cough in the first second; maneuvers 1 and 4 are acceptable and supply the reported values.',
    'The DLCO test shows a Valsalva maneuver during the breath-hold, so the statement that it is acceptable does not hold.',
  ],
});

/**
 * @param {Partial<import('../../src/core/rt-report.js').RtReport>} [overrides] merged into the stub; plain objects merge key by key,
 *   arrays and scalars replace (pass `{ stated: { post: null } }` to remove the post-bronchodilator statement)
 * @returns {import('../../src/core/rt-report.js').RtReport}
 */
export function stubRtReport(overrides = {}) {
  return merge(baseReport(), overrides);
}

const GRADES = ['A', 'B', 'C', 'D', 'E', 'U', 'F'].map((g) => [g, g]);
const YES_NO = [['yes', 'Acceptable'], ['no', 'Not acceptable']];
const loopOptions = [['acceptable', 'Acceptable'], ['slow-start', 'Hesitant start'], ['early-termination', 'Early termination of expiration'], ['cough', 'Cough in the first second'], ['glottic-closure', 'Glottic closure'], ['leak', 'Air leak at the lips'], ['mouthpiece-obstruction', 'Tongue or teeth at the mouthpiece'], ['pause-at-TLC', 'Pause at full inspiration'], ['no-plateau', 'No plateau']];

/**
 * A fixed challenge list for a case with five pre-bronchodilator maneuvers, a post-bronchodilator set, DLCO and plethysmography.
 * @returns {import('../../src/challenges/index.js').Challenge[]}
 */
export function stubChallenges() {
  const rowsFor = (n) => Array.from({ length: n }, (_, i) => [{ id: `fev1:${i}`, label: `Maneuver ${i + 1}, FEV₁` }, { id: `fvc:${i}`, label: `Maneuver ${i + 1}, FVC` }]).flat();
  const keyFor = (n, bad) => Object.fromEntries(rowsFor(n).map((r) => [r.id, bad.includes(r.id) ? 'no' : 'yes']));
  return [
    { id: 'acceptableManeuversPre', stage: 1, title: 'Acceptable maneuvers before the bronchodilator', prompt: 'For each recorded forced expiration, mark whether the FEV₁ and the FVC meet the acceptability criteria of the ATS/ERS 2019 statement.', options: YES_NO, rows: rowsFor(5), key: keyFor(5, ['fev1:1', 'fev1:2', 'fvc:3', 'fev1:4', 'fvc:4']), why: 'Stub text for the acceptability item.', needsDetails: true },
    { id: 'acceptableManeuversPost', stage: 1, title: 'Acceptable maneuvers after the bronchodilator', prompt: 'For each recorded forced expiration, mark whether the FEV₁ and the FVC meet the acceptability criteria of the ATS/ERS 2019 statement.', options: YES_NO, rows: rowsFor(3), key: keyFor(3, ['fvc:2']), why: 'Stub text for the acceptability item.', needsDetails: true },
    { id: 'gradePreFev1', stage: 1, title: 'FEV₁ quality grade before the bronchodilator', prompt: 'Grade the FEV₁ of the pre-bronchodilator set.', options: GRADES, key: 'D', why: 'Stub text for the grade item.', needsDetails: true },
    { id: 'gradePreFvc', stage: 1, title: 'FVC quality grade before the bronchodilator', prompt: 'Grade the FVC of the pre-bronchodilator set.', options: GRADES, key: 'C', why: 'Stub text for the grade item.', needsDetails: true },
    { id: 'gradePostFev1', stage: 1, title: 'FEV₁ quality grade after the bronchodilator', prompt: 'Grade the FEV₁ of the post-bronchodilator set.', options: GRADES, key: 'E', why: 'Stub text for the grade item.', needsDetails: true },
    { id: 'gradePostFvc', stage: 1, title: 'FVC quality grade after the bronchodilator', prompt: 'Grade the FVC of the post-bronchodilator set.', options: GRADES, key: 'D', why: 'Stub text for the grade item.', needsDetails: true },
    { id: 'representativeLoopOk', stage: 1, title: 'Flow-volume loops on the summary page', prompt: 'For the loop drawn on the summary page, state whether the maneuver is acceptable and, if it is not, which fault it shows.', options: loopOptions, rows: [{ id: 'pre', label: 'Before the bronchodilator' }, { id: 'post', label: 'After the bronchodilator' }], key: { pre: 'cough', post: 'acceptable' }, alsoCorrect: { pre: [], post: [] }, why: 'Stub text for the loop item.', needsDetails: false },
    { id: 'bdInterpretable', stage: 1, title: 'Bronchodilator response', prompt: 'Apply the 2022 rule and decide whether the post-bronchodilator set supports a comparison.', options: [['significant', 'Significant'], ['not-significant', 'Not significant']], rows: [{ id: 'response', label: 'Response by the 2022 rule' }, { id: 'interpretable', label: 'Post-bronchodilator set interpretable' }], rowOptions: { interpretable: [['yes', 'Interpretable'], ['no', 'Not interpretable']] }, key: { response: 'significant', interpretable: 'no' }, why: 'Stub text for the bronchodilator item.', needsDetails: true },
    { id: 'rtConsistent', stage: 2, title: 'Technologist statement', prompt: 'Compare the technologist’s statement with the maneuvers.', options: [['consistent', 'Consistent'], ['overstated', 'Overstated'], ['understated', 'Understated'], ['not-stated', 'Not stated']], key: 'overstated', why: 'Stub text for the statement item.', needsDetails: true },
    { id: 'dlcoAcceptable', stage: 1, title: 'Diffusing capacity test', prompt: 'Decide whether the single-breath test meets the acceptability criteria.', options: [['acceptable', 'Acceptable'], ['not-acceptable', 'Not acceptable']], key: 'not-acceptable', why: 'Stub text for the DLCO item.', needsDetails: true },
    { id: 'plethAcceptable', stage: 1, title: 'Plethysmography', prompt: 'Decide whether the thoracic gas volume measurement is acceptable and repeatable.', options: [['acceptable', 'Acceptable and repeatable'], ['not-acceptable', 'Not acceptable']], key: 'acceptable', why: 'Stub text for the plethysmography item.', needsDetails: false },
  ];
}
