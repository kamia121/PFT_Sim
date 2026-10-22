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

/** The caveat ids of the bronchodilator study that the scenario applied to the data (a short wait, better effort after the dose) and that make the measured response unreliable; each has a printed technologist note. */
export function bdComparisonUnreliable(caveatIds) {
  return (caveatIds ?? []).some((id) => UNRELIABLE_RESPONSE_CAVEATS.includes(id));
}

const sameGrades = (a, b) => Boolean(a) && Boolean(b) && a.fev1 === b.fev1 && a.fvc === b.fvc;
/** The summary page settles the grades: the statement gives them for every set that exists, and they equal the engine's. */
const gradesOnSummary = (rt) => sameGrades(rt.stated.pre, rt.truth.pre) && (!rt.truth.post || sameGrades(rt.stated.post, rt.truth.post));
const word = (t) => (t ? (t.acceptable ? 'acceptable' : 'not-acceptable') : null);

// ---- the study as a whole (basic review level) ---------------------------------------------------------------------

/** Grades at which a spirometry set carries a quality limitation: the set of src/interpret/interpret.js (`qualityLimited`). F is handled before it, as no value exists. */
const LIMITING_GRADES = ['D', 'E', 'U', 'F'];

/**
 * The study-level judgement, from the computed quality truth only (never from the technologist's statement, the technique preset or a scenario).
 * Insufficient: the baseline FEV₁ or FVC could not be reported (grade F, no usable maneuver), which is the case in which the engine returns the
 * pattern 'indeterminate'. Limited: a reported value rests on a grade D, E or U (the engine's `qualityLimited`), or a test that was performed
 * beside the baseline (post-bronchodilator set, single-breath DLCO, plethysmography) is not acceptable; a poor optional test limits that test
 * and never invalidates a usable baseline. No threshold is introduced: the grades, the acceptability and the missing-value rule are the engine's.
 * Exception to "quality truth only": the two bronchodilator caveats above are facts about the data (the scenario shortened the wait or changed the effort, and
 * the measured response was altered), not decoration, so they limit the comparison when a post-bronchodilator set exists; they never limit the baseline.
 * @param {import('../core/rt-report.js').RtReport} rt
 * @param {string[]} [caveatIds] the case's caveat ids (c.report.caveatIds)
 * @returns {{ key: 'interpretable'|'limited'|'insufficient', limits: string[] }}
 */
export function studyJudgement(rt, caveatIds = []) {
  const pre = rt.truth.pre;
  if (pre.fev1 === 'F' || pre.fvc === 'F') return { key: 'insufficient', limits: [] };
  const limits = [];
  if (LIMITING_GRADES.some((g) => g === pre.fev1 || g === pre.fvc)) limits.push('the baseline spirometry');
  if (rt.truth.post && ['fev1', 'fvc'].some((k) => LIMITING_GRADES.includes(rt.truth.post[k]))) limits.push('the post-bronchodilator spirometry');
  if (rt.truth.post && bdComparisonUnreliable(caveatIds)) limits.push('the bronchodilator comparison');
  if (rt.truth.dlco && !rt.truth.dlco.acceptable) limits.push('the single-breath diffusing capacity');
  if (rt.truth.pleth && !rt.truth.pleth.acceptable) limits.push('the plethysmographic lung volumes');
  return { key: limits.length ? 'limited' : 'interpretable', limits };
}

