/**
 * Plotted traces for a recorded maneuver: the expiration with fault artifacts, the inspiratory limb and the
 * tidal baseline that precedes the forced maneuver on the volume-time curve. Everything is derived from the
 * maneuver's curve and the case seed, so a figure is a pure function of the case.
 */
import { volume, flow, peakFlow } from '../../core/curve.js';
import { sampleExpiration, applyArtifacts, buildInspiratory } from '../../core/inspiratory.js';
import { createStream } from '../../core/prng.js';

/** Seed for the artifact stream of one maneuver; post-bronchodilator maneuvers are offset by 100. */
export const artifactSeed = (seed, index, set) => ((seed >>> 0) + (index + (set === 'post' ? 100 : 0)) * 0x9e3779b1) >>> 0;

/**
 * @param {object} m maneuver from generateManeuvers (needs curve, fet, fvc, faults); m.inspiratory is used when present
 * @param {{ seed: number, index: number, set?: 'pre'|'post', scenario?: object|null }} o
 */
export function maneuverTrace(m, { seed, index, set = 'pre', scenario = null }) {
  const sampled = sampleExpiration({ volume, flow }, m.curve, m.fet);
  const exp = applyArtifacts(sampled, m.faults ?? [], artifactSeed(seed, index, set));
  let insp = m.inspiratory ?? buildInspiratory(m, { seed, index: index + (set === 'post' ? 100 : 0), scenario });
  if (insp.recorded === true && !['t', 'v', 'f'].every((k) => Array.isArray(insp[k]) && insp[k].length >= 2 && insp[k].length === insp.t?.length && insp[k].every(Number.isFinite))) {
    // A recorded scalar is not a recorded waveform; do not synthesize one to match it.
    insp = { ...insp, t: [], v: [], f: [], flags: ['inspiratory-trace-not-recorded'] };
  }
  return { exp, insp };
}

/** Index of the maneuver shown on the volume-time curve: acceptable first, then the largest FVC + FEV1. */
export function bestIndex(set) {
  const ev = set.summary.evaluations;
  let bestI = 0, bestScore = -1;
  set.maneuvers.forEach((m, i) => {
    const ok = ev[i].fev1.acceptable && ev[i].fvc.acceptable ? 2 : ev[i].fev1.usable || ev[i].fvc.usable ? 1 : 0;
    const score = ok * 100 + m.fvc + m.fev1;
    if (score > bestScore) { bestScore = score; bestI = i; }
  });
  return bestI;
}

export const isAcceptable = (set, i) => set.summary.evaluations[i].fev1.acceptable && set.summary.evaluations[i].fvc.acceptable;

/**
 * Tidal breathing and the deep inspiration before a forced expiration, in exhaled volume measured from
 * total lung capacity (the same coordinate as the forced expiration). End-tidal volume sits at about the
 * inspiratory capacity below TLC, i.e. 0.6 to 0.7 of the FVC. The trace is on the plot time axis (time zero is the
 * back-extrapolated start of the forced expiration), runs from tStart, and ends at volume 0 just before the blow.
 * Purely visual: no tabulated value depends on it. Stream name: `volume-time-tidal`.
 * @returns {{ t: number[], v: number[] }}
 */
export function tidalBaseline(fvc, t0, seed, tStart = -4) {
  const rng = createStream(seed >>> 0, 'volume-time-tidal');
  const level = fvc * (0.6 + 0.1 * rng.uniform());
  const vt = Math.min(0.55, 0.12 * fvc) * (0.85 + 0.3 * rng.uniform());
  const period = 2.0 + 0.5 * rng.uniform();
  const tI1 = -t0 - 0.06;
  const tI0 = tI1 - 1.0;
  const t = [], v = [];
  for (let x = tStart; x < tI0; x += 0.05) { t.push(x); v.push(level + (vt / 2) * Math.cos((2 * Math.PI * (x - tI0)) / period)); }
  const a = level + vt / 2;
  const n = 20;
  for (let i = 0; i <= n; i++) { const u = i / n; t.push(tI0 + u * (tI1 - tI0)); v.push((a * (1 + Math.cos(Math.PI * u))) / 2); }
  return { t, v };
}

/** Peak-flow time and value of the underlying curve, for the tangent construction. */
export const curvePeak = (curve) => peakFlow(curve);
