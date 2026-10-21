/**
 * Compact curves of the summary sheet (page 1): the flow-volume loop, the volume-time curve, the plethysmography shift loop
 * and the single-breath DLCO gas tracing of the REPRESENTATIVE maneuver, trial and test. Which one that is comes from the
 * technologist report (`rt.representative`, docs/REPORT-FIRST-PLAN.md): a 0-based index into case.spirometry.pre.maneuvers,
 * case.spirometry.post.maneuvers, case.pleth.trials and the DLCO tests. Without `rt` the best maneuver, the best trial (the
 * reported one is the mean, so the first) and the best test are drawn.
 *
 * Each figure is a self-contained SVG (inline hex colors from one of the four palettes, no CSS, no url()), about 250 by 210
 * px at 96 dpi by default with 7 pt text (9.33 px); the sheet asks for other sizes through `width` and `height`. The caption
 * at the foot of each figure names the maneuver ("Pre: maneuver 3 of 5; post: maneuver 2 of 4"); it never says whether the
 * maneuver is the best or a flawed one, and no grade is drawn. Series color encodes the quantity (pre `measured`, post
 * `second`), dash style the relation (measured solid, predicted dashed).
 *
 * The drawing code of the flow-volume loop and the volume-time curve is the one of panel-spirometry.js; the plethysmography
 * and DLCO figures follow pleth-shutter.js and dlco-trace.js, with their own axes at the compact size.
 *
 * Exports: the four figures (`repFlowVolume`, `repVolumeTime`, `repPlethLoop`, `repDlco`), their list `REPRESENTATIVE_FIGURES`
 * (also the default export) and `representativeCaptions`. Each figure is { id, title, render(data, { palette, width, height }),
 * dataFor(caseData, rt) }; dataFor returns null when the case lacks the test.
 */
import { wrapSvg, line, text, resolvePalette, DASH, fix, r1, pathD, pathEl, tickValues } from './svg.js';
import { spirometryData, predictedCurve, loopRanges, loopScale, drawLoop, vtRanges, drawVolumeTime, SET_LABEL } from './panel-spirometry.js';
import { interpret } from '../../interpret/interpret.js';
import { dlcoTests, bestDlcoIndex } from './dlco-trace.js';
import { buildPleth } from '../../core/pleth.js';
import { buildDlcoTrace } from '../../core/dlco-trace.js';
import { niceTicks } from './fig-a-kit.js';

const FS = 9.33; // 7 pt at 96 dpi
const SET_SHORT = { pre: 'Pre', post: 'Post' };

const clampIndex = (i, n) => (Number.isInteger(i) && i >= 0 && i < n ? i : null);

/** Caption of the spirometry figures: "Pre: maneuver 3 of 5; post: maneuver 2 of 4". */
export function spirometryCaption(sets) {
  return sets.map((s, k) => `${k === 0 ? SET_SHORT[s.id] : SET_SHORT[s.id].toLowerCase()}: maneuver ${s.m.number} of ${s.n}`).join('; ');
}

/** Case data in the form the spirometry helpers read (interp may come with the case or be computed from a resolver). */
function spiroFor(c, rt) {
  const data = spirometryData(c, c?.interp ?? undefined);
  if (!data) return null;
  const sets = data.sets.map((s) => {
    const want = clampIndex(rt?.representative?.[s.id]?.index, s.maneuvers.length);
    const m = s.maneuvers[want ?? s.best];
    return { id: s.id, label: SET_LABEL[s.id], m, n: s.maneuvers.length, set: s };
  });
  let ip = c.interp ?? null;
  if (!ip && c.report && typeof c.resolve === 'function') ip = interpret(c.report, c.resolve, c.equation ?? 'GLIglobal');
  return { sets, predicted: predictedCurve(ip) };
}

/** One-item "shown" list in the structure drawLoop and drawVolumeTime read. */
const shownOf = (sets) => sets.map((s) => ({ set: { ...s.set, id: s.id }, items: [{ m: s.m, best: true, rank: 0 }] }));

