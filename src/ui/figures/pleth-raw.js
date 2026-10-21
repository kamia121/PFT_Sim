/**
 * Plethysmograph airway resistance loop (shutter open, quiet tidal breathing): flow (y, expiration upward) against box
 * pressure (x, compression positive). A steep, closed loop is low resistance; a flat, open loop with a bent expiratory limb is high
 * resistance. The dashed line is the fit used for sRaw: the estimator is named in the figure (least-squares slope of the shift signal on flow within
 * |flow| of 0.5 L/s). The adult upper limit of sRaw is a short tick at the end of the fit range, not a line across the plot. Raw is sRaw
 * divided by the reported FRC. Data come from `buildPleth` (case.pleth.raw); the loop is one phase-continuous record, so the traces have no kinks at flow reversals.
 */
import { PALETTES } from '../palettes.js';
import { buildPleth } from '../../core/pleth.js';
import { open, close, text, line, polyline, scale, niceTicks, frame, num } from './fig-a-kit.js';

const cache = new WeakMap();

function dataFor(caseData) {
  if (!caseData) return null;
  let p = caseData.pleth ?? null;
  if (!p || !p.raw?.estimator) {
    if (!caseData.volumes || !caseData.truth) return p;
    if (cache.has(caseData)) p = cache.get(caseData);
    else {
      const d = caseData.descriptor ?? {};
      p = buildPleth({ seed: d.seed ?? 0, truth: caseData.truth, volumes: caseData.volumes, technique: d.technique ?? 'good', scenario: caseData.scenario ?? null });
      cache.set(caseData, p);
    }
  }
  return p;
}

