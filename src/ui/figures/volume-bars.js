/**
 * Partition bars of the lung volumes (ATS/ERS 2017 standardized report, Fig 2): residual volume, expiratory
 * reserve volume and inspiratory capacity stacked, measured beside predicted. On the predicted bar the range of total
 * lung capacity from its lower to its upper limit of normal and the upper limit of RV are marked. There is no stacked
 * bar for the lower limit of normal, because the lower limits of RV, ERV and IC do not add up to a lower limit of TLC.
 *
 * Series color encodes the quantity (RV, ERV, IC); the relation is encoded by fill and outline (measured: solid fill; predicted:
 * light fill with a dashed outline; limits: dotted). Colors come from the palette only.
 *
 * Export: `volumeBars(data, { palette, width, height })` returns `{ svg, width, height }`, where `svg` is a `<g>` fragment drawn
 * in its own coordinates (0, 0 to width, height) for placement inside a larger figure. `volumeBarsData(caseData, interp)` builds `data`.
 */
import { PALETTES } from '../palettes.js';
import { text, line, rect, scale, niceTicks, num } from './fig-a-kit.js';

const EQUATIONS = { GLI2021vol: 'GLI-2021 volumes', GLI2017tlco: 'GLI-2017 TLCO', GLIglobal: 'GLI Global', GLI2012: 'GLI-2012', NHANES3: 'NHANES III' };

/**
 * @typedef {object} VolumeBarsData
 * @property {{ rv: number, erv: number, ic: number }} measured liters
 * @property {{ rv: number, erv: number, ic: number }|null} predicted liters; null when a component has no reference value
 * @property {{ pred: number|null, lln: number, uln: number }|null} tlc reference values of total lung capacity
 * @property {number|null} rvUln upper limit of normal of RV, L
 * @property {string} equation name of the reference equation
 * @property {string} note fallback statement for the reference population, empty when the equation matches the patient
 */

/**
 * @param {object|null} caseData case with `volumes` (or `pleth.suggestedVolumes`)
 * @param {object|null} [interp] interpretation object from interpret(); without it the bars show the measured values only
 * @returns {VolumeBarsData|null}
 */
export function volumeBarsData(caseData, interp = null) {
  const v = caseData?.pleth?.suggestedVolumes ?? caseData?.volumes ?? null;
  if (!v || !(v.rv > 0) || !(v.erv > 0) || !(v.ic > 0)) return null;
  const m = (interp ?? caseData?.interp)?.measures ?? {};
  const ok = (k) => m[k] && m[k].available !== false && Number.isFinite(m[k].predicted);
  const predicted = ok('rv') && ok('erv') && ok('ic') ? { rv: m.rv.predicted, erv: m.erv.predicted, ic: m.ic.predicted } : null;
  const tlc = ok('tlc') && Number.isFinite(m.tlc.lln) && Number.isFinite(m.tlc.uln) ? { pred: m.tlc.predicted, lln: m.tlc.lln, uln: m.tlc.uln } : null;
  const rvUln = ok('rv') && Number.isFinite(m.rv.uln) ? m.rv.uln : null;
  const eq = m.tlc?.equationId ?? m.rv?.equationId;
  const matched = (m.tlc ?? m.rv)?.matched;
  return {
    measured: { rv: v.rv, erv: v.erv, ic: v.ic }, predicted, tlc, rvUln,
    equation: eq ? (EQUATIONS[eq] ?? eq) : '',
    note: matched === false ? 'reference population of European ancestry' : '',
  };
}

const niceTop = (x) => { const t = niceTicks(0, x * 1.04, 4); return t[t.length - 1] >= x ? t[t.length - 1] : t[t.length - 1] + (t[1] - t[0]); };

/**
 * @param {VolumeBarsData} data
 * @param {{ palette?: object, width?: number, height?: number }} [opts]
 * @returns {{ svg: string, width: number, height: number }}
 */
