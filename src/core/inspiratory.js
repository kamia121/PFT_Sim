/**
 * Inspiratory limb of the flow-volume loop and plotting artifacts for faulty expirations.
 *
 * Everything here is for display. The tabulated values (FVC, FEV1, PEF, FEF25-75, BEV, plateau) come from the
 * expiratory curve in curve.js and are not recomputed from these traces. The inspiratory limb is a smooth,
 * effort-dependent shape whose volume is the forced inspiratory vital capacity (FIVC). It is drawn in the same
 * exhaled-volume coordinate as the expiration: it starts at the FVC and returns toward 0. A loop closes when the
 * FIVC is within a symmetric display tolerance of FVC. That geometric closure label is not the
 * one-sided ATS/ERS 2019 acceptability check, which needs a recorded maximal post-expiratory inspiration.
 *
 * Constants marked "unverified" are teaching choices, not measurements: no source in the research notes gives
 * typical peak inspiratory flow (PIF) values or the shape of the inspiratory limb.
 */
import { createStream } from './prng.js';

export const INSPIRATORY_CONSTANTS = {
  /** Peak inspiratory flow (L/s) of a well-performed forced inspiration: intercept plus slope times FVC (L). */
  pifFromFvc: { value: { intercept: 2.2, slope: 0.62 }, verification: 'unverified' },
  pifBoundsLps: { value: [1.8, 8], verification: 'unverified' },
  inspiratoryTimeBoundsS: { value: [0.8, 3.5], verification: 'unverified' },
  /** FIVC criterion: FIVC - FVC must not exceed max(0.100 L, 5% of FVC). */
  closureAbsoluteLiters: { value: 0.1, verification: 'verified-primary' },
  closureFraction: { value: 0.05, verification: 'verified-primary' },
  /** Probability that a maneuver carrying the fault also has an incomplete inspiration. */
  incompleteProbability: {
    value: { 'early-termination': 0.5, 'glottic-closure': 0.35, 'variable-effort': 0.5, cough: 0.2, 'slow-start': 0.15 },
    verification: 'unverified',
  },
};

/** Faults that always give an incomplete loop (the patient cannot seal the mouthpiece or did not finish the breath). */
const CERTAIN_INCOMPLETE = ['leak', 'mouthpiece-obstruction', 'incomplete-loop'];
/** Faults that start the blow below total lung capacity, so that FIVC exceeds FVC. */
const BELOW_TLC = ['start-below-tlc', 'incomplete-inspiration'];

/** Largest FIVC-FVC difference (L) that still counts as a closed loop. */
export const loopTolerance = (fvc) => Math.max(INSPIRATORY_CONSTANTS.closureAbsoluteLiters.value, INSPIRATORY_CONSTANTS.closureFraction.value * fvc);

/** @returns {'closed'|'incomplete-loop'|'fivc-exceeds-fvc'} */
export function loopClosure(fvc, fivc) {
  const tol = loopTolerance(fvc);
  if (Math.abs(fivc - fvc) <= tol) return 'closed';
  return fivc < fvc ? 'incomplete-loop' : 'fivc-exceeds-fvc';
}

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

/**
 * Smooth inspiratory limb for one recorded maneuver.
 * Flow is negative; volume is exhaled volume, starting at the maneuver's FVC and ending at FVC - FIVC.
 * Stream name: `inspiratory-<index>`. The same random draws are made in every branch so one fault does not
 * shift the draws of another feature.
 *
 * @param {{ fvc: number, faults?: string[] }} maneuver
 * @param {{ seed: number, index: number, scenario?: { faults?: string[] } | null }} opts
 * @returns {{ t: number[], v: number[], f: number[], fivc: number, pif: number, flags: string[] }}
 *   t is seconds from the start of inspiration; pif is the peak inspiratory flow as a positive number (L/s).
 */
