/**
 * Flow-volume loop. Exhaled volume (L) on the horizontal axis, flow (L/s) on the vertical axis, expiration up
 * and inspiration down, with 2 L/s drawn as long as 1 L (ATS/ERS 2019; Culver 2017). All maneuvers of a set are
 * overlaid; when a post-bronchodilator set exists it is overlaid in the second series color with a legend.
 *
 * Series color encodes the quantity (pre, post), dash style the relation (measured solid, predicted dashed,
 * lower limit of normal dotted). Rejected maneuvers are muted only when data.revealed is true, so the page does
 * not tell the learner which maneuvers are acceptable before the answers are checked.
 *
 * caseData fields read by dataFor: spirometry.pre/post, descriptor.seed, revealed (default false),
 * showSchematic and interp (for the schematic predicted and LLN curves; labeled schematic).
 */
import { solveCurve } from '../../core/curve.js';
import { shapeFor, durationFor } from '../../core/case.js';
import { sampleExpiration } from '../../core/inspiratory.js';
import { volume, flow } from '../../core/curve.js';
import { wrapSvg, line, pathD, pathEl, text, tickValues, resolvePalette, legendRows, DASH } from './svg.js';
import { maneuverTrace, isAcceptable } from './traces.js';

const MARGIN = { l: 54, r: 14, t: 14, b: 46 };
const LEGEND_W = 170;
const SET_LABEL = { pre: 'Pre-bronchodilator', post: 'Post-bronchodilator' };

function schematicCurve(interp, key) {
  const m = interp?.measures;
  if (!m?.fvc || !m?.fev1 || m.fvc.available === false || m.fev1.available === false) return null;
  const fvc = m.fvc[key], fev1 = m.fev1[key];
  if (!(fvc > 0 && fev1 > 0 && fev1 < fvc)) return null;
  const ratio = fev1 / fvc;
  const curve = solveCurve({ fvc, fev1, k: shapeFor(ratio), r: 0.04, T: durationFor(ratio) }).curve;
  const s = sampleExpiration({ volume, flow }, curve, curve.T);
  return { v: s.v, f: s.f };
}

/** @returns {object|null} */
function dataFor(c) {
  const pre = c?.spirometry?.pre;
  if (!pre?.maneuvers?.length) return null;
  const seed = c.descriptor?.seed ?? 0;
  const mk = (id, set) => ({
    id,
    label: SET_LABEL[id],
    maneuvers: set.maneuvers.map((m, i) => {
      const { exp, insp } = maneuverTrace(m, { seed, index: i, set: id, scenario: c.scenario ?? null });
      return { exp: { v: exp.v, f: exp.f }, insp: { v: insp.v, f: insp.f }, fvc: m.fvc, fivc: insp.fivc, flags: insp.flags, accepted: isAcceptable(set, i) };
    }),
  });
  const sets = [mk('pre', pre)];
  if (c.spirometry.post?.maneuvers?.length) sets.push(mk('post', c.spirometry.post));
  const show = !!c.showSchematic && !!c.interp;
  return {
    revealed: !!c.revealed,
    sets,
    predicted: show ? schematicCurve(c.interp, 'predicted') : null,
    lln: show ? schematicCurve(c.interp, 'lln') : null,
  };
}

const niceUp = (x, step) => Math.ceil(x / step - 1e-9) * step;

/** Axis ranges and pixel scale. 2 L/s occupies the same length as 1 L. Exported for the aspect-ratio test. */
export function flowVolumeLayout(data, W = 640, H = 480) {
  let xMin = 0, xMax = 3, yMax = 4, yMin = -4;
  for (const s of data.sets) for (const m of s.maneuvers) {
    xMax = Math.max(xMax, m.exp.v[m.exp.v.length - 1], ...m.insp.v);
    xMin = Math.min(xMin, ...m.insp.v);
    yMax = Math.max(yMax, ...m.exp.f);
    yMin = Math.min(yMin, ...m.insp.f);
  }
  for (const c of [data.predicted, data.lln]) if (c) { xMax = Math.max(xMax, ...c.v); yMax = Math.max(yMax, ...c.f); }
  xMax = niceUp(xMax + 0.2, 1);
  xMin = xMin < -0.15 ? -niceUp(-xMin, 1) : 0;
  yMax = niceUp(yMax * 1.06, 2);
  yMin = -niceUp(-yMin * 1.06, 2);
  const xRange = xMax - xMin, yRange = yMax - yMin;
  const availW = W - MARGIN.l - MARGIN.r, availH = H - MARGIN.t - MARGIN.b;
  const legendInside = availW < 360 + LEGEND_W;
  const pxPerL = Math.min((legendInside ? availW : availW - LEGEND_W) / xRange, availH / (yRange / 2));
  const plotW = xRange * pxPerL, plotH = (yRange / 2) * pxPerL;
  // Center the plot and its legend column in the free width.
  const x0 = MARGIN.l + Math.max(0, (availW - plotW - (legendInside ? 0 : LEGEND_W)) / 2), y0 = MARGIN.t;
  return {
    xMin, xMax, yMin, yMax, pxPerL, pxPerLps: pxPerL / 2, plotW, plotH, x0, y0, legendInside,
    sx: (v) => x0 + (v - xMin) * pxPerL,
    sy: (f) => y0 + (yMax - f) * (pxPerL / 2),
  };
}

