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
