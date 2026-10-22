/**
 * Within-blow irregularity of the plotted spirometry traces ("texture"). Display only: it is derived where the trace is drawn
 * (src/ui/figures/traces.js), never stored on the case, so the case, its hashes, the tabulated values, the quality grades and the
 * interpretation key do not depend on it, and the generator version is unchanged. The texture model has its own version
 * (TRACE_TEXTURE_MODEL.version); docs/trace-texture-model.md records every choice.
 *
 * Expiration: a monotone time warp of the maneuver's own curve,
 *   tau(t) = t + delta(t),   delta(t) = integral of m from 0 to t,
 *   plotted volume V(tau(t)),   plotted flow F(tau(t)) (1 + m(t)),
 * with V and F the volume and flow of curve.js, so the flow is the exact derivative of the plotted volume and, at each volume, the
 * flow of the curve times (1 + m). m is a smooth random modulation of a few percent:
 *   - zero until flow has fallen below 0.9 PEF after the peak, so time zero, the back-extrapolated volume and PEF are unchanged;
 *   - zero in the last second, so FVC, the end-of-test plateau and the forced expiratory time are unchanged;
 *   - integrating to zero between consecutive anchors (the times of 25, 50 and 75% of FVC and of FEV1), so the volume at each
 *     anchor, the FEV1 and the FEF25-75 crossing times are those of the curve.
 * The modulation is a function of exhaled volume (two cubic B-spline processes with correlation lengths of 0.04 and 0.2 of the
 * FVC) with a floor on the correlation time, so it is neither white noise nor a periodic wave. It does not depend on technique
 * or on faults: the named fault artifacts of inspiratory.js are drawn on top of it, separately.
 *
 * Inspiration: the flow of the inspiratory limb is multiplied by (1 + m) with m built the same way on inspired volume, corrected
 * so that the inspired volume (FIVC) is unchanged; the volume is integrated again from the modified flow.
 *
 * Random streams: `spiro-texture-<set>-<index>` and `spiro-texture-insp-<set>-<index>`, a fixed number of draws each. No other
 * stream is read. Amplitudes and correlation lengths are unverified teaching values (no standard gives them).
 */
import { createStream } from './prng.js';
import { volume as curveVolume, flow as curveFlow, peakFlow, backExtrapolation, timeAtVolume } from './curve.js';

export const TRACE_TEXTURE_MODEL = {
  version: 1,
  expiratory: {
    fineSd: 0.02, fineLengthOfFvc: 0.04, fineMinCorrelationS: 0.04,
    broadSd: 0.015, broadLengthOfFvc: 0.2, broadMinCorrelationS: 0.25,
    cap: 0.08,
    peakGuardFractionOfPef: 0.9, guardRampS: 0.05,
    quietEndS: 1, endRampS: 0.3,
    peakCeilingOfPef: 0.97,
    anchorsFractionOfFvc: [0.25, 0.5, 0.75],
  },
  inspiratory: {
    fineSd: 0.035, fineLengthOfFivc: 0.05, fineMinCorrelationS: 0.08,
    broadSd: 0.02, broadLengthOfFivc: 0.25, broadMinCorrelationS: 0.3,
    cap: 0.12,
  },
  /** Per-maneuver amplitude multiplier exp(sd N(0,1)), so blows of one session differ. */
  amplitudeLogSd: 0.25,
  gridStepS: 0.001,
  verification: 'unverified',
  note: 'Amplitudes and correlation lengths are simulator choices for face plausibility; no standard prescribes them.',
};

/**
 * Identifier of the spirometry trace rendering, written on every figure that draws maneuver traces (`data-trace-rendering` on
 * the svg root, so exported files carry it) and stored in the trace fixture. The generator version reproduces the case and every
 * tabulated value; this identifier says which rendering drew the traces. A link made before this rendering existed reproduces the
 * same numbers, grades and key, but not the same pixels.
 */
export const TRACE_RENDERING_ID = `spirometry-texture-v${TRACE_TEXTURE_MODEL.version}`;
export const TRACE_RENDERING_ATTRS = { 'data-trace-rendering': TRACE_RENDERING_ID };

const FINE_DRAWS = 32;
const BROAD_DRAWS = 12;

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
const smoothstep = (x) => { const c = clamp(x, 0, 1); return c * c * (3 - 2 * c); };

