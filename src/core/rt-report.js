/**
 * The technologist's report: what the person who ran the study writes on the printout, and the engine's
 * own computed quality against which that statement is measured. Teaching simulator only.
 *
 * Contract: docs/REPORT-FIRST-PLAN.md ("The technologist's quality report"). The RtReport is a pure function of
 * the case and its seed. It draws only from the stream labelled `rt-report`, in a fixed number of draws read by position,
 * so that no branch changes another draw. Nothing in the case, its report or its key depends on it (tests/rt-invariant.test.mjs).
 */
import { createStream } from './prng.js';
import { summarizeSession, faultWording } from './quality.js';
import { bestTrialIndex } from './pleth.js';
import { SPIROMETRY_2019 as S } from './standards.js';

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
 *   technologist did not mention). A stale statement carries a non-null `stated.post` or `stated.dlco` for a test that
 *   truth does not have (`truth.post` or `truth.dlco` null).
 * - `truth.dlco.reasons` and `truth.pleth.reasons` are lower-case fragments without a final period, empty when acceptable.
 * - `representative.*.faults` are fault ids of src/core/quality.js (`faultWording(id)` gives the text) that make the
 *   displayed maneuver unacceptable, empty for an acceptable maneuver. For a set with no acceptable maneuver the best
 *   usable maneuver is shown, kind 'best', and its faults are listed.
 * - Indices are 0-based. `representative.dlco.test` chooses the first retained v4 replicate, or the first available trace if none is retained; legacy single-test cases use 0.
 */

export const RT_CLOSING = 'Official interpretation to follow.';
export const HONESTY_TYPES = ['accurate', 'software', 'generic', 'optimistic', 'pessimistic', 'stale', 'silent'];

// ---------------------------------------------------------------------------------------------------------------
// Teaching choices (none of these numbers is a measured rate; no rate is printed anywhere in the interface).
// ---------------------------------------------------------------------------------------------------------------

/**
 * Relative weight of each honesty type by the technique level of the session. The weights are teaching choices: a good
 * session mostly yields an accurate statement, and the share of statements that cannot be trusted grows as the session
 * degrades. Types that cannot apply to a case (software needs a hidden fault that changes a grade; optimistic needs grades D or
 * worse; pessimistic needs a set that meets the criteria and a plausible reason for a low peak flow; stale needs a test that was
 * not done) are dropped and the rest renormalized. Software and optimistic are weighted high because each is feasible in only a
 * minority of sessions: the engine's grades are D or worse in under a fifth of poor-technique sessions, and a cough, a glottic
 * closure or a leak changes a grade in a smaller share.
 */
const HONESTY_WEIGHTS = {
  good: { accurate: 0.6, software: 0.15, generic: 0.12, optimistic: 0.1, pessimistic: 0.04, stale: 0.04, silent: 0.08 },
  fair: { accurate: 0.42, software: 0.25, generic: 0.12, optimistic: 0.2, pessimistic: 0.03, stale: 0.05, silent: 0.12 },
  poor: { accurate: 0.3, software: 0.32, generic: 0.1, optimistic: 0.28, pessimistic: 0.02, stale: 0.05, silent: 0.12 },
};
/** Share moved from accurate to generic, stale and silent equally as the encounter becomes busier (scenario level); a teaching choice. */
const BUSY_SHIFT = { none: 0, light: 0.03, moderate: 0.06, heavy: 0.09 };
/** Probability that the page-1 maneuver is an unacceptable one although acceptable maneuvers exist; a teaching choice. */
const FLAWED_FRACTION = { good: 0, fair: 0.15, poor: 0.35 };
/** Probability that an accurate statement over a poor session also names the poor effort in words. */
const ACCURATE_NAMES_POOR_EFFORT = 0.4;
/** Project threshold: a grade of D or worse is poor quality (the optimistic type and the effort word use it). */
const POOR_GRADES = ['D', 'E', 'U', 'F'];
/** Project threshold: a peak flow under 3 L/s is treated as low when deciding whether a poor-effort statement is plausible (no PEF reference is coded). */
const LOW_PEF_L_PER_S = 3;
/** Archetypes in which a low peak flow is disease and not effort (airflow obstruction; respiratory-muscle weakness). */
const LOW_PEF_ARCHETYPES = ['obstruction', 'mixed', 'bd-discordant', 'restriction-extraparenchymal'];

/**
 * Faults a grading routine cannot see in the flow-time data it is given (teaching model, not a claim about any vendor; which faults a
 * given vendor detects is unverified): a cough, glottic closure and a leak leave the volumes intact, and variable effort has no
 * criterion of its own in quality.js (it acts through the spread of the values, which the software does see, so ignoring it changes nothing).
 */
const SOFTWARE_BLIND_FAULTS = ['cough', 'glottic-closure', 'leak', 'variable-effort'];

