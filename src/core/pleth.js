/**
 * Whole-body plethysmography: shutter-closure trials for thoracic gas volume (FRC) and the open-shutter
 * airway resistance loop. Every trace is generated from Boyle's law with the case's true FRC, and every
 * reported number (trial FRC, mean FRC, sRaw, Raw, sGaw) is then recomputed from the plotted arrays, so
 * the figures and the table cannot disagree.
 *
 * Boyle's law at the shutter, with PB the barometric pressure and 47 mmHg the water vapor pressure:
 *   TGV = (dV / dPmouth) * (PB - 47)
 * and the box converts the thoracic volume change into a pressure change of the free box gas:
 *   dPbox = PB * dV / Vbox          (isothermal)
 * so the slope of box pressure against mouth pressure is
 *   dPbox / dPmouth = TGV * PB / ((PB - 47) * Vbox)       [Pa per kPa]
 *
 * Sign convention of the plotted box signal: positive when thoracic gas is compressed (the usual
 * "inverted" display), so the shutter lines slope upward and the resistance loop of an expiratory
 * effort lies to the right.
 *
 * Random streams used (none are shared with the rest of case generation): `pleth-setup`,
 * `pleth-trial-<i>` and `pleth-raw`.
 *
 * Every number marked unverified below is a teaching value, not a published finding. See
 * docs/pleth-dlco-model.md.
 */
import { createStream } from './prng.js';

/** @typedef {'acceptable'|'usable'|'rejected'} TrialStatus */
/**
 * @typedef {object} PlethTrial
 * @property {number} index 1-based trial number
 * @property {number} panFreqHz
 * @property {TrialStatus} status
 * @property {boolean} acceptable
 * @property {string[]} faults machine-readable fault codes
 * @property {string[]} faultText plain-language descriptions
 * @property {string[]} reasons why the trial is not acceptable
 * @property {number[]} t seconds from shutter closure
 * @property {number[]} pm mouth pressure, kPa
 * @property {number[]} pbox box pressure signal, Pa (compression positive)
 * @property {number} slope least-squares slope of pbox on pm, Pa per kPa
 * @property {number} r2 squared correlation of the shutter line
 * @property {number} frcL thoracic gas volume at closure computed from the plotted arrays, L
 * @property {number} deviationPct difference from the reported FRC, percent
 * @property {number[]} eelDeviationL end-expiratory level of the last tidal breaths before closure, relative to the stable level, L
 */

export const PLETH_MODEL = {
  version: 1,
  barometricMmHg: { value: 760, verification: 'convention' },
  waterVaporMmHg: { value: 47, verification: 'secondary' },
  boxFreeVolumeL: { value: 600, verification: 'unverified' },
  pantAcceptableHz: { value: [0.5, 1.0], verification: 'secondary' },
  pantToleratedMaxHzNoObstruction: { value: 1.5, verification: 'secondary' },
  repeatability: { value: 0.05, gradeC: 0.1, verification: 'secondary' },
  mouthPressureAmplitudeKpa: { value: [0.85, 1.15], verification: 'unverified' },
  fastPantInflationCap: { value: 0.2, verification: 'unverified' },
  rawMedianKpaSL: { value: 0.2, verification: 'secondary' },
  sRawUpperLimitKpaS: { value: 1.2, verification: 'secondary' },
};

