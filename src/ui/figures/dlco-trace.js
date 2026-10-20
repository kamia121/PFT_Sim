/**
 * Single-breath DLCO tracing. Left: CO and tracer concentration at the mouth (left axis) and inspired
 * volume (right axis) against time, with the breath-hold, washout and alveolar sample marked. Right:
 * the same gases against expired volume, which is how the 2017 standard asks the test to be reviewed.
 * Data come from `buildDlcoTrace` (case.dlcoTrace). The test grade and fault text are drawn only
 * when `showQuality` is true, because test acceptability is a learner question.
 */
import { PALETTES } from '../palettes.js';
import { buildDlcoTrace } from '../../core/dlco-trace.js';
import { open, close, text, line, rect, polyline, scale, niceTicks, frame, num } from './fig-a-kit.js';

const cache = new WeakMap();

function dataFor(caseData) {
  if (!caseData) return null;
  if (caseData.dlcoTrace) return caseData.dlcoTrace;
  if (!caseData.dlco || !caseData.truth) return null;
  if (cache.has(caseData)) return cache.get(caseData);
  const d = caseData.descriptor ?? {};
  const trace = buildDlcoTrace({ seed: d.seed ?? 0, truth: caseData.truth, dlco: caseData.dlco, volumes: caseData.volumes, patient: d, technique: d.technique ?? 'good', scenario: caseData.scenario ?? null });
  cache.set(caseData, trace);
  return trace;
}

const niceTop = (x) => { const t = niceTicks(0, x, 4); const top = t[t.length - 1]; return top >= x ? top : top + (t[1] - t[0]); };