// ---------------------------------------------------------------------------------------------------------------
// The shared phrase pool. Every honesty type draws its wording from these templates, and the same template serves several
// types (tests/rt-phrases.test.mjs checks that none belongs to exactly one), so that no phrase identifies a type.
// ---------------------------------------------------------------------------------------------------------------

/** Spirometry grade statements: slots {fev1} {fvc} for the pre set and {pfev1} {pfvc} for the post set in the joined form. */
const GRADE_STYLES = [
  { id: 'split', pre: 'Pre-bronchodilator spirometry: FEV₁ grade {fev1}, FVC grade {fvc}.', post: 'Post-bronchodilator spirometry: FEV₁ grade {fev1}, FVC grade {fvc}.' },
  { id: 'before-after', pre: 'Test quality before bronchodilator: FEV₁ {fev1}, FVC {fvc}.', post: 'Test quality after bronchodilator: FEV₁ {fev1}, FVC {fvc}.' },
  { id: 'joined', pre: 'Test quality: Pre: FEV₁ - {fev1}, FVC - {fvc}.', both: 'Test quality: Pre: FEV₁ - {fev1}, FVC - {fvc}; Post: FEV₁ - {pfev1}, FVC - {pfvc}.' },
];
const GENERIC_PHRASES = ['PFT data acceptable and reproducible.', 'Pulmonary function data acceptable and reproducible.', 'Study acceptable and reproducible.'];
const POOR_EFFORT_PHRASES = ['Poor effort; the results may underestimate the patient’s true function.', 'Patient effort was poor throughout the study.', 'Effort poor on most maneuvers.'];
const DLCO_PHRASES = {
  acceptable: ['DLCO test acceptable.', 'Diffusing capacity: acceptable test.', 'Single-breath DLCO met the acceptability criteria.'],
  'not-acceptable': ['DLCO test not acceptable.', 'Diffusing capacity: test not acceptable.', 'Single-breath DLCO did not meet the acceptability criteria.'],
};
const PLETH_PHRASES = {
  acceptable: ['Plethysmography acceptable and repeatable.', 'Lung volumes by plethysmography: acceptable and repeatable.', 'Plethysmographic FRC acceptable and repeatable.'],
  'not-acceptable': ['Plethysmography not acceptable.', 'Lung volumes by plethysmography: not acceptable.', 'Plethysmographic FRC not acceptable or not repeatable.'],
};
const EFFORT_PHRASES = ['Effort: {word}.', 'Patient effort was {word}.', 'Overall effort {word}.'];
const HB_PHRASES = {
  known: ['Hemoglobin {hb} g/dL entered for the DLCO adjustment.', 'DLCO adjusted for hemoglobin {hb} g/dL.', 'Hemoglobin on file {hb} g/dL; DLCO adjusted.'],
  unknown: ['Hemoglobin not available; DLCO not adjusted.', 'No hemoglobin on file; DLCO is unadjusted.', 'DLCO reported without hemoglobin adjustment (hemoglobin not available).'],
};
/**
 * Bronchodilator line: agent, dose, route and wait. Teaching wording; the dose (400 µg albuterol) and the wait (10 or 15 min) are
 * quoted from memory of the ATS/ERS 2019 protocol and are unverified.
 */
const BD_PHRASES = [
  'Bronchodilator: albuterol 400 µg by metered-dose inhaler with spacer; post-bronchodilator spirometry started {wait} min after the dose.',
  'Albuterol 400 µg (four inhalations of 100 µg) by metered-dose inhaler and valved holding chamber; repeat spirometry after {wait} min.',
  'Post-bronchodilator study: albuterol 400 µg inhaled, repeat testing {wait} min later.',
];

/** Every template of the pool, flat, with a role, for tests and for any reader that wants the wording. */
export const PHRASE_POOL = [
  ...GRADE_STYLES.flatMap((s) => [s.pre, s.post, s.both].filter(Boolean).map((t) => ({ role: `grades:${s.id}`, template: t }))),
  ...GENERIC_PHRASES.map((template) => ({ role: 'generic', template })),
  ...POOR_EFFORT_PHRASES.map((template) => ({ role: 'poor-effort', template })),
  ...Object.entries(DLCO_PHRASES).flatMap(([k, ts]) => ts.map((template) => ({ role: `dlco:${k}`, template }))),
  ...Object.entries(PLETH_PHRASES).flatMap(([k, ts]) => ts.map((template) => ({ role: `pleth:${k}`, template }))),
];

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => String(values[k]));
const pick = (list, u) => list[Math.min(list.length - 1, Math.floor(u * list.length))];

// ---------------------------------------------------------------------------------------------------------------
// Draws: a fixed number of uniforms from the `rt-report` stream, read by position.
// ---------------------------------------------------------------------------------------------------------------

