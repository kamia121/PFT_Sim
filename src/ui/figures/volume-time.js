/**
 * Volume-time curve of the best maneuver, with a short tidal baseline and the deep inspiration before the blow,
 * the back-extrapolation construction (tangent at peak flow meeting the time axis at time zero), the FEV1 mark
 * one second after time zero, and the volume change over the last second (the end-of-forced-expiration
 * plateau). Exhaled volume is measured from total lung capacity, so the FVC is the highest point and the
 * baseline sits at about the inspiratory capacity below it. When a post-bronchodilator set exists its best
 * maneuver is overlaid, aligned at its own time zero.
 *
 * caseData fields read by dataFor: spirometry.pre/post, descriptor.seed. The best maneuver is chosen as in the
 * maneuver table (acceptable first, then the larger FVC + FEV1).
 */
import { volume, peakFlow } from '../../core/curve.js';
import { wrapSvg, line, pathD, pathEl, text, tickValues, resolvePalette, legendFlow, DASH, fix, r1 } from './svg.js';
import { maneuverTrace, bestIndex, tidalBaseline } from './traces.js';

const MARGIN = { l: 54, r: 16, t: 16, b: 46, legend: 44 };
const T_START = -4;
const SET_LABEL = { pre: 'Pre-bronchodilator', post: 'Post-bronchodilator' };

const at = (t, y, x) => {
  if (x <= t[0]) return y[0];
  if (x >= t[t.length - 1]) return y[y.length - 1];
  let lo = 0, hi = t.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= x) lo = m; else hi = m; }
  return y[lo] + ((y[hi] - y[lo]) * (x - t[lo])) / (t[hi] - t[lo]);
};

function dataFor(c) {
  const pre = c?.spirometry?.pre;
  if (!pre?.maneuvers?.length) return null;
  const seed = c.descriptor?.seed ?? 0;
  const mk = (id, set) => {
    const i = bestIndex(set), m = set.maneuvers[i];
    const { exp } = maneuverTrace(m, { seed, index: i, set: id, scenario: c.scenario ?? null });
    const t = exp.t.map((x) => x - m.t0);
    const tEnd = t[t.length - 1];
    const pk = peakFlow(m.curve);
    return {
      id, label: SET_LABEL[id], index: i,
      t, v: exp.v,
      t0: m.t0, bev: m.bev, fev1: m.fev1, fvc: m.fvc, pef: m.pef, fet: m.fet,
      tPeak: pk.t - m.t0, vPeak: volume(m.curve, pk.t),
      plateau: exp.v[exp.v.length - 1] - at(t, exp.v, Math.max(t[0], tEnd - 1)),
      tidal: id === 'pre' ? tidalBaseline(m.fvc, m.t0, seed + i) : null,
    };
  };
  const sets = [mk('pre', pre)];
  if (c.spirometry.post?.maneuvers?.length) sets.push(mk('post', c.spirometry.post));
  return { sets };
}

