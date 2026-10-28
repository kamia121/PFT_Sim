/**
 * True physiology of a simulated patient, in physical units, built constructively from the
 * archetype. The anchor equations (GLI Global for spirometry, GLI-2021 for volumes, GLI-2017 for
 * diffusing capacity, all with the European or group-neutral equation) turn standardized
 * deviations into liters. The anchor is a declared, versioned choice; it is never offered as a
 * comparison lens, and a normal case is normal with respect to it.
 *
 * Sampling is constructive: the variables that define an archetype are drawn from truncated
 * distributions (inverse CDF, one uniform each), and the remaining variables from a small factor
 * model. There is no accept/reject step against the interpretation engine. The key that learners
 * are scored on is computed later from the values actually reported, after maneuver variability
 * and technique faults; agreement between archetype and key is a property test, not a filter.
 *
 * Archetype means and bands were compared with published cohorts (docs/research/archetype-literature.md; the decisions
 * and their sources are in docs/archetype-changes.md and SPEC.md). Each parameter is either anchored to a source or labelled
 * a teaching choice in those documents; all remain proposals for physician review. Generator version 2.
 */
import { createStream } from './prng.js';
import { truncatedNormal } from './stats.js';
import { createReference, GROUP_TO_GLI2012 } from '../reference/gli.js';

export const ANCHOR = { id: 'anchor-1', spirometry: 'GLIglobal', volumes: 'GLI2021vol', tlco: 'GLI2017tlco', group: 'White' };

/** Z bands for the defining abnormality, with margin inside the severity thresholds (-1.645, -2.5, -4.0). */
export const SEVERITY_Z = { 1: [-2.4, -1.8], 2: [-3.9, -2.6], 3: [-5.2, -4.15] };
const RATIO_Z = { 1: [-2.6, -1.8], 2: [-3.4, -2.6], 3: [-4.2, -3.4] };

const ARCHETYPE_NOTES = {
  normal: 'Normal for the anchor equations.',
  obstruction: 'Airflow obstruction. The phenotype (asthma-like or chronic bronchitis with a preserved DLCO, COPD without emphysema with a reduced DLCO, or emphysema with a low DLCO) is drawn from the seed, with more asthma-like cases below 40 years.',
  'restriction-parenchymal': 'Restriction with low diffusing capacity and a preserved or raised FEV1/FVC.',
  'restriction-extraparenchymal': 'Restriction from the chest wall or respiratory muscles: raised RV/TLC, low ERV, mildly low DLCO, raised KCO.',
  mixed: 'Obstruction and restriction together.',
  nonspecific: 'Low FVC with a preserved ratio and a TLC that is not low. Spirometry alone labels this preserved-ratio spirometric impairment; TLC distinguishes restriction from a non-specific pattern.',
  'low-dlco': 'Isolated reduction in diffusing capacity with normal spirometry and volumes.',
  anemia: 'Low measured DLCO caused by anemia; normal after hemoglobin correction.',
  'obesity-low-erv': 'Obesity with low expiratory reserve volume and FRC, normal or mildly low TLC, and a DLCO that is not reduced.',
  'bd-discordant': 'Obstruction with a bronchodilator response that is discordant between FEV1 and FVC. Two variants: a volume response, and a post-bronchodilator technique artifact.',
};
export const archetypeNote = (a) => ARCHETYPE_NOTES[a];

/** Cotes hemoglobin correction factor on the MEASURED value, the reciprocal of the standard's multiplier on the predicted value (ATS/ERS 2017 eqs 31 and 32, read 2026-10-21). */
export function hbFactor(hb, sex, age) {
  const c = sex === 'M' && age >= 15 ? 10.22 : 9.38;
  return (c + hb) / (1.7 * hb);
}

/**
 * Bronchodilator response of the true values, as percent of the predicted FEV1 and FVC (mean, SD), correlation 0.5.
 * Obstruction and mixed disease: continuous and damped with severity, as in COPD cohorts (SCAPIS COPD: FEV1 5.2 +- 5.4 %p,
 * FVC 4.8 +- 6.1 %p; ECLIPSE: the response falls with GOLD stage; NOVELTY: a response in FVC is at least as common as in FEV1,
 * so the FVC response is not damped). About 15 to 25% of obstructive cases exceed 10% of predicted.
 * Normal and nonspecific: SCAPIS never-smokers (FEV1 3.2 +- 4.2 %p, FVC -0.5 +- 3.1 %p; the FEV1 SD is set to 3.3 so that the 95th percentile matches their 8.7).
 * Asthma-like obstruction has a larger response: a TEACHING CHOICE with no cohort anchor, so that a classic concordant response is seen.
 */