const N_DRAWS = 32;
const U = {
  type: 0, mode: 1, gradeStyle: 2, dlcoStyle: 3, plethStyle: 4, genericStyle: 5, poorStyle: 6, effortStyle: 7, effortWord: 8, bdStyle: 9, bdWait: 10, hbStyle: 11,
  falsePreFev1: 12, falsePreFvc: 13, falsePostFev1: 14, falsePostFvc: 15, staleWhich: 16, staleGrade: 17, staleGrade2: 18, appendPoor: 19,
  flawedPre: 20, flawedPost: 21, pickPre: 22, pickPost: 23,
};
function rtDraws(seed) {
  const s = createStream(seed, 'rt-report');
  return Array.from({ length: N_DRAWS }, () => s.uniform());
}

// ---------------------------------------------------------------------------------------------------------------
// Grades and truth
// ---------------------------------------------------------------------------------------------------------------

export const GRADE_ORDER = ['A', 'B', 'C', 'D', 'E', 'U', 'F'];
/** Lower is better. */
export const gradeRank = (g) => GRADE_ORDER.indexOf(g);
const isPoor = (g) => POOR_GRADES.includes(g);
const isGood = (g) => g === 'A' || g === 'B';
const gradeValues = (set) => (set ? [set.fev1, set.fvc] : []);
const worstRank = (...sets) => Math.max(0, ...sets.flatMap(gradeValues).map(gradeRank));

/** Plain-language fragments for the DLCO reasons that are bare words in dlco-trace.js. */
const DLCO_REASON_TEXT = { leak: 'a leak around the mouthpiece during the breath-hold' };
/** Fragments for the plethysmography flags (src/core/pleth.js, `flags`), by code. */
const PLETH_REASON_TEXT = {
  'fewer-than-3-acceptable': 'fewer than three acceptable shutter closures',
  'frc-not-repeatable-5pct': 'acceptable FRC values not within 5% of their mean',
  'reported-from-usable-trials': 'no acceptable shutter closure, so the reported FRC comes from usable trials',
  'no-usable-trial': 'no usable shutter closure',
  'leak-or-damping': 'a leak, incomplete occlusion or unsupported cheeks distorted at least one trial',
  'pant-frequency': 'panting faster than the allowed frequency on at least one trial',
  'thermal-drift': 'thermal drift on at least one trial',
  'unstable-end-tidal-level': 'shutter closed away from the stable end-tidal level on at least one trial',
};

/** Project choice: a plethysmography measurement is acceptable and repeatable at grade A or B of the simulator's table (two or more acceptable trials within 5%). */
const plethAcceptable = (grade) => grade === 'A' || grade === 'B';

function dlcoTruth(c) {
  if (c.dlcoTrace?.session) { const s = c.dlcoTrace.session; return { acceptable: s.status === 'repeatable', reasons: s.status === 'repeatable' ? [] : s.warnings.map((x) => x.replace(/[.\s]+$/, '')) }; }
  const g = c.dlcoTrace?.grade;
  if (!g) return null;
  const reasons = g.acceptable ? [] : [...g.invalid, ...g.failed, ...(g.unknown ?? [])].map((r) => DLCO_REASON_TEXT[r] ?? r);
  return { acceptable: Boolean(g.acceptable), reasons };
}
function plethTruth(c) {
  if (!c.pleth) return null;
  const acceptable = plethAcceptable(c.pleth.grade) && (!c.pleth.session || c.pleth.session.status === 'reported');
  const reasons = acceptable ? [] : c.pleth.session ? [...c.pleth.session.warnings, `Overall lung-volume grade ${c.pleth.grade ?? 'unassigned'}`].map((r) => r.replace(/[.\s]+$/, '')) : (c.pleth.flags ?? []).map((f) => PLETH_REASON_TEXT[f.code]).filter(Boolean);
  return { acceptable, reasons };
}

/**
 * The engine's own grades and acceptability (case.report.grades, which equal the session summaries; dlcoTrace.grade; pleth.grade).
 * @returns {RtReport['truth']}
 */
function truthOf(c) {
  const g = c.report.grades;
  return {
    pre: { fev1: g.fev1, fvc: g.fvc },
    post: c.spirometry.post ? { fev1: g.postFev1, fvc: g.postFvc } : null,
    dlco: dlcoTruth(c),
    pleth: plethTruth(c),
  };
}

const word = (t) => (t ? (t.acceptable ? 'acceptable' : 'not-acceptable') : null);

// ---------------------------------------------------------------------------------------------------------------
// Unacceptable maneuvers: reasons and the fault ids behind them
// ---------------------------------------------------------------------------------------------------------------

/** Canonical order of the fault ids a displayed maneuver can carry. */
export const FAULT_ORDER = ['cough', 'glottic-closure', 'early-termination', 'no-plateau', 'slow-start', 'leak', 'mouthpiece-obstruction', 'pause-at-TLC'];

/**
 * Fault ids behind the reasons a maneuver is unacceptable. A reason of quality.js maps to the generator's fault id; the two
 * reasons that no single id names (a large back-extrapolated volume, a missing end-of-forced-expiration indicator) map to the id
 * the maneuver itself carries, or to the one that gives that appearance (hesitant start, no plateau).
 * @param {{ faults?: string[] }} m @param {ReturnType<typeof summarizeSession>['evaluations'][number]} e
 * @returns {string[]}
 */
