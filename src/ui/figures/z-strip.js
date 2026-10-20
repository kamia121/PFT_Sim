/**
 * Z-score strip (ATS 2017 standardized report): one horizontal axis per index from -5 to +3 with a line at the
 * lower limit of normal (z = -1.645, dotted) and at the predicted value (z = 0, dashed), and a large star at the
 * z-score. The star is deliberately large: it signals that a result near the limit is uncertain. Nothing is
 * shaded and no flag color is used; the position relative to the limits is stated in text only.
 *
 * - Two-sided indices (TLC, RV, RV/TLC, DLCO, KCO) also carry a line at the upper limit of normal (z = +1.645).
 *   The set follows src/interpret/interpret.js, which reads a high value only for these: TLC above the ULN
 *   (hyperinflation), RV or RV/TLC above the ULN (air trapping), a raised DLCO and a high KCO in the VA-KCO
 *   subtype. FVC, FEV1, FEV1/FVC and VA are read on the lower side only, so they have no ULN line.
 * - When the case has a post-bronchodilator study, FVC, FEV1 and FEV1/FVC are drawn as two stacked rows, pre
 *   (series color `measured`) above post (`second`), as in the ATS 2017 sample. The post z-scores need the
 *   reference resolver; see dataFor.
 * - A z-score outside the axis is drawn at the edge as a hollow star, with its value in the text column.
 *
 * caseData fields read by dataFor: interp (an interpretation object from interpret()), or report together with
 * resolve (the reference resolver) and optionally equation (default 'GLIglobal') to compute it.
 * `resolve` and `equation` may also come in the third argument. The second argument (the registry call of the
 * report model) is deliberately not read: the strip draws from `caseData.interp` as before, so a caller that wants
 * it passes `{ ...caseData, interp, resolve }`. Post-bronchodilator rows appear only when
 * `report.spirometry.post` exists and a resolver is available, because a post z-score is computed with the same equation as the pre values.
 */
import { interpret, LLN_Z, borderlineOf } from '../../interpret/interpret.js';
import { wrapSvg, line, text, tickValues, resolvePalette, DASH, fix } from './svg.js';
import { starEl, Z_AXIS } from './z-inline.js';

const { min: Z_MIN, max: Z_MAX } = Z_AXIS;
const ORDER = [
  ['fvc', 'FVC', 'spirometry'], ['fev1', 'FEV1', 'spirometry'], ['fev1_fvc', 'FEV1/FVC', 'spirometry'],
  ['tlc', 'TLC', 'volumes'], ['rv', 'RV', 'volumes'], ['rv_tlc', 'RV/TLC', 'volumes'],
  ['dlco', 'DLCO', 'dlco'], ['va', 'VA', 'dlco'], ['kco', 'KCO', 'dlco'],
];
const POST_IDS = new Set(['fvc', 'fev1', 'fev1_fvc']);
/** Indices read on both sides by the interpretation engine. */
export const TWO_SIDED = new Set(['tlc', 'rv', 'rv_tlc', 'dlco', 'kco']);
const EQUATION = { GLI2012: 'GLI-2012', GLIglobal: 'GLI Global', GLI2021vol: 'GLI-2021 volumes', GLI2017tlco: 'GLI-2017 TLCO' };

function dataFor(c, _interp, opts = {}) {
  let interp = c?.interp ?? null;
  const resolve = c?.resolve ?? opts?.resolve ?? null;
  if (!interp && c?.report && typeof resolve === 'function') interp = interpret(c.report, resolve, c.equation ?? opts?.equation ?? 'GLIglobal');
  if (!interp?.measures) return null;
  const equation = interp.spirometryEquation ?? c?.equation ?? opts?.equation ?? 'GLIglobal';
  const post = c?.report?.spirometry?.post;
  const patient = c?.report?.patient;
  const canPost = Boolean(post && post.fev1 > 0 && post.fvc > 0 && patient && typeof resolve === 'function');
  const rows = [];
  for (const [id, label, section] of ORDER) {
    const m = interp.measures[id];
    if (!m || m.available === false || !Number.isFinite(m.z)) continue;
    const row = { id, label, section, z: m.z, below: m.z < LLN_Z, borderline: !!m.borderline, twoSided: TWO_SIDED.has(id), equation: EQUATION[m.equationId] ?? m.equationId ?? '' };
    if (canPost && POST_IDS.has(id)) {
      const measured = id === 'fev1_fvc' ? post.fev1 / post.fvc : post[id];
      const r = resolve(id, { ...patient, measured }, equation);
      if (r?.available && Number.isFinite(r.z)) row.post = { z: r.z, below: r.z < LLN_Z, borderline: borderlineOf(r.z) };
    }
    rows.push(row);
  }
  return rows.length ? { rows, llnZ: LLN_Z, hasPost: rows.some((r) => r.post) } : null;
}

const where = (z, twoSided) => (z < LLN_Z ? 'below LLN' : twoSided && z > -LLN_Z ? 'above ULN' : 'within limits');

