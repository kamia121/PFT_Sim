/**
 * Plotted traces for a recorded maneuver: the expiration with fault artifacts, the inspiratory limb and the
 * tidal baseline that precedes the forced maneuver on the volume-time curve. Everything is derived from the
 * maneuver's curve and the case seed, so a figure is a pure function of the case.
 */
import { peakFlow, backExtrapolation } from '../../core/curve.js';
import { plotGrid, applyArtifacts, artifactSpanEnd, buildInspiratory } from '../../core/inspiratory.js';
import { expiratoryTexture, sampleTextured, textureInspiration, TRACE_RENDERING_ID } from '../../core/trace-texture.js';
import { createStream } from '../../core/prng.js';

/** Seed for the artifact stream of one maneuver; post-bronchodilator maneuvers are offset by 100. */
export const artifactSeed = (seed, index, set) => ((seed >>> 0) + (index + (set === 'post' ? 100 : 0)) * 0x9e3779b1) >>> 0;

/**
 * The one plotted representation of a maneuver, shared by the flow-volume loop and the volume-time curve: the curve sampled
 * through the within-blow texture of src/core/trace-texture.js (display only; the tabulated values keep the curve's own), then the
 * named fault artifacts on top (the texture is kept out of their windows), and the textured inspiratory limb.
 *
 * Results are cached, because every figure of a page asks for the same maneuvers again and the texture costs about 17 ms per
 * maneuver (docs/trace-texture-model.md, section 6). Contract:
 *   - the trace is a pure function of the fields it reads: curve (A, a, k, r, T), fet, fvc, faults, inspiratory (when present),
 *     the case seed, the set, the index, the faults of the scenario, and the trace-rendering version;
 *   - the cache is a WeakMap keyed by the maneuver object, so entries live only as long as the case that holds them;
 *   - inputs may be changed in place: each entry stores a fingerprint of the values of those fields (the contents of the faults and
 *     of a supplied inspiratory limb, not their identity) and is used only when the fingerprint matches, so a maneuver changed after
 *     a first call, by replacement or in place, is computed again and never answered from a stale entry;
 *   - the returned object and its arrays are frozen and shared between callers: a caller that needs to change them copies them
 *     (writing into a frozen array throws in module code, so a mistake cannot silently alter what another figure draws).
 * computeManeuverTrace is the uncached computation.
 * @param {object} m maneuver from generateManeuvers (needs curve, fet, fvc, faults); m.inspiratory is used when present
 * @param {{ seed: number, index: number, set?: 'pre'|'post', scenario?: object|null }} o
 */
export function computeManeuverTrace(m, { seed, index, set = 'pre', scenario = null }) {
  const protectUntil = artifactSpanEnd(m.faults, backExtrapolation(m.curve));
  const texture = expiratoryTexture(m.curve, m.fet, { seed, set, index, protectUntil });
  const sampled = sampleTextured(m.curve, plotGrid(m.fet), texture);
  const exp = applyArtifacts(sampled, m.faults ?? [], artifactSeed(seed, index, set));
  const insp0 = m.inspiratory ?? buildInspiratory(m, { seed, index: index + (set === 'post' ? 100 : 0), scenario });
  const insp = textureInspiration(insp0, { seed, set, index });
  return { exp, insp, texture };
}

const traceCache = new WeakMap();
/**
 * Fingerprint of the values of every input the trace reads, numbers in full precision: a supplied inspiratory limb is included by
 * content (every field textureInspiration copies or reads), so changing one of its samples in place changes the fingerprint.
 */
export const traceFingerprint = (m, { seed, index, set = 'pre', scenario = null }) => {
  const c = m.curve;
  return JSON.stringify([TRACE_RENDERING_ID, seed >>> 0, set, index, c.A, c.a, c.k, c.r, c.T, m.fet, m.fvc, m.faults ?? [], scenario?.faults ?? [], m.inspiratory ?? null]);
};
const deepFreeze = (x) => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.freeze(x); for (const v of Object.values(x)) deepFreeze(v); }
  return x;
};

/** Cached maneuverTrace (see computeManeuverTrace for the contract). */
export function maneuverTrace(m, opts) {
  const fp = traceFingerprint(m, opts);
  let byM = traceCache.get(m);
  if (!byM) { byM = new Map(); traceCache.set(m, byM); }
  const slot = `${opts.seed >>> 0}|${opts.set ?? 'pre'}|${opts.index}`;
  const hit = byM.get(slot);
  if (hit && hit.fp === fp) return hit.value;
  const value = deepFreeze(computeManeuverTrace(m, opts));
  byM.set(slot, { fp, value });
  return value;
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
