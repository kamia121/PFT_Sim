/**
 * Interpretation of a simulated report, following the ATS/ERS 2022 strategy as coded in SPEC.md.
 *
 * The engine is a pure function of reported values and the resolved references. It returns a
 * structured key. Items whose rule has not been checked against the 2022 statement are marked
 * `scored: false` or carry a `verification` field, so the learner pages can say so.
 *
 * Z-scores decide every label; percent predicted is reported but never used to classify.
 */
import { INTERPRETATION_2022 as S22 } from '../core/standards.js';

export const LLN_Z = S22.llnZ.value; // -1.645
export const BORDERLINE_BAND = 0.25; // z units either side of a limit (SPEC default, confirmed by the project physician)

export const labelOf = (z) => (z < LLN_Z ? 'low' : z > -LLN_Z ? 'high' : 'normal');
export const borderlineOf = (z) => Math.abs(z - LLN_Z) <= BORDERLINE_BAND || Math.abs(z + LLN_Z) <= BORDERLINE_BAND;

/** Severity from a z-score; the boundary at -1.645 versus -1.65 is unresolved in the sources read, so the lower limit itself is used. */
export function severityOf(z) {
  if (z >= -2.5) return 'mild';
  if (z >= -4.0) return 'moderate';
  return 'severe';
}

export const PATTERNS = {
  normal: 'Normal',
  obstruction: 'Obstruction',
  'obstruction-low-fvc': 'Obstruction with low FVC (volumes needed)',
  restriction: 'Restriction',
  mixed: 'Mixed obstruction and restriction',
  nonspecific: 'Preserved ratio, low FVC or FEV₁, TLC not low (nonspecific)',
  prism: 'Preserved ratio with low FVC or FEV₁ (PRISm; volumes needed)',
  indeterminate: 'Not interpretable',
};

const SPIRO = ['fev1', 'fvc', 'fev1_fvc'];
const VOLS = ['tlc', 'rv', 'rv_tlc', 'vc', 'frc', 'erv', 'ic'];

/**
 * @typedef {object} Report
 * @property {{ age: number, sex: 'M'|'F', heightCm: number, group: string, weightKg: number, hbGdl: number }} patient
 * @property {{ fev1: number|null, fvc: number|null, post: { fev1: number|null, fvc: number|null }|null }} spirometry liters
 * @property {{ tlc: number, rv: number, vc: number, frc: number, erv: number, ic: number }|null} volumes liters
 * @property {{ dlcoAdjusted: number, va: number }|null} dlco DLCO already corrected for hemoglobin (mL/min/mmHg), VA in liters
 * @property {{ fev1: string, fvc: string, postFev1?: string, postFvc?: string }} grades
 * @property {string[]} [caveatIds] ids of the scenario caveats a careful interpreter states; copied into key.caveatIds
 */

/**
 * @param {Report} report
 * @param {(measure: string, patient: object, family?: string) => object} resolve resolveReference from gli.js
 * @param {'GLI2012'|'GLIglobal'} spirometryEquation
 */
