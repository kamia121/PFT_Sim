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
 * Every correlation loading, archetype mean and band here is a proposal for physician review.
 * None is source-backed. See SPEC.md.
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
  obstruction: 'Airflow obstruction. The phenotype (airway-predominant or emphysema-like) is drawn from the seed.',
  'restriction-parenchymal': 'Restriction with low diffusing capacity and a preserved or raised FEV1/FVC.',
  'restriction-extraparenchymal': 'Restriction from the chest wall or respiratory muscles: raised RV/TLC, low ERV, mildly low DLCO, raised KCO.',
  mixed: 'Obstruction and restriction together.',
  nonspecific: 'Low FVC with a preserved ratio and a TLC that is not low. Spirometry alone labels this preserved ratio with impaired spirometry (PRISm).',
  'low-dlco': 'Isolated reduction in diffusing capacity with normal spirometry and volumes.',
  anemia: 'Low measured DLCO caused by anemia; normal after hemoglobin correction.',
  'obesity-low-erv': 'Obesity with low expiratory reserve volume and FRC, normal or mildly low TLC, and a normal or raised DLCO.',
  'bd-discordant': 'Obstruction with a bronchodilator response that is discordant between FEV1 and FVC. Two variants: a volume response, and a post-bronchodilator technique artifact.',
};
export const archetypeNote = (a) => ARCHETYPE_NOTES[a];

