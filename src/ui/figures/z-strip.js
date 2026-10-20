/**
 * Z-score strip (ATS 2017 standardized report): one horizontal axis per index from about -5 to +3, a line at
 * the lower limit of normal (z = -1.645, dotted) and at the predicted value (z = 0, dashed), and a large marker
 * at the z-score. Nothing is shaded and no red or green is used; the position relative to the limit is stated
 * in text only. A z-score outside the axis is drawn at the edge with a hollow marker and its value in the label.
 *
 * caseData fields read by dataFor: interp (an interpretation object from interpret()), or report together with
 * resolve (the reference resolver) and optionally equation (default 'GLIglobal') to compute it.
 */
import { interpret, LLN_Z } from '../../interpret/interpret.js';
import { wrapSvg, line, text, tickValues, resolvePalette, DASH, fix, r1 } from './svg.js';

const Z_MIN = -5, Z_MAX = 3;
const ORDER = [
  ['fvc', 'FVC'], ['fev1', 'FEV1'], ['fev1_fvc', 'FEV1/FVC'],
  ['tlc', 'TLC'], ['dlco', 'DLCO'], ['va', 'VA'], ['kco', 'KCO'],
];
const EQUATION = { GLI2012: 'GLI-2012', GLIglobal: 'GLI Global', GLI2021vol: 'GLI-2021 volumes', GLI2017tlco: 'GLI-2017 TLCO' };

function dataFor(c) {
  let interp = c?.interp ?? null;
  if (!interp && c?.report && typeof c.resolve === 'function') interp = interpret(c.report, c.resolve, c.equation ?? 'GLIglobal');
  if (!interp?.measures) return null;
  const rows = [];
  for (const [id, label] of ORDER) {
    const m = interp.measures[id];
    if (!m || m.available === false || !Number.isFinite(m.z)) continue;
    rows.push({ id, label, z: m.z, below: m.z < LLN_Z, borderline: !!m.borderline, equation: EQUATION[m.equationId] ?? m.equationId ?? '' });
  }
  return rows.length ? { rows, llnZ: LLN_Z } : null;
}

function render(data, opts = {}) {
  const palette = resolvePalette(opts.palette);
  const n = data.rows.length;
  const W = opts.width ?? 640;
  const rowH = 40;
  const H = opts.height ?? 36 + n * rowH + 44;
  const m = { l: 92, r: 172, t: 26, b: 40 };
  const pw = W - m.l - m.r;
  const sx = (z) => m.l + ((z - Z_MIN) / (Z_MAX - Z_MIN)) * pw;
  const rowsH = H - m.t - m.b;
  const rh = rowsH / n;
  let g = '';

  // Axis ticks and the two reference lines run through every row.
  for (const z of tickValues(Z_MIN, Z_MAX, 1)) {
    g += line(sx(z), m.t, sx(z), H - m.b, { stroke: palette.grid, width: 1 });
    g += text(sx(z), H - m.b + 16, fix(z, 0), { palette, anchor: 'middle', size: 12, fill: palette.axis });
  }
  g += line(sx(0), m.t - 4, sx(0), H - m.b, { stroke: palette.predicted, width: 2, dash: DASH.predicted });
  g += line(sx(data.llnZ), m.t - 4, sx(data.llnZ), H - m.b, { stroke: palette.lln, width: 2, dash: DASH.lln });
  g += text(sx(0), m.t - 9, 'Predicted', { palette, anchor: 'middle', size: 12, fill: palette.predicted });
  g += text(sx(data.llnZ), m.t - 9, 'LLN −1.645', { palette, anchor: 'middle', size: 12, fill: palette.lln });
  g += text(sx((Z_MIN + Z_MAX) / 2), H - 6, 'z-score', { palette, anchor: 'middle', size: 13, fill: palette.axis });
  g += line(m.l, H - m.b, W - m.r, H - m.b, { stroke: palette.axis, width: 1.2 });

  data.rows.forEach((r, i) => {
    const cy = m.t + rh * (i + 0.5);
    g += line(m.l, cy, W - m.r, cy, { stroke: palette.axis, width: 1 });
    g += text(m.l - 10, cy + 4, r.label, { palette, anchor: 'end', size: 14 });
    const off = r.z < Z_MIN || r.z > Z_MAX;
    const zc = Math.min(Math.max(r.z, Z_MIN), Z_MAX);
    if (off) g += `<circle cx="${r1(sx(zc))}" cy="${r1(cy)}" r="7" fill="none" stroke="${palette.measured}" stroke-width="2.5"/>`;
    else g += `<circle cx="${r1(sx(zc))}" cy="${r1(cy)}" r="7.5" fill="${palette.measured}"/>`;
    const where = r.below ? 'below LLN' : r.z > -data.llnZ ? 'above ULN' : 'within limits';
    g += text(W - m.r + 12, cy - 1, `z ${fix(r.z, 2)}${off ? ' (off scale)' : ''}`, { palette, size: 13, weight: 600 });
    g += text(W - m.r + 12, cy + 14, `${where}${r.borderline ? ', borderline' : ''}`, { palette, size: 12, fill: palette.axis });
  });

  const eqs = [...new Set(data.rows.map((r) => r.equation).filter(Boolean))].join('; ');
  const title = opts.title ?? 'Z-score strip';
  const description = opts.description ?? `Z-scores for ${data.rows.map((r) => r.label).join(', ')} on an axis from ${Z_MIN} to ${Z_MAX}, with the lower limit of normal at ${data.llnZ} and the predicted value at 0.${eqs ? ` Reference equations: ${eqs}.` : ''}`;
  return wrapSvg({ palette, width: W, height: H, title, description, body: g });
}

export default { id: 'z-strip', title: 'Z-score strip', render, dataFor };
