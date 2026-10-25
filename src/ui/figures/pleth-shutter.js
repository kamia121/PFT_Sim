/**
 * Plethysmograph shutter closure: box pressure (y) against mouth pressure (x) for each panting trial,
 * with the least-squares line from which the trial's thoracic gas volume is computed (Boyle's law).
 * Data come from `buildPleth` (case.pleth). Acceptability is a learner question, so trial status is
 * drawn only when `showQuality` is true.
 */
import { PALETTES } from '../palettes.js';
import { buildPleth } from '../../core/pleth.js';
import { open, close, text, line, polyline, scale, niceTicks, frame, num } from './fig-a-kit.js';

const cache = new WeakMap();

function dataFor(caseData) {
  if (!caseData) return null;
  if (caseData.pleth) return caseData.pleth;
  if (!caseData.volumes || !caseData.truth) return null;
  if (cache.has(caseData)) return cache.get(caseData);
  const d = caseData.descriptor ?? {};
  const pleth = buildPleth({ seed: d.seed ?? 0, truth: caseData.truth, volumes: caseData.volumes, technique: d.technique ?? 'good', scenario: caseData.scenario ?? null });
  cache.set(caseData, pleth);
  return pleth;
}

const niceMax = (x) => { const t = niceTicks(0, x * 1.08, 3); const top = t[t.length - 1]; return top >= x * 1.02 ? top : top + (t[1] - t[0]); };
const fitLs = (xs, ys) => { const n = xs.length; const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; return { mx, my }; };