const joinList = (xs) => (xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function studyItem(c, rt) {
  const { key, limits } = studyJudgement(rt, c.report?.caveatIds);
  const pre = rt.truth.pre;
  const whichF = ['fev1', 'fvc'].filter((k) => pre[k] === 'F').map((k) => VAR[k]);
  const outcome = {
    interpretable: 'Here every test that was performed meets the criteria on which its values rest, so the study can be interpreted as recorded.',
    limited: `Here the study can be interpreted, with the limits that attach to ${joinList(limits)}${limits.includes('the bronchodilator comparison') ? ' (a short wait after the dose, or better effort after it than before, changes the measured response whatever the grades)' : ''}; values from tests that meet the criteria are not made unusable by them.`,
    insufficient: `Here no usable maneuver yielded a ${joinList(whichF)}, so the baseline spirometry cannot be classified (the ratio and the pattern need both values) and the study cannot be interpreted as recorded; a diffusing capacity or lung volume that was acceptable is still a result of its own.`,
  }[key];
  return {
    id: 'studyInterpretable',
    stage: 1,
    title: 'Quality of the study',
    prompt: 'Judge the study as a whole: can it be interpreted as recorded, can it be interpreted with limitations, or is it insufficient to interpret? A flawed maneuver limits the values that depend on it and leaves the others usable.',
    options: [['interpretable', 'Interpretable'], ['limited', 'Interpretable with limitations'], ['insufficient', 'Insufficient to interpret']],
    key,
    why: `Each reported FEV₁ and FVC is the largest value of its own variable among the acceptable maneuvers or, when none is acceptable (grade U), among the usable ones, so a fault that spoils one variable, one maneuver or one optional test limits only what depends on it: a cough in the first second spoils the FEV₁ of that maneuver and not its FVC, and the FEV₁ and the FVC are graded separately. The study is insufficient only when the baseline FEV₁ or FVC cannot be reported (no usable maneuver, grade F), because the ratio and the pattern then cannot be assigned; a grade D, E or U on a reported value, or a performed test that does not meet its acceptability criteria, limits the interpretation without preventing it. ${outcome} The grouping is the simulator's, built on the grades and acceptability of ATS/ERS 2019 (grades A to F and U) and ATS/ERS 2017 (DLCO); neither statement sets a cut point for interpretability.`,
    needsDetails: true,
  };
}

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
    why: `Flow in the first second follows the effort and the airway mechanics, so a cough appears as a notch on the expiratory limb, a hesitant start as a rounded, late peak, an abrupt end at nonzero flow as glottic closure or early termination, and an incomplete expiration as a volume-time curve without a plateau. ${notes.join(' ')} A loop whose volume falls short of the tabulated FVC is not thereby flawed: the tabulated FEV₁ and FVC are the largest values among the acceptable maneuvers (among the usable ones when none is acceptable), usually from different maneuvers.`,
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
  const poorGrades = grades.some((g) => !INTERPRETABLE_GRADES.includes(g));
  const interpretable = !poorGrades && !bdComparisonUnreliable(caveats) ? 'yes' : 'no';
  const otherBd = interpOther?.bd;
  const otherKey = otherBd ? { response: otherBd.rule2022.significant ? 'significant' : 'not-significant', interpretable } : undefined;
  const agreement = bd.rulesAgree
    ? 'The earlier rule (a rise of at least 12% of baseline and at least 0.200 L) gives the same label for this case.'
    : `The earlier rule (a rise of at least 12% of baseline and at least 0.200 L) gives ${bd.rule2005.significant ? 'significant' : 'not significant'} for this case, so the two rules disagree.`;
  const why = `An absolute change in FEV₁ or FVC is a larger fraction of a small baseline than of a large one, so a change in percent of baseline, which the earlier rule used, labels the same volume differently in patients of different size; the 2022 statement expresses the change as a percent of the predicted value, 100 × (post − pre) / predicted value, and calls a rise above 10% in either variable significant (Table 1 and Box 1 of the statement; the comparison is strict). The change column of the printout, Change (% predicted), is that quantity, computed from the unrounded values. For this case the 2022 rule gives ${response === 'significant' ? 'a significant' : 'a not significant'} response. ${agreement} Whether the post-bronchodilator set can be compared with the baseline is decided here by the quality of both sets: every FEV₁ and FVC grade must be A, B or C and no caveat on the wait after the dose or on a change in effort may apply. This threshold is a project choice and not a published criterion. ${interpretable === 'yes' ? 'Both sets meet it.' : poorGrades ? 'At least one grade is D, E, U or F.' : 'A caveat on the wait after the dose or on a change in effort applies.'}`;
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
 * @param {{ rt: import('../core/rt-report.js').RtReport, interp?: object, interpOther?: object, qualityChallenge?: boolean, review?: 'basic'|'advanced' }} context review: 'basic' gives the one study-level item; any other value gives the full per-maneuver list, so a caller that does not pass it keeps the earlier behavior
 * @returns {import('./index.js').Challenge[]}
 */
export function buildChallengeList(caseData, { rt, interp, interpOther, qualityChallenge = false, review = 'advanced' }) {
  const c = caseData;
  // Basic review: one study-level judgement. No per-maneuver acceptability, letter grades, loop faults, statement adjudication or
  // optional-test items; those belong to the advanced review. The two-sided key does not depend on the equation.
  if (review === 'basic') return [studyItem(c, rt)];
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
