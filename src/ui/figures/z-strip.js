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
 * Style 'ats' (render option `style: 'ats'`; the default style is unchanged): the graphic of the ATS 2017 sample report
 * (Culver et al., Figure 1) in the form docs/REPORT-FIRST-PLAN.md describes. One panel for the pre-bronchodilator values,
 * one for the post-bronchodilator values (when a study exists) and one for the lung-volume and DLCO indices, each with a
 * thin bar per index on the z-score axis -5 to +3. The bars are filled with a gradient whose colors are palette.zBand
 * (the --z-severe, --z-moderate, --z-mild and --z-ok tokens): red below -4.0, orange at -2.5, yellow at the LLN
 * (-1.645), pale green above. Thick dashed lines mark the predicted value (0) and the LLN, and for the two-sided indices
 * the ULN (+1.645). The result is a star with a halo; the z-score and the words within limits, below LLN or above ULN
 * stand beside the bar, and the severity bands are named in text above the axis, so nothing depends on the color. The
 * bands of the ERS/ATS 2022 statement apply to all measures, and severity of impairment is not necessarily disease
 * severity; the caption says so. The gradient is drawn as thin stripes (no url() paint server) so that the SVG stays
 * self-contained and passes the figure checks. `width` defaults to 744 (Letter text width in CSS px); below 600 the panels stack.
 *
 * caseData fields read by dataFor: interp (an interpretation object from interpret()), or report together with
 * resolve (the reference resolver) and optionally equation (default 'GLIglobal') to compute it.
 * `resolve` and `equation` may also come in the third argument. The second argument (the registry call of the
 * report model) is deliberately not read: the strip draws from `caseData.interp` as before, so a caller that wants
 * it passes `{ ...caseData, interp, resolve }`. Post-bronchodilator rows appear only when
 * `report.spirometry.post` exists and a resolver is available, because a post z-score is computed with the same equation as the pre values.
 */
import { interpret, LLN_Z, borderlineOf, TWO_SIDED } from '../../interpret/interpret.js';
import { wrapSvg, line, text, tickValues, resolvePalette, DASH, fix, r1 } from './svg.js';
import { starEl, starPoints, Z_AXIS } from './z-inline.js';

const { min: Z_MIN, max: Z_MAX } = Z_AXIS;
const ORDER = [
  ['fvc', 'FVC', 'spirometry'], ['fev1', 'FEV1', 'spirometry'], ['fev1_fvc', 'FEV1/FVC', 'spirometry'],
  ['tlc', 'TLC', 'volumes'], ['rv', 'RV', 'volumes'], ['rv_tlc', 'RV/TLC', 'volumes'],
  ['dlco', 'DLCO', 'dlco'], ['va', 'VA', 'dlco'], ['kco', 'KCO', 'dlco'],
];
const POST_IDS = new Set(['fvc', 'fev1', 'fev1_fvc']);
export { TWO_SIDED };
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
  if (opts.style === 'ats') return renderAts(data, opts);
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

/* ------------------------------------------------------------------------------------------ ATS 2017 style */

/** Severity boundaries of the ERS/ATS 2022 statement, in z-scores (they apply to all measures). */
export const Z_SEVERITY = { severe: -4.0, moderate: -2.5 };

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (c) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const mix = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => v + (B[i] - v) * t)); };

/**
 * Color of the gradient at a z-score: the severe color up to -4.0, a blend to the moderate color at -2.5, a blend to the mild
 * color at the LLN, and the within-limits color above it.
 * @param {number} z @param {{ severe: string, moderate: string, mild: string, ok: string }} band
 */
export function zBandColor(z, band, llnZ = LLN_Z) {
  if (z >= llnZ) return band.ok;
  if (z <= Z_SEVERITY.severe) return band.severe;
  if (z <= Z_SEVERITY.moderate) return mix(band.severe, band.moderate, (z - Z_SEVERITY.severe) / (Z_SEVERITY.moderate - Z_SEVERITY.severe));
  return mix(band.moderate, band.mild, (z - Z_SEVERITY.moderate) / (llnZ - Z_SEVERITY.moderate));
}