export function buildInspiratory(maneuver, { seed, index, scenario = null }) {
  const rng = createStream(seed >>> 0, `inspiratory-${index}`);
  const nPif = rng.normal(), nFivc = rng.normal();
  const uIncomplete = rng.uniform(), uShort = rng.uniform(), uEffort = rng.uniform(), uB = rng.uniform(), uC = rng.uniform(), phase = rng.uniform();

  const fvc = maneuver.fvc;
  const faults = [...(maneuver.faults ?? []), ...(scenario?.faults ?? [])];
  const tol = loopTolerance(fvc);
  const flags = [];

  const pMap = INSPIRATORY_CONSTANTS.incompleteProbability.value;
  const pFault = faults.reduce((p, f) => Math.max(p, pMap[f] ?? 0), 0);
  const incomplete = faults.some((f) => CERTAIN_INCOMPLETE.includes(f)) || uIncomplete < pFault;
  const belowTlc = faults.some((f) => BELOW_TLC.includes(f));
  const variable = faults.includes('variable-effort');
  const leaky = faults.includes('leak') || faults.includes('mouthpiece-obstruction');

  let fivc;
  if (belowTlc) fivc = fvc + tol * (1.4 + 1.5 * uShort);
  else if (incomplete) fivc = Math.max(0.3 * fvc, fvc - Math.max((0.1 + 0.22 * uShort) * fvc, 1.6 * tol));
  else fivc = fvc + clamp(0.012 * fvc * nFivc, -0.7 * tol, 0.7 * tol);

  const [pifLo, pifHi] = INSPIRATORY_CONSTANTS.pifBoundsLps.value;
  let pif = clamp(INSPIRATORY_CONSTANTS.pifFromFvc.value.intercept + INSPIRATORY_CONSTANTS.pifFromFvc.value.slope * fvc, pifLo, pifHi) * (1 + 0.04 * nPif);
  let b = 0.85 + 0.1 * uB, c = 1.0 + 0.15 * uC;
  if (variable) { pif *= 0.55 + 0.55 * uEffort; b = 0.65 + 0.5 * uB; c = 0.8 + 0.8 * uC; flags.push('variable-inspiratory-effort'); }
  if (incomplete) pif *= 0.8;

  // Flow shape g(tau) = sin(pi tau^b)^c on tau in [0, 1]: zero at both ends, peak 1 at tau^b = 0.5.
  const N = 100;
  const g = new Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const tau = i / N;
    let s = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(tau, b))), c);
    if (leaky) s *= 1 + 0.08 * Math.sin(2 * Math.PI * (5 * tau + phase)) * Math.sin(Math.PI * tau);
    g[i] = s;
  }
  const integral = g.reduce((s, x, i) => s + (i === 0 || i === N ? x / 2 : x), 0) / N; // trapezoid on [0, 1]
  const [tLo, tHi] = INSPIRATORY_CONSTANTS.inspiratoryTimeBoundsS.value;
  const Ti = clamp(fivc / (pif * integral), tLo, tHi);
  pif = fivc / (Ti * integral); // keeps the volume exactly FIVC after the time bounds

  const t = new Array(N + 1), f = new Array(N + 1), v = new Array(N + 1);
  const dt = Ti / N;
  let acc = 0;
  for (let i = 0; i <= N; i++) {
    t[i] = i * dt;
    f[i] = -pif * g[i];
    if (i > 0) acc += 0.5 * (-f[i - 1] - f[i]) * dt;
    v[i] = fvc - acc;
  }
  flags.unshift(loopClosure(fvc, fivc));
  return { recorded: false, role: 'display-only', t, v, f, fivc, pif: Math.max(...f.map((x) => -x)), flags };
}

/* ---------- Plotted expiration with artifacts ---------- */

/**
 * Sample times for plotting an expiration of length tEnd: fine near the peak, coarser later, fine again in the
 * last 0.12 s so that an abrupt end is resolved. Roughly 450 points for a 15 s expiration.
 * @param {number} tEnd
 */
export function plotGrid(tEnd) {
  const end = Math.round(tEnd * 1e4);
  const set = new Set();
  const add = (k) => { if (k >= 0 && k < end) set.add(k); };
  for (let i = 0; i < 80; i++) add(i * 50);
  for (let i = 0; i < 110; i++) add(4000 + i * 100);
  for (let k = 15000; k < end - 1200; k += 500) add(k);
  for (let k = Math.max(0, end - 1200); k < end; k += 50) add(k);
  const out = [...set].sort((x, y) => x - y).map((k) => k / 1e4);
  out.push(tEnd);
  return out;
}

/**
 * Sample a curve on the plotting grid. The last sample is exactly the recorded end of expiration, so the plotted
 * FVC equals the tabulated one.
 * @param {{ volume: (c: object, t: number) => number, flow: (c: object, t: number) => number }} fns
 * @param {object} curve @param {number} tEnd
 * @returns {{ t: number[], v: number[], f: number[] }}
 */
export function sampleExpiration(fns, curve, tEnd) {
  const t = plotGrid(tEnd);
  return { t, v: t.map((x) => fns.volume(curve, x)), f: t.map((x) => fns.flow(curve, x)) };
}

const interp = (t, y, x) => {
  if (x <= t[0]) return y[0];
  if (x >= t[t.length - 1]) return y[y.length - 1];
  let lo = 0, hi = t.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= x) lo = m; else hi = m; }
  return y[lo] + ((y[hi] - y[lo]) * (x - t[lo])) / (t[hi] - t[lo]);
};

/** Raised-sine hump on [ta, tb]: zero value and zero slope at both ends. */
const hump = (x, ta, tb) => (x <= ta || x >= tb ? 0 : Math.pow(Math.sin((Math.PI * (x - ta)) / (tb - ta)), 2));

