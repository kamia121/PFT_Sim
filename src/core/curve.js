/**
 * Volume-time curve family for a forced expiratory maneuver.
 *
 *   s(t) = t - r (1 - exp(-t / r))            smooth start; r sets how quickly flow rises
 *   V(t) = A (1 - exp(-a s(t)^k))             exhaled volume (L) at time t (s) from the start of exhalation
 *   flow(t) = dV/dt
 *
 * The shape exponent k < 1 gives a concave (scooped) flow-volume loop, k near 1 a linear descent.
 * The back-extrapolated time zero t0 is the intercept of the tangent at maximum flow, and the
 * tabulated FEV1 is the volume 1.000 s after t0, so the table and the plotted trace come from the
 * same function. The scale a is found by bisection so that FEV1 and FVC agree with their targets.
 */

/** @typedef {{ A: number, a: number, k: number, r: number, T: number }} Curve */

const sOf = (t, r) => t - r * (1 - Math.exp(-t / r));
const dsOf = (t, r) => 1 - Math.exp(-t / r);

/** @param {Curve} c @param {number} t */
export function volume(c, t) {
  if (t <= 0) return 0;
  return c.A * (1 - Math.exp(-c.a * Math.pow(sOf(Math.min(t, c.T), c.r), c.k)));
}

/** @param {Curve} c @param {number} t flow in L/s */
export function flow(c, t) {
  if (t <= 0 || t > c.T) return 0;
  const s = sOf(t, c.r);
  return c.A * Math.exp(-c.a * Math.pow(s, c.k)) * c.a * c.k * Math.pow(s, c.k - 1) * dsOf(t, c.r);
}

/** Time and value of maximum flow, by golden-section search on [0, 2] s. */
export function peakFlow(c) {
  let lo = 0, hi = 2;
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo);
  let f1 = flow(c, x1), f2 = flow(c, x2);
  for (let i = 0; i < 60; i++) {
    if (f1 < f2) { lo = x1; x1 = x2; f1 = f2; x2 = lo + g * (hi - lo); f2 = flow(c, x2); }
    else { hi = x2; x2 = x1; f2 = f1; x1 = hi - g * (hi - lo); f1 = flow(c, x1); }
  }
  const t = (lo + hi) / 2;
  return { t, pef: flow(c, t) };
}

/** Back-extrapolated time zero (s) and back-extrapolated volume (L). */
export function backExtrapolation(c) {
  const { t, pef } = peakFlow(c);
  const t0 = Math.max(0, t - volume(c, t) / pef);
  return { t0, bev: volume(c, t0) };
}

/** Time (s) at which exhaled volume first reaches `target` liters, or NaN if never. */
export function timeAtVolume(c, target) {
  if (target >= volume(c, c.T)) return NaN;
  let lo = 0, hi = c.T;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (volume(c, mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Build the curve whose FEV1 (volume 1 s after the back-extrapolated zero) and FVC (volume at T)
 * equal the targets. Returns the curve plus a flag when the ratio was outside what the family can
 * represent and was clamped.
 * @param {{ fvc: number, fev1: number, k: number, r: number, T: number }} p liters, seconds
 * @returns {{ curve: Curve, clamped: boolean }}
 */
export function solveCurve({ fvc, fev1, k, r, T }) {
  const build = (lnA) => {
    const a = Math.exp(lnA);
    return { A: fvc / (1 - Math.exp(-a * Math.pow(sOf(T, r), k))), a, k, r, T };
  };
  const ratioAt = (lnA) => {
    const c = build(lnA);
    return volume(c, backExtrapolation(c).t0 + 1) / fvc;
  };
  const target = fev1 / fvc;
  let lo = Math.log(1e-4), hi = Math.log(1e4);
  const rLo = ratioAt(lo), rHi = ratioAt(hi);
  if (target <= rLo) return { curve: build(lo), clamped: true };
  if (target >= rHi) return { curve: build(hi), clamped: true };
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2;
    if (ratioAt(mid) < target) lo = mid; else hi = mid;
  }
  return { curve: build((lo + hi) / 2), clamped: false };
}

/** Evenly sampled trace for plotting and numerical checks. @returns {{ t: number[], v: number[], f: number[] }} */
export function sampleCurve(c, dt = 0.01, tEnd = c.T) {
  const n = Math.floor(tEnd / dt) + 1;
  const t = new Array(n), v = new Array(n), f = new Array(n);
  for (let i = 0; i < n; i++) { t[i] = i * dt; v[i] = volume(c, t[i]); f[i] = flow(c, t[i]); }
  return { t, v, f };
}