const PA_PER_MMHG = 133.322;
const KPA_PER_MMHG = 0.133322;
const CMH2O_PER_KPA = 10.1972;
const TRIALS_MIN = 3;
const TRIALS_MAX = 5;
const POINTS_PER_TRIAL = 64; // two pant cycles at 32 samples per cycle, plus the closing point

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
const round = (x, d) => { const p = 10 ** d; return Math.round(x * p) / p; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

/** Least-squares slope of y on x. */
export function lsSlope(x, y) {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  return sxy / sxx;
}
function rSquared(x, y) {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return (sxy * sxy) / (sxx * syy);
}

/** @param {number} barometricMmHg */
export function makeBox(barometricMmHg = PLETH_MODEL.barometricMmHg.value) {
  return {
    freeVolumeL: PLETH_MODEL.boxFreeVolumeL.value,
    barometricMmHg,
    waterVaporMmHg: PLETH_MODEL.waterVaporMmHg.value,
    barometricPa: barometricMmHg * PA_PER_MMHG,
    pbMinusPh2oKpa: (barometricMmHg - PLETH_MODEL.waterVaporMmHg.value) * KPA_PER_MMHG,
    note: 'Free box volume is an illustrative teaching value (unverified).',
  };
}

/** Box pressure change per unit mouth pressure change for a thoracic gas volume, Pa per kPa. */
export const boxPaPerKpa = (tgvL, box) => (tgvL * box.barometricPa) / (box.pbMinusPh2oKpa * box.freeVolumeL);
/** Boyle's law: thoracic gas volume (L) from the slope of box pressure on mouth pressure (Pa per kPa). */
export const frcFromSlope = (slopePaPerKpa, box) => (slopePaPerKpa * box.pbMinusPh2oKpa * box.freeVolumeL) / box.barometricPa;
/** Specific resistance (kPa.s) from the slope of box pressure on flow (Pa per L/s). */
export const sRawFromSlope = (slopePaPerLs, box) => (slopePaPerLs * box.pbMinusPh2oKpa * box.freeVolumeL) / box.barometricPa;

/**
 * Smooth monotone obstruction measure from the FEV1/FVC z-score: a softplus that is near zero for
 * z above about +1 and approaches -z - 1 for strongly negative z. Unverified teaching mapping.
 */
export const obstructionMeasure = (z) => Math.log(1 + Math.exp(-1.4 * (z + 1))) / 1.4;

/** FEV1/FVC z-score of the true lung. The case generator overrides the ratio in obstruction, so the z is approximated there. */
export function trueRatioZ(truth, ratioZ) {
  if (Number.isFinite(ratioZ)) return ratioZ;
  const lat = truth?.latent;
  if (lat && Number.isFinite(lat.zFev1Target)) return Math.min(-1.8, -0.81 + 0.83 * lat.zFev1Target); // regression on GLI Global z, see model note
  if (lat && Number.isFinite(lat.zRatio)) return lat.zRatio;
  return clamp(((truth?.ratio ?? 0.78) - 0.78) / 0.075, -6, 3);
}

const TECHNIQUE = {
  good: { pFault: 0, sigmaFrc: 0.012, fMean: 0.78, fSd: 0.09, fMin: 0.55, fMax: 0.97, ampNoise: 0.004, drift: 0.03, rawNoise: 0.02, rawBreathVar: 0.05 },
  fair: { pFault: 0.2, sigmaFrc: 0.022, fMean: 0.88, fSd: 0.16, fMin: 0.5, fMax: 1.3, ampNoise: 0.006, drift: 0.05, rawNoise: 0.035, rawBreathVar: 0.1 },
  poor: { pFault: 0.4, sigmaFrc: 0.035, fMean: 1.0, fSd: 0.28, fMin: 0.4, fMax: 1.8, ampNoise: 0.009, drift: 0.08, rawNoise: 0.055, rawBreathVar: 0.18 },
};

/** Scenario ids that force a plethysmography behavior (ids follow docs/research/scenarios.md). */
function forcedFaults(scenario) {
  const ids = new Set(scenario?.ids ?? []);
  return {
    thermal: ids.has('PLE-01'),
    fast: ids.has('PLE-02'),
    cheek: ids.has('PLE-03'),
    shutterLeak: ids.has('PLE-04'),
    eel: ids.has('PLE-05'),
  };
}

/**
 * One shutter-closure trial.
 * @returns {PlethTrial & { _truth: object }}
 */
function generateTrial(i, ctx) {
  const { seed, tgvTrue, box, u, obstructed, tech, forced, driftSign } = ctx;
  const r = createStream(seed, `pleth-trial-${i}`);
  const d = Array.from({ length: 16 }, () => r.uniform());
  const n = Array.from({ length: 6 }, () => r.normal());

  // Which behavior this trial has. One fault per trial from the technique, plus any forced by the scenario.
  const faultGate = d[0] < tech.pFault;
  const pick = d[1];
  const pickedThermal = faultGate && pick < 0.28;
  const pickedCheek = faultGate && pick >= 0.28 && pick < 0.46;
  const pickedLeak = faultGate && pick >= 0.46 && pick < 0.6;
  const pickedEel = faultGate && pick >= 0.6 && pick < 0.8;
  const pickedFast = faultGate && pick >= 0.8 && pick < 0.93;
  const pickedSlow = faultGate && pick >= 0.93;

  let f = clamp(tech.fMean + tech.fSd * n[0], tech.fMin, tech.fMax);
  if (pickedFast) f = 1.25 + 0.7 * d[3];
  if (pickedSlow) f = 0.28 + 0.2 * d[3];
  if (forced.fast) f = 2.2 + 0.6 * d[3];

  const cheek = forced.cheek || pickedCheek;
  const shutterLeak = forced.shutterLeak || pickedLeak;
  const eel = forced.eel || pickedEel;
  const thermalOn = forced.thermal || pickedThermal || f < 0.5;
  const thermalLarge = thermalOn && !forced.thermal ? d[2] < 0.25 : forced.thermal && d[2] < 0.15;

  // Thermal drift in Pa per s, stacked offsets in Pa. Drift fades over successive trials as the box equilibrates.
  const fade = 1 - 0.12 * (i - 1);
  let driftRate = tech.drift * n[2] * 0.5;
  let offset = tech.drift * 3 * (d[4] - 0.5);
  if (thermalOn) {
    driftRate = driftSign * fade * (thermalLarge ? 1.2 + 1.0 * d[5] : 0.25 + 0.45 * d[5]);
    offset = driftSign * fade * (thermalLarge ? 1.0 + 1.5 * d[6] : 0.6 + 1.0 * d[6]) * (d[7] < 0.5 ? 1 : -1);
  }
  const thermalLevel = !thermalOn ? 'minimal' : thermalLarge ? 'large' : 'parallel';

  // Mouth pressure underestimates the alveolar swing at fast panting, more so with obstruction.
  const x = 0.11 * Math.max(0, f - 1.0) * (0.25 + 1.35 * u);
  const cap = PLETH_MODEL.fastPantInflationCap.value;
  const inflation = cap * Math.tanh(x / cap);
  const cheekInfl = cheek ? 0.08 + 0.12 * d[8] : 0;
  const gain = 1 / ((1 + inflation) * (1 + cheekInfl));
  let phi = 2 * inflation + 1.0 * cheekInfl + (shutterLeak ? 0.25 + 0.25 * d[9] : 0.02 * Math.abs(n[3]));
  const bend = shutterLeak ? 0.15 + 0.15 * d[10] : 0;

  // Closure level: the stable end-tidal level, or a volume above or below it.
  const eelShift = eel ? (d[11] < 0.7 ? 1 : -1) * (0.22 + 0.28 * d[12]) : 0;
  const tgvTrial = tgvTrue * (1 + tech.sigmaFrc * n[1]) + eelShift;
  const k = boxPaPerKpa(tgvTrial, box);
  const amp = (0.85 + 0.3 * d[13]) * (cheek ? 0.78 : 1);
  const phase0 = 2 * Math.PI * d[14];

  const t = [], pm = [], pbox = [];
  const T = 2 / f;
  for (let j = 0; j <= POINTS_PER_TRIAL; j++) {
    const tj = (j * T) / POINTS_PER_TRIAL;
    const ph = 2 * Math.PI * f * tj + phase0;
    const s = Math.sin(ph);
    const alveolar = bend ? s * (1 - bend * Math.abs(s)) : s;
    const nb = r.normal(), nm = r.normal();
    t.push(round(tj, 4));
    pbox.push(round(k * amp * alveolar + driftRate * tj + offset + tech.ampNoise * k * amp * nb, 4));
    pm.push(round(gain * amp * Math.sin(ph - phi) + tech.ampNoise * amp * nm, 5));
  }

  // Everything below is computed from the arrays as plotted.
  const slope = lsSlope(pm, pbox);
  const frcL = frcFromSlope(slope, box);
  const r2 = rSquared(pm, pbox);

  const faults = [];
  const reasons = [];
  const faultText = [];
  const pct = (frcL / tgvTrial - 1) * 100;
  const fLimit = obstructed ? PLETH_MODEL.pantAcceptableHz.value[1] : PLETH_MODEL.pantToleratedMaxHzNoObstruction.value;
  let rejected = false, usable = false;
  if (f > 1.5) {
    faults.push('fast-panting'); rejected = true;
    reasons.push('panting frequency above 1.5 Hz');
    faultText.push(`Trial ${i}: panting at ${f.toFixed(2)} Hz, above 1.5 Hz. Mouth pressure underestimates the alveolar pressure swing, so FRC is read ${pct >= 0 ? 'high' : 'low'} by about ${Math.abs(pct).toFixed(0)}%.`);
  } else if (f > fLimit) {
    faults.push('fast-panting'); usable = true;
    reasons.push('panting frequency above 1.0 Hz with airflow obstruction');
    faultText.push(`Trial ${i}: panting at ${f.toFixed(2)} Hz. Above 1.0 Hz is tolerated only when spirometry shows little or no obstruction; here FRC is read about ${Math.abs(pct).toFixed(0)}% ${pct >= 0 ? 'high' : 'low'}.`);
  }
  if (f < 0.5) {
    faults.push('slow-panting'); rejected = true;
    reasons.push('panting frequency below 0.5 Hz');
    faultText.push(`Trial ${i}: panting at ${f.toFixed(2)} Hz, below 0.5 Hz. Slow panting lets the box leak and thermal drift distort the shutter line.`);
  }
  if (thermalOn && f >= 0.5) {
    faults.push('thermal-drift');
    if (thermalLevel === 'large') { rejected = true; reasons.push('large thermal drift'); } else { usable = true; reasons.push('parallel lines from thermal drift'); }
    faultText.push(`Trial ${i}: ${thermalLevel === 'large' ? 'large' : 'parallel'} thermal drift; the shutter lines are offset from one another and the slope is biased.`);
  }
  if (cheek) {
    faults.push('cheek-compliance'); rejected = true;
    reasons.push('mouth pressure damped (cheeks not supported)');
    faultText.push(`Trial ${i}: cheeks not supported. Mouth pressure underestimates the swing in alveolar pressure and FRC is read about ${Math.abs(pct).toFixed(0)}% ${pct >= 0 ? 'high' : 'low'}.`);
  }
  if (shutterLeak) {
    faults.push('shutter-leak'); rejected = true;
    reasons.push('open, bent loop (leak or incomplete occlusion)');
    faultText.push(`Trial ${i}: the loop is open and bent, as with a mouth leak or an incomplete occlusion; the slope is shallow and FRC is read ${pct >= 0 ? 'high' : 'low'} by about ${Math.abs(pct).toFixed(0)}%.`);
  }
  if (eel) {
    faults.push('unstable-eel'); usable = true;
    reasons.push('shutter closed away from the stable end-tidal level');
    faultText.push(`Trial ${i}: shutter closed about ${Math.abs(eelShift * 1000).toFixed(0)} mL ${eelShift > 0 ? 'above' : 'below'} the stable end-expiratory level, so the volume labeled FRC is not FRC.`);
  }
  const status = rejected ? 'rejected' : usable ? 'usable' : 'acceptable';

  // End-expiratory level of the preceding breaths: stable, or drifting toward the closure level.
  const eelDeviationL = Array.from({ length: 5 }, (_, b) => round((eel ? eelShift * (b / 4) ** 2 : 0) + 0.025 * r.normal(), 3));

  return {
    index: i, panFreqHz: round(f, 3), status, acceptable: status === 'acceptable', faults, faultText, reasons,
    t, pm, pbox, slope: round(slope, 5), r2: round(r2, 5), frcL: round(frcL, 4), deviationPct: 0, eelDeviationL,
  };
}

/** Largest group of values whose (max - min) / mean does not exceed tol. */
export function repeatableGroup(values, tol) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  let best = [];
  for (let a = 0; a < idx.length; a++) {
    for (let b = a; b < idx.length; b++) {
      const grp = idx.slice(a, b + 1);
      const m = mean(grp.map((g) => g[0]));
      if ((grp[grp.length - 1][0] - grp[0][0]) / m <= tol && grp.length > best.length) best = grp;
    }
  }
  return best.map((g) => g[1]);
}

