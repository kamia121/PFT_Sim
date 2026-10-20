import { SPIROMETRY_2019 as S } from './standards.js';

/**
 * Acceptability, repeatability and session grading for a set of forced maneuvers.
 * Criteria constants live in standards.js with their verification state.
 */

/**
 * @typedef {object} Maneuver
 * @property {number} fvc @property {number} fev1 @property {number} pef @property {number} fef2575
 * @property {number} fet forced expiratory time (s)
 * @property {number} bev back-extrapolated volume (L)
 * @property {number} plateau volume change over the last second (L)
 * @property {string[]} faults technical faults present
 */

/** A maneuver is usable when the start of test is sound: BEV in range and no cough or hesitation fault. */
export function evaluateManeuver(m) {
  const reasons = [];
  const bevLimit = Math.max(S.bevFractionOfFvc.value * m.fvc, S.bevAbsoluteLiters.value);
  if (m.bev >= bevLimit) reasons.push('back-extrapolated volume above limit');
  if (m.faults.includes('cough')) reasons.push('cough in the first second');
  const usable = reasons.length === 0;
  const eofe = m.plateau < S.plateauLiters.value || m.fet >= S.longFetSeconds.value;
  if (usable && !eofe) reasons.push('no end-of-test plateau');
  if (m.faults.includes('glottic-closure')) reasons.push('glottic closure');
  return { usable, acceptable: reasons.length === 0, reasons };
}

const largestTwo = (xs) => xs.slice().sort((a, b) => b - a).slice(0, 2);

/**
 * @param {Maneuver[]} maneuvers in recorded order
 * @returns {{ evaluations: object[], nAcceptable: number, nUsable: number, fvc: number|null, fev1: number|null,
 *   pef: number|null, fef2575: number|null, ratio: number|null, spreadFvc: number|null, spreadFev1: number|null,
 *   repeatable: boolean, grade: 'A'|'B'|'C'|'D'|'E'|'U'|'F' }}
 */
export function summarizeSession(maneuvers) {
  const evaluations = maneuvers.map(evaluateManeuver);
  const acc = maneuvers.filter((_, i) => evaluations[i].acceptable);
  const usable = maneuvers.filter((_, i) => evaluations[i].usable);
  const pool = acc.length ? acc : usable;
  const max = (key, xs) => (xs.length ? Math.max(...xs.map((m) => m[key])) : null);
  const fvc = max('fvc', pool), fev1 = max('fev1', pool);
  const spread = (key) => {
    if (acc.length < 2) return null;
    const [hi, next] = largestTwo(acc.map((m) => m[key]));
    return hi - next;
  };
  const spreadFvc = spread('fvc'), spreadFev1 = spread('fev1');
  const worst = spreadFvc === null ? null : Math.max(spreadFvc, spreadFev1);
  const g = S.gradeSpreadLiters;
  let grade;
  if (acc.length === 0) grade = usable.length ? 'U' : 'F';
  else if (acc.length === 1) grade = 'E';
  else if (acc.length >= 3 && worst <= g.A) grade = 'A';
  else if (worst <= g.B) grade = 'B';
  else if (worst <= g.C) grade = 'C';
  else if (worst <= g.D) grade = 'D';
  else grade = 'E';
  return {
    evaluations,
    nAcceptable: acc.length,
    nUsable: usable.length,
    fvc,
    fev1,
    pef: max('pef', pool),
    fef2575: max('fef2575', pool),
    ratio: fvc ? fev1 / fvc : null,
    spreadFvc,
    spreadFev1,
    repeatable: worst !== null && worst <= S.repeatabilityLitersAdult.value,
    grade,
  };
}
