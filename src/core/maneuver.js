import { createStream } from './prng.js';
import { solveCurve, volume, backExtrapolation, peakFlow, timeAtVolume } from './curve.js';
import { summarizeSession } from './quality.js';
import { SPIROMETRY_2019 as S } from './standards.js';

/**
 * Generates the set of forced maneuvers a technologist would record for one patient.
 * Inputs are the patient's true FVC and FEV1 in liters, a curve shape, and a technique level.
 * Technique is independent of physiology: a poor session degrades the measurements, not the lungs.
 */

export const TECHNIQUES = ['good', 'fair', 'poor'];
const FAULT_RATE = { good: 0.05, fair: 0.2, poor: 0.45 };
const MAX_MANEUVERS = 8;

/**
 * Faults that only the scenario layer injects (src/scenarios), drawn from their own streams so the
 * technique-driven draws of a case are unchanged. Magnitudes are simulator choices; directions follow
 * docs/research/scenarios.md (QS-01 to QS-14) and the ATS/ERS 2019 acceptability criteria in quality.js.
 * `pause-at-TLC` carries its pause length, which quality.js compares with the 2 s limit.
 */
export const SCENARIO_FAULTS = {
  // The curve family's own slow-start range (r of 0.14 to 0.3 s) never reaches the BEV limit, so the shape is solved afterwards (slowStartShape).
  'slow-start': (s, g) => { s.slowStart = true; s.r = g.range(0.6, 1.0); },
  'early-termination': (s, g) => { s.tStop = Math.min(s.tStop, g.range(2.5, Math.min(6, s.T))); },
  'no-plateau': (s, g) => { s.tStop = Math.min(s.tStop, g.range(5, Math.max(5.5, Math.min(9, s.T - 3)))); },
  'variable-effort': (s, g) => { const f = g.range(0.82, 0.95); s.fvcT *= f; s.fev1T *= f; },
  cough: (s, g) => { s.fev1T *= g.range(0.88, 0.95); },
  'glottic-closure': (s, g) => { s.glottisClosedAt = g.range(0.5, 4); s.tStop = Math.min(s.tStop, s.glottisClosedAt); },
  leak: (s, g) => {
    s.fvcT *= g.range(0.8, 0.94); s.fev1T *= g.range(0.88, 0.97);
    if (g.chance(0.5)) s.tStop = Math.min(s.tStop, g.range(3.5, Math.max(4, Math.min(8, s.T))));
  },
  'mouthpiece-obstruction': (s, g) => { s.fev1T *= g.range(0.78, 0.92); s.fvcT *= g.range(0.9, 0.98); s.r = Math.max(s.r, g.range(0.08, 0.18)); },
  'pause-at-TLC': (s, g) => { s.pauseSeconds = g.range(3.5, 6.5); s.fev1T *= g.range(0.88, 0.95); s.fvcT *= g.range(0.97, 1); s.r = Math.max(s.r, g.range(0.08, 0.16)); },
};
/**
 * A hesitant start as a rounder, delayed rise: the shape exponent is raised until the back-extrapolated volume
 * exceeds 1.3 times the 2019 limit (5% of FVC or 0.100 L, whichever is greater). The loop and the table still come from one curve.
 */
function slowStartShape({ fvc, fev1, k, r, T }) {
  const limit = Math.max(S.bevFractionOfFvc.value * fvc, S.bevAbsoluteLiters.value);
  let kk = Math.max(k + 0.3, 1.2);
  for (; kk < 2.6; kk += 0.2) {
    const { curve } = solveCurve({ fvc, fev1, k: kk, r, T });
    if (backExtrapolation(curve).bev > 1.3 * limit) break;
  }
  return Math.min(kk, 2.6);
}

/** Every fault id a maneuver can carry: technique faults, scenario faults, and the set-wide submaximal-effort marker. */
export const ALL_FAULT_IDS = [...new Set(['slow-start', 'early-termination', 'variable-effort', 'cough', 'glottic-closure', ...Object.keys(SCENARIO_FAULTS), 'submaximal-effort'])];

// The order in which scenario faults are applied is fixed so that a case is a pure function of its descriptor.
const SCENARIO_FAULT_ORDER = Object.keys(SCENARIO_FAULTS);