/**
 * Latest time (s from the start of exhalation) up to which applyArtifacts can change a sampled expiration that carries these
 * faults, an upper bound of the windows used there (cough and mouthpiece obstruction within the first second, slow start within
 * 0.8 s, variable effort until 2 s after the FEV1 time, leak until 1.8 s after it). Glottic closure acts only in the last 0.06 s
 * and early termination not at all. The within-blow texture (trace-texture.js) is kept out of this span, so every named
 * artifact is drawn on the same samples as before the texture existed.
 * @param {string[]} faults @param {{ t0: number }} at back-extrapolated time zero of the curve
 */
export function artifactSpanEnd(faults, { t0 }) {
  const tF = t0 + 1;
  let end = 0;
  for (const f of faults ?? []) {
    if (f === 'cough' || f === 'mouthpiece-obstruction') end = Math.max(end, 1.0);
    else if (f === 'slow-start') end = Math.max(end, 0.8);
    else if (f === 'variable-effort') end = Math.max(end, tF + 2.0);
    else if (f === 'leak') end = Math.max(end, tF + 1.8);
  }
  return end;
}

/**
 * Modify a sampled expiration so that it looks like the fault it carries. Volume changes are added as a function
 * eps(t) that is zero outside short windows and zero at 1 s after back-extrapolated time zero, so the end volume
 * (FVC), the volume at FEV1 time and the peak flow time are unchanged; flow is the derivative of the modified volume.
 *
 * What is purely visual (the tabulated values do not follow it):
 *   cough            flow spikes and dips in the first second with zero net volume; the plotted peak flow can
 *                    exceed the tabulated PEF. (The lower FEV1 of a cough is already in the curve.)
 *   leak             irregular flow deficits at roughly 0.5-3 s with zero net volume; FEF25-75 may differ slightly.
 *   mouthpiece-obstruction  flow drops to about 45% of the curve for 0.3 s early, then a recovery surge, zero net volume.
 *   variable-effort  random zero-net-volume change of the descending limb shape after peak flow; PEF, FEV1, FVC unchanged.
 *   slow-start       only if the curve already peaks within 0.15 s: time-warp of the first 0.8 s to a delayed,
 *                    rounded peak. The slow-start maneuvers of maneuver.js are already slow in the curve and are not touched.
 *   glottic-closure  the last 0.06 s is re-shaped so flow falls steeply to exactly zero; the end volume is preserved.
 *   early-termination  no change: the trace ends at the recorded stop with non-zero flow (reported as endsAbruptly).
 * Not modified: good maneuvers (no faults) are returned unchanged.
 *
 * @param {{ t: number[], v: number[], f: number[] }} sampled expiration on a time grid starting at 0
 * @param {string[]} faults fault names as in maneuver.js (plus 'leak' and 'mouthpiece-obstruction')
 * @param {number} seed unsigned 32-bit seed (the caller combines the case seed with the maneuver index)
 * @returns {{ t: number[], v: number[], f: number[], applied: string[], endsAbruptly: boolean, endsAtZeroFlow: boolean }}
 */