export function displayedFaults(m, e) {
  const has = (id) => (m.faults ?? []).includes(id);
  const out = new Set();
  for (const r of new Set([...e.fev1.reasons, ...e.fvc.reasons])) {
    if (r === 'cough in the first second') out.add('cough');
    else if (r.startsWith('glottic closure')) out.add('glottic-closure');
    else if (r === 'leak') out.add('leak');
    else if (r.startsWith('tongue or teeth')) out.add('mouthpiece-obstruction');
    else if (r.startsWith('pause at total lung capacity')) out.add('pause-at-TLC');
    else if (r === 'back-extrapolated volume above limit') out.add('slow-start');
    else if (r === 'no end-of-forced-expiration indicator') out.add(has('early-termination') ? 'early-termination' : has('glottic-closure') ? 'glottic-closure' : 'no-plateau');
  }
  return FAULT_ORDER.filter((f) => out.has(f));
}

/** The maneuver is acceptable for both the FEV1 and the FVC. */
const acceptableForBoth = (e) => e.fev1.acceptable && e.fvc.acceptable;

/**
 * Why each maneuver of a set is unacceptable for one variable, grouped by reason, with 1-based maneuver numbers.
 * @param {ReturnType<typeof summarizeSession>} summary @param {'fev1'|'fvc'} key
 * @returns {{ reason: string, maneuvers: number[] }[]}
 */
export function unacceptableCauses(summary, key) {
  const by = new Map();
  summary.evaluations.forEach((e, i) => {
    for (const r of e[key].reasons) by.set(r, [...(by.get(r) ?? []), i + 1]);
  });
  return [...by].map(([reason, maneuvers]) => ({ reason, maneuvers }));
}

// ---------------------------------------------------------------------------------------------------------------
// Representative maneuver
// ---------------------------------------------------------------------------------------------------------------

function chooseBest(maneuvers, evals) {
  const all = maneuvers.map((_, i) => i);
  const pool = [all.filter((i) => acceptableForBoth(evals[i])), all.filter((i) => evals[i].fev1.usable && evals[i].fvc.usable), all].find((p) => p.length);
  return pool.reduce((a, b) => (maneuvers[b].fev1 + maneuvers[b].fvc > maneuvers[a].fev1 + maneuvers[a].fvc ? b : a));
}

function representativeSet(set, technique, uFlawed, uPick) {
  const { maneuvers, summary } = set;
  const evals = summary.evaluations;
  const best = chooseBest(maneuvers, evals);
  const unacceptable = maneuvers.map((_, i) => i).filter((i) => !acceptableForBoth(evals[i]));
  const hasAcceptable = unacceptable.length < maneuvers.length;
  if (hasAcceptable && unacceptable.length && uFlawed < (FLAWED_FRACTION[technique] ?? 0)) {
    const index = unacceptable[Math.min(unacceptable.length - 1, Math.floor(uPick * unacceptable.length))];
    return { index, kind: 'flawed', faults: displayedFaults(maneuvers[index], evals[index]) };
  }
  return { index: best, kind: 'best', faults: displayedFaults(maneuvers[best], evals[best]) };
}

/**
 * The maneuver, trial and test shown on the summary page. Pure; uses the `rt-report` stream.
 *
 * The forced maneuver is the one with the largest FEV1 plus FVC among those acceptable for both variables (ATS/ERS 2019
 * practice; if none is, the best usable). On a seeded fraction of fair and poor sessions an unacceptable maneuver is shown instead
 * (kind 'flawed') and its own fault list is the key: a loop that falls short of the tabulated FVC is not a cue, because the
 * tabulated values are maxima over acceptable maneuvers, usually from different ones. The plethysmography trial is the acceptable
 * one nearest the reported FRC (never flawed). The v4 representative DLCO trace is the first retained replicate; legacy cases have one test.
 * @param {object} caseData a case from buildCase
 * @returns {RtReport['representative']}
 */