const bdObstructive = (sev) => ({ fev1: [[5.0, 4.5], [3.5, 3.5], [2.0, 2.5]][sev - 1], fvc: [4.5, 5.5], limits: [-6, 25] });
const BD_ASTHMA_LIKE = { fev1: [8.0, 5.5], fvc: [6.0, 6.0], limits: [-6, 30] };
const BD_NORMAL = { fev1: [3.2, 3.3], fvc: [-0.5, 3.1], limits: [-8, 12] };

/** Value at z that stays defined when 1 + L S z approaches zero (extreme negative z in skewed distributions). */
function valueAt({ L, M, S }, z) {
  if (L === 0) return M * Math.exp(S * z);
  const base = Math.max(1 + L * S * z, 0.05);
  return M * Math.pow(base, 1 / L);
}

/**
 * @param {number} seed
 * @param {import('./descriptor.js').Descriptor} d resolved descriptor
 * @param {Record<string, object>} datasets GLI datasets
 */
export function generatePhysiology(seed, d, datasets) {
  const rng = createStream(seed, 'physiology');
  const { resolveReference } = createReference(datasets, { rangePolicy: 'synthetic-anchor-clamp' });
  const pat = { age: d.age, sex: d.sex, heightCm: d.heightCm, group: ANCHOR.group };
  const anchor = (measure) => resolveReference(measure, pat, ANCHOR.spirometry).lms;
  const at = (measure, z) => valueAt(anchor(measure), z);
  const tn = (mean, sd, lo, hi) => truncatedNormal(rng.uniform(), mean, sd, lo, hi);
  const uni = (lo, hi) => rng.range(lo, hi);
  const sev = d.severity;

  // Latent defaults for a healthy lung. Every archetype below overwrites the z-scores, so these loadings affect only the
  // FVC/VC gap of the normal-range archetypes and the VA noise; the draws are kept so that the random stream is stable.
  const S = rng.normal(), G = rng.normal(), T = rng.normal();
  const e = Array.from({ length: 6 }, () => rng.normal());
  const phenotypeDraw = rng.uniform(), variantDraw = rng.uniform(), bdDraw = rng.uniform(), borderDraw = rng.uniform(), borderPick = rng.uniform();
  const bd = { responder: false, deltaFev1Pred: 0, deltaFvcFraction: 0, variant: null, model: BD_NORMAL };

  // Defaults: a healthy lung before the archetype is applied.
  const lat = {
    zTLC: 0.8 * S + 0.6 * e[0],
    zRVT: 0.5 * T + 0.87 * e[1],
    zERV: 0.3 * S + 0.95 * e[2],
    zRatio: -0.25 * S + 0.97 * e[3],
    zDLCO: 0.5 * S + 0.4 * G + 0.77 * e[4],
    delta: Math.min(Math.max(0.02 + 0.012 * e[5], 0), 0.08),
    vaShift: 0,
    zFvcTarget: null,
    zFev1Target: null,
    zKco: null, // when set, KCO is drawn and DLCO = KCO x VA (restriction, mixed)
    kcoJohnson: false, // extraparenchymal restriction: DLCO and KCO follow VA by Johnson's relation
    ervFromBmi: false, // obesity: ERV follows BMI
  };
  // Floor for the obstructive FEV1: the severity band's lower edge runs past the support of the LMS curve in older women
  // (FEV1 below 10% of predicted), so FEV1 is kept at 18% of the predicted value or above. Where that floor lies above the band the
  // target takes the floor, and the key then grades such a case by its z-score.
  const FEV1_FLOOR = 0.18;
  const fev1FloorZ = () => resolveReference('fev1', { ...pat, measured: FEV1_FLOOR * anchor('fev1').M }, ANCHOR.spirometry).z;
  const fev1TargetZ = (s) => { const [lo, hi] = SEVERITY_Z[s]; const f = fev1FloorZ(); return uni(Math.max(lo, f), Math.max(hi, f)); };
  // RV/TLC above about 0.74 is not seen even in severe obstruction; it is the cap on the drawn RV/TLC.
  const RVT_MAX = 0.74;
  const clipNormal = () => {
    lat.zRatio = tn(0.1, 0.9, -1.2);
    lat.zTLC = tn(0, 0.9, -1.3, 1.6);
    lat.zRVT = tn(0, 0.9, -1.4, 1.4);
    lat.zERV = tn(0, 0.9, -1.4, 1.8);
    lat.zDLCO = tn(0, 0.9, -1.3, 1.8);
  };
  let phenotype = null;

  switch (d.archetype) {
    case 'normal': {
      clipNormal();
      // Fifteen percent of normal cases carry one measure just above the lower limit, so equation choice can matter.
      if (borderDraw < 0.15) {
        const v = -1.25 - 0.2 * borderPick; // -1.25 to -1.45, above the limit even after measurement variability
        if (borderPick < 0.34) lat.zRatio = v; else if (borderPick < 0.67) lat.zTLC = v; else lat.zDLCO = v;
      }
      break;
    }
    case 'obstruction': {
      // Phenotype: asthma-like or chronic bronchitis ('airway-predominant', DLCO preserved), COPD without emphysema ('nonemphysematous', DLCO reduced),
      // and emphysema. The mix depends on age (a teaching choice): younger patients are mostly asthma-like.
      const older = d.age >= 40;
      const pAirway = older ? 0.2 : 0.8, pCopd = older ? 0.45 : 0.2;
      phenotype = phenotypeDraw < pAirway ? 'airway-predominant' : phenotypeDraw < pAirway + pCopd ? 'nonemphysematous' : 'emphysema';
      const k = sev - 1;
      lat.zFev1Target = fev1TargetZ(sev);
      lat.zTLC = tn(phenotype === 'airway-predominant' ? 0.3 + 0.3 * k : phenotype === 'nonemphysematous' ? 0.6 + 0.4 * k : 0.9 + 0.5 * k, 0.7, -1.2, 3.2);
      // RV/TLC rises with the FVC/VC gap (+0.1, +0.25, +0.4) and, in severe disease, with air trapping (+0.6).
      const rvtAdd = [0.1, 0.25, 1.0][k];
      lat.zRVT = tn((phenotype === 'airway-predominant' ? 1.2 : phenotype === 'nonemphysematous' ? 1.6 : 2.0) + 0.6 * k + rvtAdd, 0.7, 0.3, 5);
      lat.delta = tn(0.04 + 0.02 * k + (phenotype === 'emphysema' ? 0.02 : 0), 0.04, -0.02, 0.2);
      lat.zERV = tn(-0.3, 0.9, -2, 1.5);
      lat.zDLCO = phenotype === 'airway-predominant' ? tn(0, 0.8, -1.3, 2) : phenotype === 'nonemphysematous' ? tn([-1.8, -2.8, -3.3][k], 1.0, -5.5, -0.5) : tn([-3.6, -4.4, -5.0][k], 0.9, -6.5, -1.7);
      lat.vaShift = phenotype === 'airway-predominant' ? 0.01 * sev : phenotype === 'nonemphysematous' ? 0.03 + 0.02 * sev : 0.05 + 0.04 * sev;
      bd.responder = bdDraw < 0.45; // drawn to keep the stream; the response is continuous (see the bronchodilator block)
      bd.model = phenotype === 'airway-predominant' ? BD_ASTHMA_LIKE : bdObstructive(sev);
      break;
    }
    case 'restriction-parenchymal': {
      lat.zTLC = uni(...SEVERITY_Z[sev]);
      lat.zRVT = tn(-0.2, 0.8, -1.5, 1.2);
      lat.delta = uni(0.01, 0.04);
      lat.zRatio = tn(0.5, 0.7, -0.8, 2.3);
      lat.zERV = tn(-0.5, 0.8, -2, 1);
      lat.zKco = tn(-2.2, 0.8, -4.5, -1);
      break;
    }
    case 'restriction-extraparenchymal': {
      lat.zTLC = uni(...SEVERITY_Z[sev]);
      lat.zRVT = tn(1.5, 0.7, 0.3, 4);
      lat.delta = uni(0.01, 0.05);
      lat.zRatio = tn(0.2, 0.7, -0.8, 2);
      lat.zERV = tn(-1.8, 0.8, -4, -0.5);
      lat.kcoJohnson = true;
      break;
    }
    case 'mixed': {
      lat.zTLC = uni(...SEVERITY_Z[sev]);
      lat.zRatio = uni(...RATIO_Z[sev]);
      lat.zRVT = tn(0.6, 0.8, -0.8, 3);
      lat.delta = uni(0.04, 0.09);
      lat.zERV = tn(-0.8, 0.9, -3, 1);
      lat.zKco = tn(-1.8, 0.8, -4, -0.5);
      bd.responder = bdDraw < 0.3; // drawn to keep the stream
      bd.model = bdObstructive(sev);
      break;
    }
    case 'nonspecific': {
      lat.zFvcTarget = uni(-2.7, -1.9);
      lat.zRatio = tn(0.2, 0.7, -0.8, 2);
      lat.zTLC = tn(-0.8, 0.35, -1.15, -0.2);
      lat.delta = uni(0.015, 0.04);
      lat.zERV = tn(-0.8, 0.9, -2.5, 1);
      lat.zDLCO = tn(-0.1, 0.8, -1.3, 1.5);
      break;
    }
    case 'low-dlco': {
      clipNormal();
      lat.zDLCO = uni(...SEVERITY_Z[sev]);
      break;
    }
    case 'anemia': {
      clipNormal();
      lat.zDLCO = tn(-0.3, 0.5, -1.0, 0.5);
      break;
    }
    case 'obesity-low-erv': {
      clipNormal();
      lat.zTLC = tn(-0.6, 0.6, -1.4, 0.5);
      lat.zRVT = tn(-0.2, 0.7, -1.4, 1);
      lat.ervFromBmi = true;
      lat.zDLCO = tn(0.2, 0.7, -0.8, 1.6);
      lat.zRatio = tn(0.3, 0.8, -1, 2);
      break;
    }
    case 'bd-discordant': {
      phenotype = 'airway-predominant';
      bd.variant = variantDraw < 0.6 ? 'volume' : 'artifact';
      lat.zFev1Target = fev1TargetZ(Math.min(sev, 2));
      lat.zTLC = tn(0.6, 0.6, -0.4, 2.6);
      lat.zRVT = tn(2.2, 0.6, 1.2, 4.2);
      lat.delta = uni(0.10, 0.18);
      lat.zERV = tn(-0.3, 0.9, -2, 1.5);
      lat.zDLCO = tn(0.1, 0.8, -1.3, 1.8);
      lat.vaShift = 0.02;
      break;
    }
    default:
      throw new RangeError(`unknown archetype: ${d.archetype}`);
  }

  // Volumes, constructively: TLC and RV/TLC fix RV and VC; FVC follows from VC and the FVC/VC gap.
  let tlc = at('tlc', lat.zTLC);
  let rvt = at('rv_tlc', lat.zRVT) / 100;
  let vc, fvc, rv;
  if (lat.zFvcTarget !== null) {
    fvc = at('fvc', lat.zFvcTarget);
    vc = fvc / (1 - lat.delta);
    if (tlc - vc < 0.12 * tlc) tlc = vc / 0.88;
    rv = tlc - vc;
    rvt = rv / tlc;
  } else {
    rvt = Math.min(rvt, RVT_MAX);
    rv = tlc * rvt;
    vc = tlc - rv;
    fvc = vc * (1 - lat.delta);
  }
  let ratio = at('fev1_fvc', lat.zRatio);
  if (lat.zFev1Target !== null) {
    // Obstruction: the FEV1 target sets severity; the ratio is whatever follows, kept below the lower limit.
    const fev1Target = at('fev1', lat.zFev1Target);
    ratio = Math.min(fev1Target / fvc, valueAt(anchor('fev1_fvc'), -1.8));
  }
  ratio = Math.min(ratio, 0.98);
  // FEV1 floor for every archetype (mixed disease and extraparenchymal restriction can reach it in older women).
  const fev1Pred0 = anchor('fev1').M;
  if (fvc * ratio < FEV1_FLOOR * fev1Pred0) ratio = Math.min(FEV1_FLOOR * fev1Pred0 / fvc, 0.97);
  const fev1 = fvc * ratio;
  // Obesity: ERV falls with BMI, ERV = predicted x (0.2 + 0.8 exp(-0.12 (BMI - 20))). A two-point fit through Jones and Nzekwu
  // (about 0.44 of the BMI-20 value at BMI 30) and Steier (0.4 L against 1.7 L, about 0.23, at BMI 47); abstracts only.
  const bmi = d.weightKg / (d.heightCm / 100) ** 2;
  const ervTarget = lat.ervFromBmi ? anchor('erv').M * (0.2 + 0.8 * Math.exp(-0.12 * (bmi - 20))) * Math.exp(0.25 * e[2]) : at('erv', lat.zERV);
  const erv = Math.max(Math.min(ervTarget, 0.85 * vc), 0.12);
  const frc = rv + erv;
  const ic = vc - erv;
  const vaPred = anchor('va').M, tlcPred = anchor('tlc').M;
  // VA is a fraction of TLC: the ratio of the anchor predicted values, kept in a physical range because
  // the two anchor families were derived separately and their predicted VA/TLC is not always below one.
  const vaFraction = Math.min(Math.max(vaPred / tlcPred, 0.8), 0.96);
  const va = Math.min(tlc * vaFraction * Math.exp(0.03 * e[5]) * (1 - lat.vaShift), 0.98 * tlc);
  // Diffusing capacity. Restriction and mixed disease are anchored on KCO and DLCO = KCO x VA, so that KCO is low as in the registries;
  // extraparenchymal restriction follows Johnson's relation (KCO/KCOpred = 0.42 + 0.58 / (VA/VApred), abstract only) with a soft cap near
  // 1.40 (KCO in neuromuscular weakness reaches 114 to 130 %p), lognormal noise (SD 0.12), and a quarter of cases pulled toward
  // normal (combined weakness, scoliosis); the other archetypes draw DLCO directly and KCO = DLCO/VA.
  let kco, dlcoCorrected;
  if (lat.zKco !== null) {
    kco = at('kco', lat.zKco);
    dlcoCorrected = kco * va;
  } else if (lat.kcoJohnson) {
    const r = va / vaPred;
    let ratio = 0.42 + 0.58 / r;
    ratio = 1 + 0.4 * Math.tanh((ratio - 1) / 0.4);
    if (rng.uniform() < 0.25) ratio = 1 + 0.4 * (ratio - 1);
    kco = anchor('kco').M * ratio * Math.exp(0.12 * rng.normal());
    dlcoCorrected = kco * va;
  } else {
    dlcoCorrected = at('dlco', lat.zDLCO);
    kco = dlcoCorrected / va;
  }

  // Bronchodilator effect on the true values.
  const fev1Pred = anchor('fev1').M;
  let post = null;
  if (['obstruction', 'mixed', 'bd-discordant', 'normal', 'nonspecific'].includes(d.archetype)) {
    let dFev1, dFvc, earlyStop = null;
    if (d.archetype === 'bd-discordant' && bd.variant === 'volume') {
      dFev1 = uni(0.02, 0.06) * fev1Pred;
      dFvc = uni(0.12, 0.20) * anchor('fvc').M;
    } else if (d.archetype === 'bd-discordant') {
      dFev1 = uni(0.12, 0.2) * fev1Pred;
      dFvc = 0;
      earlyStop = [2.6, 4.2];
    } else {
      const n1 = rng.normal(), n2 = rng.normal();
      const [lo, hi] = bd.model.limits;
      const clampPct = (x) => Math.min(Math.max(x, lo), hi) / 100;
      dFev1 = clampPct(bd.model.fev1[0] + bd.model.fev1[1] * n1) * fev1Pred;
      dFvc = clampPct(bd.model.fvc[0] + bd.model.fvc[1] * (0.5 * n1 + Math.sqrt(0.75) * n2)) * anchor('fvc').M;
    }
    const pf = fvc + dFvc;
    post = { fvc: pf, fev1: Math.min(fev1 + dFev1, 0.985 * pf), earlyStop };
  }

  return {
    anchor: ANCHOR,
    archetype: d.archetype,
    phenotype,
    bdVariant: bd.variant,
    bdResponder: bd.responder,
    note: archetypeNote(d.archetype),
    latent: { ...lat },
    tlc, rv, rvt, vc, fvc, fev1, ratio, erv, frc, ic,
    dlcoCorrected, va, kco,
    post,
  };
}

