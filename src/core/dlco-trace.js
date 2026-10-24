/**
 * Single-breath DLCO test: inspired and expired tracer and CO tracings that are numerically
 * consistent with the case's reported VA and DLCO.
 *
 * Equations (BTPS volumes in L, STPD volumes in mL, PB in mmHg, tracer and CO fractions F):
 *   VA(BTPS)   = (FI,tr / FA,tr) * (VI - VD)                     tracer dilution
 *   VA(STPD)   = VA(BTPS) * 1000 * (PB - 47)/760 * 273/310        mL
 *   FA,CO,0    = FI,CO * (FA,tr / FI,tr)                          initial alveolar CO
 *   DLCO       = VA(STPD) / (t * (PB - 47)) * ln(FA,CO,0 / FA,CO,t)   mL/min/mmHg, t in min
 *   KCO        = DLCO / VA
 * FA,tr and FA,CO,t are the mean of the tracer and CO traces over the alveolar sample window, plotted
 * against expired volume. PB cancels in DLCO; it is carried so that the equations are written out.
 *
 * Breath-hold time is computed in the Jones-Meade form: from the instant 30% of VI has been inspired
 * to the midpoint of the alveolar sample (unverified for the 2017 standard, see docs/research).
 *
 * The trace is built forward from the case values: given VA and DLCO it computes the alveolar tracer
 * fraction and the CO decay for the chosen VI, dead space and breath-hold time, draws the expiration,
 * and then recomputes VA and DLCO from the plotted arrays with the equations above. With no fault the
 * result equals the case values. A fault that changes the physics (low VI, Valsalva, Mueller, a sample
 * that starts in the dead-space transition) changes the recomputed values, which are then returned as
 * `values` with `reproducesCase` false and the change described in `adjustments`.
 *
 * Random streams used: `dlco-trace-setup` and `dlco-trace-noise`.
 */
import { atMost } from './comparison.js';
import { createStream } from './prng.js';
import { obstructionMeasure, trueRatioZ } from './pleth.js';

export const DLCO_MODEL = {
  version: 1,
  testGas: { value: { tracer: 'CH4', fiTracerPct: 0.3, fiCoPct: 0.3, o2Pct: 21, balance: 'N2' }, verification: 'secondary' },
  waterVaporMmHg: { value: 47, verification: 'secondary' },
  viOverVcMin: { value: 0.9, alternative: 0.85, verification: 'secondary' },
  inspiration85PctMaxS: { value: 4.0, verification: 'secondary' },
  breathHoldWindowS: { value: [8, 12], verification: 'secondary' },
  sampleCompleteWithinS: { value: 4.0, verification: 'secondary' },
  washoutVolumeL: { value: [0.75, 1.0], smallVcMin: 0.5, smallVcLimitL: 2.0, verification: 'secondary' },
  sampleVolumeL: { value: [0.5, 1.0], smallVcAllowanceL: 1.0, verification: 'primary text: VC <1 L with confirmed dead-space clearance' },
  apparatusDeadSpaceL: { value: 0.1, verification: 'unverified' },
  anatomicDeadSpaceMlPerKg: { value: 2.2, verification: 'secondary' },
  phaseIIWidthL: { value: [0.07, 0.13], verification: 'unverified' },
  alveolarPlateauSlopePerL: { value: [0.01, 0.08], verification: 'unverified' },
  lowViDlcoExponent: { value: 0.5, verification: 'unverified' },
  valsalvaDlcoFall: { value: [0.1, 0.25], verification: 'unverified' },
  muellerDlcoRise: { value: [0.1, 0.25], verification: 'unverified' },
  pressureFlagCmH2O: { value: 8, verification: 'unverified' },
  gradeRules: { value: 'A all criteria met; B reserved; C a modeled criterion failed or remains unconfirmed; D invalid (leak, Valsalva, Mueller, VI/VC under 0.85, sample inside the dead-space transition)', verification: 'unverified' },
};