export function applyArtifacts(sampled, faults, seed) {
  const rng = createStream(seed >>> 0, 'artifact-plot');
  // Draw everything up front so the stream position does not depend on which faults are present.
  const r = Array.from({ length: 24 }, () => rng.uniform());
  const n = sampled.t.length;
  let t = sampled.t.slice(), v = sampled.v.slice(), f = sampled.f.slice();
  const applied = [];
  const tEnd = t[n - 1];
  const has = (x) => faults.includes(x);

  // Peak flow of the underlying curve (before any artifact) and back-extrapolated time zero.
  let ip = 0;
  for (let i = 1; i < n && t[i] <= 2; i++) if (f[i] > f[ip]) ip = i;
  const tPk = t[ip], pef = f[ip];
  const t0 = Math.max(0, tPk - v[ip] / pef);
  const tF = t0 + 1;

  // Slow start: only when the curve itself is not slow.
  if (has('slow-start') && tPk < 0.15) {
    const tb = 0.8;
    const s = (u) => 2 * u * u - u * u * u, ds = (u) => 4 * u - 3 * u * u;
    const v0 = v.slice(), f0 = f.slice(), t_ = t;
    for (let i = 0; i < n; i++) {
      if (t_[i] >= tb) break;
      const u = t_[i] / tb;
      v[i] = interp(t_, v0, tb * s(u));
      f[i] = interp(t_, f0, tb * s(u)) * ds(u);
    }
    applied.push('slow-start');
  }

  // Zero-net-volume perturbations.
  const humps = [];
  const rr = (k, lo, hi) => lo + (hi - lo) * r[k];
  if (has('cough')) {
    const k = 1 + Math.floor(r[0] * 3); // 1 to 3 coughs
    let start = rr(1, 0.12, 0.3);
    for (let j = 0; j < k && start + 0.14 <= 1.0; j++) {
      const w = rr(2 + j, 0.1, 0.14);
      const local = interp(t, f, start + w / 2);
      const amp = (rr(5 + j, 0.3, 0.5) * local * w) / Math.PI; // eps peak so that the flow excursion is 30-50% of local flow
      humps.push({ ta: start, tb: start + w, a: amp, ripple: 0 });
      start += w + 0.06;
    }
    applied.push('cough');
  }
  const tAfterPeak = tPk + 0.05;
  if (has('variable-effort') && tF - tAfterPeak > 0.3 && tEnd - 1.2 > tF + 0.4) {
    const sign = r[8] < 0.5 ? 1 : -1;
    humps.push({ ta: tAfterPeak, tb: tF, a: sign * rr(9, 0.03, 0.08), ripple: 0 });
    const tb2 = Math.min(tF + 2.0, tEnd - 1.0);
    humps.push({ ta: tF, tb: tb2, a: -sign * rr(10, 0.05, 0.12), ripple: 0 });
    applied.push('variable-effort');
  }
  if (has('leak') && tEnd > tF + 0.8) {
    const vend = v[n - 1];
    humps.push({ ta: 0.45, tb: tF, a: -rr(11, 0.03, 0.06) * vend, ripple: 0.35, phase: r[12] * 6.28 });
    humps.push({ ta: tF, tb: Math.min(tF + 1.8, tEnd - 0.6), a: -rr(13, 0.03, 0.07) * vend, ripple: 0.35, phase: r[14] * 6.28 });
    applied.push('leak');
  }
  if (has('mouthpiece-obstruction') && tF > 0.7) {
    humps.push({ step: true, ta: 0.25 + 0.1 * r[15], tb: 0.55 + 0.1 * r[15], recover: 0.3 });
    applied.push('mouthpiece-obstruction');
  }

  if (humps.length) {
    // Obstruction step: eps = -0.55 (v - v(ta)) inside the step, blended back to zero by the end of the recovery.
    const eps = (x) => {
      let e = 0;
      for (const h of humps) {
        if (h.step) {
          const va = interp(sampled.t, sampled.v, h.ta);
          if (x > h.ta && x <= h.tb) e -= 0.55 * (interp(sampled.t, sampled.v, x) - va);
          else if (x > h.tb && x < h.tb + h.recover) {
            const eb = 0.55 * (interp(sampled.t, sampled.v, h.tb) - va);
            e -= (eb * (1 + Math.cos((Math.PI * (x - h.tb)) / h.recover))) / 2;
          }
        } else {
          const base = h.a * hump(x, h.ta, h.tb);
          const wob = h.ripple ? 1 + h.ripple * Math.sin((2 * Math.PI * 3.5 * (x - h.ta)) / (h.tb - h.ta) + (h.phase ?? 0)) : 1;
          e += base * wob;
        }
      }
      return e;
    };
    const dh = 1e-4;
    const e = t.map(eps);
    const de = t.map((x) => (eps(x + dh) - eps(Math.max(0, x - dh))) / (x + dh - Math.max(0, x - dh)));
    // Largest scale (at most 1) that keeps flow non-negative.
    let kScale = 1;
    for (let i = 0; i < n; i++) if (de[i] < 0 && f[i] + kScale * de[i] < 0) kScale = Math.max(0, f[i] / -de[i]);
    for (let i = 0; i < n; i++) { v[i] += kScale * e[i]; f[i] += kScale * de[i]; }
  }

  // Glottic closure: preserve end volume, finish with flow exactly zero.
  let endsAtZeroFlow = false;
  if (has('glottic-closure') && n > 12) {
    const delta = 0.06;
    let ia = n - 1;
    while (ia > 0 && t[ia] > tEnd - delta) ia--;
    const ta = t[ia], dV = v[n - 1] - v[ia], f0 = f[ia];
    if (dV > 1e-6 && tEnd - ta > 1e-6) {
      const p = clamp((f0 * (tEnd - ta)) / dV, 1.15, 3);
      for (let i = ia; i < n; i++) {
        const u = (t[i] - ta) / (tEnd - ta);
        v[i] = v[ia] + dV * (1 - Math.pow(1 - u, p));
        f[i] = (p * dV * Math.pow(1 - u, p - 1)) / (tEnd - ta);
      }
      f[n - 1] = 0;
      endsAtZeroFlow = true;
      applied.push('glottic-closure');
    }
  }
  const endsAbruptly = has('early-termination') || endsAtZeroFlow;
  if (has('early-termination')) applied.push('early-termination');
  return { t, v, f, applied, endsAbruptly, endsAtZeroFlow };
}
