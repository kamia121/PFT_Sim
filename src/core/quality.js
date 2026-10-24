import { SPIROMETRY_2019 as S } from './standards.js';
import { atMost, atLeast } from './comparison.js';

/**
 * Longest pause at total lung capacity before the blast that the 2019 statement allows (seconds). Verification: stated
 * in the full text of the statement as read for docs/research/scenarios.md (S1); it is not a Table 7 criterion, so the
 * simulator treats a longer pause as spoiling the FEV1 because the text says it lowers FEV1 and peak flow.
 */
export const PAUSE_AT_TLC_MAX_SECONDS = { value: 2, verification: 'verified-primary (text), not a Table 7 row' };

/**
 * Readable wording for every maneuver fault id the generator can record (technique faults in maneuver.js, scenario faults in
 * SCENARIO_FAULTS, and the set-wide submaximal-effort marker). Consumers (report comments, the maneuver table, the app) look the id up
 * here and never print a bare id; tests/quality.test.mjs checks that every id the generator emits has an entry in all three tables.
 */
/** Report labels. */
export const FAULT_LABELS = {
  'slow-start': 'slow start',
  'early-termination': 'early termination',
  'variable-effort': 'variable effort',
  cough: 'cough in first second',
  'glottic-closure': 'glottic closure',
  leak: 'air leak at the lips',
  'mouthpiece-obstruction': 'tongue or teeth at the mouthpiece',
  'pause-at-TLC': 'pause at full inspiration',
  'submaximal-effort': 'submaximal effort',
  'no-plateau': 'no plateau at end of expiration',
};
/** Phrases for the technologist comment of a maneuver set ("<phrase> (maneuver 2)"). */
export const FAULT_TEXT = {
  'slow-start': 'hesitant start',
  'early-termination': 'early termination of expiration',
  'variable-effort': 'variable effort',
  cough: 'cough in the first second',
  'glottic-closure': 'abrupt cessation of flow, probable glottic closure',
  leak: 'air leak at the lips',
  'mouthpiece-obstruction': 'tongue or teeth in front of the mouthpiece',
  'pause-at-TLC': 'pause at full inspiration before the blast',
  'submaximal-effort': 'submaximal effort',
  'no-plateau': 'expiration stopped before a plateau',
};
/** Short wording for the per-maneuver table. */
export const FAULT_SHORT = {
  'slow-start': 'slow start',
  'early-termination': 'early stop',
  'variable-effort': 'variable effort',
  cough: 'cough',
  'glottic-closure': 'glottic closure',
  leak: 'leak',
  'mouthpiece-obstruction': 'mouthpiece obstruction',
  'pause-at-TLC': 'pause at TLC',
  'submaximal-effort': 'submaximal effort',
  'no-plateau': 'no plateau',
};
/** @param {string} id @param {'text'|'short'|'label'} [form] readable wording for a fault id; an unknown id is spelled out, not printed raw */
export function faultWording(id, form = 'text') {
  const table = form === 'short' ? FAULT_SHORT : form === 'label' ? FAULT_LABELS : FAULT_TEXT;
  return table[id] ?? String(id).replace(/[-_]/g, ' ').toLowerCase();
}

/**
 * Acceptability, usability, repeatability and grading for a set of forced maneuvers, following
 * Tables 7 and 10 of the ATS/ERS 2019 statement. FEV1 and FVC are judged and graded separately,
 * because the criteria differ: a cough in the first second spoils FEV1 but not FVC, glottic
 * closure after the first second spoils FVC but not FEV1, and only FVC needs an end-of-forced-
 * expiration (EOFE) indicator. Leaks and obstructed mouthpieces (scenario faults) make both variables unacceptable but
 * leave them usable; a pause at TLC longer than 2 s makes the FEV1 unacceptable. Zero-flow errors are not modeled.
 */

/**
 * @typedef {object} Maneuver
 * @property {number} fvc @property {number} fev1 @property {number} pef @property {number} fef2575
 * @property {number} fet forced expiratory time (s)
 * @property {number} bev back-extrapolated volume (L)
 * @property {number} plateau volume change over the last second (L)
 * @property {boolean} coughFirstSecond
 * @property {number|null} glottisClosedAt time of glottic closure (s), or null
 * @property {string[]} [faults] fault ids recorded by the generator (leak, mouthpiece-obstruction, ...)
 * @property {number} [pauseSeconds] length of a pause at total lung capacity before the blast (s)
 */

/**
 * @param {Maneuver} m
 * @param {number} maxFvcInSet largest FVC among all maneuvers in the set
 * @returns {{ fev1: { usable: boolean, acceptable: boolean, reasons: string[] }, fvc: { usable: boolean, acceptable: boolean, reasons: string[] } }}
 */