export const ATS_WORDS = { low: 'below LLN', high: 'above ULN', ok: 'within limits' };
export const atsWhere = (z, twoSided) => (z < LLN_Z ? 'low' : twoSided && z > -LLN_Z ? 'high' : 'ok');

/** Star with a halo: the halo (a thick stroke in the contrast color) separates it from every band color. */
function haloStar(cx, cy, outer, { fill, halo, hollow }) {
  const pts = starPoints(cx, cy, outer);
  return hollow
    ? `<polygon points="${pts}" fill="none" stroke="${halo}" stroke-width="3.4" stroke-linejoin="round"/><polygon points="${pts}" fill="none" stroke="${fill}" stroke-width="1.4" stroke-linejoin="round"/>`
    : `<polygon points="${pts}" fill="${halo}" stroke="${halo}" stroke-width="2.6" stroke-linejoin="round"/><polygon points="${pts}" fill="${fill}" stroke="${fill}" stroke-width="0.6" stroke-linejoin="round"/>`;
}

/** Panels of the graphic: pre (or the only spirometry set), post, and the volume and DLCO indices. */
export function atsPanels(data) {
  const sp = data.rows.filter((r) => r.section === 'spirometry');
  const rest = data.rows.filter((r) => r.section !== 'spirometry');
  const view = (r, s) => ({ id: r.id, label: r.label, z: s.z, twoSided: r.twoSided });
  const panels = [];
  if (sp.length) panels.push({ id: 'pre', title: data.hasPost ? 'Pre-bronchodilator' : 'Spirometry', rows: sp.map((r) => view(r, r)) });
  if (data.hasPost) panels.push({ id: 'post', title: 'Post-bronchodilator', rows: sp.filter((r) => r.post).map((r) => view(r, r.post)) });
  const vols = rest.filter((r) => r.section === 'volumes'), dl = rest.filter((r) => r.section === 'dlco');
  if (vols.length && dl.length && panels.length < 2) {
    panels.push({ id: 'volumes', title: 'Lung volumes', rows: vols.map((r) => view(r, r)) });
    panels.push({ id: 'dlco', title: 'Diffusing capacity', rows: dl.map((r) => view(r, r)) });
  } else if (rest.length) {
    panels.push({ id: 'other', title: vols.length && dl.length ? 'Lung volumes and DLCO' : vols.length ? 'Lung volumes' : 'Diffusing capacity', rows: rest.map((r) => view(r, r)) });
  }
  return panels;
}