export function interpret(report, resolve, spirometryEquation = 'GLIglobal') {
  const { patient } = report;
  const measures = {};
  const add = (name, measure, measured, extra = {}) => {
    if (measured === null || measured === undefined || !Number.isFinite(measured)) return;
    const r = resolve(measure, { ...patient, measured }, spirometryEquation);
    if (!r.available) { measures[name] = { measure, value: measured, available: false, reason: r.fallbackReason, equationId: r.equationId }; return; }
    measures[name] = {
      measure, value: measured, predicted: r.predicted, lln: r.lln, uln: r.uln, z: r.z, percentPredicted: r.percentPredicted,
      label: labelOf(r.z), borderline: borderlineOf(r.z), equationId: r.equationId, matched: r.matched, fallbackReason: r.fallbackReason, ...extra,
    };
  };
  const sp = report.spirometry;
  add('fev1', 'fev1', sp.fev1);
  add('fvc', 'fvc', sp.fvc);
  if (sp.fev1 && sp.fvc) add('fev1_fvc', 'fev1_fvc', sp.fev1 / sp.fvc);
  const v = report.volumes;
  if (v) {
    add('tlc', 'tlc', v.tlc); add('rv', 'rv', v.rv); add('rv_tlc', 'rv_tlc', (100 * v.rv) / v.tlc);
    add('vc', 'vc', v.vc); add('frc', 'frc', v.frc); add('erv', 'erv', v.erv); add('ic', 'ic', v.ic);
  }
  const dl = report.dlco;
  if (dl) { add('dlco', 'dlco', dl.dlcoAdjusted); add('va', 'va', dl.va); add('kco', 'kco', dl.dlcoAdjusted / dl.va); }

  const m = measures;
  const low = (k) => m[k]?.available !== false && m[k]?.label === 'low';
  const have = (k) => m[k] && m[k].available !== false;
  const flags = [];

  // ------------- pattern -------------
  let pattern;
  if (!have('fev1') || !have('fvc')) pattern = 'indeterminate';
  else {
    const ratioLow = low('fev1_fvc');
    const spiroLow = low('fvc') || low('fev1');
    const tlcKnown = have('tlc');
    if (ratioLow) {
      if (tlcKnown) pattern = low('tlc') ? 'mixed' : 'obstruction';
      else pattern = low('fvc') ? 'obstruction-low-fvc' : 'obstruction';
    } else if (tlcKnown && low('tlc')) pattern = 'restriction';
    else if (spiroLow) pattern = tlcKnown ? 'nonspecific' : 'prism';
    else pattern = 'normal';
  }
  if (tlcFlag(m, 'tlc')) flags.push({ id: 'hyperinflation', text: 'TLC above the upper limit of normal (hyperinflation).', verification: 'definition unverified' });
  if ((have('rv') && m.rv.label === 'high') || (have('rv_tlc') && m.rv_tlc.label === 'high')) flags.push({ id: 'air-trapping', text: 'RV or RV/TLC above the upper limit of normal (air trapping).', verification: 'definition unverified' });
  if (have('erv') && low('erv')) flags.push({ id: 'low-erv', text: `Low ERV; BMI ${(patient.weightKg / (patient.heightCm / 100) ** 2).toFixed(1)} kg/m².`, verification: 'finding, not a pattern' });

  // ------------- severity -------------
  let severity = null;
  if (['obstruction', 'obstruction-low-fvc'].includes(pattern) && have('fev1')) {
    severity = { id: severityOf(m.fev1.z), basis: 'FEV1 z-score', z: m.fev1.z, scored: true, fev1WithinLimits: m.fev1.label !== 'low', verification: 'bands per secondary sources; boundary rule unresolved' };
  } else if (pattern !== 'normal' && pattern !== 'indeterminate') {
    severity = { id: null, basis: 'Not scored: the 2022 rule for this pattern has not been checked', scored: false, perMeasure: Object.fromEntries(['fev1', 'fvc', 'tlc'].filter(have).map((k) => [k, m[k].z >= LLN_Z ? 'within limits' : severityOf(m[k].z)])) };
  }

  // ------------- bronchodilator -------------
  let bd = null;
  if (sp.post && have('fev1') && have('fvc') && sp.post.fev1 && sp.post.fvc) {
    const dFev1 = sp.post.fev1 - sp.fev1, dFvc = sp.post.fvc - sp.fvc;
    const pctPred = { fev1: (100 * dFev1) / m.fev1.predicted, fvc: (100 * dFvc) / m.fvc.predicted };
    const pctBase = { fev1: (100 * dFev1) / sp.fev1, fvc: (100 * dFvc) / sp.fvc };
    const rule2022 = pctPred.fev1 > 10 || pctPred.fvc > 10;
    const rule2005 = (pctBase.fev1 >= 12 && dFev1 >= 0.2) || (pctBase.fvc >= 12 && dFvc >= 0.2);
    bd = {
      dFev1, dFvc, pctPred, pctBase,
      rule2022: { significant: rule2022, which: [pctPred.fev1 > 10 && 'FEV1', pctPred.fvc > 10 && 'FVC'].filter(Boolean), verification: 'threshold from secondary sources; inclusive or exclusive boundary unresolved' },
      rule2005: { significant: rule2005, which: [pctBase.fev1 >= 12 && dFev1 >= 0.2 && 'FEV1', pctBase.fvc >= 12 && dFvc >= 0.2 && 'FVC'].filter(Boolean) },
      rulesAgree: rule2022 === rule2005,
      postRatio: sp.post.fev1 / sp.post.fvc,
      discordant: (dFev1 > 0) !== (dFvc > 0) || Math.abs(pctPred.fvc - pctPred.fev1) > 8,
    };
  }

  // ------------- diffusing capacity -------------
  let dlco = null;
  if (have('dlco')) {
    const cat = m.dlco.label === 'low' ? 'reduced' : m.dlco.label === 'high' ? 'raised' : 'normal';
    let subtype = null;
    if (cat === 'reduced' && have('va') && have('kco')) {
      const vaLow = m.va.label === 'low', kcoLow = m.kco.label === 'low', kcoHigh = m.kco.label === 'high';
      subtype = vaLow && kcoLow ? 'both-low' : vaLow && kcoHigh ? 'low-va-high-kco' : vaLow ? 'low-va-normal-kco' : kcoLow ? 'low-kco-preserved-va' : 'low-dlco-only';
    }
    if (cat === 'normal' && have('va') && have('kco') && m.va.label === 'low' && m.kco.label === 'normal') subtype = 'normal-kco-at-low-va';
    dlco = { category: cat, severity: cat === 'reduced' ? severityOf(m.dlco.z) : null, severityVerification: 'unverified', subtype, vaOverTlc: have('tlc') && have('va') ? m.va.value / m.tlc.value : null };
  }

  const quality = report.grades ?? {};
  const limited = ['fev1', 'fvc'].some((k) => ['D', 'E', 'U', 'F'].includes(quality[k]));
  const key = {
    pattern,
    severity: severity?.scored ? severity.id : null,
    gradeFev1: quality.fev1 ?? null,
    gradeFvc: quality.fvc ?? null,
    bronchodilator: bd ? (bd.rule2022.significant ? 'significant' : 'not-significant') : null,
    dlco: dlco ? dlco.category : null,
  };
  // Scenario caveats the laboratory record supports (src/scenarios); absent for a plain case.
  if (report.caveatIds?.length) key.caveatIds = [...new Set(report.caveatIds)].sort();
  return { spirometryEquation, measures, pattern, patternLabel: PATTERNS[pattern], flags, severity, bd, dlco, qualityLimited: limited, key };
}