function render(data, opts = {}) {
  const palette = resolvePalette(opts.palette);
  const W = opts.width ?? 672;
  const m = { l: 104, r: 208, t: 32, b: 40 };
  const pw = W - m.l - m.r;
  const sx = (z) => m.l + ((z - Z_MIN) / (Z_MAX - Z_MIN)) * pw;
  const llnZ = data.llnZ ?? LLN_Z;

  // Row geometry: a group is one index (one sub-row, or two when pre and post are stacked).
  const GAP_SAME = 4, GAP_SECTION = 12;
  const groups = data.rows.map((r, i) => ({ r, k: r.post ? 2 : 1, newSection: i > 0 && data.rows[i - 1].section !== r.section }));
  const nSub = groups.reduce((s, g) => s + g.k, 0);
  const gaps = groups.reduce((s, g, i) => s + (i === 0 ? 0 : g.newSection ? GAP_SECTION : GAP_SAME), 0);
  const subH0 = 24;
  const H = opts.height ?? Math.round(m.t + nSub * subH0 + gaps + m.b);
  const subH = Math.max(14, (H - m.t - m.b - gaps) / nSub);
  let y = m.t;
  for (const g of groups) { if (g.newSection) y += GAP_SECTION; else if (g !== groups[0]) y += GAP_SAME; g.y0 = y; g.y1 = y + g.k * subH; y = g.y1; }
  const bottom = y;
  const star = Math.min(8.5, subH * 0.42);
  let g = '';

  // Axis ticks, then the predicted and lower-limit lines through every row.
  for (const z of tickValues(Z_MIN, Z_MAX, 1)) {
    g += line(sx(z), m.t, sx(z), bottom, { stroke: palette.grid, width: 1 });
    g += text(sx(z), bottom + 16, fix(z, 0), { palette, anchor: 'middle', size: 11, fill: palette.axis });
  }
  g += line(sx(0), m.t - 5, sx(0), bottom, { stroke: palette.predicted, width: 1.8, dash: DASH.predicted });
  g += line(sx(llnZ), m.t - 5, sx(llnZ), bottom, { stroke: palette.lln, width: 1.8, dash: DASH.lln });
  g += text(sx(0), m.t - 10, 'Predicted', { palette, anchor: 'middle', size: 11, fill: palette.predicted });
  g += text(sx(llnZ), m.t - 10, 'LLN −1.645', { palette, anchor: 'middle', size: 11, fill: palette.lln });

  // The upper limit runs only through the rows of two-sided indices.
  let run = null;
  const flushRun = () => { if (run) { g += line(sx(-llnZ), run[0], sx(-llnZ), run[1], { stroke: palette.lln, width: 1.8, dash: DASH.lln }); run = null; } };
  for (const grp of groups) {
    if (grp.r.twoSided) run = run ? [run[0], grp.y1] : [grp.y0, grp.y1];
    else flushRun();
  }
  flushRun();
  if (groups.some((x) => x.r.twoSided)) g += text(sx(-llnZ), m.t - 10, 'ULN +1.645', { palette, anchor: 'middle', size: 11, fill: palette.lln });
  g += text(W - m.r + 12, bottom + 16, 'z-score', { palette, size: 11, fill: palette.axis });
  g += line(m.l, bottom, W - m.r, bottom, { stroke: palette.axis, width: 1.2 });

  for (const grp of groups) {
    const { r } = grp;
    g += text(8, (grp.y0 + grp.y1) / 2 + 4, r.label, { palette, size: 12, weight: 600 });
    const sets = r.post ? [['pre', r, palette.measured], ['post', r.post, palette.second]] : [[null, r, palette.measured]];
    sets.forEach(([tag, s, color], j) => {
      const cy = grp.y0 + subH * (j + 0.5);
      g += line(m.l, cy, W - m.r, cy, { stroke: palette.axis, width: 0.8 });
      if (tag) g += text(m.l - 8, cy + 3.5, tag, { palette, anchor: 'end', size: 10.5, fill: palette.axis });
      const off = s.z < Z_MIN || s.z > Z_MAX;
      g += starEl(sx(Math.min(Math.max(s.z, Z_MIN), Z_MAX)), cy, star, color, { hollow: off });
      g += text(W - m.r + 12, cy + 4, `z ${fix(s.z, 2)}`, { palette, size: 11.5, weight: 600 });
      g += text(W - m.r + 64, cy + 4, `${where(s.z, r.twoSided)}${s.borderline ? ', borderline' : ''}${off ? ' (off scale)' : ''}`, { palette, size: 10.5, fill: palette.axis });
    });
  }

  if (data.hasPost) {
    g += starEl(m.l + 8, H - 10, 5.5, palette.measured);
    g += text(m.l + 18, H - 6, 'pre-bronchodilator', { palette, size: 10.5, fill: palette.axis });
    g += starEl(m.l + 130, H - 10, 5.5, palette.second);
    g += text(m.l + 140, H - 6, 'post-bronchodilator', { palette, size: 10.5, fill: palette.axis });
  }

  const eqs = [...new Set(data.rows.map((r) => r.equation).filter(Boolean))].join('; ');
  const title = opts.title ?? 'Z-score strip';
  const sides = data.rows.filter((r) => r.twoSided).map((r) => r.label);
  const description = opts.description ?? `Z-scores for ${data.rows.map((r) => r.label).join(', ')} on an axis from ${Z_MIN} to ${Z_MAX}, each marked by a star, with the lower limit of normal at ${llnZ} and the predicted value at 0.${sides.length ? ` The upper limit of normal at +1.645 is drawn for ${sides.join(', ')}.` : ''}${data.hasPost ? ' Pre- and post-bronchodilator values are stacked for FVC, FEV1 and FEV1/FVC.' : ''}${eqs ? ` Reference equations: ${eqs}.` : ''}`;
  return wrapSvg({ palette, width: W, height: H, title, description, body: g });
}

export default { id: 'z-strip', title: 'Z-score strip', render, dataFor };