function render(data, { palette = PALETTES.dark, width = 640, height = 360, title, description, showQuality = false } = {}) {
  if (!data?.time?.t?.length) return '';
  const heading = title ?? 'Single-breath DLCO: CO and tracer gas';
  const mk = data.markers, v = data.values, q = data.quality;
  const desc = description ?? `Carbon monoxide and ${data.gas.tracer} tracer concentration in percent against time, with inspired volume, and against expired volume. Inspired volume ${num(data.inspired.volumeL, 2)} L, ${num(data.inspired.viOverVc * 100, 0)} percent of vital capacity; breath-hold ${num(data.breathHold.seconds, 1)} s; alveolar sample from ${num(mk.sample.startL, 2)} to ${num(mk.sample.endL, 2)} L after a ${num(mk.washout.endL, 2)} L washout. VA ${num(v.vaL, 2)} L, DLCO ${num(v.dlcoMlMinMmHg, 1)} mL/min/mmHg.`;

  const T = data.time;
  const tmax = Math.min(T.t[T.t.length - 1], mk.sample.endS + 4.5);
  const last = T.t.findIndex((t) => t > tmax);
  const nT = last < 0 ? T.t.length : last;
  const concMax = niceTop(Math.max(...T.co.slice(0, nT), ...T.tracer.slice(0, nT)) * 1.28);
  const volMax = niceTop(data.inspired.volumeL * 1.12);

  const top = 48, h = height - top - 40 - (showQuality ? 46 : 32);
  const L = { x0: 50, w: Math.round(width * 0.45) };
  const R = { x0: Math.round(width * 0.69), w: Math.round(width * 0.29) };
  const xsT = scale(0, tmax, L.x0, L.x0 + L.w), ysC = scale(0, concMax, top + h, top), ysV = scale(0, volMax, top + h, top);
  const vEnd = Math.min(mk.sample.endL + 0.6, data.byVolume.volumeL[data.byVolume.volumeL.length - 1]);
  const xsV = scale(0, vEnd, R.x0, R.x0 + R.w);

  const out = [open({ width, height, title: heading, description: desc, palette })];
  out.push(text(14, 20, heading, { size: 12.5, weight: 700, fill: palette.text }));

  // Legend.
  let lx = 14;
  const items = [[`CO (%)`, palette.measured, ''], [`${data.gas.tracer} tracer (%)`, palette.second, ''], ['Volume (L, right axis)', palette.third, '']];
  for (const [label, stroke] of items) {
    out.push(line(lx, 34, lx + 20, 34, { stroke, width: 2 }));
    out.push(text(lx + 25, 37.5, label, { size: 10.5, fill: palette.text }));
    lx += 25 + label.length * 5.5 + 14;
  }

  // Time panel.
  out.push(frame({
    x0: L.x0, y0: top, w: L.w, h, xs: xsT, ys: ysC, xRange: [0, tmax], yRange: [0, concMax],
    xTicks: niceTicks(0, tmax, 5), yTicks: niceTicks(0, concMax, 4), xLabel: 'Time (s)', yLabel: 'Concentration (%)', palette,
  }));
  const bandT = (a, b, color, op) => rect(xsT(a), top, Math.max(xsT(b) - xsT(a), 0.5), h, { fill: color, opacity: op });
  out.push(bandT(mk.washout.startS, mk.washout.endS, palette.mark, 0.2));
  out.push(bandT(mk.sample.startS, mk.sample.endS, palette.measured, 0.3));
  out.push(text(xsT((mk.washout.startS + mk.washout.endS) / 2) + 3, top + h - 5, 'washout', { size: 9, anchor: 'start', fill: palette.text, rotate: -90 }));
  out.push(text(xsT((mk.sample.startS + mk.sample.endS) / 2) + 3, top + h - 5, 'sample', { size: 9, anchor: 'start', fill: palette.text, rotate: -90 }));
  // Right axis for volume.
  const vTicks = niceTicks(0, volMax, 4);
  const vd = vTicks.length > 1 && vTicks[1] - vTicks[0] < 1 ? 1 : 0;
  for (const tv of vTicks) out.push(text(L.x0 + L.w + 5, ysV(tv) + 3.5, num(tv, vd), { size: 10, fill: palette.axis }));
  out.push(text(L.x0 + L.w + 36, top + h / 2, 'Volume (L)', { size: 11, anchor: 'middle', fill: palette.text, rotate: 90 }));

  const slice = (arr, a, b) => { const pts = []; for (let j = 0; j < nT; j++) if (T.t[j] >= a && T.t[j] <= b) pts.push([xsT(T.t[j]), arr(j)]); return pts; };
  out.push(polyline(slice((j) => ysV(T.volumeL[j]), 0, tmax), { stroke: palette.third, width: 1.5, opacity: 0.9 }));
  for (const [arr, stroke] of [[T.tracer, palette.second], [T.co, palette.measured]]) {
    out.push(polyline(slice((j) => ysC(arr[j]), 0, mk.tInspEndS), { stroke, width: 1.8 }));
    out.push(polyline(slice((j) => ysC(arr[j]), mk.tInspEndS, mk.tExhaleStartS), { stroke, width: 1.4, dash: '2 3', opacity: 0.65 }));
    out.push(polyline(slice((j) => ysC(arr[j]), mk.tExhaleStartS, tmax), { stroke, width: 1.8 }));
  }
  // Breath-hold bracket and event markers.
  const by = top + 12;
  out.push(line(xsT(mk.t30PctS), by, xsT(mk.tSampleMidS), by, { stroke: palette.text, width: 1 }));
  out.push(line(xsT(mk.t30PctS), by - 4, xsT(mk.t30PctS), by + 4, { stroke: palette.text, width: 1 }));
  out.push(line(xsT(mk.tSampleMidS), by - 4, xsT(mk.tSampleMidS), by + 4, { stroke: palette.text, width: 1 }));
  out.push(text((xsT(mk.t30PctS) + xsT(mk.tSampleMidS)) / 2, by - 5, `breath-hold ${num(data.breathHold.seconds, 1)} s`, { size: 10, anchor: 'middle', fill: palette.text }));
  out.push(line(xsT(mk.tExhaleStartS), top, xsT(mk.tExhaleStartS), top + h, { stroke: palette.mark, width: 1, dash: '4 3', opacity: 0.8 }));
  out.push(text(xsT(mk.tInspStartS) - 2, top + h - 5, 'inspiration', { size: 9, anchor: 'start', fill: palette.axis, rotate: -90 }));
  out.push(text(xsT(mk.tExhaleStartS) - 3, top + h - 5, 'exhalation', { size: 9, anchor: 'start', fill: palette.axis, rotate: -90 }));

  // Expired-volume panel.
  const bv = data.byVolume;
  const nV = bv.volumeL.findIndex((x) => x > vEnd + 1e-9);
  const nv = nV < 0 ? bv.volumeL.length : nV;
  out.push(frame({
    x0: R.x0, y0: top, w: R.w, h, xs: xsV, ys: ysC, xRange: [0, vEnd], yRange: [0, concMax],
    xTicks: niceTicks(0, vEnd, 3), yTicks: niceTicks(0, concMax, 4), xLabel: 'Expired volume (L)', yLabel: 'Concentration (%)', palette,
  }));
  out.push(rect(xsV(0), top, xsV(mk.washout.endL) - xsV(0), h, { fill: palette.mark, opacity: 0.2 }));
  out.push(rect(xsV(mk.sample.startL), top, xsV(mk.sample.endL) - xsV(mk.sample.startL), h, { fill: palette.measured, opacity: 0.3 }));
  out.push(text((xsV(0) + xsV(mk.washout.endL)) / 2, top + 11, 'washout', { size: 9.5, anchor: 'middle', fill: palette.text }));
  out.push(text((xsV(mk.sample.startL) + xsV(mk.sample.endL)) / 2, top + 11, 'sample', { size: 9.5, anchor: 'middle', fill: palette.text }));
  out.push(line(xsV(data.deadSpaceL), top + 16, xsV(data.deadSpaceL), top + h, { stroke: palette.mark, width: 1, dash: '4 3' }));
  out.push(text(xsV(data.deadSpaceL) + 3, top + h - 5, `VD ${num(data.deadSpaceL, 2)} L`, { size: 9, fill: palette.axis }));
  for (const [arr, stroke] of [[bv.tracer, palette.second], [bv.co, palette.measured]]) {
    out.push(polyline(bv.volumeL.slice(0, nv).map((x, j) => [xsV(x), ysC(arr[j])]), { stroke, width: 1.8 }));
  }
  const faTr = v.faTracerPct, faCo = v.faCoPct;
  out.push(text(xsV(vEnd) - 4, ysC(faTr) - 6, `FA,tr ${num(faTr, 3)}%`, { size: 9.5, anchor: 'end', fill: palette.second }));
  out.push(text(xsV(vEnd) - 4, ysC(faCo) - 6, `FA,CO ${num(faCo, 3)}%`, { size: 9.5, anchor: 'end', fill: palette.measured }));

  // Caption.
  const cy = top + h + 40 + 12;
  out.push(text(14, cy, `VI ${num(data.inspired.volumeL, 2)} L (VI/VC ${num(data.inspired.viOverVc, 2)})  ·  85% of VI in ${num(data.inspired.timeTo85PctS, 1)} s  ·  breath-hold ${num(data.breathHold.seconds, 1)} s  ·  VD ${num(data.deadSpaceL, 2)} L  ·  washout ${num(mk.washout.endL, 2)} L, sample ${num(mk.sample.endL - mk.sample.startL, 2)} L`, { size: 10, fill: palette.text }));
  out.push(text(14, cy + 14, `VA ${num(v.vaL, 2)} L  ·  DLCO ${num(v.dlcoMlMinMmHg, 1)} mL/min/mmHg  ·  KCO ${num(v.kco, 2)} mL/min/mmHg/L  ·  PB ${data.barometricMmHg} mmHg`, { size: 10, fill: palette.text }));
  if (showQuality && data.grade) {
    const g = data.grade;
    const reasons = [...g.invalid, ...g.failed, ...g.noted];
    const s = `Test grade ${g.grade}${g.wouldBeRejected ? ', would be rejected' : g.grade === 'B' ? ', accepted with a note' : ', acceptable'}${reasons.length ? `: ${reasons.join('; ')}` : ''}`;
    out.push(text(14, cy + 28, s.length > 118 ? `${s.slice(0, 115)}...` : s, { size: 10, fill: g.wouldBeRejected ? palette.second : palette.text }));
  }
  out.push(close());
  return out.join('');
}

export default { id: 'dlco-trace', title: 'Single-breath DLCO tracing', render, dataFor };