/** Spread as the research note defines it: (highest - lowest) / mean. */
export const spreadFraction = (values) => (Math.max(...values) - Math.min(...values)) / mean(values);

/**
 * FRC grade from the acceptable trials (2023 table as summarized in docs/research/pleth-dlco.md):
 * A three or more acceptable within 5%, B two within 5%, C two within 10%. D, E, U and F are placeholders:
 * D one acceptable trial, E two or more acceptable but outside 10%, U no acceptable but some usable, F nothing usable.
 */
export function gradeFrc(acceptableValues, usableCount) {
  const tol = PLETH_MODEL.repeatability.value, tolC = PLETH_MODEL.repeatability.gradeC;
  if (acceptableValues.length === 0) return usableCount > 0 ? 'U' : 'F';
  if (acceptableValues.length === 1) return 'D';
  const within5 = repeatableGroup(acceptableValues, tol).length;
  if (within5 >= 3) return 'A';
  if (within5 === 2) return 'B';
  if (repeatableGroup(acceptableValues, tolC).length >= 2) return 'C';
  return 'E';
}

/** Open-shutter airway resistance loop from the case physiology. */
function buildRawLoop({ seed, box, tgvTrue, frcReported, u, z, phenotype, tech }) {
  const r = createStream(seed, 'pleth-raw');
  const dt = 0.05;
  const sizeFactor = (3.0 / clamp(tgvTrue, 1.2, 9)) ** 0.35; // Raw falls with lung size (exponent unverified)
  const phenotypeFactor = phenotype === 'airway' ? 1.15 : phenotype === 'emphysema' ? 0.85 : 1;
  const m = obstructionMeasure(z);
  const rawModel = PLETH_MODEL.rawMedianKpaSL.value * sizeFactor * phenotypeFactor * Math.exp(0.36 * m) * Math.exp(0.08 * r.normal());
  const tau = 0.012 + 0.16 * u; // phase lag of box signal behind flow (loop opening), s
  const kq = 0.05 + 1.0 * u; // flow-dependent resistance (S shape), per L/s
  const expFlat = 1 + 0.5 * u; // higher expiratory resistance
  const kBox = boxPaPerKpa(tgvTrue, box);
  const flow = [], pbox = [], breath = [];
  for (let b = 0; b < 5; b++) {
    const vt = 0.85 * (1 - 0.12 * u) * (1 + tech.rawBreathVar * r.normal());
    const ti = 1.3 * (1 + 0.5 * tech.rawBreathVar * r.normal());
    const te = 1.65 * (1 + 0.25 * u) * (1 + 0.5 * tech.rawBreathVar * r.normal());
    for (const [phaseSign, T] of [[-1, ti], [1, te]]) {
      const A = (vt * Math.PI) / (2 * T);
      const steps = Math.round(T / dt);
      for (let j = 0; j < steps; j++) {
        const xph = j / steps;
        const v = phaseSign * A * Math.sin(Math.PI * xph);
        const dv = phaseSign * A * (Math.PI / T) * Math.cos(Math.PI * xph);
        const lin = v * (1 + kq * Math.abs(v)) * (v > 0 ? expFlat : 1);
        const palv = rawModel * (lin + tau * dv); // kPa
        flow.push(round(v, 4));
        pbox.push(round(kBox * palv + tech.rawNoise * kBox * rawModel * r.normal(), 4));
        breath.push(b);
      }
    }
  }
  // sRaw from the tidal fit over |flow| <= 0.5 L/s of the plotted arrays.
  const fx = [], fy = [];
  for (let j = 0; j < flow.length; j++) if (Math.abs(flow[j]) <= 0.5) { fx.push(flow[j]); fy.push(pbox[j]); }
  const slope = lsSlope(fx, fy);
  const sRaw = sRawFromSlope(slope, box);
  // Shape descriptors from the arrays.
  const peak = Math.max(...pbox.map(Math.abs));
  const near0 = pbox.filter((_, j) => Math.abs(flow[j]) < 1e-6).map(Math.abs); // box signal at the zero-flow points
  const opening = near0.length ? mean(near0) / peak : 0;
  const vRef = Math.min(Math.max(...flow), -Math.min(...flow));
  const lowX = [], lowY = [], hiPos = [], hiNeg = [];
  for (let j = 0; j < flow.length; j++) {
    if (Math.abs(flow[j]) <= 0.3 * vRef) { lowX.push(flow[j]); lowY.push(pbox[j]); }
    else if (flow[j] >= 0.7 * vRef) hiPos.push([flow[j], pbox[j]]);
    else if (flow[j] <= -0.7 * vRef) hiNeg.push([flow[j], pbox[j]]);
  }
  const lowSlope = lowX.length > 4 ? lsSlope(lowX, lowY) : slope;
  const highSlope = hiPos.length && hiNeg.length ? (mean(hiPos.map((q) => q[1])) - mean(hiNeg.map((q) => q[1]))) / (mean(hiPos.map((q) => q[0])) - mean(hiNeg.map((q) => q[0]))) : lowSlope;
  const sIndex = lowSlope > 0 ? highSlope / lowSlope - 1 : 0;
  const open = opening > 0.07, sShaped = sIndex > 0.15;
  const descriptor = open && sShaped ? 'open, S-shaped' : open ? 'open' : sShaped ? 'S-shaped' : 'closed, nearly linear';
  return {
    flow, pbox, breath, fitSlopePaPerLs: round(slope, 5),
    sRawKpaS: round(sRaw, 4), sGawPerKpaS: round(1 / sRaw, 4),
    rawKpaSL: round(sRaw / frcReported, 4), rawCmH2OSL: round((sRaw / frcReported) * CMH2O_PER_KPA, 3), sRawCmH2OS: round(sRaw * CMH2O_PER_KPA, 3),
    modelRawKpaSL: round(rawModel, 4),
    fitRangeLs: 0.5,
    shape: { opening: round(opening, 3), sIndex: round(sIndex, 3), descriptor },
    reference: { sRawUpperKpaS: PLETH_MODEL.sRawUpperLimitKpaS.value, verification: 'secondary' },
  };
}