/** Uniform cubic B-spline basis weights at fractional position w in [0, 1). */
function bspline(w) {
  const w2 = w * w, w3 = w2 * w;
  return [(1 - w) ** 3 / 6, (3 * w3 - 6 * w2 + 4) / 6, (-3 * w3 + 3 * w2 + 3 * w + 1) / 6, w3 / 6];
}

/**
 * Smooth unit-variance process of the knot coordinate u: a uniform cubic B-spline with independent standard normal
 * coefficients, divided pointwise by the root of the summed squared weights (between 0.46 and 0.5), so the variance is 1 everywhere.
 * @param {number[]} coef @param {number} u
 */
function process(coef, u) {
  const x = Math.max(0, u);
  const i = Math.min(Math.floor(x), coef.length - 4);
  const b = bspline(Math.min(x - i, 1));
  let s = 0, q = 0;
  for (let k = 0; k < 4; k++) { s += b[k] * coef[i + k]; q += b[k] * b[k]; }
  return s / Math.sqrt(q);
}

/** Fixed number of draws from one stream: amplitude multiplier, then fine and broad coefficients. */
function drawCoefficients(rng) {
  const amp = Math.exp(TRACE_TEXTURE_MODEL.amplitudeLogSd * rng.normal());
  const fine = Array.from({ length: FINE_DRAWS }, () => rng.normal());
  const broad = Array.from({ length: BROAD_DRAWS }, () => rng.normal());
  return { amp, fine, broad };
}

/**
 * Knot coordinate of a process that advances one unit per correlation length of exhaled volume, but no faster than one unit
 * per minimum correlation time: du/dt = min(|flow| / (length x total volume), 1 / tMin). Its total is at most 1 / length,
 * so the fixed number of coefficients is never exceeded.
 */
function knotRate(absFlow, lengthL, tMin) { return Math.min(absFlow / lengthL, 1 / tMin); }

/** Trapezoid cumulative integral of y on grid t. */
function cumtrapz(t, y) {
  const out = new Array(t.length);
  out[0] = 0;
  for (let j = 1; j < t.length; j++) out[j] = out[j - 1] + 0.5 * (y[j] + y[j - 1]) * (t[j] - t[j - 1]);
  return out;
}

/**
 * Expiratory texture of one maneuver: the time-warp function on a fine grid, ready to sample.
 * @param {import('./curve.js').Curve} curve
 * @param {number} tStop recorded end of expiration (s)
 * @param {{ seed: number, set: 'pre'|'post', index: number, protectUntil?: number }} id protectUntil: the texture starts no earlier
 *   than this time (s), used to keep it out of the windows of the named fault artifacts (inspiratory.js artifactSpanEnd)
 * @returns {{ grid: number[], delta: number[], m: number[], active: [number, number]|null, anchors: number[], scale: number, model: number }}
 */
