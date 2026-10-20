import { createStream } from './prng.js';
import { solveCurve, volume, backExtrapolation, peakFlow, timeAtVolume } from './curve.js';
import { summarizeSession } from './quality.js';

/**
 * Generates the set of forced maneuvers a technologist would record for one patient.
 * Inputs are the patient's true FVC and FEV1 in liters, a curve shape, and a technique level.
 * Technique is independent of physiology: a poor session degrades the measurements, not the lungs.
 */

export const TECHNIQUES = ['good', 'fair', 'poor'];
const FAULT_RATE = { good: 0.05, fair: 0.2, poor: 0.45 };
const MAX_MANEUVERS = 8;

/**
 * @param {import('./curve.js').Curve} curve
 * @param {number} tStop end of the recorded expiration (s)
 * @param {string[]} faults
 */
function tabulate(curve, tStop, faults, glottisClosedAt) {
  const { t0, bev } = backExtrapolation(curve);
  const fvc = volume(curve, tStop);
  const fev1 = volume(curve, Math.min(t0 + 1, tStop));
  const t25 = timeAtVolume(curve, 0.25 * fvc), t75 = timeAtVolume(curve, 0.75 * fvc);
  return {
    fvc, fev1,
    pef: peakFlow(curve).pef,
    fef2575: (0.5 * fvc) / (t75 - t25),
    fet: tStop,
    bev,
    t0,
    plateau: volume(curve, tStop) - volume(curve, Math.max(0, tStop - 1)),
    faults,
    coughFirstSecond: faults.includes('cough'),
    glottisClosedAt,
  };
}

/**
 * @param {number} seed
 * @param {{ fvc: number, fev1: number, k: number, T?: number, technique: 'good'|'fair'|'poor' }} truth
 * @returns {{ maneuvers: (ReturnType<typeof tabulate> & { curve: object, index: number })[], summary: ReturnType<typeof summarizeSession> }}
 */
export function generateManeuvers(seed, { fvc, fev1, k, T = 12, technique }) {
  const maneuvers = [];
  for (let i = 0; i < MAX_MANEUVERS; i++) {
    const rng = createStream(seed, `maneuver-${i}`);
    const faults = [];
    // Natural breath-to-breath variability, FEV1 and FVC moving together.
    const common = rng.normal(), indep = rng.normal();
    const cv = technique === 'good' ? 0.012 : technique === 'fair' ? 0.02 : 0.03;
    let fvcT = fvc * Math.exp(cv * common);
    let fev1T = fev1 * Math.exp(cv * (0.9 * common + 0.44 * indep));
    let r = Math.max(0.02, 0.035 + 0.008 * rng.normal());
    let tStop = T;
    const p = FAULT_RATE[technique];
    if (rng.chance(p)) { faults.push('slow-start'); r = rng.range(0.14, 0.3); }
    if (rng.chance(p)) { faults.push('early-termination'); tStop = rng.range(2.5, Math.min(6, T)); }
    if (rng.chance(p)) { faults.push('variable-effort'); const f = rng.range(0.88, 0.96); fvcT *= f; fev1T *= f; }
    if (rng.chance(p * 0.6)) { faults.push('cough'); fev1T *= rng.range(0.88, 0.95); }
    let glottisClosedAt = null;
    if (rng.chance(p * 0.4)) { faults.push('glottic-closure'); glottisClosedAt = rng.range(0.5, 4); tStop = Math.min(tStop, glottisClosedAt); }
    fev1T = Math.min(fev1T, 0.995 * fvcT);
    const { curve } = solveCurve({ fvc: fvcT, fev1: fev1T, k, r, T });
    const row = tabulate(curve, tStop, faults, glottisClosedAt);
    maneuvers.push({ ...row, curve, index: i });
    // The technologist stops once three acceptable, repeatable efforts are recorded.
    if (i >= 2) {
      const s = summarizeSession(maneuvers);
      if (s.grades.fev1 === 'A' && s.grades.fvc === 'A') break;
    }
  }
  return { maneuvers, summary: summarizeSession(maneuvers) };
}