export function representativeFor(caseData) {
  const c = caseData;
  const u = rtDraws(c.descriptor.seed);
  const technique = c.descriptor.technique;
  return {
    pre: representativeSet(c.spirometry.pre, technique, u[U.flawedPre], u[U.pickPre]),
    post: c.spirometry.post ? representativeSet(c.spirometry.post, technique, u[U.flawedPost], u[U.pickPost]) : null,
    pleth: c.pleth ? { trial: bestTrialIndex(c.pleth) - 1 } : null,
    dlco: c.dlcoTrace ? { test: c.dlcoTrace.tests ? Math.max(0, c.dlcoTrace.tests.findIndex((t) => t.selected)) : 0 } : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Honesty
// ---------------------------------------------------------------------------------------------------------------

/** Re-grade a set with the faults that software cannot detect removed (teaching model; see SOFTWARE_BLIND_FAULTS). */
function softwareGrades(set) {
  const seen = set.maneuvers.map((m) => ({ ...m, faults: (m.faults ?? []).filter((f) => !SOFTWARE_BLIND_FAULTS.includes(f)), coughFirstSecond: false, glottisClosedAt: null }));
  const g = summarizeSession(seen).grades;
  return { fev1: g.fev1, fvc: g.fvc };
}

/** Software ignores a leak in the single-breath test (it cannot see volume lost during the hold); other failures it reports. */
function softwareDlco(c) {
  const g = c.dlcoTrace?.grade;
  if (!g) return null;
  return { acceptable: g.failed.length === 0 && g.invalid.every((r) => r === 'leak') };
}

/** The grades and DLCO/plethysmography words a grading routine that cannot see the blind faults would state. */
function softwareStated(c, truth) {
  return {
    pre: softwareGrades(c.spirometry.pre),
    post: truth.post ? softwareGrades(c.spirometry.post) : null,
    dlco: word(softwareDlco(c)),
    pleth: word(truth.pleth),
  };
}
const truthStated = (truth) => ({ pre: truth.pre, post: truth.post, dlco: word(truth.dlco), pleth: word(truth.pleth) });

function weightsFor(c, truth, software) {
  const d = c.descriptor;
  const base = { ...(HONESTY_WEIGHTS[d.technique] ?? HONESTY_WEIGHTS.good) };
  const shift = BUSY_SHIFT[d.scenarioLevel ?? 'none'] ?? 0;
  base.accurate = Math.max(0, base.accurate - shift);
  for (const t of ['generic', 'stale', 'silent']) base[t] += shift / 3;
  const grades = [...gradeValues(truth.pre), ...gradeValues(truth.post)];
  const pre = c.spirometry.pre.summary;
  if (JSON.stringify(software) === JSON.stringify(truthStated(truth))) base.software = 0;
  if (!grades.some(isPoor)) base.optimistic = 0;
  const meets = grades.every(isGood);
  const lowPefPlausible = LOW_PEF_ARCHETYPES.includes(d.archetype) || (pre.pef ?? Infinity) < LOW_PEF_L_PER_S;
  if (!(meets && lowPefPlausible)) base.pessimistic = 0;
  if (c.spirometry.post && c.dlcoTrace) base.stale = 0;
  return base;
}

function chooseHonesty(weights, u) {
  const total = HONESTY_TYPES.reduce((s, t) => s + weights[t], 0);
  let x = u * total;
  for (const t of HONESTY_TYPES) {
    if (x < weights[t]) return t;
    x -= weights[t];
  }
  return 'accurate';
}

/** Effort word of the statement: a coarse impression that follows what the statement claims, with some scatter; never a grade. */
function effortWord(claimClass, u) {
  const table = { good: [['good', 0.85], ['fair', 1]], fair: [['fair', 0.7], ['good', 0.85], ['poor', 1]], poor: [['poor', 0.65], ['fair', 1]] }[claimClass];
  return table.find(([, cum]) => u < cum)[0];
}
const classOf = (rank) => (rank <= 1 ? 'good' : rank === 2 ? 'fair' : 'poor');

function gradeLines(styleIndex, pre, post) {
  const s = GRADE_STYLES[styleIndex];
  const values = { fev1: pre.fev1, fvc: pre.fvc, pfev1: post?.fev1, pfvc: post?.fvc };
  if (!post) return [fill(s.pre, values)];
  if (s.both) return [fill(s.both, values)];
  return [fill(s.pre, values), fill(s.post, { fev1: post.fev1, fvc: post.fvc })];
}

/** Better of the true grade and a drawn A or B: the optimistic technologist never states worse than the truth. */
const rosy = (truthGrade, u) => (gradeRank(truthGrade) <= 1 ? truthGrade : u < 0.5 ? 'A' : 'B');

/**
 * Statement for one honesty type.
 * @returns {{ honesty: Honesty, stated: RtReport['stated'], lines: string[], claim: 'truth'|'good'|'poor'|'stated'|null }}
 */
function statement(type, truth, software, u) {
  const hasPost = Boolean(truth.post);
  const nothing = { pre: null, post: null, dlco: null, pleth: null };
  const style = Math.floor(u[U.gradeStyle] * GRADE_STYLES.length);
  const dStyle = u[U.dlcoStyle], pStyle = u[U.plethStyle];
  const testLines = (s) => [
    ...(s.dlco ? [pick(DLCO_PHRASES[s.dlco], dStyle)] : []),
    ...(s.pleth ? [pick(PLETH_PHRASES[s.pleth], pStyle)] : []),
  ];
  const fromGrades = (stated) => ({ stated, lines: [...gradeLines(style, stated.pre, stated.post), ...testLines(stated)] });

  if (type === 'silent') return { honesty: type, stated: nothing, lines: [], claim: null };
  if (type === 'generic') return { honesty: type, stated: nothing, lines: [pick(GENERIC_PHRASES, u[U.genericStyle])], claim: 'good' };
  if (type === 'pessimistic') return { honesty: type, stated: nothing, lines: [pick(POOR_EFFORT_PHRASES, u[U.poorStyle])], claim: 'poor' };
  if (type === 'optimistic') {
    if (u[U.mode] < 0.5) return { honesty: type, stated: nothing, lines: [pick(GENERIC_PHRASES, u[U.genericStyle])], claim: 'good' };
    const stated = {
      pre: { fev1: rosy(truth.pre.fev1, u[U.falsePreFev1]), fvc: rosy(truth.pre.fvc, u[U.falsePreFvc]) },
      post: hasPost ? { fev1: rosy(truth.post.fev1, u[U.falsePostFev1]), fvc: rosy(truth.post.fvc, u[U.falsePostFvc]) } : null,
      dlco: truth.dlco ? 'acceptable' : null,
      pleth: truth.pleth ? 'acceptable' : null,
    };
    return { honesty: type, ...fromGrades(stated), claim: 'stated' };
  }
  if (type === 'software') return { honesty: type, ...fromGrades(software), claim: 'stated' };
  // accurate and stale: the engine's grades for the tests that exist
  let stated = { pre: { ...truth.pre }, post: truth.post ? { ...truth.post } : null, dlco: word(truth.dlco), pleth: word(truth.pleth) };
  if (type === 'stale') {
    // Text carried forward from another study: it names a test that was not done. It states quality only, never a result,
    // so it cannot disagree with the key (which is computed from the values on the report).
    const missing = [!hasPost && 'post', !truth.dlco && 'dlco'].filter(Boolean);
    const target = missing[Math.min(missing.length - 1, Math.floor(u[U.staleWhich] * missing.length))];
    if (target === 'post') stated.post = { fev1: u[U.staleGrade] < 0.6 ? 'A' : 'B', fvc: u[U.staleGrade2] < 0.6 ? 'A' : 'B' };
    else stated.dlco = 'acceptable';
  }
  const out = fromGrades(stated);
  if (type === 'accurate' && worstRank(truth.pre, truth.post) >= gradeRank('D') && u[U.appendPoor] < ACCURATE_NAMES_POOR_EFFORT) {
    out.lines.push(pick(POOR_EFFORT_PHRASES, u[U.poorStyle]));
  }
  return { honesty: type, ...out, claim: 'truth' };
}

/**
 * Whether the statement, read against the engine's grades, is consistent, overstated, understated or absent. Computed from the
 * statement and the truth, not from the honesty label; the label only says how a statement without grades is to be read.
 * 'overstated' also covers a statement about a test that was not done.
 * @param {Pick<RtReport, 'honesty'|'stated'|'truth'>} rt
 * @returns {'consistent'|'overstated'|'understated'|'not-stated'}
 */
export function statementVerdict(rt) {
  const { honesty, stated, truth } = rt;
  if (honesty === 'silent') return 'not-stated';
  const better = [], worse = [];
  const cmp = (s, t, aboutMissing) => {
    if (s === null || s === undefined) return;
    if (aboutMissing) { better.push(1); return; }
    const d = gradeRank(t) - gradeRank(s); // positive: stated better than truth
    if (d > 0) better.push(d); else if (d < 0) worse.push(-d);
  };
  const hasGrades = Boolean(stated.pre);
  if (hasGrades) {
    for (const set of ['pre', 'post']) {
      if (!stated[set]) continue;
      for (const k of ['fev1', 'fvc']) cmp(stated[set][k], truth[set]?.[k], !truth[set]);
    }
  } else if (honesty === 'generic' || honesty === 'optimistic') {
    // "Acceptable and reproducible" claims grade A or B for every set and an acceptable DLCO and plethysmography.
    const ok = [truth.pre, truth.post].filter(Boolean).every((s) => gradeValues(s).every(isGood)) && [truth.dlco, truth.pleth].filter(Boolean).every((t) => t.acceptable);
    if (!ok) better.push(1);
  } else if (honesty === 'pessimistic') {
    // "Poor effort" claims D or worse somewhere.
    const poor = [truth.pre, truth.post].filter(Boolean).some((s) => gradeValues(s).some(isPoor));
    if (!poor) worse.push(1);
  }
  for (const part of ['dlco', 'pleth']) {
    if (!stated[part]) continue;
    if (!truth[part]) { better.push(1); continue; }
    if (stated[part] === 'acceptable' && !truth[part].acceptable) better.push(1);
    if (stated[part] === 'not-acceptable' && truth[part].acceptable) worse.push(1);
  }
  if (better.length) return 'overstated';
  if (worse.length) return 'understated';
  return 'consistent';
}

// ---------------------------------------------------------------------------------------------------------------
// Interpretation-bearing comment lines
// ---------------------------------------------------------------------------------------------------------------

/**
 * Categories of the scenario statements (src/scenarios) that are carried to the comment box of the summary page: preparation and
 * circumstances of the visit that bear on how the values are read and say nothing about how the maneuvers went. Left to the detailed
 * page because their wording describes the maneuvers (and would reveal the answer to the quality questions before they are asked):
 * Contraindication ("limits effort", "guards the incision"), Respiratory infection ("frequent cough on forced expiration"), Alcohol
 * ("coordination poor") and Obesity ("difficulty with a deep breath out"), together with every technique, interface, cooperation,
 * DLCO and plethysmography category. Identity items (height, reference sex, requisition group, equations) belong to the identity
 * block, and the hemoglobin statements are replaced by the hemoglobin line below.
 */
export const PAGE1_COMMENT_CATEGORIES = ['Medication', 'Smoking', 'Caffeine', 'Exercise', 'Meal', 'Clothing', 'Oxygen', 'Altitude'];

function interpretationLines(c, claimClassWord, u) {
  const lines = [];
  const post = c.spirometry.post;
  if (post) {
    const wait = Math.round(c.scenario?.preTest?.postBdWaitMinutes ?? pick([10, 15], u[U.bdWait]));
    lines.push(fill(pick(BD_PHRASES, u[U.bdStyle]), { wait }));
  }
  const sc = c.scenario ?? {};
  (sc.statements ?? []).forEach((s, i) => {
    const text = sc.technologistComments?.[i];
    if (text && PAGE1_COMMENT_CATEGORIES.includes(s.category)) lines.push(text);
  });
  if (c.dlco) {
    const hb = c.report.patient.hbGdl;
    const known = sc.hbAvailable !== false && Number.isFinite(hb);
    lines.push(fill(pick(known ? HB_PHRASES.known : HB_PHRASES.unknown, u[U.hbStyle]), { hb: known ? hb.toFixed(1) : '' }));
  }
  if (claimClassWord) lines.push(fill(pick(EFFORT_PHRASES, u[U.effortStyle]), { word: claimClassWord }));
  return lines;
}

// ---------------------------------------------------------------------------------------------------------------
// Details: when and why the detailed page changes an answer
// ---------------------------------------------------------------------------------------------------------------

const SET_WORD = { pre: 'before the bronchodilator', post: 'after the bronchodilator' };
const VAR_WORD = { fev1: 'FEV₁', fvc: 'FVC' };
const REASON_TEXT = {
  'back-extrapolated volume above limit': 'back-extrapolated volume above the limit',
  'cough in the first second': 'a cough in the first second',
  'glottic closure in the first second': 'glottic closure in the first second',
  'glottic closure after the first second': 'glottic closure after the first second',
  'no end-of-forced-expiration indicator': 'no end-of-forced-expiration indicator',
  leak: 'an air leak at the lips',
  'tongue or teeth in front of the mouthpiece': 'tongue or teeth in front of the mouthpiece',
  'pause at total lung capacity longer than 2 s': 'a pause at full inspiration longer than 2 s',
};
/** Noun phrases for the faults of a displayed maneuver (see FAULT_TEXT in quality.js for the report-comment form). */
const FAULT_NOUN = {
  cough: 'a cough in the first second',
  'glottic-closure': 'glottic closure',
  'early-termination': 'early termination of expiration',
  'no-plateau': 'no plateau at the end of expiration',
  'slow-start': 'a hesitant start',
  leak: 'an air leak at the lips',
  'mouthpiece-obstruction': 'tongue or teeth in front of the mouthpiece',
  'pause-at-TLC': 'a pause at full inspiration before the blast',
};
const list = (xs) => (xs.length <= 1 ? xs.join('') : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const maneuversText = (ns) => `maneuver${ns.length > 1 ? 's' : ''} ${list(ns.map(String))}`;

/** Why the maneuvers of a set fail for a variable, e.g. "a cough in the first second in maneuvers 2 and 3". */
export function causesText(summary, key) {
  const causes = unacceptableCauses(summary, key);
  return list(causes.map((x) => `${REASON_TEXT[x.reason] ?? x.reason} in ${maneuversText(x.maneuvers)}`));
}

/**
 * Why a set falls short of grade B for one variable, as clauses: unacceptable maneuvers with their causes, too few acceptable
 * maneuvers, or two largest acceptable values that differ by more than the repeatability limit. Empty when nothing is missing.
 */
export function shortfallClauses(summary, key) {
  const V = VAR_WORD[key];
  const out = [];
  const causes = unacceptableCauses(summary, key);
  if (causes.length) out.push(`unacceptable for the ${V}: ${causesText(summary, key)}`);
  const n = summary.nAcceptable[key];
  if (n === 0) out.push(`no maneuver is acceptable for the ${V}`);
  else if (n === 1) out.push(`only one maneuver is acceptable for the ${V}`);
  else if (summary.spread[key] > S.repeatabilityLitersAdult.value + 1e-9) out.push(`the two largest acceptable ${V} values differ by more than ${S.repeatabilityLitersAdult.value.toFixed(3)} L`);
  return out;
}

function detailsReasonsFor(c, honesty, stated, truth, representative) {
  const out = [];
  if (!stated.pre) {
    if (honesty === 'pessimistic') out.push('The statement reports poor effort, but each set holds at least two acceptable maneuvers whose largest values agree within 0.150 L for the FEV₁ and for the FVC.');
    else if (honesty === 'silent') out.push('The report carries no quality statement, so the grade of each set follows from the acceptability of each maneuver and the agreement of the two largest acceptable values on the detailed page.');
    else {
      out.push('The statement carries no grades, so the grade of each set follows from the acceptability of each maneuver and the agreement of the two largest acceptable values on the detailed page.');
      // "Acceptable and reproducible" describes grades A and B.
      for (const set of ['pre', 'post']) for (const k of ['fev1', 'fvc']) {
        if (!truth[set] || isGood(truth[set][k])) continue;
        const clauses = shortfallClauses(c.spirometry[set].summary, k);
        out.push(`The statement describes the study as acceptable and reproducible; the ${VAR_WORD[k]} ${SET_WORD[set]} does not meet that description${clauses.length ? `; ${clauses.join('; ')}` : ''}.`);
      }
      for (const [part, name] of [['dlco', 'single-breath DLCO test'], ['pleth', 'plethysmography']]) {
        if (truth[part] && !truth[part].acceptable) out.push(`The statement describes the study as acceptable and reproducible; the ${name} does not meet that description; ${truth[part].reasons.join('; ')}.`);
      }
    }
  }
  for (const set of ['pre', 'post']) {
    if (!stated[set] || !truth[set]) continue;
    for (const k of ['fev1', 'fvc']) {
      if (stated[set][k] === truth[set][k]) continue;
      const higher = gradeRank(stated[set][k]) < gradeRank(truth[set][k]);
      const clauses = higher ? shortfallClauses(c.spirometry[set].summary, k) : [];
      out.push(`The statement grades the ${VAR_WORD[k]} ${SET_WORD[set]} ${higher ? 'higher' : 'lower'} than the maneuver list supports${clauses.length ? `; ${clauses.join('; ')}` : ''}.`);
    }
  }
  for (const set of ['pre', 'post']) {
    const r = representative[set];
    if (!r || r.kind !== 'flawed') continue;
    const sess = c.spirometry[set];
    const others = sess.maneuvers.filter((_, i) => i !== r.index && acceptableForBoth(sess.summary.evaluations[i])).length;
    out.push(`The loop drawn on the summary page for the set ${SET_WORD[set]} is maneuver ${r.index + 1} of ${sess.maneuvers.length}, which shows ${list(r.faults.map((f) => FAULT_NOUN[f] ?? faultWording(f)))}; ${others === 1 ? 'one other maneuver is' : `${others} other maneuvers are`} acceptable, and the reported values come from the acceptable maneuvers.`);
  }
  if (stated.dlco && truth.dlco && stated.dlco !== word(truth.dlco)) {
    out.push(truth.dlco.acceptable
      ? 'The statement calls the single-breath DLCO test not acceptable although it meets the acceptability criteria.'
      : `The statement calls the single-breath DLCO test acceptable; the test does not meet the criteria: ${truth.dlco.reasons.join('; ')}.`);
  }
  if (stated.pleth && truth.pleth && stated.pleth !== word(truth.pleth)) {
    out.push(truth.pleth.acceptable
      ? 'The statement calls the plethysmography not acceptable although the trials are acceptable and repeatable.'
      : `The statement calls the plethysmography acceptable; the trials do not meet the criteria: ${truth.pleth.reasons.join('; ')}.`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------------------------------------------

/**
 * The technologist's report for a case. Pure: the same case gives the same report, the case is not read for anything it does not
 * already hold and is never changed, and no other random stream is touched.
 * @param {object} caseData a case from buildCase
 * @returns {RtReport}
 */
export function buildRtReport(caseData) {
  const c = caseData;
  const u = rtDraws(c.descriptor.seed);
  const truth = truthOf(c);
  const representative = representativeFor(c);
  const software = softwareStated(c, truth);
  const type = chooseHonesty(weightsFor(c, truth, software), u[U.type]);
  const s = statement(type, truth, software, u);

  // Effort word: follows what the statement claims. A silent technologist leaves it blank.
  const claimClass = s.claim === 'poor' ? 'poor'
    : s.claim === 'good' ? 'good'
    : s.claim === 'stated' ? classOf(worstRank(s.stated.pre, s.stated.post))
    : s.claim === 'truth' ? classOf(worstRank(truth.pre, truth.post))
    : null;
  const effort = claimClass === null ? null : s.claim === 'poor' ? 'poor' : effortWord(claimClass, u[U.effortWord]);

  const detailsReasons = detailsReasonsFor(c, s.honesty, s.stated, truth, representative);
  return {
    version: 1,
    honesty: s.honesty,
    interpretationLines: interpretationLines(c, effort, u),
    qualityLines: s.lines,
    closing: RT_CLOSING,
    stated: s.stated,
    truth,
    representative,
    needsDetails: detailsReasons.length > 0,
    detailsReasons,
  };
}