/**
 * @param {object} args
 * @param {number} args.seed
 * @param {object} args.truth physiology from generatePhysiology
 * @param {object|null} args.volumes case volumes (erv, ic are used for the linked maneuvers)
 * @param {'good'|'fair'|'poor'} [args.technique]
 * @param {object} [args.scenario] case.scenario; ids PLE-01 to PLE-05 force behaviors
 * @param {number} [args.ratioZ] true FEV1/FVC z-score if the caller has the reference tables
 * @param {number} [args.barometricMmHg]
 */
export function buildPleth({ seed, truth, volumes, technique = 'good', scenario = null, ratioZ, barometricMmHg } = {}) {
  if (!volumes || !truth) return null;
  const tech = TECHNIQUE[technique] ?? TECHNIQUE.good;
  const box = makeBox(barometricMmHg ?? scenario?.barometricMmHg ?? PLETH_MODEL.barometricMmHg.value);
  const tgvTrue = truth.frc ?? volumes.frc;
  const z = trueRatioZ(truth, ratioZ);
  const obstructed = z < -1.645;
  const u = clamp(obstructionMeasure(z) / 3.5, 0, 1);
  const forced = forcedFaults(scenario);
  const driftSign = createStream(seed, 'pleth-setup').uniform() < 0.5 ? -1 : 1;
  const ctx = { seed, tgvTrue, box, u, obstructed, tech, forced, driftSign };

  /** @type {PlethTrial[]} */
  const trials = [];
  for (let i = 1; i <= TRIALS_MAX; i++) {
    trials.push(generateTrial(i, ctx));
    if (i >= TRIALS_MIN) {
      const ok = trials.filter((tr) => tr.acceptable).map((tr) => tr.frcL);
      if (gradeFrc(ok, 0) === 'A') break;
    }
  }

  const acceptable = trials.filter((tr) => tr.acceptable);
  const usable = trials.filter((tr) => tr.status === 'usable');
  const basis = acceptable.length ? acceptable : usable.length ? usable : trials;
  const reportedFrc = mean(basis.map((tr) => tr.frcL));
  for (const tr of trials) tr.deviationPct = round((tr.frcL / reportedFrc - 1) * 100, 2);
  const accValues = acceptable.map((tr) => tr.frcL);
  const grade = gradeFrc(accValues, usable.length);
  const spreadAcc = accValues.length >= 2 ? spreadFraction(accValues) : null;

  const flags = [];
  const add = (code, text, severity) => flags.push({ code, text, severity });
  if (acceptable.length < 3) add('fewer-than-3-acceptable', `${acceptable.length} acceptable shutter closures; the standard asks for at least three.`, 'major');
  if (spreadAcc !== null && spreadAcc > PLETH_MODEL.repeatability.value) add('frc-not-repeatable-5pct', `Acceptable FRC values differ by ${(spreadAcc * 100).toFixed(1)}% of their mean (limit 5%).`, spreadAcc > PLETH_MODEL.repeatability.gradeC ? 'major' : 'minor');
  if (!acceptable.length && usable.length) add('reported-from-usable-trials', 'No acceptable trial; the reported FRC is the mean of usable trials and should be read with caution.', 'major');
  if (!acceptable.length && !usable.length) add('no-usable-trial', 'No usable trial; the reported FRC is the mean of rejected trials.', 'major');
  if (trials.some((tr) => tr.faults.includes('fast-panting'))) add('pant-frequency', 'At least one trial was panted faster than the allowed frequency.', 'minor');
  if (trials.some((tr) => tr.faults.includes('thermal-drift'))) add('thermal-drift', 'Thermal drift is present on at least one trial.', 'minor');
  if (trials.some((tr) => tr.faults.includes('cheek-compliance') || tr.faults.includes('shutter-leak'))) add('leak-or-damping', 'A leak, an incomplete occlusion or unsupported cheeks distorted at least one trial.', 'major');
  if (trials.some((tr) => tr.faults.includes('unstable-eel'))) add('unstable-end-tidal-level', 'The shutter closed away from the stable end-tidal level on at least one trial.', 'minor');

  const faults = trials.flatMap((tr) => tr.faultText);

  const raw = buildRawLoop({ seed, box, tgvTrue, frcReported: reportedFrc, u, z, phenotype: truth.phenotype ?? null, tech });
  if (raw.sRawKpaS > PLETH_MODEL.sRawUpperLimitKpaS.value) add('sraw-above-upper-limit', `sRaw ${raw.sRawKpaS.toFixed(2)} kPa.s is above the 1.2 kPa.s upper limit quoted for adults (secondary source).`, 'minor');

  const erv = Math.min(volumes.erv ?? truth.erv, 0.85 * reportedFrc);
  const ic = volumes.ic ?? truth.ic;
  return {
    version: PLETH_MODEL.version,
    method: 'whole-body plethysmography',
    box,
    trials,
    replicateTable: trials.map((tr) => ({ trial: tr.index, panFreqHz: tr.panFreqHz, frcL: tr.frcL, deviationPct: tr.deviationPct, status: tr.status, acceptable: tr.acceptable, notes: tr.reasons.join('; ') })),
    trueFrcL: round(tgvTrue, 4),
    reportedFrcL: round(reportedFrc, 4),
    frcBasis: acceptable.length ? 'acceptable' : usable.length ? 'usable' : 'all',
    repeatability: {
      rule: 'spread = (highest - lowest) / mean of the acceptable FRC values; 5% for grades A and B, 10% for grade C',
      toleranceFraction: PLETH_MODEL.repeatability.value,
      nAcceptable: acceptable.length, nUsable: usable.length, nTrials: trials.length,
      spreadFraction: spreadAcc === null ? null : round(spreadAcc, 4),
      nWithin5Pct: accValues.length ? repeatableGroup(accValues, PLETH_MODEL.repeatability.value).length : 0,
    },
    grade,
    raw,
    flags,
    faults,
    suggestedVolumes: { method: 'plethysmography', frc: reportedFrc, erv, ic, tlc: reportedFrc + ic, rv: reportedFrc - erv, vc: ic + erv },
    unverified: Object.entries(PLETH_MODEL).filter(([, v]) => v.verification === 'unverified').map(([k]) => k),
  };
}