export function evaluateManeuver(m, maxFvcInSet = m.fvc) {
  const bevLimit = Math.max(S.bevFractionOfFvc.value * m.fvc, S.bevAbsoluteLiters.value);
  const bevBad = atLeast(m.bev, bevLimit);
  const closureFirstSecond = m.glottisClosedAt !== null && m.glottisClosedAt < 1;
  const closureLater = m.glottisClosedAt !== null && m.glottisClosedAt >= 1;

  const fev1Reasons = [];
  if (bevBad) fev1Reasons.push('back-extrapolated volume above limit');
  if (m.coughFirstSecond) fev1Reasons.push('cough in the first second');
  if (closureFirstSecond) fev1Reasons.push('glottic closure in the first second');

  // Faults added by the scenario layer. Both leave the value usable; they spoil acceptability only.
  const leakReasons = [];
  if (m.faults?.includes('leak')) leakReasons.push('leak');
  if (m.faults?.includes('mouthpiece-obstruction')) leakReasons.push('tongue or teeth in front of the mouthpiece');
  const pauseReasons = m.pauseSeconds !== undefined && m.pauseSeconds > PAUSE_AT_TLC_MAX_SECONDS.value ? ['pause at total lung capacity longer than 2 s'] : [];

  const fvcUsableReasons = [];
  if (bevBad) fvcUsableReasons.push('back-extrapolated volume above limit');
  if (closureFirstSecond) fvcUsableReasons.push('glottic closure in the first second');

  const fvcReasons = [...fvcUsableReasons, ...leakReasons];
  if (closureLater) fvcReasons.push('glottic closure after the first second');
  const eofe = m.plateau < S.plateauLiters.value
    || m.fet >= S.longFetSeconds.value
    || atLeast(m.fvc, maxFvcInSet - S.eofeRepeatabilityOfLargestFvc.value);
  if (!eofe) fvcReasons.push('no end-of-forced-expiration indicator');

  return {
    fev1: { usable: fev1Reasons.length === 0, acceptable: fev1Reasons.length === 0 && leakReasons.length === 0 && pauseReasons.length === 0, reasons: [...fev1Reasons, ...leakReasons, ...pauseReasons] },
    fvc: { usable: fvcUsableReasons.length === 0, acceptable: fvcReasons.length === 0, reasons: fvcReasons },
  };
}

/** Table 10, adult column. */
function gradeVariable(acceptableValues, usableCount) {
  if (acceptableValues.length === 0) return usableCount ? 'U' : 'F';
  if (acceptableValues.length === 1) return 'E';
  const [hi, next] = acceptableValues.slice().sort((a, b) => b - a);
  const spread = hi - next;
  const g = S.gradeSpreadLiters;
  if (acceptableValues.length >= 3 && atMost(spread, g.A)) return 'A';
  if (atMost(spread, g.B)) return 'B';
  if (atMost(spread, g.C)) return 'C';
  if (atMost(spread, g.D)) return 'D';
  return 'E';
}

const largestTwoSpread = (xs) => {
  if (xs.length < 2) return null;
  const [hi, next] = xs.slice().sort((a, b) => b - a);
  return hi - next;
};

/**
 * @param {Maneuver[]} maneuvers in recorded order
 * @returns {{ evaluations: ReturnType<typeof evaluateManeuver>[], grades: { fev1: string, fvc: string },
 *   nAcceptable: { fev1: number, fvc: number }, fvc: number|null, fev1: number|null, pef: number|null,
 *   fef2575: number|null, ratio: number|null, spread: { fev1: number|null, fvc: number|null }, repeatable: boolean }}
 */
export function summarizeSession(maneuvers) {
  const maxFvcInSet = maneuvers.length ? Math.max(...maneuvers.map((m) => m.fvc)) : 0;
  const evaluations = maneuvers.map((m) => evaluateManeuver(m, maxFvcInSet));
  const pick = (key, flag) => maneuvers.filter((_, i) => evaluations[i][key][flag]);
  const out = {};
  for (const key of ['fev1', 'fvc']) {
    const acc = pick(key, 'acceptable');
    const use = pick(key, 'usable');
    const pool = acc.length ? acc : use;
    out[key] = {
      value: pool.length ? Math.max(...pool.map((m) => m[key])) : null,
      grade: gradeVariable(acc.map((m) => m[key]), use.length),
      n: acc.length,
      spread: largestTwoSpread(acc.map((m) => m[key])),
    };
  }
  // The best FEV1 and best FVC can come from different maneuvers with different acceptability. A report never
  // shows FEV1 above FVC, so in that case FVC is taken as the FEV1 value and the adjustment is flagged.
  const fvcAdjusted = out.fvc.value !== null && out.fev1.value !== null && out.fev1.value > out.fvc.value;
  if (fvcAdjusted) out.fvc.value = out.fev1.value;
  const poolFor = (key) => (pick(key, 'acceptable').length ? pick(key, 'acceptable') : pick(key, 'usable'));
  const maxOf = (field, pool) => (pool.length ? Math.max(...pool.map((m) => m[field])) : null);
  return {
    evaluations,
    grades: { fev1: out.fev1.grade, fvc: out.fvc.grade },
    nAcceptable: { fev1: out.fev1.n, fvc: out.fvc.n },
    fvc: out.fvc.value,
    fev1: out.fev1.value,
    pef: maxOf('pef', poolFor('fev1')),
    fef2575: maxOf('fef2575', poolFor('fvc')),
    fvcAdjusted,
    ratio: out.fvc.value && out.fev1.value !== null ? out.fev1.value / out.fvc.value : null,
    spread: { fev1: out.fev1.spread, fvc: out.fvc.spread },
    repeatable: [out.fev1.spread, out.fvc.spread].every((x) => x !== null && atMost(x, S.repeatabilityLitersAdult.value)),
  };
}
