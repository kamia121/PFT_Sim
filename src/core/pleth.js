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
 * `pleth-trial-<i>`, `pleth-raw` (one draw: the physiological Raw target), `pleth-resistance` and
 * `pleth-timeline-<i>` (the last two draw only display traces).
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

/**
 * Volume-time record of one shutter-closure maneuver (new in the report-page redesign; `pleth.timeline.trials[k - 1]`).
 * Volume is absolute thoracic gas volume in liters. The end-expiratory level at shutter closure is that trial's FRC
 * read from the plotted arrays (`PlethTrial.frcL`); residual volume and total lung capacity at the ends of the record are
 * the reported ones (`suggestedVolumes`), so the axis is anchored at the reported mean. Time is seconds from the start
 * of the record. Segments, in order: tidal (quiet breathing before closure), closure (shutter closed: the pneumotach
 * volume is flat while the subject pants), open-shutter (the shutter has opened and one quiet breath is taken),
 * expiration (slow, to RV) and inspiration (slow, to TLC).
 *
 * @typedef {object} PlethTimelineSegment
 * @property {'tidal'|'closure'|'open-shutter'|'expiration'|'inspiration'} id
 * @property {string} label plain-language name for the figure
 * @property {number} t0 start time, s
 * @property {number} t1 end time, s
 * @property {number} i0 index of the first sample in `t` and `v`
 * @property {number} i1 index of the last sample (inclusive); the last sample of one segment is the first of the next
 *
 * Mouth-pressure lane of one trial. `t`, `pm` and `pbox` are the very arrays of `PlethTrial` (same objects, not resampled).
 * Record time of sample j is `tStartS + t[j]`.
 * @typedef {object} PlethTimelineLane
 * @property {number} trial 1-based
 * @property {number} tStartS record time at which the shutter closes, s
 * @property {number[]} t seconds from shutter closure (verbatim)
 * @property {number[]} pm mouth pressure, kPa (verbatim)
 * @property {number[]} pbox box pressure signal, Pa, compression positive (verbatim)
 * @property {number} panFreqHz
 *
 * @typedef {object} PlethTimelineLevels
 * @property {number} reportedFrcL reported FRC (mean of the acceptable trials): the anchor of the axis
 * @property {number} trialFrcL this trial's FRC from the plotted arrays; the volume at closure
 * @property {number} closureOffsetL trialFrcL minus stableEelL; far from zero when the shutter closed away from the stable level (unstable end-tidal level)
 * @property {number} stableEelL end-expiratory level of the first quiet breath, before any drift toward the closure level; the open-shutter breath returns to it and the slow expiration starts from it
 * @property {number} rvL residual volume at the end of the slow expiration (reported FRC minus ERV)
 * @property {number} tlcL total lung capacity at the end of the record (reported FRC plus IC)
 * @property {number} ervL expiratory reserve volume from the stable level (case value)
 * @property {number} icL inspiratory capacity from the stable level (case value)
 * @property {number} tidalVolumeL mean tidal volume of the quiet breaths
 *
 * @typedef {object} PlethTimelineTrial
 * @property {number} trial 1-based trial number
 * @property {number[]} t seconds from the start of the record
 * @property {number[]} v absolute volume, L, same length as `t`
 * @property {PlethTimelineSegment[]} segments
 * @property {number[]} eelL end-expiratory level of each quiet breath before closure, L (the last equals the closure level)
 * @property {PlethTimelineLevels} levels
 * @property {PlethTimelineLane} lane
 * @property {boolean} offsetFromStable true when the closure level differs from the stable level by more than 0.05 L (unstable end-tidal level)
 *
 * @typedef {object} PlethTimeline
 * @property {number} version
 * @property {'tidal'} breathingMode breathing before closure
 * @property {string} anchor statement of what the volume axis is anchored to
 * @property {number} reportedFrcL
 * @property {PlethTimelineTrial[]} trials one record per panting trial, in trial order
 */

