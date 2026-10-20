/**
 * Plethysmograph airway resistance loop (shutter open): flow (y, expiration upward) against box pressure
 * (x). A steep, closed loop is low resistance; an open, S-shaped, flatter loop is high resistance. The
 * dashed line is the fit used for sRaw (|flow| up to 0.5 L/s); the dotted line is the adult upper limit
 * for sRaw (secondary source). Data come from `buildPleth` (case.pleth.raw).
 */
import { PALETTES } from '../palettes.js';
import { buildPleth } from '../../core/pleth.js';
import { open, close, text, line, polyline, scale, niceTicks, frame, num } from './fig-a-kit.js';

const cache = new WeakMap();

function dataFor(caseData) {
  if (!caseData) return null;
  let p = caseData.pleth ?? null;
  if (!p) {
    if (!caseData.volumes || !caseData.truth) return null;
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

function render(data, { palette = PALETTES.dark, width = 640, height = 360, title, description } = {}) {
  const raw = data?.raw ?? null;
  if (!raw?.flow?.length) return '';
  const heading = title ?? 'Airway resistance loop: flow against box pressure';
  const box = data.box;
  const desc = description ?? `Flow in liters per second against box pressure in pascals during tidal breathing with the shutter open, ${raw.shape?.descriptor ?? ''} loop. Specific airway resistance ${num(raw.sRawKpaS, 2)} kPa.s, airway resistance ${num(raw.rawKpaSL, 2)} kPa.s per liter, specific conductance ${num(raw.sGawPerKpaS, 2)} per kPa.s.`;

  const x0 = 62, y0 = 40, h = height - y0 - 50, w = Math.round(width * 0.54);
  const factor = (box.pbMinusPh2oKpa * box.freeVolumeL) / box.barometricPa; // kPa.s per (Pa per L/s)
  const ulnSlope = raw.reference.sRawUpperKpaS / factor; // Pa per L/s
  const flowMax = Math.max(...raw.flow.map(Math.abs));
  const ymax = niceMax(Math.max(flowMax, 0.9));
  const xmax = niceMax(Math.max(...raw.pbox.map(Math.abs), ulnSlope * 0.6));
  const xs = scale(-xmax, xmax, x0, x0 + w), ys = scale(-ymax, ymax, y0 + h, y0);

  const out = [open({ width, height, title: heading, description: desc, palette })];
  out.push(text(14, 20, heading, { size: 12.5, weight: 700, fill: palette.text }));
  out.push(frame({
    x0, y0, w, h, xs, ys, xRange: [-xmax, xmax], yRange: [-ymax, ymax],
    xTicks: niceTicks(-xmax, xmax, 4), yTicks: niceTicks(-ymax, ymax, 4),
    xLabel: 'Box pressure (Pa)', yLabel: 'Flow (L/s)', palette, zeroLines: true,
  }));
  out.push(text(x0 + 5, y0 + 13, 'expiration', { size: 9.5, fill: palette.axis }));
  out.push(text(x0 + 5, y0 + h - 6, 'inspiration', { size: 9.5, fill: palette.axis }));

  // Upper limit and fit lines, then the loops.
  const ulnFlow = Math.min(ymax, (xmax * 0.98) / ulnSlope);
  out.push(polyline([[xs(-ulnSlope * ulnFlow), ys(-ulnFlow)], [xs(ulnSlope * ulnFlow), ys(ulnFlow)]], { stroke: palette.lln, width: 1.2, dash: '1.5 3.5' }));
  const nBreaths = Math.max(...raw.breath) + 1;
  for (let b = 0; b < nBreaths; b++) {
    const pts = [];
    raw.flow.forEach((v, j) => { if (raw.breath[j] === b) pts.push([xs(raw.pbox[j]), ys(v)]); });
    if (pts.length) pts.push(pts[0]);
    out.push(polyline(pts, { stroke: palette.measured, width: 1.3, opacity: 0.8 }));
  }
  const fr = raw.fitRangeLs;
  out.push(polyline([[xs(-raw.fitSlopePaPerLs * fr), ys(-fr)], [xs(raw.fitSlopePaPerLs * fr), ys(fr)]], { stroke: palette.mark, width: 1.6, dash: '5 3' }));

  let lx = x0;
  out.push(line(lx, 31, lx + 20, 31, { stroke: palette.measured, width: 1.6 })); out.push(text(lx + 25, 34.5, 'Breaths', { size: 10.5, fill: palette.text }));
  lx += 80;
  out.push(line(lx, 31, lx + 20, 31, { stroke: palette.mark, width: 1.6, dash: '5 3' })); out.push(text(lx + 25, 34.5, 'sRaw fit', { size: 10.5, fill: palette.text }));
  lx += 80;
  out.push(line(lx, 31, lx + 20, 31, { stroke: palette.lln, width: 1.2, dash: '1.5 3.5' })); out.push(text(lx + 25, 34.5, 'sRaw upper limit', { size: 10.5, fill: palette.text }));

  const cx = x0 + w + 26;
  let y = y0 + 12;
  out.push(text(cx, y, 'Shutter open', { size: 11.5, weight: 700, fill: palette.text }));
  y += 6;
  out.push(line(cx, y, width - 14, y, { stroke: palette.grid, width: 1 }));
  const rows = [
    ['sRaw', `${num(raw.sRawKpaS, 2)} kPa·s`, `${num(raw.sRawCmH2OS, 1)} cmH2O·s`],
    ['Raw', `${num(raw.rawKpaSL, 2)} kPa·s/L`, `${num(raw.rawCmH2OSL, 1)} cmH2O·s/L`],
    ['sGaw', `${num(raw.sGawPerKpaS, 2)} /(kPa·s)`, ''],
  ];
  for (const [name, v, alt] of rows) {
    y += 30;
    out.push(text(cx, y - 12, name, { size: 10.5, fill: palette.axis }));
    out.push(text(cx, y + 4, v, { size: 16, weight: 700, fill: palette.measured }));
    if (alt) out.push(text(cx + 118, y + 4, alt, { size: 10, fill: palette.axis }));
  }
  out.push(text(cx, height - 46, 'Raw = sRaw / FRC;  sGaw = 1 / sRaw', { size: 10, fill: palette.text }));
  out.push(text(cx, height - 32, `Upper limit ${num(raw.reference.sRawUpperKpaS, 1)} kPa·s (adults)`, { size: 10, fill: palette.axis }));
  out.push(text(cx, height - 19, 'Fit over flow within ±0.5 L/s', { size: 10, fill: palette.axis }));
  out.push(close());
  return out.join('');
}

export default { id: 'pleth-raw', title: 'Airway resistance loop', render, dataFor };