function legend(items, x, y, palette, { size = FS - 1 } = {}) {
  let out = '', cx = 0;
  for (const it of items) {
    out += line(x + cx, y - size * 0.32, x + cx + 14, y - size * 0.32, { stroke: it.color, width: it.width ?? 1.8, dash: it.dash });
    out += text(x + cx + 18, y, it.label, { palette, size });
    cx += 18 + it.label.length * size * 0.5 + 12;
  }
  return out;
}

function caption(W, H, s, palette) {
  return text(4, H - 3, s, { palette, size: FS, fill: palette.text });
}

/* ------------------------------------------------------------------------------------------ flow-volume */

function renderFlowVolume(data, opts = {}) {
  const palette = resolvePalette(opts.palette);
  const W = opts.width ?? 250, H = opts.height ?? 210;
  const shown = shownOf(data.sets);
  const drawn = data.sets.map((s) => s.m);
  const dData = { palette, shown, view: 'best', predicted: data.predicted, tidal: null, quality: false };
  const R = loopRanges(drawn, [data.predicted]);
  const top = 14, bottom = FS + 16;
  const left = 24;
  const plotH = H - top - bottom;
  let sc = loopScale(R, { x: left, y: top, w: W - left - 8, h: plotH });
  const free = W - (sc.x + sc.w) - 8;
  const sideLegend = free >= 78;
  if (!sideLegend) sc = loopScale(R, { x: left, y: top, w: W - left - 8, h: plotH - 12 });
  let g = `<g data-subplot="rep-flow-volume">${drawLoop(sc, dData, { fs: FS, titles: false, units: true, labelPef: false })}</g>`;
  const items = [
    ...data.sets.map((s) => ({ label: s.id === 'pre' && data.sets.length === 1 ? 'Measured' : SET_SHORT[s.id], color: s.id === 'post' ? palette.second : palette.measured, width: 2 })),
    ...(data.predicted ? [{ label: 'Predicted', color: palette.predicted, width: 1.7, dash: DASH.predicted }] : []),
  ];
  if (sideLegend) {
    let y = sc.y + 14;
    const x = sc.x + sc.w + 14;
    for (const it of items) { g += legend([it], x, y, palette); y += FS + 4; }
  } else {
    g += legend(items, left, sc.y + sc.h + FS + 14, palette);
  }
  g += caption(W, H, data.caption, palette);
  const desc = `Flow-volume loop of the representative maneuver: ${data.caption}. Exhaled volume in liters on the horizontal axis, flow in liters per second on the vertical axis, expiration up and inspiration down, 2 L/s drawn as long as 1 L.${data.predicted ? ' The dashed curve is the predicted expiratory curve, constructed from the predicted FEV1 and FVC.' : ''}`;
  return wrapSvg({ palette, width: W, height: H, title: opts.title ?? 'Flow-volume loop, representative maneuver', description: desc, body: g });
}

function flowVolumeData(c, rt) {
  const d = spiroFor(c, rt);
  if (!d) return null;
  return { ...d, caption: spirometryCaption(d.sets) };
}

export const repFlowVolume = { id: 'rep-flow-volume', title: 'Flow-volume loop, representative maneuver', render: renderFlowVolume, dataFor: flowVolumeData };

/* ----------------------------------------------------------------------------------------- volume-time */