function render(data, { palette = PALETTES.dark, width = 640, height = 360, title, description, showQuality = false } = {}) {
  if (!data || !data.trials?.length) return '';
  const heading = title ?? 'Shutter closure: box pressure against mouth pressure';
  const trials = data.trials;
  const desc = description ?? `Box pressure in pascals plotted against mouth pressure in kilopascals for ${trials.length} panting trials with the shutter closed. The slope of each line gives the thoracic gas volume at closure by Boyle's law: ${trials.map((t) => `trial ${t.index} ${num(t.frcL, 2)} L at ${num(t.panFreqHz, 2)} Hz`).join(', ')}. Reported FRC ${num(data.reportedFrcL, 2)} L.`;

  const x0 = 62, y0 = 40, h = height - y0 - 50, w = Math.round(width * 0.54);
  const xmax = niceMax(Math.max(...trials.flatMap((t) => t.pm.map(Math.abs))));
  const ymax = niceMax(Math.max(...trials.flatMap((t) => t.pbox.map(Math.abs))));
  const xs = scale(-xmax, xmax, x0, x0 + w), ys = scale(-ymax, ymax, y0 + h, y0);
  const colorOf = (t) => (!showQuality ? palette.measured : t.status === 'acceptable' ? palette.measured : t.status === 'usable' ? palette.second : palette.rejected);

  const out = [open({ width, height, title: heading, description: desc, palette })];
  out.push(text(14, 20, heading, { size: 12.5, weight: 700, fill: palette.text }));
  out.push(frame({
    x0, y0, w, h, xs, ys, xRange: [-xmax, xmax], yRange: [-ymax, ymax],
    xTicks: niceTicks(-xmax, xmax, 4), yTicks: niceTicks(-ymax, ymax, 4),
    xLabel: 'Mouth pressure (kPa)', yLabel: 'Box pressure (Pa)', palette, zeroLines: true,
  }));

  // Trial traces, then the fitted lines on top.
  for (const t of trials) out.push(polyline(t.pm.map((p, j) => [xs(p), ys(t.pbox[j])]), { stroke: colorOf(t), width: 1.4, opacity: 0.9 }));
  for (const t of trials) {
    const { mx, my } = fitLs(t.pm, t.pbox);
    const lo = Math.min(...t.pm) * 1.12, hi = Math.max(...t.pm) * 1.12;
    const pts = [lo, hi].map((px) => [xs(px), ys(my + t.slope * (px - mx))]);
    out.push(polyline(pts, { stroke: palette.mark, width: 1, dash: '4 3', opacity: 0.95 }));
  }
  // No trial numbers are written on the plot (they collide where the traces overlap); the table lists each trial.

  // Legend under the heading.
  let lx = x0;
  out.push(line(lx, 31, lx + 20, 31, { stroke: palette.measured, width: 1.6 })); out.push(text(lx + 25, 34.5, 'Shutter trace', { size: 10.5, fill: palette.text }));
  lx += 112;
  out.push(line(lx, 31, lx + 20, 31, { stroke: palette.mark, width: 1, dash: '4 3' })); out.push(text(lx + 25, 34.5, 'Least-squares slope', { size: 10.5, fill: palette.text }));

  // Right column: replicate table and reported value.
  const cx = x0 + w + 26;
  let y = y0 + 12;
  out.push(text(cx, y, 'Panting trials', { size: 11.5, weight: 700, fill: palette.text }));
  y += 6;
  out.push(line(cx, y, width - 14, y, { stroke: palette.grid, width: 1 }));
  y += 14;
  out.push(text(cx, y, 'No.', { size: 10, fill: palette.axis }));
  out.push(text(cx + 34, y, 'Rate', { size: 10, fill: palette.axis }));
  out.push(text(cx + 82, y, 'FRC', { size: 10, fill: palette.axis }));
  if (showQuality) out.push(text(cx + 122, y, 'Status', { size: 10, fill: palette.axis }));
  for (const t of trials) {
    y += 16;
    out.push(line(cx, y - 3.5, cx + 9, y - 3.5, { stroke: colorOf(t), width: 2 }));
    out.push(text(cx + 13, y, String(t.index), { size: 11, fill: palette.text }));
    out.push(text(cx + 34, y, `${num(t.panFreqHz, 2)} Hz`, { size: 11, fill: palette.text }));
    out.push(text(cx + 82, y, `${num(t.frcL, 2)} L`, { size: 11, fill: palette.text }));
    if (showQuality) out.push(text(cx + 122, y, t.status, { size: 11, fill: colorOf(t) }));
  }
  y += 12;
  out.push(line(cx, y, width - 14, y, { stroke: palette.grid, width: 1 }));
  y += 22;
  out.push(text(cx, y - 8, 'Reported FRC', { size: 10.5, fill: palette.axis }));
  out.push(text(cx, y + 12, `${num(data.reportedFrcL, 2)} L`, { size: 21, weight: 700, fill: palette.measured }));
  y += 28;
  out.push(text(cx, y, data.session ? (Number.isFinite(data.reportedFrcL) ? 'mean of retained trials' : 'FRC not reportable') : data.frcBasis === 'acceptable' || !showQuality ? 'mean of the acceptable trials' : `mean of the ${data.frcBasis} trials`, { size: 10, fill: palette.axis }));
  if (showQuality) {
    const sp = data.repeatability?.spreadFraction;
    out.push(text(cx, y + 14, `${data.session ? 'Overall grade' : 'FRC-only rubric'} ${data.grade ?? 'unassigned'}${sp != null ? `, spread ${num(sp * 100, 1)}%` : ''}`, { size: 10.5, fill: palette.text }));
  }
  const box = data.box;
  const mlPerPa = (box.freeVolumeL / box.barometricPa) * 1000;
  out.push(text(cx, height - 46, 'TGV = (ΔV / ΔPmouth) × (PB − 47 mmHg)', { size: 10, fill: palette.text }));
  out.push(text(cx, height - 32, `PB ${box.barometricMmHg} mmHg; 1 Pa ≈ ${num(mlPerPa, 1)} mL shift`, { size: 10, fill: palette.axis }));
  out.push(text(cx, height - 19, 'Box pressure: compression positive', { size: 10, fill: palette.axis }));
  out.push(close());
  return out.join('');
}

export default { id: 'pleth-shutter', title: 'Plethysmograph shutter closure', render, dataFor };
