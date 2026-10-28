/**
 * Plethysmography panel: one svg with four sub-plots, each a `<g data-subplot="A|B|C|D">`.
 *
 *   A  volume-time record of one panting trial, in absolute volume anchored at the reported FRC: quiet breathing, shutter closed
 *      (the pneumotach volume is flat), shutter open, slow expiration to RV and slow inspiration to TLC, with ERV and IC read from the
 *      end-expiratory level. The pants appear on a separate mouth-pressure lane drawn on an expanded time scale (the trial's own arrays).
 *   B  occlusion loops: mouth pressure against shift volume (mL), trials overlaid. Acceptable trials fall on nearly one line, and the
 *      overlap is the acceptance criterion; thermal drift shows as parallel offset. The trial table beside the plot gives number,
 *      panting frequency and FRC, so the plot carries no trial labels.
 *   C  resistance loop (shutter open, tidal breathing): flow against shift volume on the same x axis as B, the fitted line that gives
 *      sRaw, and a short tick for the upper limit (no long upper-limit line).
 *   D  stacked RV, ERV and IC bars, measured beside predicted, with the TLC lower-to-upper limit range and the RV upper limit
 *      on the predicted bar (no stacked bar for the lower limit).
 *
 * Sign convention: shift volume is positive when alveolar gas is compressed (panting against the shutter, expiratory effort).
 *
 * Interface: render(data, { palette, width = 672, height, title, description, showQuality = false, view = 'best', selected }).
 *   view 'best'     B overlays the selected trials (default all) in the series color with the best trial emphasized; A shows the best trial.
 *   view 'all'      B overlays the selected trials in distinct tints (palette series colors) with the best emphasized; A shows the first selected.
 *   view 'separate' B becomes one small panel per selected trial (same axes) with its number, FRC, frequency and, when showQuality is
 *                   true, its status and reasons; A shows the first selected.
 *   selected        1-based trial numbers; invalid numbers are ignored; default every trial.
 * "best" here keeps the acceptance criterion visible: with a single trial there is no overlap to judge. The best trial is the
 * acceptable one (else usable, else any) closest to the reported FRC. Quality verdicts (status words and status colors) appear only when showQuality is true.
 *
 * Series color encodes the quantity; dash style the relation (measured solid, predicted dashed, limits dotted). Flag color is text only.
 * Sizes assume the default width of 672 px = 7 in: text of 9.5 to 12 px is 7 to 9 pt.
 */
import plethShutter from './pleth-shutter.js';
import { PALETTES } from '../palettes.js';
import { buildPleth, bestTrialIndex, shiftMlPerPa } from '../../core/pleth.js';
import { open, close, text, line, polyline, rect, scale, niceTicks, num, esc } from './fig-a-kit.js';
import { volumeBars, volumeBarsData } from './volume-bars.js';

const cache = new WeakMap();
const SZ = { tick: 9.5, label: 10.5, note: 9.5, cap: 11, value: 12 };

/** Pleth data of a case: stored (current generator) or built from the case. */
function plethOf(c) {
  if (!c) return null;
  const stored = c.pleth ?? null;
  if (stored?.session || stored && stored.timeline && stored.raw?.shiftMl) return stored;
  if (stored && !c.volumes) return null;
  if (!c.volumes || !c.truth) return null;
  if (cache.has(c)) return cache.get(c);
  const d = c.descriptor ?? {};
  const p = buildPleth({ seed: d.seed ?? 0, truth: c.truth, volumes: c.volumes, technique: d.technique ?? 'good', scenario: c.scenario ?? null });
  cache.set(c, p);
  return p;
}

/** @returns {{ pleth: object, bars: object|null, best: number }|null} null when the case has no plethysmography */
function dataFor(c, interp) {
  const pleth = plethOf(c);
  if (!pleth?.trials?.length) return null;
  return { pleth, bars: volumeBarsData({ ...c, pleth }, interp ?? c?.interp ?? null), best: bestTrialIndex(pleth) };
}

