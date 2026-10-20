/**
 * SVG figures for the report. All colors come from CSS variables defined in src/styles/tokens.css,
 * so the figures follow the light and dark themes. Series color encodes the quantity or equation;
 * dash style encodes the relation: measured (solid), predicted (dashed), lower limit of normal (dotted).
 *
 * Both figures are drawn from the same curve functions that produce the tabulated values.
 */
import { volume, flow, backExtrapolation, peakFlow, sampleCurve } from '../core/curve.js';

const W = 640, H = 360;
const M = { l: 58, r: 18, t: 18, b: 46 };
const PW = W - M.l - M.r, PH = H - M.t - M.b;

const fmt = (x) => (Math.round(x * 100) / 100).toString();

function niceMax(x) {
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const mag = Math.pow(10, Math.floor(Math.log10(x)));
  for (const s of steps) if (s * mag >= x) return s * mag;
  return 10 * mag;
}

function ticks(max, n = 5) {
  const raw = max / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw);
  const out = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function frame(xMax, yMax, xLabel, yLabel, xTicks, yTicks) {
  const sx = (x) => M.l + (x / xMax) * PW;
  const sy = (y) => M.t + PH - (y / yMax) * PH;
  let g = `<rect class="fig-bg" x="0" y="0" width="${W}" height="${H}" rx="6"/>`;
  for (const t of yTicks) g += `<line class="fig-grid" x1="${M.l}" x2="${W - M.r}" y1="${sy(t)}" y2="${sy(t)}"/><text class="fig-tick" x="${M.l - 8}" y="${sy(t) + 4}" text-anchor="end">${fmt(t)}</text>`;
  for (const t of xTicks) g += `<line class="fig-grid" y1="${M.t}" y2="${M.t + PH}" x1="${sx(t)}" x2="${sx(t)}"/><text class="fig-tick" x="${sx(t)}" y="${M.t + PH + 18}" text-anchor="middle">${fmt(t)}</text>`;
  g += `<line class="fig-axis" x1="${M.l}" x2="${W - M.r}" y1="${sy(0)}" y2="${sy(0)}"/><line class="fig-axis" x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${M.t + PH}"/>`;
  g += `<text class="fig-label" x="${M.l + PW / 2}" y="${H - 8}" text-anchor="middle">${xLabel}</text>`;
  g += `<text class="fig-label" transform="translate(14 ${M.t + PH / 2}) rotate(-90)" text-anchor="middle">${yLabel}</text>`;
  return { g, sx, sy };
}

const path = (pts, sx, sy) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join('');

function legend(items) {
  let x = M.l + 8;
  return items.map(({ cls, text }) => {
    const out = `<line class="${cls}" x1="${x}" x2="${x + 22}" y1="${M.t + 12}" y2="${M.t + 12}"/><text class="fig-legend" x="${x + 28}" y="${M.t + 16}">${text}</text>`;
    x += 40 + text.length * 6.4;
    return out;
  }).join('');
}

/**
 * Expiratory flow-volume curve (exhaled volume on the horizontal axis, flow up).
 * The inspiratory limb is not simulated.
 * @param {{ maneuvers: { curve: object, accepted: boolean, fet: number }[], predicted?: object|null, lln?: object|null, label: string }} p
 *   predicted and lln are curves built from the predicted and lower-limit FVC and FEV1.
 */
