/**
 * GLI reference equations through the LMS method.
 *
 *   M = exp(intercept + height and age terms + group term + M spline(age))
 *   S = exp(intercept + age terms + group term + S spline(age))          (S spline used only where the source equation has one)
 *   L = constant, or a function of ln(age), plus the L spline(age)
 *   z = ((x / M)^L - 1) / (L S), or ln(x / M) / S when L = 0
 *   LLN and ULN are the values at z = -1.645 and +1.645, the rounded cutoff the GLI workbooks and rspiro use.
 *
 * The data come from the GLI lookup workbooks through tools/extract-gli.py and are covered by the
 * notice in src/reference/NOTICE, not by the MIT license of the surrounding code. Splines are
 * interpolated linearly in age between the 0.25-year rows of the workbooks. Ages outside the
 * published range return null; nothing is extrapolated.
 */

export const Z_LIMIT = 1.645;

/** Requisition group labels mapped to GLI-2012 ethnicity codes (1 Caucasian ... 5 other or mixed). */
export const GROUP_TO_GLI2012 = {
  'White': 1,
  'Black or African American': 2,
  'Asian: Northeast': 3,
  'Asian: Southeast': 4,
  'Other or mixed': 5,
};

const VOLUME_MEASURES = ['tlc', 'rv', 'vc', 'ic', 'erv', 'frc', 'rv_tlc'];
const TLCO_MEASURES = ['dlco', 'kco', 'va'];
const SPIROMETRY_MEASURES = ['fev1', 'fvc', 'fev1_fvc'];

function interpolate(sp, key, age) {
  const a = sp.age;
  if (age < a[0] || age > a[a.length - 1]) return null;
  let lo = 0, hi = a.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (a[mid] <= age) lo = mid; else hi = mid;
  }
  const f = (age - a[lo]) / (a[hi] - a[lo]);
  return sp[key][lo] + f * (sp[key][hi] - sp[key][lo]);
}

const linear = (t, lnAge, age, lnHt, ht) => t.const + t.ageLn * lnAge + t.age * age + t.htLn * lnHt + t.ht * ht;

/**
 * @param {object} entry one measure and sex from a data file
 * @param {string} equationId
 * @param {{ age: number, heightCm: number, ethnicityCode?: number }} p
 * @returns {{ L: number, M: number, S: number } | null} null when age is outside the published range
 */
export function lms(entry, equationId, { age, heightCm, ethnicityCode = 1 }) {
  const ms = interpolate(entry.splines, 'm', age);
  if (ms === null) return null;
  const ss = interpolate(entry.splines, 's', age);
  const ls = interpolate(entry.splines, 'l', age);
  const lnAge = Math.log(age), lnHt = Math.log(heightCm);
  if (equationId === 'GLI2012') {
    const k = ethnicityCode - 2; // 2..5 map to the third..sixth coefficient; 1 is the reference group
    const aTerm = k >= 0 ? entry.a[3 + k] : 0;
    const pTerm = k >= 0 ? entry.p[2 + k] : 0;
    return {
      L: entry.q[0] + entry.q[1] * lnAge + ls,
      M: Math.exp(entry.a[0] + entry.a[1] * lnHt + entry.a[2] * lnAge + aTerm + ms),
      S: Math.exp(entry.p[0] + entry.p[1] * lnAge + pTerm + ss),
    };
  }
  return {
    L: linear(entry.l, lnAge, age, lnHt, heightCm) + ls,
    M: Math.exp(linear(entry.m, lnAge, age, lnHt, heightCm) + ms),
    S: Math.exp(linear(entry.s, lnAge, age, lnHt, heightCm) + (entry.sSpline ? ss : 0)),
  };
}

export const valueAtZ = ({ L, M, S }, z) => (L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L));
export const zScore = ({ L, M, S }, x) => (L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S));

/**
 * @param {Record<string, { id: string, measures: object }>} datasets keyed by equation id:
 *   GLI2012, GLIglobal, GLI2021vol, GLI2017tlco
 */
export function createReference(datasets) {
  const familyFor = (measure) => (SPIROMETRY_MEASURES.includes(measure) ? 'spirometry' : VOLUME_MEASURES.includes(measure) ? 'GLI2021vol' : TLCO_MEASURES.includes(measure) ? 'GLI2017tlco' : null);

  /**
   * Resolve a reference value for one measurement, falling back as a laboratory would when the
   * requested equation does not cover the measurement or the patient's group.
   * @param {string} measure fev1, fvc, fev1_fvc, tlc, rv, vc, ic, erv, frc, rv_tlc, dlco, kco or va
   * @param {{ age: number, sex: 'M'|'F', heightCm: number, group: string, measured?: number }} patient
   * @param {'GLI2012'|'GLIglobal'} [spirometryFamily] equation requested for spirometry
   */
  function resolveReference(measure, patient, spirometryFamily = 'GLIglobal') {
    const family = familyFor(measure);
    if (!family) throw new RangeError(`unknown measure: ${measure}`);
    const sex = patient.sex === 'M' ? 'male' : 'female';
    let equationId = family === 'spirometry' ? spirometryFamily : family;
    let matched = true;
    let fallbackReason = null;
    if (family === 'spirometry' && !['GLI2012', 'GLIglobal'].includes(equationId)) throw new RangeError(`unknown spirometry equation: ${equationId}`);
    if (family !== 'spirometry' && patient.group !== 'White') {
      matched = false;
      fallbackReason = 'equation-derived-in-european-ancestry-only';
    }
    const ethnicityCode = GROUP_TO_GLI2012[patient.group];
    if (equationId === 'GLI2012' && ethnicityCode === undefined) throw new RangeError(`unknown group: ${patient.group}`);
    const entry = datasets[equationId].measures[measure][sex];
    const base = { measure, equationId, matched, fallbackReason };
    const params = lms(entry, equationId, { age: patient.age, heightCm: patient.heightCm, ethnicityCode });
    if (params === null) return { ...base, available: false, fallbackReason: 'age-outside-range', predicted: null, lln: null, uln: null, z: null, percentPredicted: null };
    const out = { ...base, available: true, lms: params, predicted: params.M, lln: valueAtZ(params, -Z_LIMIT), uln: valueAtZ(params, Z_LIMIT), z: null, percentPredicted: null };
    if (patient.measured !== undefined) {
      out.z = zScore(params, patient.measured);
      out.percentPredicted = (100 * patient.measured) / params.M;
    }
    return out;
  }
  return { resolveReference };
}