function render(data, opts = {}) {
  const palette = resolvePalette(opts.palette);
  const W = opts.width ?? 640, H = opts.height ?? 400;
  const pw = W - MARGIN.l - MARGIN.r, ph = H - MARGIN.t - MARGIN.b - MARGIN.legend;
  const tEndMax = Math.max(...data.sets.map((s) => s.t[s.t.length - 1]));
  const xMax = Math.max(6, Math.ceil(tEndMax + 0.5));
  const vTop = Math.max(...data.sets.map((s) => s.fvc));
  const yMax = Math.max(1, Math.ceil(vTop * 1.2));
  const sx = (t) => MARGIN.l + ((t - T_START) / (xMax - T_START)) * pw;
  const sy = (v) => MARGIN.t + ph - (v / yMax) * ph;
  const colors = { pre: palette.measured, post: palette.second };
  const pre = data.sets[0];
  let g = '';

  const xStep = xMax - T_START > 14 ? 2 : 1;
  for (const x of tickValues(T_START, xMax, xStep)) {
    g += line(sx(x), sy(0), sx(x), sy(yMax), { stroke: palette.grid, width: 1 });
    g += text(sx(x), sy(0) + 16, String(x).replace('-', '−'), { palette, anchor: 'middle', size: 12, fill: palette.axis });
  }
  for (const y of tickValues(0, yMax, 1)) {
    g += line(sx(T_START), sy(y), sx(xMax), sy(y), { stroke: palette.grid, width: 1 });
    g += text(sx(T_START) - 7, sy(y) + 4, String(y), { palette, anchor: 'end', size: 12, fill: palette.axis });
  }
  g += line(sx(T_START), sy(0), sx(xMax), sy(0), { stroke: palette.axis, width: 1.2 });
  g += line(sx(T_START), sy(yMax), sx(T_START), sy(0), { stroke: palette.axis, width: 1.2 });
  g += text(sx((T_START + xMax) / 2), sy(0) + 36, 'Time (s); zero at back-extrapolated start', { palette, anchor: 'middle', size: 13, fill: palette.axis });
  g += text(14, sy(yMax / 2), 'Exhaled volume (L)', { palette, anchor: 'middle', size: 13, fill: palette.axis, rotate: -90 });

  // Time zero.
  g += line(sx(0), sy(0), sx(0), sy(yMax) + 24 + 16 * data.sets.length, { stroke: palette.mark, width: 1, dash: DASH.mark });

  // Tidal baseline and deep inspiration (not part of any tabulated value).
  if (pre.tidal) g += pathEl(pathD(pre.tidal.t.map((t, i) => [sx(t), sy(pre.tidal.v[i])])), { stroke: palette.mark, width: 1.4 });

  // Back-extrapolation construction for the pre set: tangent at peak flow, from time zero to just past the peak.
  {
    const tEnd = pre.tPeak + 0.45;
    let tx = tEnd;
    if (pre.pef * tx > yMax) tx = yMax / pre.pef;
    g += pathEl(`M${r1(sx(0))} ${r1(sy(0))}L${r1(sx(tx))} ${r1(sy(pre.pef * tx))}`, { stroke: palette.third, width: 1.4, dash: DASH.lln });
  }

  // Forced expirations.
  for (const s of data.sets) g += pathEl(pathD(s.t.map((t, i) => [sx(t), sy(s.v[i])])), { stroke: colors[s.id], width: 2 });

  // FEV1 marks: dashed guides to both axes and a dot on the curve.
  data.sets.forEach((s) => {
    const col = colors[s.id];
    g += line(sx(1), sy(0), sx(1), sy(s.fev1), { stroke: col, width: 1, dash: DASH.mark });
    g += line(sx(T_START), sy(s.fev1), sx(1), sy(s.fev1), { stroke: col, width: 1, dash: DASH.mark });
    g += `<circle cx="${r1(sx(1))}" cy="${r1(sy(s.fev1))}" r="4.5" fill="${col}"/>`;
  });

  // FVC and plateau annotation: the last second of each trace is bracketed on its FVC line, and the labels are
  // stacked above the highest FVC line so that they never sit on a curve.
  const yTop = sy(Math.max(...data.sets.map((s) => s.fvc)));
  const labels = [];
  data.sets.forEach((s) => {
    const col = colors[s.id];
    const tEnd = s.t[s.t.length - 1];
    g += line(sx(Math.max(s.t[0], tEnd - 1)), sy(s.fvc), sx(tEnd), sy(s.fvc), { stroke: col, width: 3 });
    const prefix = data.sets.length > 1 ? (s.id === 'pre' ? 'Pre ' : 'Post ') : '';
    labels.push({ x: sx(tEnd), s: `${prefix}FVC ${fix(s.fvc, 2)} L; volume change in last 1 s ${fix(s.plateau, 3)} L` });
  });
  labels.reverse();
  labels.forEach((l, i) => { g += text(l.x, yTop - 8 - 15 * i, l.s, { palette, anchor: 'end', size: 12 }); });

  // Text block, top left (the plot is empty there): back-extrapolated volume and the FEV1 of each set, with a swatch
  // in the series color.
  g += text(sx(T_START) + 8, sy(yMax) + 15, `Back-extrapolated volume ${fix(pre.bev, 3)} L`, { palette, size: 12, fill: palette.axis });
  data.sets.forEach((q, i) => {
    const yy = sy(yMax) + 32 + 16 * i;
    g += `<circle cx="${r1(sx(T_START) + 13)}" cy="${r1(yy - 4)}" r="4.5" fill="${colors[q.id]}"/>`;
    g += text(sx(T_START) + 24, yy, `${data.sets.length > 1 ? (q.id === 'pre' ? 'Pre ' : 'Post ') : ''}FEV1 ${fix(q.fev1, 2)} L`, { palette, size: 12 });
  });

  // Legend below the axis label.
  const items = [];
  for (const q of data.sets) items.push({ label: data.sets.length > 1 ? q.label : 'Forced expiration, best maneuver', color: colors[q.id], width: 2 });
  items.push({ label: 'Tangent at peak flow', color: palette.third, width: 1.4, dash: DASH.lln });
  items.push({ label: 'Tidal breathing and inspiration', color: palette.mark, width: 1.4 });
  g += legendFlow(items, MARGIN.l, sy(0) + 54, pw, palette).markup;

  const title = opts.title ?? 'Volume-time curve';
  const description = opts.description ?? `Exhaled volume in liters against time in seconds for the best maneuver${data.sets.length > 1 ? ' before and after bronchodilator' : ''}, starting with tidal breathing before the forced expiration. Time zero is the back-extrapolated start; FEV1 is marked one second later.`;
  return wrapSvg({ palette, width: W, height: H, title, description, body: g });
}

export default { id: 'volume-time', title: 'Volume-time curve', render, dataFor };