/**
 * Open-shutter airway resistance loop (new in the report-page redesign; `pleth.raw`). One continuous record of
 * tidal breaths built from a single phase variable, so the flow and the shift signal have no jumps at flow reversals.
 * The loop is flow (expiration positive) against shift signal; the x axis in the figures is the shift volume in mL,
 * `shiftMl = pbox * freeBoxVolume / barometricPressure`, positive when alveolar gas is compressed (expiratory effort).
 * sRaw is the least-squares slope of `pbox` on `flow` within |flow| <= `estimator.fitRangeLs`, recomputed from these arrays;
 * Raw = sRaw divided by the reported FRC (mean of the acceptable trials). Earlier versions of the generator
 * produced sRaw and Raw from a different loop (see docs/pleth-dlco-model.md, section 1.3).
 *
 * @typedef {object} PlethRawMorphology
 * @property {'closed'|'golf-club'|'restriction'|'sigmoid'} id
 * @property {string} label
 * @property {string} appearance what the loop looks like, in words
 * @property {{ text: string, tag: 'verified'|'secondary'|'MEM' }} source basis of the shape, graded as in docs/research/pleth-dlco.md
 * @property {Record<string, number>} parameters shape parameters used for this case (all unverified teaching values)
 *
 * @typedef {object} PlethRawEstimator
 * @property {'ls-slope-abs-flow'} id
 * @property {string} label name printed next to sRaw
 * @property {number} fitRangeLs flow window of the fit, L/s
 * @property {number} nPoints samples inside the window
 *
 * @typedef {object} PlethRawBreathingMode
 * @property {'tidal'} id
 * @property {string} label
 * @property {number} tidalVolumeL mean tidal volume of the recorded breaths
 * @property {number} inspiratoryTimeS mean
 * @property {number} expiratoryTimeS mean
 * @property {number} ratePerMin
 *
 * @typedef {object} PlethRawLoop
 * @property {number[]} t seconds
 * @property {number[]} flow L/s, expiration positive
 * @property {number[]} pbox box pressure signal, Pa, compression positive
 * @property {number[]} shiftMl shift volume, mL (derived from pbox)
 * @property {number[]} volumeL tidal volume above the end-expiratory level, L
 * @property {number[]} breath 0-based breath index of each sample
 * @property {PlethRawMorphology} morphology
 * @property {PlethRawEstimator} estimator
 * @property {PlethRawBreathingMode} breathingMode
 * @property {number} fitSlopePaPerLs slope of the estimator, Pa per L/s
 * @property {number} tangentSlopePaPerLs local slope through zero flow (|flow| <= 0.15 L/s), Pa per L/s
 * @property {number} sRawKpaS
 * @property {number} sGawPerKpaS 1 / sRaw
 * @property {number} rawKpaSL sRaw / reported FRC
 * @property {number} rawCmH2OSL
 * @property {number} sRawCmH2OS
 * @property {number} modelRawKpaSL physiological target the generator was calibrated to (before recomputation)
 * @property {{ definition: string, frcL: number }} rawBasis Raw = sRaw divided by this FRC
 * @property {{ sRtotKpaS: number }} alternativeEstimates sRtot: slope of the line between the points of maximal shift, which diverges from the fit in open loops
 * @property {{ opening: number, sIndex: number, descriptor: string }} shape
 * @property {{ sRawUpperKpaS: number, verification: string }} reference
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
 * FRC-only simulator rubric; this is not the corrected 2023 overall grade, which also needs retained SVC quality:
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

// ---------------------------------------------------------------------------------------------------------------
// Display traces: tidal breathing, the open-shutter resistance loop and the volume-time record.
// Random streams used here are `pleth-raw` (first draw only, the physiological Raw target, as before),
// `pleth-resistance`, and `pleth-timeline-<trial>`. No other stream is read.
// ---------------------------------------------------------------------------------------------------------------

const TAU = 2 * Math.PI;
const smoothstep = (x) => { const c = clamp(x, 0, 1); return c * c * (3 - 2 * c); };
const smootherstep = (x) => { const c = clamp(x, 0, 1); return c * c * c * (c * (6 * c - 15) + 10); };

/** Shift volume in mL per pascal of box pressure: the box converts a thoracic volume change dV into dPbox = PB dV / Vbox. */
export const shiftMlPerPa = (box) => (box.freeVolumeL / box.barometricPa) * 1000;

/**
 * Breathing mode and loop-shape constants of the resistance trace. The breathing mode is quiet tidal breathing (VT 0.85 L,
 * Ti 1.3 s, Te 1.65 s, after Kraemer 2021, PMC, adults in the box). Morphology parameters are teaching values (unverified);
 * the shape of each morphology is graded by the source of its description in docs/research/pleth-dlco.md section 1.5.
 */