const niceMax = (x) => { const t = niceTicks(0, x * 1.08, 3); const top = t[t.length - 1]; return top >= x * 1.02 ? top : top + (t[1] - t[0]); };
const wrap = (s, maxChars) => {
  const lines = [];
  let cur = '';
  for (const w of String(s).split(/\s+/)) {
    if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
};

function render(data, { palette = PALETTES.dark, width = 640, height = 360, title, description } = {}) {
  const raw = data?.raw ?? null;
  if (!raw?.flow?.length) return '';
  const heading = title ?? 'Airway resistance loop: flow against box pressure';
  const box = data.box;
  const desc = description ?? `Flow in liters per second against box pressure in pascals during tidal breathing with the shutter open, ${raw.shape?.descriptor ?? ''} loop. Specific airway resistance ${num(raw.sRawKpaS, 2)} kPa.s, estimated as ${raw.estimator?.label ?? 'the least-squares slope within 0.5 L/s'}; airway resistance ${num(raw.rawKpaSL, 2)} kPa.s per liter (sRaw divided by the reported FRC), specific conductance ${num(raw.sGawPerKpaS, 2)} per kPa.s.`;

  const x0 = 62, y0 = 40, h = height - y0 - 50, w = Math.round(width * 0.54);
  const factor = (box.pbMinusPh2oKpa * box.freeVolumeL) / box.barometricPa; // kPa.s per (Pa per L/s)
  const fr = raw.fitRangeLs;
  const ulnX = (raw.reference.sRawUpperKpaS / factor) * fr; // box pressure of the upper-limit line at the end of the fit range, Pa
  const flowMax = Math.max(...raw.flow.map(Math.abs));
  const ymax = niceMax(Math.max(flowMax, 0.9));
  const xmax = niceMax(Math.max(...raw.pbox.map(Math.abs), ulnX * 1.3));
  const xs = scale(-xmax, xmax, x0, x0 + w), ys = scale(-ymax, ymax, y0 + h, y0);

  const out = [open({ width, height, title: heading, description: desc, palette })];
  out.push(text(14, 20, heading, { size: 12.5, weight: 700, fill: palette.text }));
  out.push(frame({
    x0, y0, w, h, xs, ys, xRange: [-xmax, xmax], yRange: [-ymax, ymax],
    xTicks: niceTicks(-xmax, xmax, 4), yTicks: niceTicks(-ymax, ymax, 4),
    xLabel: 'Box pressure (Pa), compression positive', yLabel: 'Flow (L/s)', palette, zeroLines: true,
  }));
  out.push(text(x0 + 5, y0 + 13, 'expiration', { size: 9.5, fill: palette.axis }));
  out.push(text(x0 + 5, y0 + h - 6, 'inspiration', { size: 9.5, fill: palette.axis }));

  // Breaths: each loop closes on the first sample of the next breath, so there is no closing segment.
  const nBreaths = Math.max(...raw.breath) + 1;
  for (let b = 0; b < nBreaths; b++) {
    const pts = [];
    raw.flow.forEach((v, j) => { if (raw.breath[j] === b) pts.push([xs(raw.pbox[j]), ys(v)]); });
    const nxt = raw.flow.findIndex((_, j) => raw.breath[j] === b + 1);
    if (nxt >= 0) pts.push([xs(raw.pbox[nxt]), ys(raw.flow[nxt])]);
    out.push(polyline(pts, { stroke: palette.measured, width: 1.3, opacity: 0.85 }));
  }
  out.push(polyline([[xs(-raw.fitSlopePaPerLs * fr), ys(-fr)], [xs(raw.fitSlopePaPerLs * fr), ys(fr)]], { stroke: palette.mark, width: 1.6, dash: '5 3' }));
  // Short upper-limit tick at the end of the fit range, expiratory side.
  out.push(line(xs(ulnX), ys(fr) - 6, xs(ulnX), ys(fr) + 6, { stroke: palette.lln, width: 1.8 }));

  let lx = x0;
  out.push(line(lx, 31, lx + 20, 31, { stroke: palette.measured, width: 1.6 })); out.push(text(lx + 25, 34.5, 'Breaths', { size: 10.5, fill: palette.text }));
  lx += 80;
  out.push(line(lx, 31, lx + 20, 31, { stroke: palette.mark, width: 1.6, dash: '5 3' })); out.push(text(lx + 25, 34.5, 'sRaw fit', { size: 10.5, fill: palette.text }));
  lx += 80;
  out.push(line(lx + 10, 25, lx + 10, 37, { stroke: palette.lln, width: 1.8 })); out.push(text(lx + 25, 34.5, 'sRaw upper limit (tick)', { size: 10.5, fill: palette.text }));

  const cx = x0 + w + 26;
  const cw = Math.floor((width - 14 - cx) / 4.5);
  let y = y0 + 12;
  out.push(text(cx, y, 'Shutter open', { size: 11.5, weight: 700, fill: palette.text }));
  y += 6;
  out.push(line(cx, y, width - 14, y, { stroke: palette.grid, width: 1 }));
  const rows = [
    ['sRaw', `${num(raw.sRawKpaS, 2)} kPa·s`, `${num(raw.sRawCmH2OS, 1)} cmH2O·s`],
    ['Raw', `${num(raw.rawKpaSL, 2)} kPa·s/L`, `${num(raw.rawCmH2OSL, 1)} cmH2O·s/L`],
    ['sGaw', `${num(raw.sGawPerKpaS, 2)} /(kPa·s)`, ''],
  ];
  y += 6;
  for (const [name, v, alt] of rows) {
    out.push(text(cx, y + 11, name, { size: 10, fill: palette.axis }));
    out.push(text(cx, y + 30, v, { size: 16, weight: 700, fill: palette.measured }));
    if (alt) out.push(text(width - 14, y + 30, alt, { size: 9.5, anchor: 'end', fill: palette.axis }));
    y += 40;
  }
  y += 10;
  const notes = [
    `${raw.estimator?.label ?? 'Least-squares slope within |flow| 0.5 L/s'}.`,
    `Tidal breathing, VT ${num(raw.breathingMode?.tidalVolumeL ?? 0.85, 2)} L, ${num(raw.breathingMode?.ratePerMin ?? 20, 0)} per min.`,
    `Raw = sRaw / reported FRC (${num(raw.rawBasis?.frcL ?? data.reportedFrcL, 2)} L); sGaw = 1 / sRaw.`,
    `Upper limit ${num(raw.reference.sRawUpperKpaS, 1)} kPa·s (adults).`,
  ];
  for (const s of notes) for (const l of wrap(s, cw)) { out.push(text(cx, y, l, { size: 9.5, fill: palette.text })); y += 11.5; }
  out.push(close());
  return out.join('');
}

export default { id: 'pleth-raw', title: 'Airway resistance loop', render, dataFor };