/**
 * Scenario controls for one maneuver set.
 * @typedef {object} ManeuverScenario
 * @property {Record<string, number>} [faultProb] extra probability per fault on every maneuver
 * @property {{ fault: string, p: number, first: number }[]} [forced] a fault that always occurs on maneuver index `first` and on later ones with probability p
 * @property {{ fvc?: number, fev1?: number, r?: number }} [effort] set-wide submaximal effort: multipliers on FVC and FEV1 and a slower start
 * @property {{ perBlow: number }} [decline] FEV1 (and, half as fast, FVC) falls by this fraction with each maneuver; testing stops below 80% of the first
 * @property {number} [maxManeuvers] cap on the number of maneuvers recorded
 */

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

/** Time to stop at when a decline scenario applies: FEV1 below this fraction of the first blow ends testing (ATS/ERS 2019). */
const DECLINE_STOP_FRACTION = 0.8;

/**
 * @param {number} seed
 * @param {{ fvc: number, fev1: number, k: number, T?: number, technique: 'good'|'fair'|'poor', prefix?: string, earlyStop?: [number, number]|null, scenario?: ManeuverScenario|null }} truth
 * @returns {{ maneuvers: (ReturnType<typeof tabulate> & { curve: object, index: number })[], summary: ReturnType<typeof summarizeSession> }}
 */
export function generateManeuvers(seed, { fvc, fev1, k, T = 12, technique, prefix = 'maneuver', earlyStop = null, scenario = null }) {
  const maneuvers = [];
  const limit = Math.min(MAX_MANEUVERS, scenario?.maxManeuvers ?? MAX_MANEUVERS);
  let firstFev1 = null;
  for (let i = 0; i < limit; i++) {
    const rng = createStream(seed, `${prefix}-${i}`);
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
    // A forced early stop (for example after a bronchodilator) applies to every maneuver in the set.
    if (earlyStop) { const stop = rng.range(earlyStop[0], earlyStop[1]); tStop = Math.min(tStop, stop); if (!faults.includes('early-termination')) faults.push('early-termination'); }
    let pauseSeconds = null, slowStart = false;
    if (scenario) {
      // Scenario faults use their own stream, drawn after the technique faults, so removing the scenario restores the plain case.
      const g = createStream(seed, `scn-${prefix}-${i}`);
      const st = { fvcT, fev1T, r, tStop, T, glottisClosedAt, pauseSeconds: null, slowStart: false };
      const want = new Set();
      for (const name of Object.keys(scenario.faultProb ?? {}).sort()) if (g.chance(scenario.faultProb[name])) want.add(name);
      for (const f of scenario.forced ?? []) if (i === f.first || g.chance(f.p)) want.add(f.fault);
      for (const name of SCENARIO_FAULT_ORDER) {
        if (!want.has(name) || faults.includes(name)) continue;
        SCENARIO_FAULTS[name](st, g);
        faults.push(name);
      }
      if (scenario.effort) {
        const e = scenario.effort, noise = Math.exp(0.008 * g.normal());
        st.fvcT *= (e.fvc ?? 1) * noise; st.fev1T *= (e.fev1 ?? 1) * noise; st.r = Math.max(st.r, e.r ?? 0);
        faults.push('submaximal-effort');
      }
      if (scenario.decline) {
        st.fev1T *= Math.max(0.3, 1 - scenario.decline.perBlow * i);
        st.fvcT *= Math.max(0.3, 1 - 0.5 * scenario.decline.perBlow * i);
      }
      ({ fvcT, fev1T, r, tStop, glottisClosedAt, pauseSeconds } = st);
      slowStart = st.slowStart;
    }
    fev1T = Math.min(fev1T, 0.995 * fvcT);
    const kBlow = slowStart ? slowStartShape({ fvc: fvcT, fev1: fev1T, k, r, T }) : k;
    const { curve } = solveCurve({ fvc: fvcT, fev1: fev1T, k: kBlow, r, T });
    const row = tabulate(curve, tStop, faults, glottisClosedAt);
    if (pauseSeconds !== null) row.pauseSeconds = pauseSeconds;
    maneuvers.push({ ...row, curve, index: i });
    if (scenario?.decline) {
      if (firstFev1 === null) firstFev1 = row.fev1;
      if (i > 0 && row.fev1 < DECLINE_STOP_FRACTION * firstFev1) break;
    }
    // The technologist stops once three acceptable, repeatable efforts are recorded (a falling FEV1 ends the session by the 80% rule instead).
    if (i >= 2 && !scenario?.decline) {
      const s = summarizeSession(maneuvers);
      if (s.grades.fev1 === 'A' && s.grades.fvc === 'A') break;
    }
  }
  return { maneuvers, summary: summarizeSession(maneuvers) };
}