export const RAW_LOOP_MODEL = {
  version: 2,
  breathingMode: { id: 'tidal', label: 'tidal breathing', tidalVolumeL: 0.85, inspiratoryTimeS: 1.3, expiratoryTimeS: 1.65, verification: 'secondary' },
  fitRangeLs: { value: 0.5, verification: 'secondary' },
  nBreaths: 5,
  sampleIntervalS: 0.04,
  referenceFlowLs: { value: 0.55, note: 'scale of the quadrature opening term', verification: 'unverified' },
  flowBlendEpsLs: { value: 0.08, note: 'width of the tanh blend between the inspiratory and expiratory limbs', verification: 'unverified' },
  expiratoryOpeningAsymmetry: { value: 0.35, note: 'the opening term is larger on expiration and smaller on inspiration, by a smooth function of phase, equal at the two zero-flow points', verification: 'unverified' },
  verification: 'unverified',
};

/** Morphologies of the resistance loop (flow against shift signal). The first letter of `tag` grades the shape source: verified, secondary or MEM. */
export const RAW_MORPHOLOGIES = {
  closed: {
    label: 'Closed, near-linear',
    appearance: 'steep, nearly straight loop through the origin; the inspiratory and expiratory limbs superimpose',
    source: { text: 'Normal: steep, nearly straight, closed loop (Criee 2011 summary and a society slide set), docs/research/pleth-dlco.md 1.5', tag: 'secondary' },
    params: () => ({ cubicInspiratory: 0.12, cubicExpiratory: 0.12, opening: 0.015 }),
  },
  'golf-club': {
    label: 'Golf club (expiratory flow limitation)',
    appearance: 'inspiratory limb near linear; the expiratory limb bends toward the shift axis as flow rises, and the loop opens at zero flow',
    source: { text: 'Expiratory limb flattens, bends or opens, "golf club"; opening at zero flow with air trapping (docs/research/pleth-dlco.md 1.5; Kraemer 2021, PMC). Direction of rotation: counterclockwise in expiration (PMC8223795). Size of the bend and of the opening is not published', tag: 'secondary' },
    params: (u) => ({ cubicInspiratory: 0.12, cubicExpiratory: 0.6 + 2.2 * u, opening: 0.06 + 0.35 * u }),
  },
  restriction: {
    label: 'Steep, closed (restriction)',
    appearance: 'steep, narrow, closed loop: low resistance for the small lung and no distortion unless there is coexisting airway disease',
    source: { text: 'Restriction: steep curve excludes relevant obstruction; sRaw may look normal or low (docs/research/pleth-dlco.md 1.5, memory-based inference from the steep-curve statement)', tag: 'MEM' },
    params: () => ({ cubicInspiratory: 0.05, cubicExpiratory: 0.05, opening: 0.01 }),
  },
  sigmoid: {
    label: 'Sigmoid (central or extrathoracic obstruction)',
    appearance: 'S-shaped loop: resistance rises with flow on both limbs, with the flow dependence at least as large on inspiration',
    source: { text: 'Central or extrathoracic obstruction: sigmoid (S-shaped) loop, raised inspiratory resistance for extrathoracic obstruction (docs/research/pleth-dlco.md 1.5). No archetype in this simulator is a central obstruction, so this shape is used only when requested', tag: 'secondary' },
    params: () => ({ cubicInspiratory: 1.4, cubicExpiratory: 1.0, opening: 0.05 }),
  },
};

/**
 * Quiet tidal breathing as one phase-continuous record. Lung volume above the end-expiratory level is
 *   V(t) = (VT(t) / 2) (1 - cos theta(t)),   d theta / dt = w0 (1 + eps sin theta) (1 + mu(t)),
 * so every breath is one cycle of a single phase theta (0 at end-expiration, pi at end-inspiration). eps = sin((pi/2)(Te - Ti)/(Te + Ti))
 * makes the inspiratory half of the cycle last Ti and the expiratory half Te; w0 gives the period Ti + Te. Flow follows from dV/dt, so it is smooth through
 * every reversal (it vanishes with zero slope in volume at theta = 0 and pi) and nothing switches at zero flow. mu(t) and the
 * relative change of VT(t) are slow sums of two sinusoids (breath-to-breath variation of `varFrac`), not per-breath jumps.
 * Flow is returned with expiration positive.
 */