export function flowVolumeSvg({ maneuvers, predicted = null, lln = null }) {
  const volMax = niceMax(Math.max(...maneuvers.map((m) => volume(m.curve, m.fet)), predicted ? volume(predicted, predicted.T) : 0) * 1.05);
  const flowMax = niceMax(Math.max(...maneuvers.map((m) => peakFlow(m.curve).pef), predicted ? peakFlow(predicted).pef : 0) * 1.1);
  const f = frame(volMax, flowMax, 'Exhaled volume (L)', 'Flow (L/s)', ticks(volMax), ticks(flowMax));
  const trace = (curve, tEnd) => {
    const { t, v, f: fl } = sampleCurve(curve, 0.01, tEnd);
    return t.map((_, i) => [v[i], fl[i]]);
  };
  let g = f.g;
  if (lln) g += `<path class="fig-lln" d="${path(trace(lln, lln.T), f.sx, f.sy)}"/>`;
  if (predicted) g += `<path class="fig-pred" d="${path(trace(predicted, predicted.T), f.sx, f.sy)}"/>`;
  maneuvers.filter((m) => !m.accepted).forEach((m) => { g += `<path class="fig-rejected" d="${path(trace(m.curve, m.fet), f.sx, f.sy)}"/>`; });
  maneuvers.filter((m) => m.accepted).forEach((m) => { g += `<path class="fig-measured" d="${path(trace(m.curve, m.fet), f.sx, f.sy)}"/>`; });
  g += legend([{ cls: 'fig-measured', text: 'Measured' }, ...(predicted ? [{ cls: 'fig-pred', text: 'Predicted' }] : []), ...(lln ? [{ cls: 'fig-lln', text: 'LLN' }] : []), ...(maneuvers.some((m) => !m.accepted) ? [{ cls: 'fig-rejected', text: 'Not acceptable' }] : [])]);
  return `<svg class="fig" viewBox="0 0 ${W} ${H}" role="img" aria-label="Expiratory flow-volume curves for each maneuver, with predicted and lower limit of normal curves when a reference is selected">${g}</svg>`;
}

/**
 * Volume-time curve for the best maneuver, with the back-extrapolation construction and the FEV1 mark.
 * @param {{ curve: object, fet: number }} maneuver
 */
export function volumeTimeSvg({ curve, fet }) {
  const { t0, bev } = backExtrapolation(curve);
  const pk = peakFlow(curve);
  const tMax = Math.max(6, Math.ceil(fet));
  const vMax = niceMax(volume(curve, fet) * 1.08);
  const f = frame(tMax, vMax, 'Time from start of exhalation (s)', 'Exhaled volume (L)', ticks(tMax, 6), ticks(vMax));
  const { t, v } = sampleCurve(curve, 0.01, fet);
  let g = f.g;
  g += `<path class="fig-measured" d="${path(t.map((x, i) => [x, v[i]]), f.sx, f.sy)}"/>`;
  // Tangent at maximum flow, extended to the time axis (the back-extrapolated time zero).
  const tp = pk.t, vp = volume(curve, tp);
  g += `<line class="fig-tangent" x1="${f.sx(t0)}" y1="${f.sy(0)}" x2="${f.sx(tp + 0.35)}" y2="${f.sy(Math.min(vMax, vp + pk.pef * 0.35))}"/>`;
  g += `<line class="fig-mark" x1="${f.sx(t0)}" x2="${f.sx(t0)}" y1="${f.sy(0)}" y2="${f.sy(vMax * 0.12)}"/><text class="fig-note" x="${f.sx(t0) + 4}" y="${f.sy(vMax * 0.14)}">time zero</text>`;
  const t1 = t0 + 1, v1 = volume(curve, t1);
  g += `<line class="fig-mark" x1="${f.sx(t1)}" x2="${f.sx(t1)}" y1="${f.sy(0)}" y2="${f.sy(v1)}"/><line class="fig-mark" x1="${f.sx(0)}" x2="${f.sx(t1)}" y1="${f.sy(v1)}" y2="${f.sy(v1)}"/>`;
  g += `<circle class="fig-dot" cx="${f.sx(t1)}" cy="${f.sy(v1)}" r="4"/><text class="fig-note" x="${f.sx(t1) + 8}" y="${f.sy(v1) + 16}">FEV₁ ${v1.toFixed(2)} L</text>`;
  g += `<text class="fig-note" x="${f.sx(fet) - 6}" y="${f.sy(volume(curve, fet)) - 8}" text-anchor="end">FVC ${volume(curve, fet).toFixed(2)} L</text>`;
  g += `<text class="fig-note" x="${M.l + 8}" y="${M.t + 16}">Back-extrapolated volume ${bev.toFixed(3)} L</text>`;
  return `<svg class="fig" viewBox="0 0 ${W} ${H}" role="img" aria-label="Volume-time curve of the best maneuver with the back-extrapolation line and the one-second volume marked">${g}</svg>`;
}

// flow() is re-exported so the figure tests can recompute the table from the plotted arrays.
export { flow };