export function volumeBars(data, { palette = PALETTES.dark, width = 322, height = 214 } = {}) {
  if (!data?.measured) return { svg: '', width, height };
  const P = palette;
  const parts = [];
  const x0 = 40, top = 6, bottom = height - 46, plotH = bottom - top;
  const meas = data.measured, pred = data.predicted;
  const sum = (b) => b.rv + b.erv + b.ic;
  const dataMax = Math.max(sum(meas), pred ? sum(pred) : 0, data.tlc?.uln ?? 0);
  const yMax = niceTop(dataMax);
  const ys = scale(0, yMax, bottom, top);
  const ticks = niceTicks(0, yMax, 4);
  for (const t of ticks) {
    parts.push(line(x0, ys(t), width - 4, ys(t), { stroke: P.grid, width: 1 }));
    parts.push(text(x0 - 5, ys(t) + 3.5, num(t, t % 1 ? 1 : 0), { size: 9.5, anchor: 'end', fill: P.axis }));
  }
  parts.push(line(x0, top, x0, bottom, { stroke: P.axis, width: 1 }));
  parts.push(line(x0, bottom, width - 4, bottom, { stroke: P.axis, width: 1 }));
  parts.push(text(11, (top + bottom) / 2, 'Volume (L)', { size: 10.5, anchor: 'middle', fill: P.text, rotate: -90 }));

  const bw = 70;
  const xm = x0 + 12, xp = xm + bw + 30;
  const stack = (b, x, predictedBar) => {
    let base = 0;
    const out = [];
    for (const [key, name, color] of [['rv', 'RV', P.measured], ['erv', 'ERV', P.second], ['ic', 'IC', P.third]]) {
      const y1 = ys(base + b[key]), y2 = ys(base);
      const mid = (y1 + y2) / 2;
      if (predictedBar) {
        // relation: predicted = light fill and a dashed outline
        out.push(rect(x, y1, bw, y2 - y1, { fill: color, opacity: 0.16 }));
        out.push(`<rect x="${Math.round(x * 100) / 100}" y="${Math.round(y1 * 100) / 100}" width="${bw}" height="${Math.round((y2 - y1) * 100) / 100}" fill="none" stroke="${color}" stroke-width="1.4" stroke-dasharray="5 3"/>`);
      } else {
        out.push(rect(x, y1, bw, y2 - y1, { fill: color, opacity: 0.55, stroke: color, width: 1.2 }));
      }
      if (y2 - y1 >= 13) out.push(text(x + 6, mid + 3.5, `${name} ${num(b[key], 2)}`, { size: 9.5, weight: 600, fill: P.text }));
      base += b[key];
    }
    return out.join('');
  };
  parts.push(stack(meas, xm, false));
  parts.push(text(xm + bw / 2, bottom + 14, 'Measured', { size: 10.5, anchor: 'middle', fill: P.text }));
  parts.push(text(xm + bw / 2, ys(sum(meas)) - 4, `TLC ${num(sum(meas), 2)}`, { size: 9.5, anchor: 'middle', fill: P.text }));
  if (pred) {
    parts.push(stack(pred, xp, true));
    parts.push(text(xp + bw / 2, bottom + 14, 'Predicted', { size: 10.5, anchor: 'middle', fill: P.text }));
  } else {
    parts.push(text(xp + bw / 2, (top + bottom) / 2, 'no reference', { size: 9.5, anchor: 'middle', fill: P.axis }));
    parts.push(text(xp + bw / 2, (top + bottom) / 2 + 12, 'values', { size: 9.5, anchor: 'middle', fill: P.axis }));
  }
  if (data.equation) parts.push(text(x0, bottom + 28, `Predicted: ${data.equation}`, { size: 9.5, fill: P.axis }));
  if (data.note) parts.push(text(x0, bottom + 39, data.note, { size: 9.5, fill: P.axis }));

  // TLC range (lower to upper limit of normal) beside the predicted bar, and the RV upper limit across it.
  const xr = xp + bw + 12;
  if (data.tlc) {
    const yl = ys(data.tlc.lln), yu = ys(data.tlc.uln);
    parts.push(line(xr, yu, xr, yl, { stroke: P.lln, width: 1.3 }));
    parts.push(line(xr - 4, yu, xr + 4, yu, { stroke: P.lln, width: 1.3 }));
    parts.push(line(xr - 4, yl, xr + 4, yl, { stroke: P.lln, width: 1.3 }));
    parts.push(text(xr + 8, yu + 3.5, `TLC ULN ${num(data.tlc.uln, 2)}`, { size: 9.5, fill: P.text }));
    parts.push(text(xr + 8, yl + 3.5, `TLC LLN ${num(data.tlc.lln, 2)}`, { size: 9.5, fill: P.text }));
  }
  if (data.rvUln !== null && data.rvUln !== undefined && pred) {
    const y = ys(data.rvUln);
    parts.push(line(xp + bw - 14, y, xp + bw + 6, y, { stroke: P.lln, width: 1.6 }));
    parts.push(text(xr + 8, y + 3.5, `RV ULN ${num(data.rvUln, 2)}`, { size: 9.5, fill: P.text }));
  }
  return { svg: `<g data-volume-bars="">${parts.join('')}</g>`, width, height };
}