function simulateTidal({ rng, nBreaths, vt, ti, te, dt, varFrac }) {
  const eps = Math.sin((Math.PI / 2) * ((te - ti) / (te + ti)));
  const w0 = TAU / ((ti + te) * Math.sqrt(1 - eps * eps));
  const waves = (amp) => [0, 1].map(() => ({ a: amp * (0.5 + 0.5 * rng.uniform()), om: TAU / (7 + 12 * rng.uniform()), ph: TAU * rng.uniform() }));
  const rateW = waves(0.5 * varFrac), ampW = waves(varFrac);
  const sumW = (ws, t) => ws.reduce((s, w) => s + w.a * Math.sin(w.om * t + w.ph), 0);
  const dsumW = (ws, t) => ws.reduce((s, w) => s + w.a * w.om * Math.cos(w.om * t + w.ph), 0);
  const rate = (th, t) => w0 * (1 + eps * Math.sin(th)) * (1 + sumW(rateW, t));
  const rk4 = (th, t, h) => {
    const k1 = rate(th, t), k2 = rate(th + 0.5 * h * k1, t + 0.5 * h), k3 = rate(th + 0.5 * h * k2, t + 0.5 * h), k4 = rate(th + h * k3, t + h);
    return (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
  };
  const end = nBreaths * TAU;
  const t = [0], theta = [0];
  let th = 0, tt = 0;
  while (th < end - 1e-12) {
    let h = dt;
    const step = rk4(th, tt, h);
    const remaining = end - th;
    if (remaining <= 1.5 * step) {
      // the record ends on the last end-expiration; the remaining phase is covered in one or two steps, none much shorter than dt
      const nSub = remaining <= step ? 1 : 2;
      h = (h * remaining) / step / nSub;
      for (let q = 0; q < nSub; q++) {
        th = q === nSub - 1 ? end : th + rk4(th, tt, h);
        tt += h;
        t.push(tt); theta.push(th);
      }
      break;
    }
    th += step; tt += h;
    t.push(tt); theta.push(th);
  }
  const vol = [], flow = [];
  for (let j = 0; j < t.length; j++) {
    const vtj = vt * (1 + sumW(ampW, t[j])), dvt = vt * dsumW(ampW, t[j]);
    const c = Math.cos(theta[j]), s = Math.sin(theta[j]);
    vol.push(0.5 * vtj * (1 - c));
    flow.push(-(0.5 * dvt * (1 - c) + 0.5 * vtj * s * rate(theta[j], t[j])));
  }
  const breath = theta.map((x) => Math.min(nBreaths - 1, Math.floor(x / TAU + 1e-9)));
  // realized timing and volume of each breath, by linear interpolation of the half-cycle crossings
  const crossing = (level) => {
    const j = theta.findIndex((x) => x >= level);
    if (j <= 0) return t[Math.max(j, 0)];
    return t[j - 1] + ((level - theta[j - 1]) / (theta[j] - theta[j - 1])) * (t[j] - t[j - 1]);
  };
  const breaths = Array.from({ length: nBreaths }, (_, b) => {
    const a = crossing(b * TAU), m = crossing(b * TAU + Math.PI), e = crossing((b + 1) * TAU);
    return { ti: m - a, te: e - m, vt: Math.max(...vol.filter((_, j) => breath[j] === b)) };
  });
  return { t, theta, vol, flow, breath, breaths };
}

/** Which morphology a case gets. Sigmoid is never chosen automatically (no archetype is a central or extrathoracic obstruction). */
function pickMorphology({ requested, obstructed, restricted }) {
  if (requested && RAW_MORPHOLOGIES[requested]) return requested;
  if (obstructed) return 'golf-club';
  if (restricted) return 'restriction';
  return 'closed';
}

/** Remove the least-squares fit on [1, x] within the window from y, so the fit slope within the window is not changed by y. */
function orthogonalize(y, x, inWindow) {
  const xs = [], ys = [];
  for (let j = 0; j < y.length; j++) if (inWindow[j]) { xs.push(x[j]); ys.push(y[j]); }
  const slope = lsSlope(xs, ys), my = mean(ys), mx = mean(xs);
  return y.map((q, j) => q - (my + slope * (x[j] - mx)));
}

/**
 * Open-shutter airway resistance loop from the case physiology, built from one phase-continuous tidal record.
 * Alveolar pressure of the noise-free loop is p = S * [ g(v) - h(v) cos(theta) ] with
 *   g(v) = v + (kI (1 - w(v)) + kE w(v)) v^3,   w(v) = (1 + tanh(v / eps)) / 2
 * (flow-dependent resistance, the expiratory term blended in by tanh so nothing switches at v = 0) and a quadrature
 * opening term h cos(theta) that is symmetric about the fit line, so it adds no slope. The scale S is set so the least-squares
 * slope over |flow| <= 0.5 L/s equals the physiological Raw target of the case; the noise is smooth and made orthogonal to
 * [1, flow] inside the window, so the recomputed sRaw reproduces the target to the rounding of the stored arrays.
 */
function buildRawLoop({ seed, box, tgvTrue, frcReported, u, z, phenotype, tech, morphology, restricted }) {
  const r0 = createStream(seed, 'pleth-raw');
  const sizeFactor = (3.0 / clamp(tgvTrue, 1.2, 9)) ** 0.35; // Raw falls with lung size (exponent unverified)
  const phenotypeFactor = phenotype === 'airway-predominant' ? 1.15 : phenotype === 'emphysema' ? 0.85 : 1;
  const m = obstructionMeasure(z);
  const rawModel = PLETH_MODEL.rawMedianKpaSL.value * sizeFactor * phenotypeFactor * Math.exp(0.36 * m) * Math.exp(0.08 * r0.normal());

  const rng = createStream(seed, 'pleth-resistance');
  const M = RAW_LOOP_MODEL;
  const sim = simulateTidal({
    rng, nBreaths: M.nBreaths, vt: M.breathingMode.tidalVolumeL * (1 - 0.12 * u), ti: M.breathingMode.inspiratoryTimeS,
    te: M.breathingMode.expiratoryTimeS * (1 + 0.25 * u), dt: M.sampleIntervalS, varFrac: tech.rawBreathVar,
  });
  const { t, theta, vol, flow: v, breath } = sim;
  const n = v.length;

  const morphId = pickMorphology({ requested: morphology, obstructed: z < -1.645, restricted });
  const morph = RAW_MORPHOLOGIES[morphId];
  const par = morph.params(u);
  const eps = M.flowBlendEpsLs.value, vref = M.referenceFlowLs.value, asym = M.expiratoryOpeningAsymmetry.value;
  const w = (x) => 0.5 * (1 + Math.tanh(x / eps));
  const g = (x) => x + (par.cubicInspiratory * (1 - w(x)) + par.cubicExpiratory * w(x)) * x ** 3;
  // counterclockwise in expiration (flow upward, shift to the right): pressure leads flow, so the opening term enters as -h cos(theta).
  // Its amplitude h (1 - asym sin theta) is larger in expiration (sin theta < 0) and equal at the two zero-flow points, so it never jumps.
  const p0 = v.map((x, j) => g(x) - par.opening * vref * (1 - asym * Math.sin(theta[j])) * Math.cos(theta[j]));

  const fitRange = M.fitRangeLs.value;
  const inWin = v.map((x) => Math.abs(x) <= fitRange);
  const vw = v.filter((_, j) => inWin[j]), pw = p0.filter((_, j) => inWin[j]);
  const S = rawModel / lsSlope(vw, pw); // kPa.s/L, so that the fit slope over the window equals rawModel
  // smooth noise (first-order low-pass, correlation time about 0.3 s), orthogonal to [1, flow] inside the fit window
  const nz = [];
  let s = 0;
  const a = 0.88;
  for (let j = 0; j < n; j++) { s = a * s + Math.sqrt(1 - a * a) * rng.normal(); nz.push(s); }
  const sd = Math.sqrt(mean(nz.map((q) => q * q)));
  const noise = orthogonalize(nz.map((q) => (q / sd) * tech.rawNoise * rawModel), v, inWin);

  const kBox = boxPaPerKpa(tgvTrue, box);
  const flow = v.map((x) => round(x, 4));
  const pbox = p0.map((q, j) => round(kBox * (S * q + noise[j]), 4));
  const shiftMl = pbox.map((q) => round(q * shiftMlPerPa(box), 3));
  const volumeL = vol.map((x) => round(x, 4));

  // sRaw from the tidal fit over |flow| <= 0.5 L/s of the stored arrays.
  const fx = [], fy = [];
  for (let j = 0; j < n; j++) if (Math.abs(flow[j]) <= fitRange) { fx.push(flow[j]); fy.push(pbox[j]); }
  const slope = lsSlope(fx, fy);
  const sRaw = sRawFromSlope(slope, box);
  const near = [], nearY = [];
  for (let j = 0; j < n; j++) if (Math.abs(flow[j]) <= 0.15) { near.push(flow[j]); nearY.push(pbox[j]); }
  const tangent = near.length >= 8 ? lsSlope(near, nearY) : slope;

  // sRtot: slope of the line between the points of maximal shift (largest and smallest box signal) of each breath, averaged.
  const rtot = [];
  for (let b = 0; b < M.nBreaths; b++) {
    let iMax = -1, iMin = -1;
    for (let j = 0; j < n; j++) if (breath[j] === b) { if (iMax < 0 || pbox[j] > pbox[iMax]) iMax = j; if (iMin < 0 || pbox[j] < pbox[iMin]) iMin = j; }
    if (iMax >= 0 && Math.abs(flow[iMax] - flow[iMin]) > 0.2) rtot.push((pbox[iMax] - pbox[iMin]) / (flow[iMax] - flow[iMin]));
  }
  const sRtot = rtot.length ? sRawFromSlope(mean(rtot), box) : sRaw;

  // Shape descriptors from the arrays: opening at the zero-flow crossings and slope at high against low flow.
  const peak = Math.max(...pbox.map(Math.abs));
  const open0 = [];
  for (let j = 1; j < n; j++) if (flow[j - 1] * flow[j] < 0) open0.push(Math.abs(pbox[j - 1] + ((pbox[j] - pbox[j - 1]) * flow[j - 1]) / (flow[j - 1] - flow[j])));
  const opening = open0.length ? mean(open0) / peak : 0;
  const vRef = Math.min(Math.max(...flow), -Math.min(...flow));
  const lowX = [], lowY = [], hiPos = [], hiNeg = [];
  for (let j = 0; j < n; j++) {
    if (Math.abs(flow[j]) <= 0.3 * vRef) { lowX.push(flow[j]); lowY.push(pbox[j]); }
    else if (flow[j] >= 0.7 * vRef) hiPos.push([flow[j], pbox[j]]);
    else if (flow[j] <= -0.7 * vRef) hiNeg.push([flow[j], pbox[j]]);
  }
  const lowSlope = lowX.length > 4 ? lsSlope(lowX, lowY) : slope;
  const highSlope = hiPos.length && hiNeg.length ? (mean(hiPos.map((q) => q[1])) - mean(hiNeg.map((q) => q[1]))) / (mean(hiPos.map((q) => q[0])) - mean(hiNeg.map((q) => q[0]))) : lowSlope;
  const sIndex = lowSlope > 0 ? highSlope / lowSlope - 1 : 0;
  const isOpen = opening > 0.06, isBent = sIndex > 0.15;
  const descriptor = morphId === 'sigmoid' ? 'S-shaped' : isOpen && isBent ? 'open, golf club' : isOpen ? 'open' : isBent ? 'bent toward the shift axis' : 'closed, nearly linear';

  return {
    t: t.map((x) => round(x, 3)), flow, pbox, shiftMl, volumeL, breath, fitSlopePaPerLs: round(slope, 5), tangentSlopePaPerLs: round(tangent, 5),
    sRawKpaS: round(sRaw, 4), sGawPerKpaS: round(1 / sRaw, 4),
    rawKpaSL: round(sRaw / frcReported, 4), rawCmH2OSL: round((sRaw / frcReported) * CMH2O_PER_KPA, 3), sRawCmH2OS: round(sRaw * CMH2O_PER_KPA, 3),
    modelRawKpaSL: round(rawModel, 4),
    fitRangeLs: fitRange,
    morphology: {
      id: morphId, label: morph.label, appearance: morph.appearance, source: morph.source,
      parameters: Object.fromEntries(Object.entries(par).map(([k, q]) => [k, round(q, 4)])), parameterVerification: 'unverified',
    },
    estimator: {
      id: 'ls-slope-abs-flow', label: `sRaw: least-squares slope of shift signal on flow, |flow| ≤ ${fitRange} L/s`, fitRangeLs: fitRange, nPoints: fx.length,
    },
    breathingMode: {
      id: 'tidal', label: M.breathingMode.label, tidalVolumeL: round(mean(sim.breaths.map((q) => q.vt)), 3),
      inspiratoryTimeS: round(mean(sim.breaths.map((q) => q.ti)), 3), expiratoryTimeS: round(mean(sim.breaths.map((q) => q.te)), 3),
      ratePerMin: round(60 / mean(sim.breaths.map((q) => q.ti + q.te)), 1),
    },
    rawBasis: { definition: 'Raw = sRaw / reported FRC (mean of the acceptable trials)', frcL: round(frcReported, 4) },
    alternativeEstimates: { sRtotKpaS: round(sRtot, 4), note: 'sRtot (line between the points of maximal shift) diverges from the fit in open loops' },
    shape: { opening: round(opening, 3), sIndex: round(sIndex, 3), descriptor },
    reference: { sRawUpperKpaS: PLETH_MODEL.sRawUpperLimitKpaS.value, verification: 'secondary' },
  };
}

export const TIMELINE_MODEL = {
  version: 1,
  quietBreaths: 5,
  sampleIntervalS: 0.1,
  note: 'Quiet breathing, open-shutter breath and slow VC maneuver durations are teaching values (unverified).',
  verification: 'unverified',
};

/** Index (1-based) of the trial drawn alone in the "best" views: among the acceptable trials (else usable, else all), the one closest to the reported FRC. */
export function bestTrialIndex(pleth) {
  const pool = ['acceptable', 'usable'].map((s) => pleth.trials.filter((t) => t.status === s)).find((a) => a.length) ?? pleth.trials;
  return pool.reduce((a, b) => (Math.abs(b.deviationPct) < Math.abs(a.deviationPct) ? b : a)).index;
}

/**
 * Volume-time record of every panting trial, in absolute volume anchored at the reported FRC.
 * quiet breaths (baseline moving through the end-expiratory levels recorded before closure) -> shutter closed (flat volume;
 * the pants appear only on the mouth-pressure lane, which carries the trial's own arrays) -> shutter open, one quiet breath that returns to the
 * stable level -> slow expiration to RV -> slow inspiration to TLC.
 */
function buildTimeline({ seed, trials, reportedFrc, suggested, basis, u, tech }) {
  const M = TIMELINE_MODEL;
  const out = trials.map((tr) => {
    const rng = createStream(seed, `pleth-timeline-${tr.index}`);
    const vt = clamp(0.85 * (1 - 0.12 * u) * (1 + 0.04 * rng.normal()), 0.35, 0.6 * suggested.ic);
    const ti = 1.3 * (1 + 0.06 * rng.normal()), te = 1.65 * (1 + 0.25 * u) * (1 + 0.06 * rng.normal());
    const sim = simulateTidal({ rng, nBreaths: M.quietBreaths, vt, ti, te, dt: M.sampleIntervalS, varFrac: 0.8 * tech.rawBreathVar });
    const closureL = tr.frcL;
    // end-expiratory level after each quiet breath, ending at the closure level
    const eelL = tr.eelDeviationL.map((d) => closureL + d - tr.eelDeviationL[M.quietBreaths - 1]);
    const stableL = eelL[0]; // the end-expiratory level before any drift toward the closure level
    const t = [], v = [], segments = [];
    const push = (id, label, ts, vs) => {
      const i0 = t.length ? t.length - 1 : 0;
      ts.forEach((x, j) => { if (j > 0 || !t.length) { t.push(x); v.push(vs[j]); } });
      segments.push({ id, label, t0: ts[0], t1: ts[ts.length - 1], i0, i1: t.length - 1 });
    };
    // quiet breathing
    const tidalV = sim.theta.map((th, j) => {
      const b = sim.breath[j];
      const e0 = b === 0 ? eelL[0] : eelL[b - 1], e1 = eelL[b];
      return e0 + (e1 - e0) * smoothstep((th - b * TAU) / TAU) + sim.vol[j];
    });
    push('tidal', 'Quiet breathing', sim.t, tidalV);
    // shutter closed: the pneumotach volume does not change
    const tClose = sim.t[sim.t.length - 1];
    const tPant = tr.t[tr.t.length - 1];
    push('closure', 'Shutter closed', [tClose, tClose + tPant / 2, tClose + tPant], [closureL, closureL, closureL]);
    // shutter open: one quiet breath that returns to the stable end-expiratory level
    const open = simulateTidal({ rng, nBreaths: 1, vt: 0.9 * vt, ti, te, dt: M.sampleIntervalS, varFrac: 0.3 * tech.rawBreathVar });
    const tOpen = tClose + tPant;
    push('open-shutter', 'Shutter open', open.t.map((x) => tOpen + x), open.theta.map((th, j) => closureL + (stableL - closureL) * smoothstep(th / TAU) + open.vol[j]));
    // slow expiration to RV, slow inspiration to TLC (smooth, zero flow at both ends)
    const tEx = tOpen + open.t[open.t.length - 1];
    const dEx = clamp(2.2 + 1.5 * suggested.erv, 3, 6), nEx = Math.ceil(dEx / M.sampleIntervalS);
    const exT = Array.from({ length: nEx + 1 }, (_, j) => tEx + (j / nEx) * dEx);
    push('expiration', 'Expiration to RV', exT, exT.map((_, j) => stableL - (stableL - suggested.rv) * smootherstep(j / nEx)));
    const tIn = exT[exT.length - 1];
    const dIn = clamp(2.5 + 0.6 * suggested.vc, 4, 7), nIn = Math.ceil(dIn / M.sampleIntervalS);
    const inT = Array.from({ length: nIn + 1 }, (_, j) => tIn + (j / nIn) * dIn);
    push('inspiration', 'Inspiration to TLC', inT, inT.map((_, j) => suggested.rv + (suggested.tlc - suggested.rv) * smootherstep(j / nIn)));
    const closureOffsetL = closureL - stableL;
    return {
      trial: tr.index,
      t: t.map((x) => round(x, 3)), v: v.map((x) => round(x, 4)),
      segments: segments.map((sg) => ({ ...sg, t0: round(sg.t0, 3), t1: round(sg.t1, 3) })),
      eelL: eelL.map((x) => round(x, 4)),
      levels: {
        reportedFrcL: round(reportedFrc, 4), trialFrcL: tr.frcL, closureOffsetL: round(closureOffsetL, 4), stableEelL: round(stableL, 4),
        rvL: round(suggested.rv, 4), tlcL: round(suggested.tlc, 4), ervL: round(suggested.erv, 4), icL: round(suggested.ic, 4),
        tidalVolumeL: round(mean(sim.breaths.map((q) => q.vt)), 3),
      },
      lane: { trial: tr.index, tStartS: round(tClose, 3), t: tr.t, pm: tr.pm, pbox: tr.pbox, panFreqHz: tr.panFreqHz },
      offsetFromStable: tr.faults.includes('unstable-eel'),
    };
  });
  return {
    version: M.version, breathingMode: 'tidal',
    anchor: `Volume axis anchored at the reported FRC (mean of the ${basis} trials); RV and TLC are the reported values`,
    reportedFrcL: round(reportedFrc, 4), trials: out,
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
 * @param {'closed'|'golf-club'|'restriction'|'sigmoid'} [args.morphology] force a resistance-loop morphology (otherwise chosen from the physiology; sigmoid only on request)
 * @returns {object|null} trials, FRC, grade, `raw` (a PlethRawLoop) and `timeline` (a PlethTimeline)
 */
export function buildPleth({ seed, truth, volumes, technique = 'good', scenario = null, ratioZ, barometricMmHg, morphology } = {}) {
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

  const restricted = Number.isFinite(truth.latent?.zTLC) && truth.latent.zTLC < -1.645;
  const raw = buildRawLoop({ seed, box, tgvTrue, frcReported: reportedFrc, u, z, phenotype: truth.phenotype ?? null, tech, morphology, restricted });
  if (raw.sRawKpaS > PLETH_MODEL.sRawUpperLimitKpaS.value) add('sraw-above-upper-limit', `sRaw ${raw.sRawKpaS.toFixed(2)} kPa.s is above the 1.2 kPa.s upper limit quoted for adults (secondary source).`, 'minor');

  const erv = Math.min(volumes.erv ?? truth.erv, 0.85 * reportedFrc);
  const ic = volumes.ic ?? truth.ic;
  const suggestedVolumes = { method: 'plethysmography', frc: reportedFrc, erv, ic, tlc: reportedFrc + ic, rv: reportedFrc - erv, vc: ic + erv };
  const timeline = buildTimeline({ seed, trials, reportedFrc, suggested: suggestedVolumes, basis: acceptable.length ? 'acceptable' : usable.length ? 'usable' : 'all', u, tech });
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
    timeline,
    flags,
    faults,
    suggestedVolumes,
    unverified: Object.entries(PLETH_MODEL).filter(([, v]) => v.verification === 'unverified').map(([k]) => k),
  };
}