const niceMax = (x) => { const t = niceTicks(0, x * 1.08, 3); const top = t[t.length - 1]; return top >= x * 1.02 ? top : top + (t[1] - t[0]); };
const sub = (id, label, body) => `<g data-subplot="${id}" aria-label="${esc(label)}">${body}</g>`;
const wrap = (s, maxChars) => {
  const lines = [];
  let cur = '';
  for (const w of String(s).split(/\s+/)) {
    if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
};

/** Axes with grid, ticks and labels. `xs`/`ys` are the pixel scales of the caller. */
function axes(P, { x0, y0, w, h, xs, ys, xTicks, yTicks, xFmt, yFmt, xLabel, xLabelStart = false, yLabel, zero = true, xTickLabels = true }) {
  const out = [];
  for (const v of xTicks) out.push(line(xs(v), y0, xs(v), y0 + h, { stroke: P.grid, width: 1 }));
  for (const v of yTicks) out.push(line(x0, ys(v), x0 + w, ys(v), { stroke: P.grid, width: 1 }));
  if (zero) {
    if (xTicks[0] < 0 && xTicks[xTicks.length - 1] > 0) out.push(line(xs(0), y0, xs(0), y0 + h, { stroke: P.axis, width: 1, opacity: 0.7 }));
    if (yTicks[0] < 0 && yTicks[yTicks.length - 1] > 0) out.push(line(x0, ys(0), x0 + w, ys(0), { stroke: P.axis, width: 1, opacity: 0.7 }));
  }
  out.push(rect(x0, y0, w, h, { stroke: P.axis, width: 1 }));
  if (xTickLabels) for (const v of xTicks) out.push(text(xs(v), y0 + h + 12, xFmt(v), { size: SZ.tick, anchor: 'middle', fill: P.axis }));
  for (const v of yTicks) out.push(text(x0 - 4, ys(v) + 3.3, yFmt(v), { size: SZ.tick, anchor: 'end', fill: P.axis }));
  if (xLabel) out.push(text(xLabelStart ? x0 : x0 + w / 2, y0 + h + (xTickLabels ? 25 : 12), xLabel, { size: SZ.label, anchor: xLabelStart ? 'start' : 'middle', fill: P.text }));
  if (yLabel) out.push(text(x0 - 31, y0 + h / 2, yLabel, { size: SZ.label, anchor: 'middle', fill: P.text, rotate: -90 }));
  return out.join('');
}

const fmtTick = (v) => (Math.abs(v) < 1e-9 ? '0' : Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

function render(data, opts = {}) {
  const { palette = PALETTES.dark, width = 672, height, title, description, showQuality = false, view = 'best', selected } = opts;
  if (!data?.pleth?.trials?.length) return '';
  if (!data.pleth.timeline || !data.pleth.raw) return plethShutter.render(data.pleth, { ...opts, width, title: 'Plethysmography: TLC/RV unavailable', description: data.pleth.session?.warnings.join(' ') ?? 'Complete lung volumes are not reportable.' });
  const P = palette;
  const pl = data.pleth, trials = pl.trials, n = trials.length, raw = pl.raw, box = pl.box, tl = pl.timeline;
  const mlPerPa = shiftMlPerPa(box);
  const best = data.best ?? bestTrialIndex(pl);

  const valid = Array.isArray(selected) ? [...new Set(selected.filter((k) => Number.isInteger(k) && k >= 1 && k <= n))].sort((a, b) => a - b) : [];
  const sel = valid.length ? valid : trials.map((t) => t.index);
  const bestIn = sel.includes(best) ? best : sel[0];
  const focus = view !== 'best' && valid.length ? valid[0] : bestIn;
  const separate = view === 'separate';
  const TINTS = [P.measured, P.second, P.third, P.text, P.axis];
  const statusColor = (t) => (t.status === 'acceptable' ? P.measured : t.status === 'usable' ? P.second : P.rejected);
  const colorOf = (t) => (showQuality ? statusColor(t) : view === 'all' ? TINTS[(t.index - 1) % TINTS.length] : P.measured);

  // ---- layout ---------------------------------------------------------------------------------------
  const W = width;
  const pad = 10;
  const Lw = Math.round(W * 0.48);
  const rx = Lw + 22;
  const plotX = rx + 42;
  const tableW = 92;
  const plotW = W - pad - tableW - 12 - plotX;
  const body = {};

  // shared scales for B and C (same x axis)
  const xmax = niceMax(Math.max(...trials.flatMap((t) => t.pbox.map((q) => Math.abs(q * mlPerPa))), ...raw.shiftMl.map(Math.abs)));
  const xs = scale(-xmax, xmax, plotX, plotX + plotW);
  const xTicks = niceTicks(-xmax, xmax, 4);
  const pmax = niceMax(Math.max(...trials.flatMap((t) => t.pm.map(Math.abs))));
  const fmax = niceMax(Math.max(...raw.flow.map(Math.abs), 0.8));

  // ======================= right column: B =======================
  const bTop = 36;
  const hB = 128;
  let yR = 0;
  const rightB = [];
  if (!separate) {
    const ysB = scale(-pmax, pmax, bTop + hB, bTop);
    rightB.push(text(rx, 14, 'B  Occlusion loops', { size: SZ.cap, weight: 700, fill: P.text }));
    rightB.push(text(rx, 26, 'mouth pressure against shift volume; trials overlaid', { size: SZ.note, fill: P.axis }));
    rightB.push(axes(P, { x0: plotX, y0: bTop, w: plotW, h: hB, xs, ys: ysB, xTicks, yTicks: niceTicks(-pmax, pmax, 4), xFmt: fmtTick, yFmt: fmtTick, yLabel: 'Mouth pressure (kPa)', xTickLabels: true }));
    const order = sel.filter((k) => k !== bestIn).concat(bestIn); // best on top
    for (const k of order) {
      const t = trials[k - 1];
      const emph = k === bestIn && sel.length > 1;
      rightB.push(polyline(t.pm.map((p, j) => [xs(t.pbox[j] * mlPerPa), ysB(p)]), { stroke: colorOf(t), width: emph ? 1.9 : 1.2, opacity: emph || sel.length === 1 ? 1 : 0.8 }));
    }
    // trial table beside the plot
    const tx = plotX + plotW + 14;
    let ty = bTop + 10;
    rightB.push(text(tx, ty, 'Trial', { size: SZ.tick, fill: P.axis }));
    rightB.push(text(tx + 30, ty, 'Hz', { size: SZ.tick, fill: P.axis }));
    rightB.push(text(tx + tableW, ty, 'FRC (L)', { size: SZ.tick, anchor: 'end', fill: P.axis }));
    ty += 4;
    rightB.push(line(tx, ty, tx + tableW, ty, { stroke: P.grid, width: 1 }));
    for (const k of sel) {
      const t = trials[k - 1];
      ty += 15;
      rightB.push(line(tx, ty - 3.5, tx + 8, ty - 3.5, { stroke: colorOf(t), width: 2.2 }));
      rightB.push(text(tx + 12, ty, String(t.index), { size: SZ.tick + 1, fill: P.text, weight: t.index === bestIn && sel.length > 1 ? 700 : 400 }));
      rightB.push(text(tx + 30, ty, num(t.panFreqHz, 2), { size: SZ.tick + 1, fill: P.text }));
      rightB.push(text(tx + tableW, ty, num(t.frcL, 2), { size: SZ.tick + 1, anchor: 'end', fill: P.text }));
      if (showQuality) {
        ty += 11;
        rightB.push(text(tx + 12, ty, t.status, { size: SZ.note, fill: statusColor(t) }));
      }
      if (ty > bTop + hB - 2) break;
    }
    ty = Math.min(ty + 8, bTop + hB - 14);
    rightB.push(line(tx, ty, tx + tableW, ty, { stroke: P.grid, width: 1 }));
    rightB.push(text(tx, ty + 13, 'Reported', { size: SZ.tick, fill: P.axis }));
    rightB.push(text(tx + tableW, ty + 13, `${num(pl.reportedFrcL, 2)} L`, { size: SZ.value, anchor: 'end', weight: 700, fill: P.measured }));
    yR = bTop + hB + 14;
  } else {
    // small multiples, two per row, same axes for every trial
    const cols = 2, gw = Math.floor((W - pad - rx - 8) / cols), pw = gw - 46, ph = 66;
    const ysS = (top) => scale(-pmax, pmax, top + ph, top);
    rightB.push(text(rx, 14, 'B  Occlusion loops, one panel per trial', { size: SZ.cap, weight: 700, fill: P.text }));
    rightB.push(text(rx, 26, `x: shift volume ±${fmtTick(xmax)} mL; y: mouth pressure ±${fmtTick(pmax)} kPa; every panel`, { size: SZ.note, fill: P.axis }));
    // status and reasons under each panel (only with showQuality); a row is as tall as its longest caption
    const caption = (t) => (showQuality ? wrap(t.reasons.length ? `${t.status}: ${t.reasons.join('; ')}` : t.status, Math.floor(pw / 4.6)).slice(0, 7) : []);
    const rowLines = (idx) => Math.max(...sel.slice(idx - (idx % cols), idx - (idx % cols) + cols).map((k) => caption(trials[k - 1]).length));
    let rowTop = bTop;
    sel.forEach((k, idx) => {
      const t = trials[k - 1];
      const col = idx % cols;
      if (idx > 0 && col === 0) rowTop += ph + 20 + 10.5 * rowLines(idx - 1) + 12;
      const gx = rx + col * gw + 40;
      const xsS = scale(-xmax, xmax, gx, gx + pw);
      const y = ysS(rowTop);
      const g = [axes(P, { x0: gx, y0: rowTop, w: pw, h: ph, xs: xsS, ys: y, xTicks: [-xmax, 0, xmax], yTicks: [-pmax, 0, pmax], xFmt: fmtTick, yFmt: fmtTick, xTickLabels: false, yLabel: null })];
      g.push(polyline(t.pm.map((p, j) => [xsS(t.pbox[j] * mlPerPa), y(p)]), { stroke: colorOf(t), width: 1.5 }));
      g.push(text(gx, rowTop + ph + 12, `Trial ${t.index}`, { size: SZ.label, weight: 700, fill: P.text }));
      g.push(text(gx + pw, rowTop + ph + 12, `${num(t.frcL, 2)} L, ${num(t.panFreqHz, 2)} Hz`, { size: SZ.tick, anchor: 'end', fill: P.text }));
      caption(t).forEach((s, i) => g.push(text(gx, rowTop + ph + 24 + i * 10.5, s, { size: SZ.note, fill: statusColor(t) })));
      rightB.push(`<g data-trial="${t.index}">${g.join('')}</g>`);
      yR = rowTop + ph + 20 + 10.5 * rowLines(idx) + 12;
    });
  }
  body.B = sub('B', 'Occlusion loops: mouth pressure against shift volume', rightB.join(''));

  // ======================= right column: C =======================
  const cCap = yR + 22;
  const cTop = cCap + 22;
  const hC = 146;
  const ysC = scale(-fmax, fmax, cTop + hC, cTop);
  const sh = raw.shiftMl, fl = raw.flow;
  const cOut = [];
  cOut.push(text(rx, cCap, 'C  Resistance loop, shutter open', { size: SZ.cap, weight: 700, fill: P.text }));
  cOut.push(text(rx, cCap + 12, `flow against shift volume; ${raw.breathingMode.label}, same x axis as B`, { size: SZ.note, fill: P.axis }));
  cOut.push(axes(P, {
    x0: plotX, y0: cTop, w: plotW, h: hC, xs, ys: ysC, xTicks, yTicks: niceTicks(-fmax, fmax, 4), xFmt: fmtTick, yFmt: fmtTick,
    xLabel: 'Shift volume (mL), compression positive', yLabel: 'Flow (L/s)',
  }));
  const nB = Math.max(...raw.breath) + 1;
  for (let b = 0; b < nB; b++) {
    const pts = [];
    fl.forEach((v, j) => { if (raw.breath[j] === b) pts.push([xs(sh[j]), ysC(v)]); });
    const nxt = fl.findIndex((_, j) => raw.breath[j] === b + 1);
    if (nxt >= 0) pts.push([xs(sh[nxt]), ysC(fl[nxt])]); // the loop closes on the first sample of the next breath
    cOut.push(polyline(pts, { stroke: P.measured, width: 1.2, opacity: 0.85 }));
  }
  const fr = raw.fitRangeLs, sl = raw.fitSlopePaPerLs * mlPerPa; // mL per L/s
  cOut.push(polyline([[xs(-sl * fr), ysC(-fr)], [xs(sl * fr), ysC(fr)]], { stroke: P.mark, width: 1.6, dash: '5 3' }));
  // short upper-limit tick at the end of the fit range (expiratory side)
  const factor = (box.pbMinusPh2oKpa * box.freeVolumeL) / box.barometricPa;
  const ulnX = (raw.reference.sRawUpperKpaS / factor) * mlPerPa * fr;
  if (ulnX < xmax * 0.97) {
    cOut.push(line(xs(ulnX), ysC(fr) - 5, xs(ulnX), ysC(fr) + 5, { stroke: P.lln, width: 1.6 }));
    cOut.push(text(xs(ulnX), ysC(fr) - 9, 'ULN', { size: SZ.tick, anchor: 'middle', fill: P.text }));
  }
  cOut.push(text(plotX + 4, cTop + 11, 'expiration', { size: SZ.tick, fill: P.axis }));
  cOut.push(text(plotX + 4, cTop + hC - 5, 'inspiration', { size: SZ.tick, fill: P.axis }));
  // resistance values to the right of the plot
  const vx = plotX + plotW + 14;
  let vy = cTop + 6;
  for (const [name, val, unit] of [['sRaw', num(raw.sRawKpaS, 2), 'kPa·s'], ['Raw', num(raw.rawKpaSL, 2), 'kPa·s/L'], ['sGaw', num(raw.sGawPerKpaS, 2), '1/(kPa·s)']]) {
    cOut.push(text(vx, vy + 8, name, { size: SZ.tick, fill: P.axis }));
    cOut.push(text(vx, vy + 23, val, { size: SZ.value, weight: 700, fill: P.measured }));
    cOut.push(text(vx + 38, vy + 23, unit, { size: SZ.tick, fill: P.axis }));
    vy += 37;
  }
  // estimator, breathing mode and the definition of Raw
  let ey = cTop + hC + 42;
  const note = [
    `${raw.estimator.label} (dashed line).`,
    `Breathing: ${raw.breathingMode.label}, VT ${num(raw.breathingMode.tidalVolumeL, 2)} L, ${num(raw.breathingMode.ratePerMin, 0)} per min.`,
    `Raw = sRaw / reported FRC (${num(raw.rawBasis.frcL, 2)} L); sGaw = 1 / sRaw. Tick: sRaw upper limit ${num(raw.reference.sRawUpperKpaS, 1)} kPa·s.`,
  ];
  for (const s of note) for (const l of wrap(s, Math.floor((W - pad - rx) / 4.4))) { cOut.push(text(rx, ey, l, { size: SZ.note, fill: P.text })); ey += 11; }
  body.C = sub('C', 'Resistance loop: flow against shift volume', cOut.join(''));
  const rightBottom = ey;

  // ======================= left column: A =======================
  const ax0 = pad + 46, aw = Lw - 46 - 52 - pad;
  const aTrial = tl.trials[focus - 1];
  const lev = aTrial.levels;
  const plottedFrc = pl.session ? lev.trialFrcL : lev.reportedFrcL;
  const tEnd = aTrial.t[aTrial.t.length - 1];
  const vlo = Math.floor((Math.min(lev.rvL, ...aTrial.v) - 0.25) * 2) / 2, vhi = Math.ceil((Math.max(lev.tlcL, ...aTrial.v) + 0.25) * 2) / 2;
  const aTop = 56, hA = 126;
  const axs = scale(0, tEnd, ax0, ax0 + aw), ays = scale(vlo, vhi, aTop + hA, aTop);
  const aOut = [];
  aOut.push(text(pad, 14, 'A  Volume-time record', { size: SZ.cap, weight: 700, fill: P.text }));
  aOut.push(text(pad, 26, `trial ${focus} of ${n}; ${pl.session ? 'linked measurements, before session selection' : 'axis anchored at the reported mean FRC'}`, { size: SZ.note, fill: P.axis }));
  const segs = aTrial.segments;
  const tc = segs.find((s) => s.id === 'closure');
  // time ticks away from the closure interval, which is expanded on the lane below
  const tTicks = niceTicks(0, tEnd, 8).filter((v) => v <= tEnd + 1e-9 && (v < tc.t0 - 3.5 || v > tc.t1 + 4.5));
  const vTicks = niceTicks(vlo, vhi, 5);
  aOut.push(axes(P, { x0: ax0, y0: aTop, w: aw, h: hA, xs: axs, ys: ays, xTicks: tTicks, yTicks: vTicks, xFmt: fmtTick, yFmt: fmtTick, xLabel: 'Time (s)', xLabelStart: true, yLabel: 'Volume (L)', zero: false }));
  // Reference levels: individual linked measurements for v3, aggregate values for legacy v2.
  for (const y of [lev.tlcL, (pl.session ? lev.trialFrcL : lev.reportedFrcL), lev.rvL]) aOut.push(line(ax0, ays(y), ax0 + aw, ays(y), { stroke: P.axis, width: 0.9, opacity: 0.6 }));
  // segment boundaries and their labels in two rows above the plot
  const short = { tidal: 'quiet breathing', closure: 'closed', 'open-shutter': 'open', expiration: 'to RV', inspiration: 'to TLC' };
  segs.forEach((sg, i) => {
    if (i > 0) aOut.push(line(axs(sg.t0), aTop, axs(sg.t0), aTop + hA, { stroke: P.axis, width: 0.8, dash: '1.5 3', opacity: 0.8 }));
    const cx = (axs(sg.t0) + axs(sg.t1)) / 2;
    aOut.push(text(cx, aTop - (i % 2 ? 3 : 14), short[sg.id], { size: SZ.tick, anchor: 'middle', fill: P.text }));
  });
  const aColor = view === 'all' ? colorOf(trials[focus - 1]) : P.measured; // in the tinted view, the same tint as the trial in B
  aOut.push(polyline(aTrial.t.map((t, j) => [axs(t), ays(aTrial.v[j])]), { stroke: aColor, width: 1.7 }));
  // closure level, and the offset from the stable level when the shutter closed away from it
  const yc = ays(lev.trialFrcL);
  aOut.push(line(axs(tc.t0) - 3, yc, axs(tc.t1) + 3, yc, { stroke: aColor, width: 2.6 }));
  // ERV and IC read from the end-expiratory level, in the right margin
  const bx = ax0 + aw + 5, lx = bx + 6;
  const br = (y1, y2) => line(bx, y1, bx, y2, { stroke: P.axis, width: 1.2 }) + line(bx - 3, y1, bx + 3, y1, { stroke: P.axis, width: 1.2 }) + line(bx - 3, y2, bx + 3, y2, { stroke: P.axis, width: 1.2 });
  aOut.push(br(ays(lev.tlcL), ays(plottedFrc)), br(ays(plottedFrc), ays(lev.rvL)));
  const lab = (y, s, bold) => aOut.push(text(lx, y + 3.3, s, { size: SZ.tick, fill: P.text, weight: bold ? 700 : 400 }));
  lab(ays(lev.tlcL), `TLC ${num(lev.tlcL, 2)}`, true);
  lab((ays(lev.tlcL) + ays(plottedFrc)) / 2, `IC ${num(lev.icL, 2)}`);
  lab(ays(plottedFrc) - 0.5, `FRC ${num(plottedFrc, 2)}`, true);
  lab((ays(plottedFrc) + ays(lev.rvL)) / 2 + 1, `ERV ${num(lev.ervL, 2)}`);
  lab(ays(lev.rvL), `RV ${num(lev.rvL, 2)}`, true);
  // mouth-pressure lane on an expanded time scale
  const lane = aTrial.lane;
  const laneTop = aTop + hA + 54, hL = 38;
  const tPant = lane.t[lane.t.length - 1];
  const lxs = scale(0, tPant, ax0, ax0 + aw), lys = scale(-pmax, pmax, laneTop + hL, laneTop);
  aOut.push(line(axs(tc.t0), aTop + hA, ax0, laneTop, { stroke: P.axis, width: 0.8, dash: '1.5 3', opacity: 0.8 }));
  aOut.push(line(axs(tc.t1), aTop + hA, ax0 + aw, laneTop, { stroke: P.axis, width: 0.8, dash: '1.5 3', opacity: 0.8 }));
  const lt = niceTicks(0, tPant, 3).filter((v) => v <= tPant + 1e-9);
  aOut.push(axes(P, { x0: ax0, y0: laneTop, w: aw, h: hL, xs: lxs, ys: lys, xTicks: lt, yTicks: [-pmax, 0, pmax], xFmt: fmtTick, yFmt: fmtTick, xLabel: 'Time from closure (s)', yLabel: 'kPa', zero: true }));
  aOut.push(polyline(lane.t.map((t, j) => [lxs(t), lys(lane.pm[j])]), { stroke: aColor, width: 1.4 }));
  aOut.push(text(pad, laneTop + hL + 38, 'Lane: mouth pressure while closed, expanded time scale', { size: SZ.note, fill: P.axis }));
  let aEnd = laneTop + hL + 42;
  if (aTrial.offsetFromStable) {
    const off = lev.closureOffsetL;
    aOut.push(text(pad, aEnd + 4, `Shutter closed ${num(Math.abs(off), 2)} L ${off >= 0 ? 'above' : 'below'} the stable end-expiratory level (${num(lev.stableEelL, 2)} L).`, { size: SZ.note, fill: P.text }));
    aEnd += 14;
  }
  body.A = sub('A', 'Volume-time record of one panting trial', aOut.join(''));

  // ======================= left column: D =======================
  const dTop = aEnd + 10;
  const dBars = data.bars ? volumeBars(data.bars, { palette: P, width: Lw - pad, height: 196 }) : null;
  const dOut = [text(pad, dTop + 4, 'D  Partition of total lung capacity', { size: SZ.cap, weight: 700, fill: P.text })];
  let dEnd = dTop + 10;
  if (dBars) {
    dOut.push(`<g transform="translate(${pad} ${dTop + 14})">${dBars.svg}</g>`);
    dEnd = dTop + 14 + dBars.height;
  } else {
    dOut.push(text(pad, dTop + 22, 'Reference values are not available for these volumes.', { size: SZ.note, fill: P.axis }));
    dEnd = dTop + 30;
  }
  body.D = sub('D', 'Partition bars: RV, ERV and IC measured and predicted', dOut.join(''));

  const H = Math.max(height ?? 0, Math.ceil(Math.max(dEnd, rightBottom) + 8));
  const heading = title ?? 'Plethysmography: volume-time record, occlusion loops, resistance loop and volume partition';
  const sRawTxt = `sRaw ${num(raw.sRawKpaS, 2)} kPa.s, Raw ${num(raw.rawKpaSL, 2)} kPa.s per liter, sGaw ${num(raw.sGawPerKpaS, 2)} per kPa.s`;
  const desc = description ?? `Plethysmography with ${n} panting trials, reported FRC ${num(pl.reportedFrcL, 2)} L. Panel A shows the volume-time record of trial ${focus} with the pants on a separate mouth-pressure lane; panel B overlays the occlusion loops (mouth pressure against shift volume); panel C shows the airway resistance loop (flow against shift volume, compression positive) with ${sRawTxt}, estimated by ${raw.estimator.label}; panel D shows the RV, ERV and IC partition against the predicted partition.`;
  return [open({ width: W, height: H, title: heading, description: desc, palette: P }), body.A, body.B, body.C, body.D, close()].join('');
}

export default { id: 'panel-pleth', title: 'Plethysmography panel', render, dataFor };