export { GROUP_TO_GLI2012 };

/**
 * Carboxyhemoglobin and the measured DLCO. Three concepts, which are not interchangeable (ATS/ERS 2017, Graham et al., Eur Respir J
 * 2017;49:1600016, section "Adjustment for carboxyhaemoglobin concentration and carbon monoxide back-pressure", text read on 2026-10-21):
 *   - endogenous COHb is 1 to 2% in the healthy non-smokers from whom the prediction equations come;
 *   - an adjustment for interpretation is recommended only when COHb is known to be elevated or is suspected to exceed 2%; the standard gives
 *     it on the predicted value, eq. 37: DLCO[predicted for COHb] = DLCO[predicted] x (102% - COHb%), "1% for each percentage point of COHb > 2%";
 *   - the simulation's effect on the measured value, which is a teaching choice below: 1% of DLCO per percentage point above 1.5%.
 * The simulation's slope lies inside the standard's "about 0.8-1% per 1% COHb"; its 1.5% baseline lies inside the endogenous 1-2% but is not the standard's 2%.
 * The generator keeps these two constants, because changing them would change every case with a COHb scenario under the same descriptor version.
 * The newer finding of about 2% per 1% COHb with measured back-pressure (eq. 38) is not simulated.
 */
export const COHB = {
  referencePercent: { value: 1.5, verification: 'teaching baseline inside the standard\'s endogenous range of 1-2%' },
  dlcoFractionPerPercent: { value: 0.01, verification: 'teaching slope inside the standard\'s 0.8-1% per 1% COHb (eq. 37 uses 1%)' },
  /** ATS/ERS 2017: adjust the predicted value for COHb only above this level (known or suspected). */
  adjustAbovePercent: { value: 2, verification: 'ATS/ERS 2017 (text and eq. 37)' },
};