function renderAts(data, opts = {}) {
  const palette = resolvePalette(opts.palette);
  const band = palette.zBand ?? { severe: '#C8553D', moderate: '#E8A04C', mild: '#F2D95C', ok: '#CFE8CC' };
  const alpha = palette.zBandAlpha ?? 1;
  const star = palette.zStar ?? { fill: palette.text, halo: palette.background ?? '#FFFFFF' };
  const W = opts.width ?? 744;
  const llnZ = data.llnZ ?? LLN_Z;
  const panels = atsPanels(data);
  const FS = 9.3, FS_S = 8.2, ROW = 14, BAR = 8;
  const LW = 44, TW = 80, GUT = 12;
  const side = W >= 600;
  const pw = side ? Math.min(372, (W - GUT * (panels.length - 1)) / Math.max(panels.length, 1)) : W;
  const barsTop = 35, below = 44;
  const nRowsMax = Math.max(...panels.map((p) => p.rows.length), 1);
  let g = '';
  let yNext = 4, bottomMost = 4;

  panels.forEach((p, k) => {
    const x0 = side ? k * (pw + GUT) : 0;
    const y0 = side ? 4 : yNext;
    const bx = x0 + LW, bw = pw - LW - TW - 6;
    const sx = (z) => bx + ((z - Z_MIN) / (Z_MAX - Z_MIN)) * bw;
    const top = y0 + barsTop, bottom = top + p.rows.length * ROW;
    const yc = (i) => top + ROW * (i + 0.5);
    g += text(x0, y0 + 9, p.title, { palette, size: 10.4, weight: 700 });
    // Band names in text above the axis, on two levels so that the narrow bands do not collide.
    const lab = (z, s, lvl, anchor = 'middle') => text(sx(z), y0 + 19 + lvl * 9, s, { palette, size: FS_S, anchor });
    g += lab(Z_MIN, 'severe', 0, 'start');
    g += lab((Z_SEVERITY.severe + Z_SEVERITY.moderate) / 2, 'moderate', 1);
    g += lab((Z_SEVERITY.moderate + llnZ) / 2, 'mild', 0);
    // Above the LLN the result is not reduced, which holds for every index; "within limits" is the reading between the LLN and the ULN of
    // an index read on both sides, so the band over the whole green area is not named that, and the area beyond the ULN carries its own name.
    g += lab((llnZ + Z_MAX) / 2, 'not reduced', 1);
    if (p.rows.some((r) => r.twoSided)) g += lab((-llnZ + Z_MAX) / 2, 'above ULN', 0);
    for (const z of [Z_SEVERITY.severe, Z_SEVERITY.moderate, llnZ]) g += line(sx(z), top - 5, sx(z), top - 1, { stroke: palette.axis, width: 0.8 });
    // Gradient bars as stripes: one path per color, all rows of the panel in it.
    const barRects = (xa, xb) => p.rows.map((_, i) => `M${r1(xa)} ${r1(yc(i) - BAR / 2)}h${r1(xb - xa)}v${BAR}h${r1(xa - xb)}z`).join('');
    const nStripe = Math.max(16, Math.min(72, Math.round((sx(llnZ) - sx(Z_MIN)) / 1.3)));
    const fillAttr = (c) => `fill="${c}"${alpha < 1 ? ` fill-opacity="${alpha}"` : ''}`;
    let stripes = '';
    for (let i = 0; i < nStripe; i++) {
      const za = Z_MIN + ((llnZ - Z_MIN) * i) / nStripe, zb = Z_MIN + ((llnZ - Z_MIN) * (i + 1)) / nStripe;
      const over = alpha < 1 || i === nStripe - 1 ? 0 : 0.35;
      stripes += `<path d="${barRects(sx(za), sx(zb) + over)}" ${fillAttr(zBandColor((za + zb) / 2, band, llnZ))}/>`;
    }
    stripes += `<path d="${barRects(sx(llnZ), sx(Z_MAX))}" ${fillAttr(band.ok)}/>`;
    g += `<g shape-rendering="crispEdges">${stripes}</g>`;
    p.rows.forEach((_, i) => { g += `<rect x="${r1(bx)}" y="${r1(yc(i) - BAR / 2)}" width="${r1(bw)}" height="${BAR}" fill="none" stroke="${palette.axis}" stroke-width="0.5"/>`; });
    // Reference lines: predicted and LLN through the panel, ULN through the runs of two-sided rows.
    g += line(sx(0), top - 2, sx(0), bottom + 2, { stroke: star.fill, width: 1.9, dash: '6 2.5' });
    g += line(sx(llnZ), top - 2, sx(llnZ), bottom + 2, { stroke: star.fill, width: 1.9, dash: '1.6 2' });
    let runStart = null;
    const flush = (end) => { if (runStart !== null) { g += line(sx(-llnZ), top + runStart * ROW - 2, sx(-llnZ), top + end * ROW + 2, { stroke: star.fill, width: 1.9, dash: '1.6 2' }); runStart = null; } };
    p.rows.forEach((r, i) => { if (r.twoSided) { if (runStart === null) runStart = i; } else flush(i); });
    flush(p.rows.length);
    // Axis, ticks and the names of the reference lines.
    g += line(bx, bottom + 3, bx + bw, bottom + 3, { stroke: palette.axis, width: 0.8 });
    for (const z of tickValues(Z_MIN, Z_MAX, 1)) {
      g += line(sx(z), bottom + 3, sx(z), bottom + 6, { stroke: palette.axis, width: 0.8 });
      g += text(sx(z), bottom + 15, fix(z, 0), { palette, anchor: 'middle', size: FS_S, fill: palette.axis });
    }
    g += text(sx(llnZ), bottom + 25, 'LLN', { palette, anchor: 'middle', size: FS_S, weight: 600 });
    g += text(sx(0), bottom + 34, 'predicted', { palette, anchor: 'middle', size: FS_S, weight: 600 });
    if (p.rows.some((r) => r.twoSided)) g += text(sx(-llnZ), bottom + 25, 'ULN', { palette, anchor: 'middle', size: FS_S, weight: 600 });
    g += text(bx + bw + 4, bottom + 15, 'z', { palette, size: FS_S, fill: palette.axis, italic: true });
    // Rows: index name, star, z-score and words.
    p.rows.forEach((r, i) => {
      const cy = yc(i);
      g += text(x0, cy + 3.2, r.label, { palette, size: FS, weight: 600 });
      const off = r.z < Z_MIN || r.z > Z_MAX;
      g += haloStar(sx(Math.min(Math.max(r.z, Z_MIN), Z_MAX)), cy, 5.2, { fill: star.fill, halo: star.halo, hollow: off });
      g += text(bx + bw + 8, cy + 3.2, fix(r.z, 2), { palette, size: FS, weight: 700 });
      g += text(bx + bw + 8 + 27, cy + 3.2, ATS_WORDS[atsWhere(r.z, r.twoSided)], { palette, size: FS_S });
    });
    const used = barsTop + p.rows.length * ROW + below;
    yNext = y0 + used;
    bottomMost = Math.max(bottomMost, side ? 4 + barsTop + nRowsMax * ROW + below : yNext);
  });

  const twoSided = data.rows.some((r) => r.twoSided);
  const caps = [`Bands apply to all measures: severe, z below ${fix(Z_SEVERITY.severe, 1)}; moderate, ${fix(Z_SEVERITY.severe, 1)} to ${fix(Z_SEVERITY.moderate, 1)}; mild, ${fix(Z_SEVERITY.moderate, 1)} to the LLN (${fix(llnZ, 3)}); not reduced above the LLN. The star marks the result.`,
    ...(twoSided ? [`For the indices read on both sides, within limits means between the LLN and the ULN (+${fix(-llnZ, 3)}); a value above the ULN is marked above ULN and is not graded by severity. For the other indices, within limits means at or above the LLN.`] : []),
    'Severity of impairment is not necessarily disease severity.'];
  const maxChars = Math.floor(W / 3.9);
  const capLines = [];
  for (const cap of caps) {
    let cur = null;
    for (const word of cap.split(' ')) { if (cur !== null && (cur + ' ' + word).length <= maxChars) cur = `${cur} ${word}`; else { if (cur !== null) capLines.push(cur); cur = word; } }
    if (cur !== null) capLines.push(cur);
  }
  const cy = bottomMost + 6;
  capLines.forEach((l, i) => { g += text(0, cy + i * 10, l, { palette, size: FS_S }); });
  const height = Math.round(cy + capLines.length * 10 + 2);

  const desc = opts.description ?? `${panels.map((p) => `${p.title}: ${p.rows.map((r) => `${r.label} z ${fix(r.z, 2)}, ${ATS_WORDS[atsWhere(r.z, r.twoSided)]}${r.z < Z_MIN || r.z > Z_MAX ? ' (off scale)' : ''}`).join('; ')}.`).join(' ')} Axis from ${Z_MIN} to ${Z_MAX}; gradient bars with the lower limit of normal at ${llnZ}, the predicted value at 0 and, for the two-sided indices, the upper limit at +1.645, above which a value is marked above ULN and is not graded by severity.`;
  return wrapSvg({ palette, width: W, height: opts.height ?? height, title: opts.title ?? 'Z-score graphic', description: desc, body: g });
}

export default { id: 'z-strip', title: 'Z-score strip', render, dataFor };