export function expiratoryTexture(curve, tStop, { seed, set, index, protectUntil = 0 }) {
  const P = TRACE_TEXTURE_MODEL.expiratory;
  const rng = createStream(seed >>> 0, `spiro-texture-${set}-${index}`);
  const { amp, fine, broad } = drawCoefficients(rng);
  const empty = { grid: [], delta: [], m: [], active: null, anchors: [], scale: 0, model: TRACE_TEXTURE_MODEL.version };

  const { t: tPk, pef } = peakFlow(curve);
  // Guard: the peak and the descent to 0.9 PEF stay exactly as the curve has them (time zero, BEV and PEF depend on this part).
  let lo = tPk, hi = Math.min(tStop, tPk + 5);
  if (curveFlow(curve, hi) > P.peakGuardFractionOfPef * pef || protectUntil >= tStop) return empty;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (curveFlow(curve, mid) > P.peakGuardFractionOfPef * pef) lo = mid; else hi = mid; }
  const tGuard = Math.max(hi, protectUntil);
  const tQuiet = tStop - P.quietEndS;
  if (!(tQuiet - tGuard > P.guardRampS + P.endRampS)) return empty;

  // Anchors: the guard, the times of 25, 50 and 75% of the volume at the end of the record and of FEV1, and the start of the quiet end.
  const fvc = curveVolume(curve, tStop);
  const { t0 } = backExtrapolation(curve);
  const cand = [...P.anchorsFractionOfFvc.map((q) => timeAtVolume(curve, q * fvc)), t0 + 1];
  const anchors = [tGuard, ...cand.filter((x) => Number.isFinite(x) && x > tGuard + 1e-6 && x < tQuiet - 1e-6).sort((a, b) => a - b), tQuiet]
    .filter((x, k, a) => k === 0 || x - a[k - 1] > 1e-6);

  // Grid: each anchor segment split into equal steps of at most gridStepS, so every anchor is a node.
  const grid = [];
  for (let k = 0; k + 1 < anchors.length; k++) {
    const a = anchors[k], b = anchors[k + 1], n = Math.max(2, Math.ceil((b - a) / TRACE_TEXTURE_MODEL.gridStepS));
    for (let j = k === 0 ? 0 : 1; j <= n; j++) grid.push(j === n ? b : a + ((b - a) * j) / n);
  }
  const f = grid.map((x) => curveFlow(curve, x));
  const uFine = cumtrapz(grid, f.map((q) => knotRate(q, P.fineLengthOfFvc * fvc, P.fineMinCorrelationS)));
  const uBroad = cumtrapz(grid, f.map((q) => knotRate(q, P.broadLengthOfFvc * fvc, P.broadMinCorrelationS)));
  const env = grid.map((x) => smoothstep((x - tGuard) / P.guardRampS) * (1 - smoothstep((x - (tQuiet - P.endRampS)) / P.endRampS)));
  const m0 = grid.map((_, j) => {
    const raw = amp * (P.fineSd * process(fine, uFine[j]) + P.broadSd * process(broad, uBroad[j]));
    return env[j] * P.cap * Math.tanh(raw / P.cap);
  });

  // Zero integral of m over every anchor segment: subtract c sin^2 bumps (zero value and slope at the anchors, so m stays smooth).
  const m = m0.slice();
  let j0 = 0;
  for (let k = 0; k + 1 < anchors.length; k++) {
    let j1 = j0;
    while (j1 < grid.length - 1 && grid[j1] < anchors[k + 1]) j1++;
    const a = grid[j0], b = grid[j1];
    const phi = (x) => Math.sin((Math.PI * (x - a)) / (b - a)) ** 2;
    let im = 0, ip = 0;
    for (let j = j0 + 1; j <= j1; j++) {
      const h = grid[j] - grid[j - 1];
      im += 0.5 * (m0[j] + m0[j - 1]) * h;
      ip += 0.5 * (phi(grid[j]) + phi(grid[j - 1])) * h;
    }
    const c = im / ip;
    for (let j = j0; j <= j1; j++) m[j] = m0[j] - c * phi(grid[j]);
    j0 = j1;
  }
  let delta = cumtrapz(grid, m);

  // No new peak: the textured flow must stay below the ceiling after the guard. Scaling m scales delta and keeps every anchor.
  // The cap holds after the correction too: scale m down if the bumps pushed it past the cap.
  const mMax = Math.max(...m.map(Math.abs));
  let scale = mMax > P.cap ? P.cap / mMax : 1;
  const peakOk = (s) => grid.every((x, j) => curveFlow(curve, x + s * delta[j]) * (1 + s * m[j]) <= P.peakCeilingOfPef * pef);
  for (let it = 0; it < 30 && !peakOk(scale); it++) scale *= 0.8;
  if (!peakOk(scale)) return empty;
  const mOut = m.map((q) => q * scale);
  delta = delta.map((q) => q * scale);
  return { grid, delta, m: mOut, active: [anchors[0], anchors[anchors.length - 1]], anchors, scale, model: TRACE_TEXTURE_MODEL.version };
}

/** delta and m at time x: cubic Hermite in delta (its derivative is m) and linear in m, on the fine grid. */
export function warpAt(tex, x) {
  if (!tex.active || x <= tex.active[0] || x >= tex.active[1]) return { delta: 0, m: 0 };
  const g = tex.grid;
  let lo = 0, hi = g.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (g[mid] <= x) lo = mid; else hi = mid; }
  const h = g[hi] - g[lo], s = (x - g[lo]) / h;
  const h00 = 2 * s ** 3 - 3 * s * s + 1, h10 = s ** 3 - 2 * s * s + s, h01 = -2 * s ** 3 + 3 * s * s, h11 = s ** 3 - s * s;
  const delta = h00 * tex.delta[lo] + h10 * h * tex.m[lo] + h01 * tex.delta[hi] + h11 * h * tex.m[hi];
  return { delta, m: tex.m[lo] + s * (tex.m[hi] - tex.m[lo]) };
}