const STEP_L = 0.01; // expired-volume grid
const DT = 0.05; // time grid, s
const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
const round = (x, d) => { const p = 10 ** d; return Math.round(x * p) / p; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const gridDown = (x, g = 0.05) => Math.round(x / g) * g;

// Normal CDF (Abramowitz-Stegun 7.1.26 on erf).
function Phi(x) {
  const s = x < 0 ? -1 : 1, a = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * a);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return 0.5 * (1 + s * erf);
}

/** Inspiratory volume fraction at fraction x of inspiratory time: CDF of a beta(2,3) flow profile (peak flow in the first third). */
const insp = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 6 * x * x - 8 * x ** 3 + 3 * x ** 4);
function inspInverse(frac) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (insp(m) < frac) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

const UMAX = 5;
const gam = (u) => 1 - (1 + u) * Math.exp(-u);
const expNorm = (u) => gam(Math.min(Math.max(u, 0), UMAX)) / gam(UMAX); // fraction of the exhaled volume at u = t / tau
function expInverse(frac) {
  let lo = 0, hi = UMAX;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (expNorm(m) < frac) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** Single-breath equations, exported so that tests and callers use the same definitions. */
export const vaStpdMl = (vaBtpsL, pbMmHg = 760) => vaBtpsL * 1000 * ((pbMmHg - 47) / 760) * (273 / 310);
export const vaFromTracer = (fiTracer, faTracer, viL, vdL) => (fiTracer / faTracer) * (viL - vdL);
export const dlcoFromDecay = (vaStpd, tBhSeconds, pbMmHg, fCo0, fCoT) => (vaStpd / ((tBhSeconds / 60) * (pbMmHg - 47))) * Math.log(fCo0 / fCoT);

/**
 * Recompute VA, DLCO and KCO from the plotted arrays of a trace.
 * @param {object} trace a DlcoTrace
 */
export function analyzeDlcoTrace(trace) {
  const { byVolume: bv, markers: mk, gas } = trace;
  const lo = mk.sample.startL - 1e-9, hi = mk.sample.endL + 1e-9;
  const idx = [];
  bv.volumeL.forEach((v, i) => { if (v >= lo && v <= hi) idx.push(i); });
  const faTr = mean(idx.map((i) => bv.tracer[i])) / 100;
  const faCo = mean(idx.map((i) => bv.co[i])) / 100;
  const fiTr = gas.fiTracerPct / 100, fiCo = gas.fiCoPct / 100;
  const vaBtps = vaFromTracer(fiTr, faTr, trace.inspired.volumeL, trace.deadSpaceL);
  const fCo0 = fiCo * (faTr / fiTr);
  const tBh = mk.tSampleMidS - mk.t30PctS;
  const dlco = dlcoFromDecay(vaStpdMl(vaBtps, trace.barometricMmHg), tBh, trace.barometricMmHg, fCo0, faCo);
  return { vaL: vaBtps, dlco, kco: dlco / vaBtps, faTracer: faTr, faCo, fCo0, breathHoldS: tBh, windowPoints: idx.length };
}

/**
 * Grade a single test against the acceptability list of docs/research/pleth-dlco.md section 2.1.
 * The A to D letters here are a simulator rubric, not the overlapping interim maneuver rows
 * in 2017 Table 3 and not a session grade. Replicate selection/reporting is not modeled.
 */
export function gradeDlcoTest(q) {
  const failed = [], noted = [], invalid = [], unknown = [];
  if (q.leak) invalid.push('leak');
  if (q.valsalva) invalid.push('Valsalva maneuver during the breath-hold');
  if (q.mueller) invalid.push('Mueller maneuver during the breath-hold');
  if (q.viOverVc < DLCO_MODEL.viOverVcMin.alternative) invalid.push(`inspired volume ${(q.viOverVc * 100).toFixed(0)}% of VC, under 85%`);
  else if (q.viOverVc < DLCO_MODEL.viOverVcMin.value) {
    if (!(Number.isFinite(q.vaL) && Number.isFinite(q.largestOtherAcceptableVaL))) unknown.push('low-VI alternative needs VA from another acceptable maneuver');
    else if (!atMost(Math.abs(q.vaL - q.largestOtherAcceptableVaL), Math.max(0.2, 0.05 * q.largestOtherAcceptableVaL))) failed.push('low-VI alternative VA is outside the permitted agreement');
  }
  if (q.contamination > 0.03) invalid.push('alveolar sample begins inside the dead-space transition');
  const [bhLo, bhHi] = DLCO_MODEL.breathHoldWindowS.value;
  if (q.breathHoldS < bhLo || q.breathHoldS > bhHi) failed.push(`breath-hold ${q.breathHoldS.toFixed(1)} s, outside 8 to 12 s`);
  if (q.sampleEndS > DLCO_MODEL.sampleCompleteWithinS.value) failed.push(`alveolar sample finished ${q.sampleEndS.toFixed(1)} s after the start of exhalation, over 4 s`);
  // The trace is a classical discrete-sample teaching model. RGA requires its own
  // demonstrated washout and virtual sample; do not reuse classical bag-volume cutoffs.
  if (q.samplingMethod === 'rga') {
    if (q.deadSpaceClearanceConfirmed !== true) unknown.push('RGA washout clearance is unconfirmed');
    if (q.sampleL < 0.085 || q.sampleL > 0.5) failed.push('RGA virtual sample outside 0.085 to 0.500 L');
  } else {
    const wr = DLCO_MODEL.washoutVolumeL.value;
    const washMin = q.vcL < DLCO_MODEL.washoutVolumeL.smallVcLimitL ? DLCO_MODEL.washoutVolumeL.smallVcMin : wr[0];
    if (q.washoutL < washMin - 1e-9 || q.washoutL > wr[1] + 1e-9) failed.push(`washout volume ${q.washoutL.toFixed(2)} L outside ${washMin.toFixed(2)} to ${wr[1].toFixed(2)} L`);
    const sr = DLCO_MODEL.sampleVolumeL.value;
    if (q.sampleL > sr[1] + 1e-9 || (q.sampleL < sr[0] - 1e-9 && q.vcL >= DLCO_MODEL.sampleVolumeL.smallVcAllowanceL)) failed.push(`sample volume ${q.sampleL.toFixed(2)} L outside 0.5 to 1.0 L`);
    else if (q.sampleL < sr[0] - 1e-9 && q.deadSpaceClearanceConfirmed !== true) unknown.push('small-VC sample exception needs confirmed dead-space clearance');
  }
  if (q.t85S >= DLCO_MODEL.inspiration85PctMaxS.value) failed.push(`85% of the inspired volume took ${q.t85S.toFixed(1)} s; the criterion is strictly less than 4 s`);
  const grade = invalid.length ? 'D' : failed.length || unknown.length ? 'C' : noted.length ? 'B' : 'A';
  return { grade, rubric: 'simulator, not ATS/ERS Table 3 or a session grade', acceptable: grade === 'A', wouldBeRejected: grade !== 'A', invalid, failed, noted, unknown };
}

const FAULTS = {
  'low-vi': { text: 'Incomplete inspiration: inspired volume is low relative to the vital capacity. VA is smaller and DLCO falls less than VA, so KCO rises.', numbers: true },
  'slow-inspiration': { text: 'Slow inspiration: 85% of the inspired volume takes longer than 4 s, so the start of the breath-hold is ambiguous. Numbers are unchanged in this model; the inspiration-time criterion fails.', numbers: false },
  'short-hold': { text: 'Breath-hold shorter than 8 s. The Krogh equation corrects for time, so the printed numbers are unchanged in this model; the test fails the hold criterion.', numbers: false },
  'long-hold': { text: 'Breath-hold longer than 12 s. The Krogh equation corrects for time, so the printed numbers are unchanged in this model; the test fails the hold criterion.', numbers: false },
  leak: { text: 'Leak around the mouthpiece: the measured volume falls during the breath-hold and does not return to the starting level. Visual and grading only; no numerical effect is modeled because the direction of the error is not predictable.', numbers: false },
  valsalva: { text: 'Valsalva maneuver during the breath-hold: positive mouth pressure with a flat volume trace. The pressure channel is visual; the fall in measured DLCO is an unverified teaching effect.', numbers: true },
  mueller: { text: 'Mueller maneuver during the breath-hold: negative mouth pressure and a small rise in volume. The pressure channel is visual; the rise in measured DLCO is an unverified teaching effect.', numbers: true },
  'early-sample': { text: 'Alveolar sample begins before the dead space has washed out. Dead-space gas raises both tracer and CO in the sample, so VA and DLCO are underestimated.', numbers: true },
};

function pickFaults(d, technique, scenario) {
  const ids = new Set(scenario?.ids ?? []);
  const forced = [];
  if (ids.has('DLC-01')) forced.push('low-vi');
  if (ids.has('DLC-02')) forced.push('slow-inspiration');
  if (ids.has('DLC-03')) forced.push('long-hold');
  if (ids.has('DLC-04')) forced.push('valsalva');
  if (ids.has('DLC-05')) forced.push('mueller');
  if (ids.has('DLC-06')) forced.push('leak');
  const gate = technique === 'poor' ? 0.75 : technique === 'fair' ? 0.3 : 0;
  const out = new Set(forced);
  const table = [['low-vi', 0.22], ['short-hold', 0.14], ['long-hold', 0.14], ['slow-inspiration', 0.12], ['leak', 0.1], ['valsalva', 0.09], ['mueller', 0.06], ['early-sample', 0.13]];
  const choose = (u) => { let c = 0; for (const [name, w] of table) { c += w; if (u < c) return name; } return 'early-sample'; };
  if (d[0] < gate) {
    out.add(choose(d[1]));
    if (technique === 'poor' && d[2] < 0.3) out.add(choose(d[3]));
  }
  // Mutually exclusive pairs: keep the first.
  if (out.has('short-hold') && out.has('long-hold')) out.delete('long-hold');
  if (out.has('valsalva') && out.has('mueller')) out.delete('mueller');
  return [...out];
}

/**
 * @param {object} args
 * @param {number} args.seed
 * @param {object} args.truth
 * @param {{ raw: number, va: number }|null} args.dlco case dlco (raw mL/min/mmHg, va L)
 * @param {object|null} args.volumes case volumes (vc, rv used)
 * @param {{ weightKg?: number, barometricMmHg?: number }} [args.patient]
 * @param {'good'|'fair'|'poor'} [args.technique]
 * @param {object} [args.scenario] { ids: DLC-01 to DLC-06 force faults; viOverVc: the VI/VC fraction a forced DLC-01 uses }
 * @param {number} [args.ratioZ] true FEV1/FVC z-score if known; otherwise approximated from the truth
 */
export function buildDlcoTrace({ seed, truth, dlco, volumes, patient = {}, technique = 'good', scenario = null, ratioZ } = {}) {
  if (!dlco || !(dlco.raw > 0) || !(dlco.va > 0)) return null;
  const pb = patient.barometricMmHg ?? scenario?.barometricMmHg ?? 760;
  const gas = { ...DLCO_MODEL.testGas.value };
  const fiTr = gas.fiTracerPct / 100, fiCo = gas.fiCoPct / 100;
  const vcL = volumes?.vc ?? truth?.vc ?? 4;
  const u = clamp(obstructionMeasure(trueRatioZ(truth, ratioZ)) / 3.5, 0, 1);

  const r = createStream(seed, 'dlco-trace-setup');
  const d = Array.from({ length: 24 }, () => r.uniform());
  const faults = pickFaults(d, technique, scenario);
  const has = (f) => faults.includes(f);

  // Inspiration and dead space.
  const r0 = 0.93 + 0.07 * d[4];
  // A scenario that forces DLC-01 may state the fraction (scenario.viOverVc, VI/VC); the intake text and the tracing then agree.
  const rActual = has('low-vi') ? (scenario?.viOverVc !== undefined && scenario?.ids?.includes('DLC-01') ? scenario.viOverVc : scenario?.ids?.includes('DLC-01') ? 0.74 + 0.06 * d[5] : 0.72 + 0.16 * d[5]) : r0;
  const vi0 = r0 * vcL, vi = rActual * vcL;
  const weight = patient.weightKg ?? 70;
  const vdRaw = clamp(DLCO_MODEL.anatomicDeadSpaceMlPerKg.value * weight / 1000, 0.12, 0.3) + DLCO_MODEL.apparatusDeadSpaceL.value;
  const vd = round(Math.min(vdRaw, 0.14 * vi), 3);
  const sigma = (DLCO_MODEL.phaseIIWidthL.value[0] + (DLCO_MODEL.phaseIIWidthL.value[1] - DLCO_MODEL.phaseIIWidthL.value[0]) * clamp(u + 0.3 * d[6], 0, 1)) * clamp(Math.sqrt(vcL / 3.5), 0.55, 1); // sharper transition in small lungs
  const tiNormal = 2.0 + 1.4 * d[7];
  const ti = has('slow-inspiration') ? 7.0 + 2.0 * d[7] : tiNormal;

  // Washout and sample windows on a 0.05 L grid.
  const smallVc = vcL < DLCO_MODEL.washoutVolumeL.smallVcLimitL;
  let vw = smallVc ? 0.5 : vcL < 3 ? 0.75 : 0.75 + 0.05 * Math.floor(d[8] * 6);
  vw = Math.max(vw, gridDown(vd + 4 * sigma + 0.03, 0.05) + (vd + 4 * sigma + 0.03 > gridDown(vd + 4 * sigma + 0.03, 0.05) ? 0.05 : 0));
  let vs = 0.55 + 0.05 * Math.floor(d[9] * 10);
  if (has('early-sample')) vw = Math.max(0.15, gridDown(vd - 0.1, 0.05));
  vs = Math.max(vcL < 1 ? 0.2 : 0.5, Math.min(vs, gridDown(0.8 * vi - vw, 0.05)));
  vs = Math.min(vs, Math.max(0.1, gridDown(0.92 * vi - vw, 0.05)));
  vw = round(vw, 2); vs = round(vs, 2);
  const vmid = vw + vs / 2;

  // Case-referenced alveolar volume and diffusing capacity for the actual test.
  let vaCase = dlco.va;
  const adjustments = [];
  if ((vi0 - vd) / vaCase > 0.97) {
    vaCase = (vi0 - vd) / 0.97;
    adjustments.push(`VA raised from ${dlco.va.toFixed(2)} L to ${vaCase.toFixed(2)} L because the tracer cannot dilute below the inspired alveolar volume (VI - VD) for this VC.`);
  }
  const vaTrue = Math.max(vaCase + (vi - vi0), vi - vd + 0.05);
  let dlcoTrue = dlco.raw * (vaTrue / vaCase) ** DLCO_MODEL.lowViDlcoExponent.value;
  let effect = 1;
  if (has('valsalva')) effect = 1 - (0.1 + 0.15 * d[10]);
  if (has('mueller')) effect = 1 + (0.1 + 0.15 * d[10]);
  dlcoTrue *= effect;
  const phi = (vi - vd) / vaTrue; // FA,tr / FI,tr
  const faTrClean = fiTr * phi;
  const fCo0 = fiCo * phi;

  // Timeline.
  const tIn0 = 1.0;
  const t30 = tIn0 + inspInverse(0.3) * ti;
  const tIe = tIn0 + ti;
  const t85 = inspInverse(0.85) * ti;
  const tBhTarget = has('short-hold') ? 5.0 + 2.4 * d[11] : has('long-hold') ? (scenario?.ids?.includes('DLC-03') ? 14.5 + 1.0 * d[11] : 12.8 + 3.2 * d[11]) : 9.0 + 2.0 * d[11];

  // Exhalation profile. The mouth-leak case loses volume during the hold.
  const leakL = has('leak') ? 0.25 + 0.3 * d[12] : 0;
  const muellerRise = has('mueller') ? 0.08 + 0.07 * d[13] : 0;
  const vHoldEnd = vi - leakL; // the Mueller rise is transient; the volume returns before exhalation
  let tau = 1.3 + 1.2 * u + 0.4 * d[14];
  const tEndFor = (tauX) => tauX * expInverse((vw + vs) / vHoldEnd);
  if (tEndFor(tau) > 3.6) tau = 3.6 / expInverse((vw + vs) / vHoldEnd);
  const tMidX = tau * expInverse(vmid / vHoldEnd);
  let tExh0 = t30 + tBhTarget - tMidX;
  if (tExh0 < tIe + 0.4) tExh0 = tIe + 0.4;
  const tSampleMid = tExh0 + tMidX;
  const tBh = tSampleMid - t30;
  const tEnd = tExh0 + UMAX * tau;
  const sampleEndS = tEndFor(tau);

  // Alveolar plateau slope with obstruction, bounded so the plateau stays positive.
  const slopeBase = 0.01 + 0.07 * u * (0.7 + 0.6 * d[15]);
  const sPlateau = Math.min(slopeBase, 0.6 / Math.max(vHoldEnd - vmid, 0.5));

  // Alveolar CO at the sample, after the decay during the hold.
  const decay = (dlcoTrue * (tBh / 60) * (pb - 47)) / vaStpdMl(vaTrue, pb);
  const faCoClean = fCo0 * Math.exp(-decay);

  // By-volume grid and window weights.
  const K = Math.min(Math.round((vw + vs + 0.7) / STEP_L), Math.round(vHoldEnd / STEP_L));
  const vols = Array.from({ length: K + 1 }, (_, k) => round(k * STEP_L, 2));
  const wDead = (v) => 1 - Phi((v - vd) / sigma);
  const plateau = (v) => 1 - sPlateau * (v - vmid);
  const inWin = (v) => v >= vw - 1e-9 && v <= vw + vs + 1e-9;
  const winIdx = vols.map((v, k) => (inWin(v) ? k : -1)).filter((k) => k >= 0);
  const meanW = mean(winIdx.map((k) => wDead(vols[k])));
  const meanWG = mean(winIdx.map((k) => (1 - wDead(vols[k])) * plateau(vols[k])));
  const solve = !has('early-sample');
  // Amplitude of the alveolar plateau so that the window mean equals the clean alveolar value.
  const ampTr = solve ? (faTrClean - fiTr * meanW) / meanWG : faTrClean;
  const ampCo = solve ? (faCoClean - fiCo * meanW) / meanWG : faCoClean;
  const concAt = (vx, amp, fi) => wDead(vx) * fi + (1 - wDead(vx)) * amp * plateau(vx);

  const nz = createStream(seed, 'dlco-trace-noise');
  const NOISE = 0.004;
  const noisy = (arrFn, fi) => {
    const clean = vols.map((v) => arrFn(v));
    const e = clean.map((c) => NOISE * c * nz.normal());
    const m = mean(winIdx.map((k) => e[k]));
    return clean.map((c, k) => (inWin(vols[k]) ? c + e[k] - m : c + e[k]));
  };
  const trVol = noisy((v) => concAt(v, ampTr, fiTr) * 100);
  const coVol = noisy((v) => concAt(v, ampCo, fiCo) * 100);
  const contamination = meanW;

  // Time arrays.
  const nT = Math.floor(tEnd / DT) + 1;
  const T = [], V = [], CO = [], TR = [], P = [];
  const valStart = tIe + 0.4, valEnd = tExh0 - 0.3;
  const pAmp = has('valsalva') ? 14 + 10 * d[16] : has('mueller') ? -(14 + 10 * d[16]) : 0;
  const leakShape = (t) => (t <= tIe ? 0 : t >= tExh0 ? 1 : Math.min(1, (t - tIe) / Math.max(tExh0 - tIe, 0.1)));
  for (let j = 0; j < nT; j++) {
    const t = j * DT;
    let vol = 0, co = 0, tr = 0;
    if (t < tIn0) { vol = 0; co = 0; tr = 0; }
    else if (t < tIe) { const x = (t - tIn0) / ti; vol = vi * insp(x); const rise = 1 - Math.exp(-(t - tIn0) / 0.15); co = fiCo * 100 * rise; tr = fiTr * 100 * rise; }
    else if (t < tExh0) {
      vol = vi - leakL * leakShape(t);
      co = fiCo * 100; tr = fiTr * 100;
      if (muellerRise) { const x = clamp((t - valStart) / Math.max(valEnd - valStart, 0.5), 0, 1); vol += muellerRise * Math.sin(Math.PI * x) ** 2; }
    } else {
      const frac = expNorm((t - tExh0) / tau);
      const vx = vHoldEnd * frac;
      vol = vHoldEnd - vx;
      co = concAt(vx, ampCo, fiCo) * 100; tr = concAt(vx, ampTr, fiTr) * 100;
    }
    let p = 0;
    if (pAmp && t >= valStart && t <= valEnd) { const x = (t - valStart) / Math.max(valEnd - valStart, 0.5); p = pAmp * Math.min(1, 6 * x, 6 * (1 - x)); }
    T.push(round(t, 3));
    V.push(round(vol, 4));
    CO.push(round(Math.max(0, co * (1 + NOISE * 0.5 * nz.normal())), 6));
    TR.push(round(Math.max(0, tr * (1 + NOISE * 0.5 * nz.normal())), 6));
    P.push(round(p + 0.25 * nz.normal(), 2));
  }

  /** @type {any} */
  const trace = {
    version: DLCO_MODEL.version,
    method: 'single-breath diffusing capacity, rapid gas analyzer, tracer CH4',
    gas,
    barometricMmHg: pb,
    deadSpaceL: vd,
    deadSpaceTransitionWidthL: round(sigma, 3),
    inspired: { volumeL: round(vi, 4), vcL: round(vcL, 4), viOverVc: round(vi / vcL, 4), inspirationTimeS: round(ti, 2), timeTo85PctS: round(t85, 2) },
    breathHold: { seconds: round(tBh, 3), holdOnlyS: round(tExh0 - tIe, 3), definition: 'from 30% of the inspired volume to the midpoint of the alveolar sample (Jones-Meade form, unverified for the 2017 standard)' },
    markers: {
      tInspStartS: tIn0, t30PctS: round(t30, 3), tInspEndS: round(tIe, 3), tExhaleStartS: round(tExh0, 3), tSampleMidS: round(tSampleMid, 3),
      exhalationStartVolumeL: round(vHoldEnd, 4),
      washout: { startL: 0, endL: vw, startS: round(tExh0, 3), endS: round(tExh0 + tau * expInverse(vw / vHoldEnd), 3) },
      sample: { startL: vw, endL: round(vw + vs, 2), midL: round(vmid, 3), startS: round(tExh0 + tau * expInverse(vw / vHoldEnd), 3), endS: round(tExh0 + sampleEndS, 3) },
    },
    time: { t: T, volumeL: V, co: CO, tracer: TR, pressureCmH2O: P },
    byVolume: { volumeL: vols, co: coVol.map((x) => round(x, 6)), tracer: trVol.map((x) => round(x, 6)) },
    faults: faults.map((f) => ({ code: f, text: FAULTS[f].text, affectsNumbers: FAULTS[f].numbers, visualOnly: !FAULTS[f].numbers })),
    adjustments,
    equations: [
      'VA(BTPS) = (FI,tr / FA,tr) x (VI - VD)',
      'VA(STPD) = VA(BTPS) x 1000 x (PB - 47)/760 x 273/310   [mL]',
      'FA,CO,0 = FI,CO x FA,tr / FI,tr',
      'DLCO = VA(STPD) / (t x (PB - 47)) x ln(FA,CO,0 / FA,CO,t)   [mL/min/mmHg, t in min]',
      'KCO = DLCO / VA',
    ],
    unverified: Object.entries(DLCO_MODEL).filter(([, v]) => v.verification === 'unverified').map(([k]) => k),
  };

  const rec = analyzeDlcoTrace(trace);
  trace.breathHold.seconds = round(rec.breathHoldS, 3); // difference of the rounded markers, so the stored value matches the plotted ones
  const near = (a, b) => Math.abs(a / b - 1) <= 0.01;
  const reproduces = near(rec.vaL, dlco.va) && near(rec.dlco, dlco.raw);
  trace.values = { vaL: round(rec.vaL, 4), dlcoMlMinMmHg: round(rec.dlco, 4), kco: round(rec.kco, 4), faTracerPct: round(rec.faTracer * 100, 5), faCoPct: round(rec.faCo * 100, 5), faCo0Pct: round(rec.fCo0 * 100, 5), breathHoldS: round(rec.breathHoldS, 3) };
  trace.caseValues = { vaL: dlco.va, dlcoMlMinMmHg: dlco.raw };
  trace.reproducesCase = reproduces;
  if (!reproduces) {
    const dv = (rec.vaL / dlco.va - 1) * 100, dd = (rec.dlco / dlco.raw - 1) * 100;
    adjustments.push(`Printed VA ${rec.vaL.toFixed(2)} L (${dv >= 0 ? '+' : ''}${dv.toFixed(1)}% from the case value) and DLCO ${rec.dlco.toFixed(1)} mL/min/mmHg (${dd >= 0 ? '+' : ''}${dd.toFixed(1)}%) because of the technique faults in this test.`);
  }
  trace.adjusted = reproduces ? null : { vaL: trace.values.vaL, dlcoMlMinMmHg: trace.values.dlcoMlMinMmHg, kco: trace.values.kco };

  // Quality metrics from the plotted arrays and the grade.
  const holdIdx = T.map((t, j) => (t > tIe + 0.2 && t < tExh0 - 0.2 ? j : -1)).filter((j) => j >= 0);
  const pHold = holdIdx.map((j) => P[j]);
  const volHold = holdIdx.map((j) => V[j]);
  const flagCm = DLCO_MODEL.pressureFlagCmH2O.value;
  trace.quality = {
    samplingMethod: 'classical',
    // Clearance is assumed only when this modeled contamination check passes.
    deadSpaceClearanceConfirmed: contamination <= 0.03,
    viOverVc: trace.inspired.viOverVc,
    t85S: trace.inspired.timeTo85PctS,
    breathHoldS: trace.breathHold.seconds,
    sampleEndS: round(sampleEndS, 3),
    washoutL: vw, sampleL: vs, vcL: trace.inspired.vcL,
    contamination: round(contamination, 5),
    valsalva: pHold.length ? Math.max(...pHold) > flagCm : false,
    mueller: pHold.length ? Math.min(...pHold) < -flagCm : false,
    leak: volHold.length ? volHold[0] - volHold[volHold.length - 1] > 0.1 : false,
  };
  trace.grade = gradeDlcoTest(trace.quality);
  return trace;
}