/** Multiplier on the measured DLCO for a carboxyhemoglobin of `cohbPercent` (1 at or below the endogenous level). */
export function cohbDlcoFactor(cohbPercent) {
  const excess = Math.max(0, cohbPercent - COHB.referencePercent.value);
  return Math.max(0.5, 1 - COHB.dlcoFractionPerPercent.value * excess);
}

/** ATS/ERS 2017 eq. 37: multiplier on the PREDICTED DLCO for COHb above 2%; null at or below 2% or when COHb is not a number. */
export function cohbReferenceMultiplier(cohbPercent) {
  return Number.isFinite(cohbPercent) && cohbPercent > COHB.adjustAbovePercent.value ? (102 - cohbPercent) / 100 : null;
}

/** ATS/ERS 2017 eqs 31 and 32: multiplier on the PREDICTED DLCO for hemoglobin (g/dL); 1.7Hb/(10.22+Hb) for males of 15 years and older, 1.7Hb/(9.38+Hb) otherwise. Eq. 33 with Hbref = 14.6 or 13.4 is the same. */
export function hbReferenceMultiplier(hb, sex, age) {
  return 1 / hbFactor(hb, sex, age);
}

/**
 * Acute, reversible effects on the measured spirometric quantities, applied to a copy of the true
 * physiology before maneuvers are generated. The lungs themselves (volumes, DLCO) are not changed here;
 * the multipliers are simulator choices whose directions come from the research catalog.
 *
 * @param {ReturnType<typeof generatePhysiology>} truth
 * @param {{ baselineShiftToPost?: number, postResponseMult?: number, fvcMult?: number, fev1Mult?: number,
 *   preOnlyMult?: { fvc?: number, fev1?: number } }} fx
 * @returns {{ fvc: number, fev1: number, ratio: number, post: ({ fvc: number, fev1: number, earlyStop: [number, number]|null }|null) }}
 */