/** Cotes hemoglobin correction. Verification state: UNVERIFIED against ATS/ERS 2017 (see standards.js). */
export function hbFactor(hb, sex, age) {
  const c = sex === 'M' && age >= 15 ? 10.22 : 9.38;
  return (c + hb) / (1.7 * hb);
}

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
  const { resolveReference } = createReference(datasets);
  const pat = { age: d.age, sex: d.sex, heightCm: d.heightCm, group: ANCHOR.group };
  const anchor = (measure) => resolveReference(measure, pat, ANCHOR.spirometry).lms;
  const at = (measure, z) => valueAt(anchor(measure), z);
  const tn = (mean, sd, lo, hi) => truncatedNormal(rng.uniform(), mean, sd, lo, hi);
  const uni = (lo, hi) => rng.range(lo, hi);
  const sev = d.severity;

  // Factor model for variables an archetype does not define. Loadings are proposals.
  const S = rng.normal(), G = rng.normal(), T = rng.normal();
  const e = Array.from({ length: 6 }, () => rng.normal());
  const phenotypeDraw = rng.uniform(), variantDraw = rng.uniform(), bdDraw = rng.uniform(), borderDraw = rng.uniform(), borderPick = rng.uniform();
  const bd = { responder: false, deltaFev1Pred: 0, deltaFvcFraction: 0, variant: null };

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
  };
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
      phenotype = phenotypeDraw < 0.6 ? 'airway' : 'emphysema';
      lat.zFev1Target = uni(...SEVERITY_Z[sev]);
      lat.zTLC = tn(phenotype === 'airway' ? 0.3 + 0.3 * (sev - 1) : 0.9 + 0.5 * (sev - 1), 0.7, -1.2, 3.2);
      lat.zRVT = tn(phenotype === 'airway' ? 1.2 + 0.6 * (sev - 1) : 2.0 + 0.6 * (sev - 1), 0.7, 0.3, 5);
      lat.delta = uni(0.03, 0.07) + 0.04 * (sev - 1) + (phenotype === 'emphysema' ? 0.03 : 0);
      lat.zERV = tn(-0.3, 0.9, -2, 1.5);
      lat.zDLCO = phenotype === 'airway' ? tn(0.2, 0.8, -1.3, 2) : tn(-1.8 - 0.6 * (sev - 1), 0.6, -5, -1.7);
      lat.vaShift = phenotype === 'emphysema' ? 0.05 + 0.04 * sev : 0.01 * sev;
      bd.responder = bdDraw < 0.45;
      break;
    }
    case 'restriction-parenchymal': {
      lat.zTLC = uni(...SEVERITY_Z[sev]);
      lat.zRVT = tn(-0.2, 0.8, -1.5, 1.2);
      lat.delta = uni(0.01, 0.04);
      lat.zRatio = tn(0.5, 0.7, -0.8, 2.3);
      lat.zERV = tn(-0.5, 0.8, -2, 1);
      lat.zDLCO = tn(-1.2 - 0.8 * sev, 0.7, -6, -1.75);
      break;
    }
    case 'restriction-extraparenchymal': {
      lat.zTLC = uni(...SEVERITY_Z[sev]);
      lat.zRVT = tn(1.5, 0.7, 0.3, 4);
      lat.delta = uni(0.01, 0.05);
      lat.zRatio = tn(0.2, 0.7, -0.8, 2);
      lat.zERV = tn(-1.8, 0.8, -4, -0.5);
      lat.zDLCO = tn(-0.6, 0.6, -1.5, 0.8);
      break;
    }
    case 'mixed': {
      lat.zTLC = uni(...SEVERITY_Z[sev]);
      lat.zRatio = uni(...RATIO_Z[sev]);
      lat.zRVT = tn(0.6, 0.8, -0.8, 3);
      lat.delta = uni(0.04, 0.09);
      lat.zERV = tn(-0.8, 0.9, -3, 1);
      lat.zDLCO = tn(-1.2 - 0.4 * sev, 0.8, -5, 0.3);
      bd.responder = bdDraw < 0.3;
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
      lat.zERV = uni(...SEVERITY_Z[sev]);
      lat.zDLCO = tn(0.5, 0.7, -0.8, 2.2);
      lat.zRatio = tn(0.3, 0.8, -1, 2);
      break;
    }
    case 'bd-discordant': {
      phenotype = 'airway';
      bd.variant = variantDraw < 0.6 ? 'volume' : 'artifact';
      lat.zFev1Target = uni(...SEVERITY_Z[Math.min(sev, 2)]);
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
  const fev1 = fvc * ratio;
  const erv = Math.max(Math.min(at('erv', lat.zERV), 0.85 * vc), 0.12);
  const frc = rv + erv;
  const ic = vc - erv;
  const dlcoCorrected = at('dlco', lat.zDLCO);
  const vaPred = anchor('va').M, tlcPred = anchor('tlc').M;
  // VA is a fraction of TLC: the ratio of the anchor predicted values, kept in a physical range because
  // the two anchor families were derived separately and their predicted VA/TLC is not always below one.
  const vaFraction = Math.min(Math.max(vaPred / tlcPred, 0.8), 0.96);
  const va = Math.min(tlc * vaFraction * Math.exp(0.03 * e[5]) * (1 - lat.vaShift), 0.98 * tlc);
  const kco = dlcoCorrected / va;

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
    } else if (bd.responder) {
      dFev1 = uni(0.11, 0.2) * fev1Pred;
      dFvc = dFev1 * uni(0.2, 0.9);
    } else {
      dFev1 = uni(-0.01, 0.06) * fev1Pred;
      dFvc = dFev1 * uni(0.0, 0.8);
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
 * Carboxyhemoglobin and the measured DLCO. A raised COHb competes with the test gas for hemoglobin and
 * adds CO back-pressure, so the measured DLCO falls. The rule of about 1% of DLCO per 1% of COHb above
 * the endogenous level is quoted in the research catalog as not verified; both constants are
 * UNVERIFIED teaching values (see src/scenarios/constants.js and docs/scenarios-model.md).
 */
export const COHB = {
  referencePercent: { value: 1.5, verification: 'unverified' },
  dlcoFractionPerPercent: { value: 0.01, verification: 'unverified' },
};

/** Multiplier on the measured DLCO for a carboxyhemoglobin of `cohbPercent` (1 at or below the endogenous level). */
export function cohbDlcoFactor(cohbPercent) {
  const excess = Math.max(0, cohbPercent - COHB.referencePercent.value);
  return Math.max(0.5, 1 - COHB.dlcoFractionPerPercent.value * excess);
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