/**
 * Sample a textured expiration at the given times. Outside the active window the samples are the curve's own values,
 * bit for bit.
 * @param {import('./curve.js').Curve} curve @param {number[]} t @param {ReturnType<typeof expiratoryTexture>} tex
 * @returns {{ t: number[], v: number[], f: number[] }}
 */
export function sampleTextured(curve, t, tex) {
  const v = new Array(t.length), f = new Array(t.length);
  for (let i = 0; i < t.length; i++) {
    const { delta, m } = warpAt(tex, t[i]);
    if (delta === 0 && m === 0) { v[i] = curveVolume(curve, t[i]); f[i] = curveFlow(curve, t[i]); continue; }
    const tau = t[i] + delta;
    v[i] = curveVolume(curve, tau);
    f[i] = curveFlow(curve, tau) * (1 + m);
  }
  return { t: t.slice(), v, f };
}

/**
 * Inspiratory texture: the flow is multiplied by (1 + m), m corrected so that the inspired volume is unchanged; the volume is
 * integrated again from the textured flow with the same trapezoid rule as buildInspiratory, so it ends at FVC - FIVC.
 * @param {{ t: number[], v: number[], f: number[], fivc: number, pif: number, flags: string[] }} insp from buildInspiratory
 * @param {{ seed: number, set: 'pre'|'post', index: number }} id
 */
export function textureInspiration(insp, { seed, set, index }) {
  const P = TRACE_TEXTURE_MODEL.inspiratory;
  const rng = createStream(seed >>> 0, `spiro-texture-insp-${set}-${index}`);
  const { amp, fine, broad } = drawCoefficients(rng);
  const { t, f } = insp;
  const n = t.length;
  if (n < 4 || !(insp.fivc > 0)) return { ...insp, t: t.slice(), v: insp.v.slice(), f: f.slice(), flags: [...insp.flags], texture: { model: TRACE_TEXTURE_MODEL.version, applied: false } };
  const fivc = insp.fivc, Ti = t[n - 1] - t[0];
  const absF = f.map((q) => Math.abs(q));
  const uFine = cumtrapz(t, absF.map((q) => knotRate(q, P.fineLengthOfFivc * fivc, P.fineMinCorrelationS)));
  const uBroad = cumtrapz(t, absF.map((q) => knotRate(q, P.broadLengthOfFivc * fivc, P.broadMinCorrelationS)));
  const m0 = t.map((_, j) => P.cap * Math.tanh((amp * (P.fineSd * process(fine, uFine[j]) + P.broadSd * process(broad, uBroad[j]))) / P.cap));
  // Flow-weighted zero integral: sum over the trapezoid of f m equals zero, so the inspired volume is unchanged.
  const phi = t.map((x) => Math.sin((Math.PI * (x - t[0])) / Ti) ** 2);
  let a = 0, b = 0;
  for (let j = 1; j < n; j++) {
    const h = t[j] - t[j - 1];
    a += 0.5 * (f[j] * m0[j] + f[j - 1] * m0[j - 1]) * h;
    b += 0.5 * (f[j] * phi[j] + f[j - 1] * phi[j - 1]) * h;
  }
  const c = b !== 0 ? a / b : 0;
  const m = m0.map((q, j) => q - c * phi[j]);
  const ft = f.map((q, j) => q * (1 + m[j]));
  const v0 = insp.v[0];
  const v = new Array(n);
  let acc = 0;
  for (let j = 0; j < n; j++) {
    if (j > 0) acc += 0.5 * (-ft[j - 1] - ft[j]) * (t[j] - t[j - 1]);
    v[j] = v0 - acc;
  }
  // t and flags are copied, so the result shares no array with its input (callers may freeze the result).
  return { ...insp, t: t.slice(), flags: [...insp.flags], v, f: ft, pif: Math.max(...ft.map((q) => -q)), texture: { model: TRACE_TEXTURE_MODEL.version, applied: true } };
}