export function applyAcuteEffects(truth, fx = {}) {
  let fvc = truth.fvc, fev1 = truth.fev1;
  const post = truth.post ? { ...truth.post } : null;
  // A bronchodilator taken before the visit moves the baseline toward the post-bronchodilator values, which stay put.
  if (post && fx.baselineShiftToPost) {
    fvc += fx.baselineShiftToPost * (post.fvc - fvc);
    fev1 += fx.baselineShiftToPost * (post.fev1 - fev1);
  }
  // A short wait before the post-bronchodilator set captures only part of the response.
  if (post && fx.postResponseMult !== undefined) {
    post.fvc = fvc + fx.postResponseMult * (post.fvc - fvc);
    post.fev1 = fev1 + fx.postResponseMult * (post.fev1 - fev1);
  }
  const fm = fx.fvcMult ?? 1, em = fx.fev1Mult ?? 1;
  fvc *= fm; fev1 *= em;
  if (post) { post.fvc *= fm; post.fev1 *= em; }
  // Effects on the baseline set only (a better-coached post-bronchodilator set makes the response look larger).
  if (fx.preOnlyMult) { fvc *= fx.preOnlyMult.fvc ?? 1; fev1 *= fx.preOnlyMult.fev1 ?? 1; }
  fev1 = Math.min(fev1, 0.985 * fvc);
  if (post) post.fev1 = Math.min(post.fev1, 0.985 * post.fvc);
  const unchanged = fvc === truth.fvc && fev1 === truth.fev1;
  return { fvc, fev1, ratio: unchanged ? truth.ratio : fev1 / fvc, post };
}