function renderVolumeTime(data, opts = {}) {
  const palette = resolvePalette(opts.palette);
  const W = opts.width ?? 250, H = opts.height ?? 210;
  const shown = shownOf(data.sets);
  const drawn = data.sets.map((s) => s.m);
  const VR = vtRanges(drawn, 0);
  const top = 16, bottom = FS + 16, left = 24, right = 16;
  const vt = { x: left, y: top, w: W - left - right, h: H - top - bottom, ...VR };
  let g = legend(data.sets.map((s) => ({ label: data.sets.length === 1 ? 'Measured' : SET_SHORT[s.id], color: s.id === 'post' ? palette.second : palette.measured, width: 2 })), left + 18, 9, palette);
  g += `<g data-subplot="rep-volume-time">${drawVolumeTime(vt, { palette, shown, view: 'best', predicted: null, quality: false }, { fs: FS, titles: false, units: true, tangent: false })}</g>`;
  g += caption(W, H, data.caption, palette);
  const desc = `Volume-time curve of the representative maneuver: ${data.caption}. Exhaled volume in liters against time in seconds from 1 s before the back-extrapolated start of the forced expiration; a tick at 1 s marks the FEV1 position.`;
  return wrapSvg({ palette, width: W, height: H, title: opts.title ?? 'Volume-time curve, representative maneuver', description: desc, body: g });
}

export const repVolumeTime = { id: 'rep-volume-time', title: 'Volume-time curve, representative maneuver', render: renderVolumeTime, dataFor: flowVolumeData };

/* ------------------------------------------------------------------------------------ plethysmography */

const cache = new WeakMap();
function plethOf(c) {
  if (c?.pleth) return c.pleth;
  if (!c?.volumes || !c?.truth) return null;
  if (cache.has(c)) return cache.get(c);
  const d = c.descriptor ?? {};
  const p = buildPleth({ seed: d.seed ?? 0, truth: c.truth, volumes: c.volumes, technique: d.technique ?? 'good', scenario: c.scenario ?? null });
  cache.set(c, p);
  return p;
}

const niceMax = (x) => { const t = niceTicks(0, x * 1.08, 3); const top = t[t.length - 1]; return top >= x * 1.02 ? top : top + (t[1] - t[0]); };

function plethData(c, rt) {
  const p = plethOf(c);
  if (!p?.trials?.length) return null;
  const want = clampIndex(rt?.representative?.pleth?.trial, p.trials.length);
  const k = want ?? 0;
  return { trial: p.trials[k], number: k + 1, n: p.trials.length, caption: `Plethysmography: trial ${k + 1} of ${p.trials.length}` };
}

function renderPleth(data, opts = {}) {
  const palette = resolvePalette(opts.palette);
  const W = opts.width ?? 250, H = opts.height ?? 210;
  const t = data.trial;
  const top = 16, bottom = FS + 24, left = 38, right = 10;
  const w = W - left - right, h = H - top - bottom;
  const xmax = niceMax(Math.max(...t.pm.map(Math.abs))), ymax = niceMax(Math.max(...t.pbox.map(Math.abs)));
  const sx = (v) => left + ((v + xmax) / (2 * xmax)) * w, sy = (v) => top + h - ((v + ymax) / (2 * ymax)) * h;
  let g = legend([{ label: 'Shutter trace', color: palette.measured, width: 1.8 }, { label: 'Slope', color: palette.mark, width: 1.2, dash: DASH.mark }], left, 9, palette);
  const xt = niceTicks(-xmax, xmax, 4), yt = niceTicks(-ymax, ymax, 4);
  const dec = (ticks) => { const st = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1; return st >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(st) - 1e-9)); };
  for (const v of xt) { g += line(sx(v), top, sx(v), top + h, { stroke: palette.grid, width: 1 }); g += text(sx(v), top + h + FS + 3, v.toFixed(dec(xt)).replace('-', '−'), { palette, anchor: 'middle', size: FS, fill: palette.axis }); }
  for (const v of yt) { g += line(left, sy(v), left + w, sy(v), { stroke: palette.grid, width: 1 }); g += text(left - 4, sy(v) + FS * 0.35, v.toFixed(dec(yt)).replace('-', '−'), { palette, anchor: 'end', size: FS, fill: palette.axis }); }
  g += line(sx(0), top, sx(0), top + h, { stroke: palette.axis, width: 1 });
  g += line(left, sy(0), left + w, sy(0), { stroke: palette.axis, width: 1 });
  g += `<rect x="${left}" y="${top}" width="${r1(w)}" height="${r1(h)}" fill="none" stroke="${palette.axis}" stroke-width="1"/>`;
  g += pathEl(pathD(t.pm.map((p, j) => [sx(p), sy(t.pbox[j])])), { stroke: palette.measured, width: 1.6 });
  const n = t.pm.length;
  const mx = t.pm.reduce((a, b) => a + b, 0) / n, my = t.pbox.reduce((a, b) => a + b, 0) / n;
  const lo = Math.max(Math.min(...t.pm) * 1.1, -xmax), hi = Math.min(Math.max(...t.pm) * 1.1, xmax);
  g += pathEl(pathD([lo, hi].map((px) => [sx(px), sy(my + t.slope * (px - mx))])), { stroke: palette.mark, width: 1.1, dash: DASH.mark });
  g += text(left + w / 2, top + h + 2 * FS + 4, 'Mouth pressure (kPa)', { palette, anchor: 'middle', size: FS, fill: palette.axis });
  g += text(left - 29, top + h / 2, 'Box pressure (Pa)', { palette, anchor: 'middle', size: FS, fill: palette.axis, rotate: -90 });
  g += caption(W, H, data.caption, palette);
  const desc = `Plethysmograph shutter closure of the representative trial (${data.caption}): box pressure in pascals against mouth pressure in kilopascals with the least-squares line from which the thoracic gas volume is computed.`;
  return wrapSvg({ palette, width: W, height: H, title: opts.title ?? 'Plethysmography shift loop, representative trial', description: desc, body: g });
}