function render(data, opts = {}) {
  const palette = resolvePalette(opts.palette);
  const W = opts.width ?? 640, H = opts.height ?? 480;
  const L = flowVolumeLayout(data, W, H);
  const { sx, sy } = L;
  const hasPost = data.sets.length > 1;
  const colors = { pre: palette.measured, post: palette.second };
  let g = '';

  // Grid, ticks and frame.
  const xStep = 1, yStep = L.yMax - L.yMin > 16 ? 4 : 2;
  for (const x of tickValues(L.xMin, L.xMax, xStep)) {
    g += line(sx(x), sy(L.yMax), sx(x), sy(L.yMin), { stroke: palette.grid, width: 1 });
    g += text(sx(x), sy(L.yMin) + 16, String(x), { palette, anchor: 'middle', size: 12, fill: palette.axis });
  }
  for (const y of tickValues(L.yMin, L.yMax, yStep)) {
    g += line(sx(L.xMin), sy(y), sx(L.xMax), sy(y), { stroke: palette.grid, width: 1 });
    g += text(sx(L.xMin) - 7, sy(y) + 4, String(y).replace('-', '−'), { palette, anchor: 'end', size: 12, fill: palette.axis });
  }
  g += line(sx(L.xMin), sy(0), sx(L.xMax), sy(0), { stroke: palette.axis, width: 1.2 });
  g += line(sx(L.xMin), sy(L.yMax), sx(L.xMin), sy(L.yMin), { stroke: palette.axis, width: 1.2 });
  g += line(sx(L.xMin), sy(L.yMin), sx(L.xMax), sy(L.yMin), { stroke: palette.axis, width: 1.2 });
  // Heavy vertical line at volume 0 marks the start of the forced expiration.
  if (L.xMin < 0) g += line(sx(0), sy(L.yMax), sx(0), sy(L.yMin), { stroke: palette.axis, width: 2 });
  g += text(sx((L.xMin + L.xMax) / 2), sy(L.yMin) + 36, 'Exhaled volume (L)', { palette, anchor: 'middle', size: 13, fill: palette.axis });
  g += text(sx(L.xMin) - 38, sy((L.yMax + L.yMin) / 2), 'Flow (L/s), expiration up', { palette, anchor: 'middle', size: 13, fill: palette.axis, rotate: -90 });

  // Schematic predicted and lower limit curves, behind the data.
  const curvePath = (c) => pathD(c.v.map((v, i) => [sx(v), sy(c.f[i])]));
  if (data.lln) g += pathEl(curvePath(data.lln), { stroke: palette.lln, width: 1.8, dash: DASH.lln });
  if (data.predicted) g += pathEl(curvePath(data.predicted), { stroke: palette.predicted, width: 1.8, dash: DASH.predicted });

  // Maneuvers: rejected (muted) first, then accepted, set by set.
  const loopPath = (m) => pathD([...m.exp.v.map((v, i) => [sx(v), sy(m.exp.f[i])]), ...m.insp.v.map((v, i) => [sx(v), sy(m.insp.f[i])])]);
  let anyRejected = false;
  for (const s of data.sets) {
    const muted = (m) => data.revealed && !m.accepted;
    for (const m of s.maneuvers) if (muted(m)) { anyRejected = true; g += pathEl(loopPath(m), { stroke: palette.rejected, width: 1.2 }); }
    for (const m of s.maneuvers) if (!muted(m)) g += pathEl(loopPath(m), { stroke: colors[s.id], width: 1.8 });
  }

  // Expiration / inspiration labels inside the plot.
  g += text(sx(L.xMin) + 8, sy(L.yMax) + 15, 'Expiration', { palette, size: 12, fill: palette.axis, italic: true });
  g += text(sx(L.xMin) + 8, sy(L.yMin) - 8, 'Inspiration', { palette, size: 12, fill: palette.axis, italic: true });

  // Legend.
  const items = hasPost
    ? [{ label: SET_LABEL.pre, color: colors.pre }, { label: SET_LABEL.post, color: colors.post }]
    : [{ label: 'Measured', color: colors.pre }];
  if (data.revealed && anyRejected) items.push({ label: 'Not acceptable', color: palette.rejected, width: 1.4 });
  if (data.predicted) items.push({ label: 'Predicted (schematic)', color: palette.predicted, dash: DASH.predicted });
  if (data.lln) items.push({ label: 'LLN (schematic)', color: palette.lln, dash: DASH.lln });
  const lx = L.legendInside ? sx(L.xMax) - LEGEND_W + 10 : sx(L.xMax) + 24;
  const ly = L.legendInside ? sy(L.yMax) + 20 : sy(L.yMax) + 16;
  g += legendRows(items, lx, ly, palette);

  const n = data.sets.map((s) => `${s.maneuvers.length} ${SET_LABEL[s.id].toLowerCase()}`).join(' and ');
  const title = opts.title ?? 'Flow-volume loop';
  const description = opts.description ?? `Flow-volume loops of ${n} maneuvers. Exhaled volume in liters on the horizontal axis, flow in liters per second on the vertical axis, expiration up and inspiration down.${data.predicted ? ' Predicted and lower-limit curves are schematic.' : ''}`;
  return wrapSvg({ palette, width: W, height: H, title, description, body: g });
}

export default { id: 'flow-volume', title: 'Expiratory and inspiratory flow-volume loop', render, dataFor };
