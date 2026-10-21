/**
 * Builders for the quality challenges. Each item is a pure description (see the Challenge typedef in index.js). Keys come
 * from the engine (the maneuver evaluations, the grades, the interpretation) and from the technologist's report only through
 * `statementVerdict`, which compares the statement with the engine's grades. Explanations are written for the moment after the
 * answers are checked: physiology first, units named, no treatment advice.
 */
import { SPIROMETRY_2019 as S } from '../core/standards.js';
import { FAULT_TEXT } from '../core/quality.js';
import { FAULT_ORDER, GRADE_ORDER, statementVerdict, unacceptableCauses, causesText } from '../core/rt-report.js';

const GRADE_OPTIONS = GRADE_ORDER.map((g) => [g, g]);
const YES_NO = [['yes', 'Acceptable'], ['no', 'Not acceptable']];
const ACCEPT = [['acceptable', 'Acceptable'], ['not-acceptable', 'Not acceptable']];
const VAR = { fev1: 'FEV₁', fvc: 'FVC' };
const SET_ADVERB = { pre: 'before', post: 'after' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Project choice (not a published criterion): the post-bronchodilator comparison is interpretable when every FEV₁ and FVC grade of both sets is A, B or C. */
const INTERPRETABLE_GRADES = ['A', 'B', 'C'];
/** Existing caveat ids (src/scenarios) under which the measured response is unreliable whatever the grades: a short wait and better effort after the dose. */
const UNRELIABLE_RESPONSE_CAVEATS = ['bd-timing-short', 'bd-effort-artifact'];

const sameGrades = (a, b) => Boolean(a) && Boolean(b) && a.fev1 === b.fev1 && a.fvc === b.fvc;
/** The summary page settles the grades: the statement gives them for every set that exists, and they equal the engine's. */
const gradesOnSummary = (rt) => sameGrades(rt.stated.pre, rt.truth.pre) && (!rt.truth.post || sameGrades(rt.stated.post, rt.truth.post));
const word = (t) => (t ? (t.acceptable ? 'acceptable' : 'not-acceptable') : null);

// ---- acceptability of each maneuver --------------------------------------------------------------------------------

function acceptabilityItem(c, set) {
  const sess = c.spirometry[set];
  if (!sess) return null;
  const evals = sess.summary.evaluations;
  const rows = evals.flatMap((_, i) => [{ id: `fev1:${i}`, label: `Maneuver ${i + 1}, FEV₁` }, { id: `fvc:${i}`, label: `Maneuver ${i + 1}, FVC` }]);
  const key = Object.fromEntries(rows.map((r) => { const [k, i] = r.id.split(':'); return [r.id, evals[Number(i)][k].acceptable ? 'yes' : 'no']; }));
  const inSet = (k) => (unacceptableCauses(sess.summary, k).length ? `unacceptable for the ${VAR[k]}: ${causesText(sess.summary, k)}` : `every maneuver is acceptable for the ${VAR[k]}`);
  const when = `${SET_ADVERB[set]} the bronchodilator`;
  return {
    id: set === 'pre' ? 'acceptableManeuversPre' : 'acceptableManeuversPost',
    stage: 1,
    title: `Acceptable maneuvers ${when}`,
    prompt: `For each forced expiration recorded ${when}, mark whether its FEV₁ and whether its FVC meet the acceptability criteria of the ATS/ERS 2019 statement.`,
    options: YES_NO,
    rows,
    key,
    why: `The FEV₁ is the volume exhaled in the first second, so interrupted flow in that interval (a cough, glottic closure, an air leak) spoils the FEV₁; the FVC is the volume of a complete expiration, so it needs an end-of-forced-expiration indicator (a plateau, an expiratory time of 15 s, or an FVC within ${S.eofeRepeatabilityOfLargestFvc.value.toFixed(3)} L of the largest FVC in the set), and a cough in the first second does not spoil it. Both variables need a back-extrapolated volume below the larger of 5% of the FVC and ${S.bevAbsoluteLiters.value.toFixed(3)} L (ATS/ERS 2019, Table 7). In this set, ${inSet('fev1')}; ${inSet('fvc')}.`,
    needsDetails: true,
  };
}

// ---- grades ----------------------------------------------------------------------------------------------------------

function gradeRule(grade, V) {
  const g = S.gradeSpreadLiters;
  const f = (x) => x.toFixed(3);
  return {
    A: `Three or more acceptable maneuvers whose two largest ${V} values differ by ${f(g.A)} L or less give grade A.`,
    B: `Two acceptable maneuvers whose ${V} values differ by ${f(g.B)} L or less give grade B.`,
    C: `Two or more acceptable maneuvers whose two largest ${V} values differ by more than ${f(g.B)} L and by ${f(g.C)} L or less give grade C.`,
    D: `Two or more acceptable maneuvers whose two largest ${V} values differ by more than ${f(g.C)} L and by ${f(g.D)} L or less give grade D.`,
    E: `A single acceptable maneuver, or two largest acceptable ${V} values that differ by more than ${f(g.D)} L, give grade E.`,
    U: `No acceptable maneuver with at least one usable maneuver gives grade U, and the ${V} is taken from the best usable maneuver.`,
    F: `No usable maneuver gives grade F.`,
  }[grade];
}

function gradeItem(c, rt, set, key) {
  const sess = c.spirometry[set];
  if (!sess || !rt.truth[set]) return null;
  const V = VAR[key];
  const grade = rt.truth[set][key];
  const n = sess.summary.nAcceptable[key];
  const spread = sess.summary.spread[key];
  const when = `${SET_ADVERB[set]} the bronchodilator`;
  const stated = rt.stated[set]?.[key];
  return {
    id: `grade${cap(set)}${cap(key)}`,
    stage: 1,
    title: `${V} quality grade ${when}`,
    prompt: `Assign the ATS/ERS 2019 quality grade (A to F) to the ${V} of the set recorded ${when}.`,
    options: GRADE_OPTIONS,
    key: grade,
    why: `Agreement between independent maximal efforts is the check that a reported maximum is reproducible, so the grade follows from the number of acceptable maneuvers and from the difference between the two largest acceptable values (ATS/ERS 2019, Table 10). ${gradeRule(grade, V)} In this set, ${n === 0 ? `no maneuver is acceptable for the ${V}` : `${n} maneuver${n > 1 ? 's are' : ' is'} acceptable for the ${V}`}${spread !== null ? `, and the two largest acceptable values differ by ${spread.toFixed(3)} L` : ''}.`,
    needsDetails: stated !== grade,
  };
}

// ---- representative loop ---------------------------------------------------------------------------------------------

const LOOP_OPTIONS = [['acceptable', 'Acceptable'], ...FAULT_ORDER.map((id) => [id, cap(FAULT_TEXT[id])])];

function loopItem(c, rt) {
  const rows = [];
  const key = {}, alsoCorrect = {}, notes = [];
  for (const set of ['pre', 'post']) {
    const r = rt.representative[set];
    if (!r) continue;
    rows.push({ id: set, label: set === 'pre' ? 'Before the bronchodilator' : 'After the bronchodilator' });
    key[set] = r.faults.length ? r.faults[0] : 'acceptable';
    alsoCorrect[set] = r.faults.slice(1);
    const n = c.spirometry[set].maneuvers.length;
    notes.push(`The loop ${SET_ADVERB[set]} the bronchodilator is maneuver ${r.index + 1} of ${n}; ${r.faults.length ? `it is unacceptable (${r.faults.map((f) => FAULT_TEXT[f]).join('; ')})` : r.kind === 'best' ? 'it is acceptable and has the largest FEV₁ plus FVC among the acceptable maneuvers' : 'it is acceptable'}.`);
  }
  if (!rows.length) return null;
  return {
    id: 'representativeLoopOk',
    stage: 1,
    title: 'Flow-volume loop on the summary page',
    prompt: 'For the forced expiration drawn on the summary page, state whether the maneuver is acceptable and, if it is not, which fault it shows.',
    options: LOOP_OPTIONS,
    rows,
    key,
    alsoCorrect,
    why: `Flow in the first second follows the effort and the airway mechanics, so a cough appears as a notch on the expiratory limb, a hesitant start as a rounded, late peak, an abrupt end at nonzero flow as glottic closure or early termination, and an incomplete expiration as a volume-time curve without a plateau. ${notes.join(' ')} A loop whose volume falls short of the tabulated FVC is not thereby flawed: the tabulated FEV₁ and FVC are the largest acceptable values, usually from different maneuvers.`,
    needsDetails: false,
  };
}

// ---- bronchodilator response and interpretability --------------------------------------------------------------------

function bdItem(c, rt, interp, interpOther) {
  const bd = interp?.bd;
  if (!bd || !c.spirometry.post) return null;
  const response = bd.rule2022.significant ? 'significant' : 'not-significant';
  const grades = [...Object.values(rt.truth.pre), ...Object.values(rt.truth.post ?? {})];
  const caveats = interp.key?.caveatIds ?? c.report.caveatIds ?? [];
  const blocking = caveats.filter((id) => UNRELIABLE_RESPONSE_CAVEATS.includes(id));
  const poorGrades = grades.some((g) => !INTERPRETABLE_GRADES.includes(g));
  const interpretable = !poorGrades && blocking.length === 0 ? 'yes' : 'no';
  const otherBd = interpOther?.bd;
  const otherKey = otherBd ? { response: otherBd.rule2022.significant ? 'significant' : 'not-significant', interpretable } : undefined;
  const agreement = bd.rulesAgree
    ? 'The earlier rule (a rise of at least 12% of baseline and at least 0.200 L) gives the same label for this case.'
    : `The earlier rule (a rise of at least 12% of baseline and at least 0.200 L) gives ${bd.rule2005.significant ? 'significant' : 'not significant'} for this case, so the two rules disagree.`;
  const why = `An absolute change in FEV₁ or FVC is a larger fraction of a small baseline than of a large one, so a change in percent of baseline, the quantity in the change column of the printout, labels the same volume differently in patients of different size; the 2022 statement expresses the change as a percent of the predicted value and calls a rise above 10% in either variable significant (threshold from secondary summaries; whether the boundary is inclusive is unresolved). For this case the 2022 rule gives ${response === 'significant' ? 'a significant' : 'a not significant'} response. ${agreement} Whether the post-bronchodilator set can be compared with the baseline is decided here by the quality of both sets: every FEV₁ and FVC grade must be A, B or C and no caveat on the wait after the dose or on a change in effort may apply. This threshold is a project choice and not a published criterion. ${interpretable === 'yes' ? 'Both sets meet it.' : poorGrades ? 'At least one grade is D, E, U or F.' : 'A caveat on the wait after the dose or on a change in effort applies.'}`;
  return {
    id: 'bdInterpretable',
    stage: 1,
    title: 'Bronchodilator response',
    prompt: 'Apply the 2022 rule (change in FEV₁ or FVC as a percent of the predicted value) and decide whether the post-bronchodilator set supports a comparison with the baseline.',
    options: [['significant', 'Significant'], ['not-significant', 'Not significant']],
    rows: [{ id: 'response', label: 'Response by the 2022 rule' }, { id: 'interpretable', label: 'Post-bronchodilator set interpretable' }],
    rowOptions: { interpretable: [['yes', 'Interpretable'], ['no', 'Not interpretable']] },
    key: { response, interpretable },
    ...(otherKey ? { otherKey } : {}),
    why,
    needsDetails: !gradesOnSummary(rt),
  };
}

// ---- the technologist's statement -------------------------------------------------------------------------------------

const VERDICT_OPTIONS = [
  ['consistent', 'Consistent with the maneuvers'],
  ['overstated', 'Overstated: better than the maneuvers support'],
  ['understated', 'Understated: worse than the maneuvers support'],
  ['not-stated', 'No quality statement'],
];

function statementItem(rt, qualityChallenge) {
  const verdict = statementVerdict(rt);
  const lead = {
    consistent: 'The statement agrees with the acceptability and the grades that follow from the maneuver list.',
    overstated: 'The statement describes the study as better than the maneuver list supports.',
    understated: 'The statement describes the study as worse than the maneuver list supports.',
    'not-stated': 'The report carries no quality statement, so the quality of each set follows from the maneuver list alone.',
  }[verdict];
  const mechanism = {
    software: 'A grade computed by software from the flow-time data does not see a cough, glottic closure or an air leak, which leave the volumes intact but spoil the maneuver; which faults a given instrument detects is not verified, so this is a teaching model.',
    pessimistic: 'A low peak flow in airflow obstruction or respiratory-muscle weakness reflects the disease and not the effort; effort is judged from the shape of the maneuvers and from the agreement between them.',
    stale: 'Text carried forward from another study can name a test that was not performed at this visit, and a test that is not on the report has no quality to state.',
    generic: 'A statement without grades cannot be checked against Table 10 of the 2019 statement and has to be compared with the maneuvers directly.',
    optimistic: 'A favorable statement does not replace the acceptability and the agreement of the maneuvers themselves.',
  }[rt.honesty] ?? '';
  const named = rt.stated.post && !rt.truth.post ? 'post-bronchodilator spirometry' : 'the single-breath DLCO test';
  const stalePart = rt.honesty === 'stale' ? `The statement gives the quality of ${named}, which was not performed.` : '';
  // The reasons that only say the statement has no grades repeat the lead and the mechanism.
  const reasons = verdict === 'consistent' || verdict === 'not-stated' ? '' : rt.detailsReasons.filter((r) => !/^The (statement carries no grades|report carries no quality statement)/.test(r)).join(' ');
  return {
    id: 'rtConsistent',
    stage: qualityChallenge ? 2 : 1,
    title: 'Technologist statement',
    prompt: qualityChallenge
      ? 'Compare the technologist’s statement with the grades and the acceptability you assigned from the maneuvers.'
      : 'Compare the technologist’s statement with the maneuvers on the detailed page.',
    options: VERDICT_OPTIONS,
    key: verdict,
    why: [lead, stalePart, mechanism, reasons].filter(Boolean).join(' '),
    needsDetails: rt.honesty !== 'silent' && rt.honesty !== 'stale',
  };
}

// ---- single-breath DLCO and plethysmography --------------------------------------------------------------------------

function dlcoItem(rt) {
  const t = rt.truth.dlco;
  if (!t) return null;
  return {
    id: 'dlcoAcceptable',
    stage: 1,
    title: 'Single-breath diffusing capacity test',
    prompt: 'Decide whether the single-breath test meets the acceptability criteria.',
    options: ACCEPT,
    key: word(t),
    why: `Single-breath DLCO measures the uptake of carbon monoxide from a known alveolar volume over the breath-hold, so the result is valid only when the inspired volume is near the vital capacity, the hold is of the required length, the alveolar sample is taken after the dead space has been washed out, and no leak, Valsalva or Mueller maneuver changes the intrathoracic pressure or the lung volume during the hold. The criteria are those coded in the simulator (ATS/ERS 2017 acceptability list; the grouping into letters is the simulator's own). ${t.acceptable ? 'This test meets them.' : `This test does not meet them: ${t.reasons.join('; ')}.`}`,
    needsDetails: rt.stated.dlco !== word(t),
  };
}

function plethItem(rt) {
  const t = rt.truth.pleth;
  if (!t) return null;
  return {
    id: 'plethAcceptable',
    stage: 1,
    title: 'Plethysmographic functional residual capacity',
    prompt: 'Decide whether the shutter-closure trials are acceptable and repeatable.',
    options: [['acceptable', 'Acceptable and repeatable'], ['not-acceptable', 'Not acceptable']],
    key: word(t),
    why: `Thoracic gas volume at the end of tidal expiration follows from the pressure change at the mouth against the pressure change in the box during panting against the closed shutter, so a trial is valid when the shutter closes at the stable end-tidal level, panting stays within the allowed frequency, and drift or a leak does not tilt or open the pressure loop; the reported FRC is the mean of the acceptable trials, which must agree within 5% (tolerance from a secondary source). ${t.acceptable ? 'The trials of this study meet these requirements.' : `The trials of this study do not: ${t.reasons.join('; ')}.`}`,
    needsDetails: rt.stated.pleth !== word(t),
  };
}

/**
 * @param {object} caseData
 * @param {{ rt: import('../core/rt-report.js').RtReport, interp?: object, interpOther?: object, qualityChallenge?: boolean }} context
 * @returns {import('./index.js').Challenge[]}
 */
export function buildChallengeList(caseData, { rt, interp, interpOther, qualityChallenge = false }) {
  const c = caseData;
  return [
    acceptabilityItem(c, 'pre'),
    acceptabilityItem(c, 'post'),
    gradeItem(c, rt, 'pre', 'fev1'),
    gradeItem(c, rt, 'pre', 'fvc'),
    gradeItem(c, rt, 'post', 'fev1'),
    gradeItem(c, rt, 'post', 'fvc'),
    loopItem(c, rt),
    bdItem(c, rt, interp, interpOther),
    dlcoItem(rt),
    plethItem(rt),
    statementItem(rt, qualityChallenge),
  ].filter(Boolean);
}