function tlcFlag(m, k) { return m[k] && m[k].available !== false && m[k].label === 'high'; }

/**
 * Compare the same report under two spirometry equations. Volumes and TLCO use the same
 * equations in both runs, so any change is attributable to the spirometry equation.
 */
export function compareEquations(report, resolve, a = 'GLI2012', b = 'GLIglobal') {
  const ia = interpret(report, resolve, a), ib = interpret(report, resolve, b);
  const changes = [];
  for (const k of ['fev1', 'fvc', 'fev1_fvc']) {
    const x = ia.measures[k], y = ib.measures[k];
    if (x && y && x.available !== false && y.available !== false && (x.label !== y.label)) changes.push({ measure: k, from: x.label, to: y.label, zA: x.z, zB: y.z });
  }
  const borderline = ['fev1', 'fvc', 'fev1_fvc'].filter((k) => ia.measures[k]?.borderline || ib.measures[k]?.borderline);
  return {
    a: ia, b: ib,
    labelChanges: changes,
    patternChanged: ia.pattern !== ib.pattern,
    severityChanged: (ia.severity?.id ?? null) !== (ib.severity?.id ?? null),
    bronchodilatorChanged: (ia.bd?.rule2022.significant ?? null) !== (ib.bd?.rule2022.significant ?? null),
    borderline,
  };
}
