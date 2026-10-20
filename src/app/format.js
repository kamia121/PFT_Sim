export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (x, dp = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(dp).replace('-', '−'));
export const signed = (x, dp = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(dp));

export const MEASURES = {
  fev1: { label: 'FEV₁', unit: 'L', dp: 2 },
  fvc: { label: 'FVC', unit: 'L', dp: 2 },
  fev1_fvc: { label: 'FEV₁/FVC', unit: 'ratio', dp: 3 },
  tlc: { label: 'TLC', unit: 'L', dp: 2 },
  rv: { label: 'RV', unit: 'L', dp: 2 },
  rv_tlc: { label: 'RV/TLC', unit: '%', dp: 1 },
  vc: { label: 'VC', unit: 'L', dp: 2 },
  frc: { label: 'FRC', unit: 'L', dp: 2 },
  erv: { label: 'ERV', unit: 'L', dp: 2 },
  ic: { label: 'IC', unit: 'L', dp: 2 },
  dlco: { label: 'DLCO, hemoglobin-adjusted', unit: 'mL/min/mmHg', dp: 1 },
  va: { label: 'VA', unit: 'L', dp: 2 },
  kco: { label: 'KCO', unit: 'mL/min/mmHg/L', dp: 2 },
};

export const EQUATION_NAMES = {
  GLI2012: 'GLI-2012',
  GLIglobal: 'GLI Global 2022',
  GLI2021vol: 'GLI-2021 volumes',
  GLI2017tlco: 'GLI-2017 TLCO',
};

/**
 * Case facts that several renderers read. They are kept here so that the learner page, the report,
 * the narrative and the quiz agree on what was and was not recorded.
 */

/** Hemoglobin was entered for the DLCO adjustment. A missing value is null, and null is not a low value. */
export const hbKnown = (dlco) => Boolean(dlco) && Number.isFinite(dlco.hbGdl);

/** Hemoglobin below 11 g/dL. False when the hemoglobin is missing. */
export const hbLow = (hb) => Number.isFinite(hb) && hb < 11;

/** Carboxyhemoglobin was measured by co-oximetry. Only then may its value appear anywhere. */
export const coHbMeasured = (scenario) => scenario?.coHbMeasured === true && Number.isFinite(scenario?.coHbPercent);

/** A raised carboxyhemoglobin exists in the case but was not measured (recent smoking, no co-oximetry). */
export const coHbUnmeasured = (scenario) => scenario?.coHbMeasured !== true && Number.isFinite(scenario?.coHbPercent) && scenario.coHbPercent > 0;

/** The patient declined to give sex, so the birth sex is not shown before the answers are checked. */
export const sexUndisclosed = (scenario) => scenario?.referenceSex?.birthDisclosed === false || (Array.isArray(scenario?.ids) && scenario.ids.includes('sex-not-recorded'));

/** The reference sex differs from the birth sex and the birth sex may be shown. */
export const showBirthSex = (scenario) => Boolean(scenario?.referenceSex) && scenario.referenceSex.birth !== scenario.referenceSex.used && !sexUndisclosed(scenario);