export const repPlethLoop = { id: 'rep-pleth-loop', title: 'Plethysmography shift loop, representative trial', render: renderPleth, dataFor: plethData };

/* ------------------------------------------------------------------------------------------------ DLCO */

const dlcoCache = new WeakMap();
function dlcoSource(c) {
  if (c?.dlcoTrace) return c.dlcoTrace;
  if (!c?.dlco || !c?.truth) return null;
  if (dlcoCache.has(c)) return dlcoCache.get(c);
  const d = c.descriptor ?? {};
  const trace = buildDlcoTrace({ seed: d.seed ?? 0, truth: c.truth, dlco: c.dlco, volumes: c.volumes, patient: d, technique: d.technique ?? 'good', scenario: c.scenario ?? null });
  dlcoCache.set(c, trace);
  return trace;
}

function dlcoData(c, rt) {
  const tests = dlcoTests(dlcoSource(c));
  if (!tests.length) return null;
  const k = clampIndex(rt?.representative?.dlco?.test, tests.length) ?? bestDlcoIndex(tests);
  return { test: tests[k], number: k + 1, n: tests.length, caption: `Single-breath DLCO: test ${k + 1} of ${tests.length}` };
}

function renderDlco(data, opts = {}) {
  const palette = resolvePalette(opts.palette);
  const W = opts.width ?? 250, H = opts.height ?? 210;
  const d = data.test, mk = d.markers, T = d.time;
  const top = 16, bottom = FS + 16, left = 26, right = 28;
  const w = W - left - right, h = H - top - bottom;
  const tmax = Math.min(T.t[T.t.length - 1], mk.sample.endS + 4.5);
  const nT = Math.max(2, T.t.findIndex((t) => t > tmax) < 0 ? T.t.length : T.t.findIndex((t) => t > tmax));
  const niceTop = (x, n = 4) => { const t = niceTicks(0, x, n); const tp = t[t.length - 1]; return tp >= x ? tp : tp + (t[1] - t[0]); };
  const concMax = niceTop(Math.max(...T.co.slice(0, nT), ...T.tracer.slice(0, nT)) * 1.15);
  const volMax = niceTop(d.inspired.volumeL * 1.12);
  const sx = (t) => left + (t / tmax) * w, syC = (v) => top + h - (v / concMax) * h, syV = (v) => top + h - (v / volMax) * h;
  let g = legend([{ label: 'CO (%)', color: palette.measured, width: 1.8 }, { label: `${d.gas.tracer} (%)`, color: palette.second, width: 1.8 }, { label: 'Volume (L, right)', color: palette.third, width: 1.4 }], left, 9, palette);
  const xt = tickValues(0, tmax, tmax > 25 ? 10 : 5).filter((v) => v <= tmax + 1e-9);
  for (const v of xt) { g += line(sx(v), top, sx(v), top + h, { stroke: palette.grid, width: 1 }); g += text(sx(v), top + h + FS + 3, String(v), { palette, anchor: 'middle', size: FS, fill: palette.axis }); }
  const ct = niceTicks(0, concMax, 4);
  for (const v of ct) { g += line(left, syC(v), left + w, syC(v), { stroke: palette.grid, width: 1 }); g += text(left - 4, syC(v) + FS * 0.35, String(Math.round(v * 100) / 100), { palette, anchor: 'end', size: FS, fill: palette.axis }); }
  for (const v of niceTicks(0, volMax, 3)) g += text(left + w + 4, syV(v) + FS * 0.35, String(Math.round(v * 10) / 10), { palette, size: FS, fill: palette.third });
  const band = (a, b, color, op) => `<rect x="${r1(sx(a))}" y="${top}" width="${r1(Math.max(sx(b) - sx(a), 0.5))}" height="${r1(h)}" fill="${color}" fill-opacity="${op}"/>`;
  g += band(mk.washout.startS, mk.washout.endS, palette.mark, 0.2);
  g += band(mk.sample.startS, mk.sample.endS, palette.measured, 0.3);
  g += band(mk.tInspEndS, mk.tExhaleStartS, palette.mark, 0.1);
  g += `<rect x="${left}" y="${top}" width="${r1(w)}" height="${r1(h)}" fill="none" stroke="${palette.axis}" stroke-width="1"/>`;
  const slice = (fy, a, b) => { const pts = []; for (let j = 0; j < nT; j++) if (T.t[j] >= a && T.t[j] <= b) pts.push([sx(T.t[j]), fy(j)]); return pts; };
  g += pathEl(pathD(slice((j) => syV(T.volumeL[j]), 0, tmax)), { stroke: palette.third, width: 1.2 });
  for (const [arr, stroke] of [[T.tracer, palette.second], [T.co, palette.measured]]) {
    for (const [a, b] of [[0, mk.tInspEndS], [mk.tExhaleStartS, tmax]]) {
      const pts = slice((j) => syC(arr[j]), a, b);
      if (pts.length > 1) g += pathEl(pathD(pts), { stroke, width: 1.6 });
    }
  }
  g += text((sx(mk.tInspEndS) + sx(mk.tExhaleStartS)) / 2, top + h / 2, 'breath-hold', { palette, anchor: 'middle', size: FS - 1, fill: palette.axis, italic: true });
  g += text(left + w / 2, top + h + 2 * FS + 2, 'Time (s)', { palette, anchor: 'middle', size: FS, fill: palette.axis });
  g += caption(W, H, data.caption, palette);
  const desc = `Single-breath DLCO tracing of the representative test (${data.caption}): carbon monoxide and ${d.gas.tracer} concentration in percent against time, with the inspired volume in liters on the right axis; the breath-hold interval, the washout and the alveolar sample are shaded.`;
  return wrapSvg({ palette, width: W, height: H, title: opts.title ?? 'DLCO gas tracing, representative test', description: desc, body: g });
}

export const repDlco = { id: 'rep-dlco', title: 'DLCO gas tracing, representative test', render: renderDlco, dataFor: dlcoData };

export const REPRESENTATIVE_FIGURES = [repFlowVolume, repVolumeTime, repPlethLoop, repDlco];
/** Captions as the sheet and the tests read them. */
export const representativeCaptions = (c, rt) => Object.fromEntries(REPRESENTATIVE_FIGURES.map((f) => [f.id, f.dataFor(c, rt)?.caption ?? null]));
export default REPRESENTATIVE_FIGURES;
