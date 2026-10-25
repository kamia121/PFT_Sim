/**
 * Spirometry panel: the flow-volume loop (left) and the volume-time curve (right) in one self-contained SVG, laid
 * out as on a laboratory printout. The drawing code is shared with the stand-alone flow-volume and volume-time
 * figures, which import the helpers exported here.
 *
 * Conventions (docs/REPORT-PAGE-PLAN.md, docs/research/report-formats.md section 3)
 *   - Flow-volume loop: exhaled volume (L) to the right, flow (L/s) up for expiration, 2 L/s drawn as long as 1 L.
 *     Exhaled volume is measured from total lung capacity (TLC at 0). The end of expiration turns into inspiration
 *     through a rounded corner, not a vertical drop. PEF is marked with an open diamond.
 *   - Predicted expiratory curve: dashed, built only from equation-backed predicted points (FEV1 and FVC from the
 *     interpretation; PEF as well when a loaded equation supplies it) with the volume-time family of core/curve.js
 *     between those points, and labeled "predicted, constructed" with the equation named. No lower-limit loop is
 *     drawn: the 5th percentiles of PEF, FEF50 and FVC do not occur in one person; the limit lives in the table and
 *     in the z-score strip.
 *   - Tidal loop at the end-expiratory level, placed from the case inspiratory capacity (IC = TLC - FRC, measured
 *     from TLC), so that it agrees with the lung-volume table. Omitted when the case has no volumes.
 *   - Volume-time curve: starts 1 s before time zero (the back-extrapolated start) with no pre-test wave; a short tick
 *     at t = 1 s marks the FEV1 position (no dots, no drop lines, no values); annotations sit outside the plot.
 *   - Series color encodes the quantity (pre-bronchodilator measured color, post-bronchodilator second color), dash
 *     encodes the relation (measured solid, predicted dashed). Flag color is text only.
 *
 * Views (opts.view) and selection (opts.selected, 1-based maneuver numbers as in case.spirometry.pre.maneuvers)
 *   best      the best curve of each set only (report default)
 *   all       the selected maneuvers overlaid, the best of them emphasized, each in its own tint (opacity)
 *   separate  one small panel per selected maneuver: number, FEV1, FVC and the technologist comment (fault labels).
 *             Acceptability verdicts appear only when showQuality is true.
 *
 * Teaching constants marked unverified: the tidal volume and breath times of the tidal loop (src/core/pleth.js uses
 * the same 0.85 L and 1.3 s for its tidal breaths), the 2 L/s-per-L aspect is from ATS/ERS 2019 and Culver 2017.
 */
import { solveCurve, volume, flow, peakFlow } from '../../core/curve.js';
import { shapeFor, durationFor } from '../../core/case.js';
import { sampleExpiration } from '../../core/inspiratory.js';
import { faultWording } from '../../core/quality.js';
import { interpret } from '../../interpret/interpret.js';
import { wrapSvg, line, text, resolvePalette, tickValues, DASH, fix, r1 } from './svg.js';
import { TRACE_RENDERING_ATTRS } from '../../core/trace-texture.js';
import { maneuverTrace, bestIndex, isAcceptable } from './traces.js';

export const SET_LABEL = { pre: 'Pre-bronchodilator', post: 'Post-bronchodilator' };
const SET_SHORT = { pre: 'Pre', post: 'Post' };
const EQUATION = { GLI2012: 'GLI-2012', GLIglobal: 'GLI Global 2022', GLI2021vol: 'GLI-2021 volumes', GLI2017tlco: 'GLI-2017 TLCO', NHANES3: 'NHANES III' };
export const equationLabel = (id) => EQUATION[id] ?? id;

/** Tidal breathing of the tidal loop. Values are teaching choices, not measurements. */
export const TIDAL = { vtL: 0.85, tiS: 1.3, teS: 2.2, verification: 'unverified' };

const niceUp = (x, step) => Math.ceil(x / step - 1e-9) * step;
const clampN = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

/** Index of the last element of sorted `t` that is <= x (0 when x is before the start). */
function idxAt(t, x) {
  let lo = 0, hi = t.length - 1;
  if (x <= t[0]) return 0;
  if (x >= t[hi]) return hi;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= x) lo = m; else hi = m; }
  return lo;
}
const interpAt = (t, y, x) => {
  const i = idxAt(t, x);
  if (i >= t.length - 1) return y[t.length - 1];
  const d = t[i + 1] - t[i];
  return d > 0 ? y[i] + ((y[i + 1] - y[i]) * (x - t[i])) / d : y[i];
};

/* ------------------------------------------------------------------------------------------------ data */

/**
 * Predicted expiratory curve from equation-backed points only. FEV1 and FVC come from the interpretation; PEF is used
 * when the interpretation carries a `pef` measure with a predicted value (no loaded equation supplies one today, so the
 * shape exponent then follows the predicted ratio, as in core/case.js). Each point records its equation and whether the
 * equation was a fallback, so the label can name them per point.
 * @returns {null | { points: {name: string, equationId: string, fallback: boolean}[], equationIds: string[], fvc: number, fev1: number, pef: number|null, pefFromEquation: boolean, t: number[], v: number[], f: number[] }}
 */
export function predictedCurve(interp) {
  const m = interp?.measures;
  const ok = (x) => x && x.available !== false && Number.isFinite(x.predicted) && x.predicted > 0;
  if (!ok(m?.fvc) || !ok(m?.fev1)) return null;
  const fvc = m.fvc.predicted, fev1 = m.fev1.predicted;
  if (!(fev1 < fvc)) return null;
  const ratio = fev1 / fvc;
  const T = durationFor(ratio), r = 0.04;
  let k = shapeFor(ratio);
  const points = [{ name: 'FEV1', measure: m.fev1 }, { name: 'FVC', measure: m.fvc }];
  let pefFromEquation = false;
  if (ok(m?.pef)) {
    // Fall back per point: PEF constrains the shape when an equation gives it; otherwise the shape follows the ratio.
    const pefAt = (kk) => peakFlow(solveCurve({ fvc, fev1, k: kk, r, T }).curve).pef;
    let lo = 0.6, hi = 1.6; // the shape range of core/case.js (0.6 to 1.05) widened upward; lower k gives unphysical peaks
    if (pefAt(lo) >= m.pef.predicted && pefAt(hi) <= m.pef.predicted) {
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (pefAt(mid) > m.pef.predicted) lo = mid; else hi = mid; }
      k = (lo + hi) / 2;
      // Used only when the family reaches the target.
      if (Math.abs(pefAt(k) - m.pef.predicted) <= 0.02 * m.pef.predicted) {
        pefFromEquation = true;
        points.push({ name: 'PEF', measure: m.pef });
      } else k = shapeFor(ratio);
    }
  }
  const curve = solveCurve({ fvc, fev1, k, r, T }).curve;
  const s = sampleExpiration({ volume, flow }, curve, curve.T);
  const pts = points.map((p) => ({ name: p.name, equationId: p.measure.equationId, fallback: p.measure.matched === false }));
  return { points: pts, equationIds: [...new Set(pts.map((p) => p.equationId))], fvc, fev1, pef: peakFlow(curve).pef, pefFromEquation, t: s.t, v: s.v, f: s.f };
}

/** Legend wording for the predicted curve: names the points and their equations, and marks fallbacks. */
export function predictedLabel(p) {
  const eqs = p.equationIds.map(equationLabel);
  const names = p.points.map((x) => x.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  const fb = p.points.some((x) => x.fallback);
  return `Predicted, constructed from ${list} (${eqs.join('; ')}${fb ? ', fallback' : ''})`;
}

/**
 * Tidal loop at the end-expiratory level. Exhaled volume is measured from TLC, so the end-expiratory level is at the
 * inspiratory capacity: x = IC. Expiratory flow is limited to 97% of the maximal envelope at the same volume (a
 * flow-limited patient breathes on the envelope). Returns null without IC.
 * @param {{ volumes?: { ic?: number }|null }} c
 * @param {{ v: number[], f: number[] }} env expiratory limb of the best pre-bronchodilator maneuver
 */
export function tidalLoop(c, env) {
  const ic = c?.volumes?.ic;
  if (!(ic > 0) || !env?.v?.length) return null;
  const fvcEnd = env.v[env.v.length - 1];
  let eel = ic, clamped = false;
  // The forced loop ends at the forced vital capacity; an IC beyond it (gas trapping) is drawn on the envelope's end.
  if (eel > fvcEnd - 0.03) { eel = Math.max(fvcEnd - 0.03, 0.2); clamped = true; }
  const vt = Math.min(TIDAL.vtL, 0.5 * eel);
  const qe = (Math.PI * vt) / (2 * TIDAL.teS), qi = (Math.PI * vt) / (2 * TIDAL.tiS);
  const N = 72, v = [], f = [];
  for (let i = 0; i <= N; i++) {
    const th = (2 * Math.PI * i) / N;
    const x = eel - vt / 2 - (vt / 2) * Math.cos(th);
    let y = th <= Math.PI ? qe * Math.sin(th) : qi * Math.sin(th);
    if (y > 0) y = Math.min(y, 0.97 * Math.max(interpAt(env.v, env.f, x), 0));
    v.push(x); f.push(y);
  }
  return { ic, eel, vt, clamped, v, f };
}

function maneuverFaultsText(m) {
  return m.faults.map((f) => faultWording(f, 'label')).join(', ');
}

/**
 * Data for the panel and, through it, the stand-alone figures.
 * @param {object} c case data: the case plus interp (optional), revealed (optional)
 * @param {object} [interp] interpretation (defaults to c.interp)
 */
export function spirometryData(c, interp) {
  const pre = c?.spirometry?.pre;
  if (!pre?.maneuvers?.length) return null;
  const seed = c.descriptor?.seed ?? 0;
  let ip = interp ?? c.interp ?? null;
  if (!ip && c.report && typeof c.resolve === 'function') ip = interpret(c.report, c.resolve, c.equation ?? 'GLIglobal');
  const mk = (id, set) => {
    const best = bestIndex(set);
    const maneuvers = set.maneuvers.map((m, i) => {
      const { exp, insp } = maneuverTrace(m, { seed, index: i, set: id, scenario: c.scenario ?? null });
      const ev = set.summary.evaluations[i];
      const pk = peakFlow(m.curve);
      const ipk = idxAt(exp.t, pk.t);
      const t = exp.t.map((x) => x - m.t0);
      const tEnd = t[t.length - 1];
      const plateau = exp.v[exp.v.length - 1] - interpAt(t, exp.v, Math.max(t[0], tEnd - 1));
      const ok = ev.fev1.acceptable && ev.fvc.acceptable ? 2 : ev.fev1.usable || ev.fvc.usable ? 1 : 0;
      return {
        number: i + 1, index: i,
        exp: { t: exp.t, v: exp.v, f: exp.f }, insp: { t: insp.t, v: insp.v, f: insp.f, fivc: insp.fivc },
        fivc: insp.fivc, flags: insp.flags,
        t, v: exp.v, t0: m.t0, bev: m.bev,
        fev1: m.fev1, fvc: m.fvc, pef: m.pef, fet: m.fet, plateau,
        peak: { v: exp.v[ipk], f: exp.f[ipk] }, tPeak: pk.t - m.t0,
        faults: m.faults, comment: maneuverFaultsText(m), commentShort: m.faults.map((f) => faultWording(f, 'short')).join(', '),
        accepted: isAcceptable(set, i),
        verdicts: { fev1: ev.fev1, fvc: ev.fvc },
        score: ok * 100 + m.fvc + m.fev1,
      };
    });
    return { id, label: SET_LABEL[id], best, maneuvers };
  };
  const sets = [mk('pre', pre)];
  if (c.spirometry.post?.maneuvers?.length) sets.push(mk('post', c.spirometry.post));
  const bestPre = sets[0].maneuvers[sets[0].best];
  return {
    revealed: !!c.revealed,
    sets,
    predicted: predictedCurve(ip),
    tidal: tidalLoop(c, bestPre.exp),
  };
}

/* ------------------------------------------------------------------------------------------ selection */

/**
 * Which maneuvers each view draws. A set with no selected maneuver is left out.
 * @returns {{ set: object, items: { m: object, best: boolean, rank: number }[] }[]}
 */
export function chooseShown(data, view = 'best', selected) {
  const sel = Array.isArray(selected) ? new Set(selected.map(Number)) : null;
  const out = [];
  for (const set of data.sets) {
    if (view === 'best') { out.push({ set, items: [{ m: set.maneuvers[set.best], best: true, rank: 0 }] }); continue; }
    const list = set.maneuvers.filter((m) => !sel || sel.has(m.number));
    if (!list.length) continue;
    const top = list.reduce((a, b) => (b.score > a.score ? b : a));
    // Best first, then the others in recorded order.
    const items = [{ m: top, best: true, rank: 0 }, ...list.filter((m) => m !== top).map((m, k) => ({ m, best: false, rank: k + 1 }))];
    out.push({ set, items: view === 'separate' ? list.map((m) => ({ m, best: m === top, rank: 0 })) : items });
  }
  return out;
}

const seriesColor = (palette, id) => (id === 'post' ? palette.second : palette.measured);

/** Stroke width and opacity of one overlaid curve. */
function itemStyle(view, it) {
  if (view === 'all' && !it.best) return { width: 1.3, opacity: Math.max(0.35, 0.72 - 0.08 * (it.rank - 1)) };
  return { width: view === 'separate' ? 1.7 : 2.1, opacity: 1 };
}

/* ------------------------------------------------------------------------------------------- drawing */

const P = (d, { stroke, width = 1.8, dash, opacity }) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}${opacity !== undefined && opacity < 1 ? ` stroke-opacity="${r1(opacity * 100) / 100}"` : ''}/>`;
/** Polyline path; points less than 0.3 px from the previous kept point are dropped (flat tails would repeat hundreds of times). */
const poly = (pts) => {
  let out = '', px = NaN, py = NaN;
  pts.forEach(([x, y], i) => {
    if (i && i < pts.length - 1 && Math.hypot(x - px, y - py) < 0.3) return;
    out += `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`;
    px = x; py = y;
  });
  return out;
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Pixel points of a polyline, densified to at most 4 px between points, for label collision tests. */
function dense(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    out.push(pts[i]);
    if (i + 1 < pts.length) {
      const n = Math.floor(dist(pts[i], pts[i + 1]) / 4);
      for (let k = 1; k <= n; k++) out.push([pts[i][0] + ((pts[i + 1][0] - pts[i][0]) * k) / (n + 1), pts[i][1] + ((pts[i + 1][1] - pts[i][1]) * k) / (n + 1)]);
    }
  }
  return out;
}
const hits = (box, obstacles) => { let n = 0; for (const pts of obstacles) for (const [x, y] of pts) if (x >= box.x - 1 && x <= box.x + box.w + 1 && y >= box.y - 1 && y <= box.y + box.h + 1) n++; return n; };
/** First candidate box that no obstacle point touches; the one with the fewest touches otherwise. */
function place(cands, obstacles) {
  let best = cands[0], bestN = Infinity;
  for (const c of cands) { const n = hits(c, obstacles); if (n === 0) return c; if (n < bestN) { best = c; bestN = n; } }
  return best;
}
const unit = (dx, dy) => { const n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; };

/**
 * Pixel path of one loop. The inspiratory limb starts at the end of expiration with a vertical tangent (the volume
 * changes slowly while flow rises), so a straight join makes a vertical drop. The corner is replaced by one cubic
 * Bezier whose end tangents are those of the two limbs, a few pixels from the join, which rounds it without moving
 * the curves away from the data.
 * @param {{ exp: {v:number[],f:number[]}, insp: {v:number[],f:number[]} }} m
 */
export function loopPath(m, sx, sy, corner = 8) {
  const E = m.exp.v.map((v, i) => [sx(v), sy(m.exp.f[i])]);
  const I = m.insp.v.map((v, i) => [sx(v), sy(m.insp.f[i])]);
  if (I.length < 2) return poly(E); // A scalar FIVC observation does not supply an inspiratory trace.
  const A = E[E.length - 1];
  let jb = 1;
  while (jb < I.length - 2 && dist(A, I[jb]) < corner) jb++;
  const B = I[jb];
  let ja = E.length - 2;
  while (ja > 0 && dist(A, E[ja]) < 3) ja--;
  let jc = Math.min(jb + 1, I.length - 1);
  while (jc < I.length - 1 && dist(B, I[jc]) < 3) jc++;
  const dA = unit(A[0] - E[ja][0], A[1] - E[ja][1]);
  const dB = unit(I[jc][0] - B[0], I[jc][1] - B[1]);
  const h = 0.4 * dist(A, B);
  const c1 = [A[0] + dA[0] * h, A[1] + dA[1] * h], c2 = [B[0] - dB[0] * h, B[1] - dB[1] * h];
  return `${poly(E)}C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(B[0])} ${r1(B[1])}${poly(I.slice(jb + 1)).replace(/^M/, 'L')}`;
}

/** Axis ranges of a loop plot over the drawn maneuvers and the extras. */
export function loopRanges(maneuvers, extras = []) {
  let xMin = 0, xMax = 0, yMax = 0, yMin = 0;
  for (const m of maneuvers) {
    xMax = Math.max(xMax, m.exp.v[m.exp.v.length - 1], ...m.insp.v);
    xMin = Math.min(xMin, ...m.insp.v);
    yMax = Math.max(yMax, ...m.exp.f);
    yMin = Math.min(yMin, ...m.insp.f);
  }
  for (const c of extras) if (c) { xMax = Math.max(xMax, ...c.v); yMax = Math.max(yMax, ...c.f); }
  xMax = Math.max(3, niceUp(xMax + 0.2, 1));
  xMin = xMin < -0.15 ? -niceUp(-xMin, 1) : 0;
  yMax = Math.max(4, niceUp(yMax * 1.06, 2));
  yMin = -Math.max(4, niceUp(-yMin * 1.06, 2));
  return { xMin, xMax, yMin, yMax };
}

/**
 * Scale for a loop plot with 2 L/s as long as 1 L, fitted (bottom left) into a box.
 * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }} R
 * @param {{ x: number, y: number, w: number, h: number }} box
 */
export function loopScale(R, box) {
  const xr = R.xMax - R.xMin, yr = R.yMax - R.yMin;
  const pxPerL = Math.min(box.w / xr, box.h / (yr / 2));
  const w = xr * pxPerL, h = (yr / 2) * pxPerL;
  const x = box.x, y = box.y + box.h - h;
  return { ...R, x, y, w, h, pxPerL, pxPerLps: pxPerL / 2, sx: (v) => x + (v - R.xMin) * pxPerL, sy: (f) => y + (R.yMax - f) * (pxPerL / 2) };
}

const stepFor = (pxPerUnit, minPx, options) => options.find((s) => s * pxPerUnit >= minPx) ?? options[options.length - 1];

/**
 * Draws one flow-volume plot.
 * @param {object} sc loopScale result
 * @param {{ palette: object, shown: ReturnType<typeof chooseShown>, view: string, predicted?: object|null, tidal?: object|null, quality: boolean }} d
 * @param {{ fs?: number, titles?: boolean, labelPef?: boolean, tidalLabel?: boolean, lw?: number, units?: boolean }} [o]
 */
export function drawLoop(sc, d, o = {}) {
  const { palette } = d;
  const fs = o.fs ?? 10;
  const { sx, sy } = sc;
  let g = '';
  const xStep = stepFor(sc.pxPerL, 20, [1, 2, 5]);
  const yStep = stepFor(sc.pxPerLps, 14, [2, 4, 5, 10]);
  for (const x of tickValues(sc.xMin, sc.xMax, xStep)) {
    g += line(sx(x), sy(sc.yMax), sx(x), sy(sc.yMin), { stroke: palette.grid, width: 1 });
    g += text(sx(x), sy(sc.yMin) + fs + 3, String(x), { palette, anchor: 'middle', size: fs, fill: palette.axis });
  }
  for (const y of tickValues(sc.yMin, sc.yMax, yStep)) {
    g += line(sx(sc.xMin), sy(y), sx(sc.xMax), sy(y), { stroke: palette.grid, width: 1 });
    g += text(sx(sc.xMin) - 5, sy(y) + fs * 0.35, String(y).replace('-', '−'), { palette, anchor: 'end', size: fs, fill: palette.axis });
  }
  g += line(sx(sc.xMin), sy(0), sx(sc.xMax), sy(0), { stroke: palette.axis, width: 1.2 });
  g += line(sx(sc.xMin), sy(sc.yMax), sx(sc.xMin), sy(sc.yMin), { stroke: palette.axis, width: 1.2 });
  g += line(sx(sc.xMin), sy(sc.yMin), sx(sc.xMax), sy(sc.yMin), { stroke: palette.axis, width: 1.2 });
  // Heavy vertical line at volume 0 marks the start of the forced expiration when the loop extends to its left.
  if (sc.xMin < 0) g += line(sx(0), sy(sc.yMax), sx(0), sy(sc.yMin), { stroke: palette.axis, width: 2 });
  if (o.titles !== false) {
    g += text(sx((sc.xMin + sc.xMax) / 2), sy(sc.yMin) + 2 * fs + 6, 'Exhaled volume (L)', { palette, anchor: 'middle', size: fs + 0.5, fill: palette.axis });
    g += text(sc.x - 5 - 2.4 * fs - 6, sy((sc.yMax + sc.yMin) / 2), 'Flow (L/s)', { palette, anchor: 'middle', size: fs + 0.5, fill: palette.axis, rotate: -90 });
    g += text(sx(sc.xMax) - 4, sy(sc.yMax) + fs + 2, 'expiration', { palette, anchor: 'end', size: fs, fill: palette.axis, italic: true });
    g += text(sx(sc.xMax) - 4, sy(sc.yMin) - 5, 'inspiration', { palette, anchor: 'end', size: fs, fill: palette.axis, italic: true });
  } else if (o.units) {
    g += text(sx(sc.xMin) + 3, sy(sc.yMax) - 4, 'L/s', { palette, size: fs, fill: palette.axis });
    g += text(sx(sc.xMax) + 7, sy(sc.yMin) + fs + 3, 'L', { palette, size: fs, fill: palette.axis });
  }
  // Predicted expiratory curve (constructed) and tidal loop, behind the data.
  const obstacles = [];
  if (d.predicted) {
    const pts = d.predicted.v.map((v, i) => [sx(v), sy(d.predicted.f[i])]);
    obstacles.push(dense(pts));
    g += P(poly(pts), { stroke: palette.predicted, width: 1.7, dash: DASH.predicted });
  }
  const textW = (str) => str.length * fs * 0.52;
  // The plot frame and the zero-flow axis are obstacles too, so that labels stay inside the plot and off the axes.
  obstacles.push(dense([[sx(sc.xMin), sy(sc.yMax)], [sx(sc.xMax), sy(sc.yMax)], [sx(sc.xMax), sy(sc.yMin)], [sx(sc.xMin), sy(sc.yMin)], [sx(sc.xMin), sy(sc.yMax)]]));
  obstacles.push(dense([[sx(sc.xMin), sy(0)], [sx(sc.xMax), sy(0)]]));
  if (d.tidal) {
    const pts = d.tidal.v.map((v, i) => [sx(v), sy(d.tidal.f[i])]);
    obstacles.push(dense(pts));
    g += P(`${poly(pts)}Z`, { stroke: palette.mark, width: 1.3 });
  }
  // Maneuvers: muted ones first, then the others with the best last so that it is on top.
  const muted = (it) => d.quality && d.view !== 'best' && !it.m.accepted;
  const flat = d.shown.flatMap(({ set, items }) => items.map((it) => ({ set, it })));
  const order = [...flat.filter(({ it }) => muted(it)), ...flat.filter(({ it }) => !muted(it) && !it.best), ...flat.filter(({ it }) => !muted(it) && it.best)];
  for (const { set, it } of order) {
    const st = itemStyle(d.view, it);
    obstacles.push(dense([...it.m.exp.v.map((v, i) => [sx(v), sy(it.m.exp.f[i])]), ...it.m.insp.v.map((v, i) => [sx(v), sy(it.m.insp.f[i])])]));
    g += P(loopPath(it.m, sx, sy), { stroke: muted(it) ? palette.rejected : seriesColor(palette, set.id), width: o.lw ?? st.width, opacity: muted(it) ? 0.9 : st.opacity });
  }
  // Label of the tidal loop: below it, or beside it when that band is taken.
  if (d.tidal && o.tidalLabel !== false) {
    const w = textW('tidal'), cx = sx(d.tidal.eel - d.tidal.vt / 2), bot = sy(Math.min(...d.tidal.f)), top = sy(Math.max(...d.tidal.f));
    const c = place([
      { x: cx - w / 2, y: bot + 2, w, h: fs }, { x: cx - w / 2, y: top - fs - 2, w, h: fs },
      { x: sx(d.tidal.eel - d.tidal.vt) - w - 4, y: (top + bot) / 2 - fs / 2, w, h: fs },
    ], obstacles);
    g += text(c.x + w / 2, c.y + fs * 0.85, 'tidal', { palette, anchor: 'middle', size: fs, fill: palette.axis, italic: true });
  }
  // PEF markers: open diamonds on the plotted trace at the time of maximal flow; the label goes on the higher of two close ones.
  const marks = flat.filter(({ it }) => it.best || d.view === 'separate' || d.view === 'best');
  const sorted = [...marks].sort((a, b) => b.it.m.peak.f - a.it.m.peak.f);
  const labelled = [];
  for (const { set, it } of sorted) {
    const px = sx(it.m.peak.v), py = sy(it.m.peak.f), s2 = 4;
    g += `<path d="M${r1(px)} ${r1(py - s2)}L${r1(px + s2)} ${r1(py)}L${r1(px)} ${r1(py + s2)}L${r1(px - s2)} ${r1(py)}Z" fill="none" stroke="${seriesColor(palette, set.id)}" stroke-width="1.4"/>`;
    if (o.labelPef !== false && !labelled.some((q) => Math.abs(q - py) < fs + 2)) {
      const w = textW('PEF');
      const c = place([
        { x: px + s2 + 3, y: py - fs / 2, w, h: fs }, { x: px + s2 + 3, y: py - s2 - fs - 1, w, h: fs },
        { x: px - w / 2, y: py - s2 - fs - 3, w, h: fs }, { x: px + s2 + 3, y: py + s2, w, h: fs },
      ], obstacles);
      g += text(c.x, c.y + fs * 0.85, 'PEF', { palette, size: fs, fill: palette.axis });
      labelled.push(py);
    }
  }
  return g;
}

/** Axis ranges of a volume-time plot. */
export function vtRanges(maneuvers, predictedFvc = 0) {
  const tEndMax = Math.max(...maneuvers.map((m) => m.t[m.t.length - 1]));
  const t0Max = Math.max(0, ...maneuvers.map((m) => m.t0));
  const xMin = t0Max > 0.9 ? -Math.ceil(t0Max + 0.2) : -1;
  const xMax = Math.max(6, Math.ceil(tEndMax + 0.5));
  const top = Math.max(...maneuvers.map((m) => m.fvc), predictedFvc);
  const yStep = top > 10 ? 2 : 1;
  const yMax = Math.max(yStep, niceUp(top * 1.08, yStep));
  return { xMin, xMax, yMin: 0, yMax, yStep };
}

/**
 * Draws one volume-time plot. The trace starts 1 s before time zero at volume 0 (breath held at TLC); there is no
 * pre-test wave. FEV1 is a short tick at t = 1 s with no dots, drop lines or values.
 * @param {{ x: number, y: number, w: number, h: number, xMin: number, xMax: number, yMax: number, yStep: number }} sc plot rectangle plus ranges
 * @param {{ palette: object, shown: ReturnType<typeof chooseShown>, view: string, predicted?: object|null, quality: boolean }} d
 * @param {{ fs?: number, titles?: boolean, tangent?: boolean, numbers?: boolean, units?: boolean, lw?: number }} [o]
 */
export function drawVolumeTime(sc, d, o = {}) {
  const { palette } = d;
  const fs = o.fs ?? 10;
  const sx = (t) => sc.x + ((t - sc.xMin) / (sc.xMax - sc.xMin)) * sc.w;
  const sy = (v) => sc.y + sc.h - (v / sc.yMax) * sc.h;
  const pxS = sc.w / (sc.xMax - sc.xMin), pxL = sc.h / sc.yMax;
  let g = '';
  const xStep = stepFor(pxS, 24, [1, 2, 5, 10]);
  for (const x of tickValues(sc.xMin, sc.xMax, xStep)) {
    g += line(sx(x), sy(0), sx(x), sy(sc.yMax), { stroke: palette.grid, width: 1 });
    g += text(sx(x), sy(0) + fs + 3, String(x).replace('-', '−'), { palette, anchor: 'middle', size: fs, fill: palette.axis });
  }
  const yStep = Math.max(sc.yStep, stepFor(pxL, 14, [0.5, 1, 2, 5, 10]));
  for (const y of tickValues(0, sc.yMax, yStep)) {
    g += line(sx(sc.xMin), sy(y), sx(sc.xMax), sy(y), { stroke: palette.grid, width: 1 });
    g += text(sx(sc.xMin) - 5, sy(y) + fs * 0.35, String(y), { palette, anchor: 'end', size: fs, fill: palette.axis });
  }
  g += line(sx(sc.xMin), sy(0), sx(sc.xMax), sy(0), { stroke: palette.axis, width: 1.2 });
  g += line(sx(sc.xMin), sy(sc.yMax), sx(sc.xMin), sy(0), { stroke: palette.axis, width: 1.2 });
  // Time zero (back-extrapolated start of the forced expiration).
  g += line(sx(0), sy(0), sx(0), sy(sc.yMax), { stroke: palette.axis, width: 1, dash: DASH.mark });
  if (o.titles !== false) {
    g += text(sx((sc.xMin + sc.xMax) / 2), sy(0) + 2 * fs + 6, 'Time (s); 0 is the back-extrapolated start', { palette, anchor: 'middle', size: fs + 0.5, fill: palette.axis });
    g += text(sc.x - 5 - 1.9 * fs - 6, sy(sc.yMax / 2), 'Exhaled volume (L)', { palette, anchor: 'middle', size: fs + 0.5, fill: palette.axis, rotate: -90 });
  } else if (o.units) {
    g += text(sx(sc.xMin) + 3, sy(sc.yMax) - 4, 'L', { palette, size: fs, fill: palette.axis });
    g += text(sx(sc.xMax) + 7, sy(0) + fs + 3, 's', { palette, size: fs, fill: palette.axis });
  }
  // Predicted FVC (equation-backed): a dashed horizontal line with its label above it, at the left where the trace is low.
  if (d.predicted) {
    const y = sy(d.predicted.fvc);
    g += line(sx(sc.xMin), y, sx(sc.xMax), y, { stroke: palette.predicted, width: 1.4, dash: DASH.predicted });
    if (o.titles !== false) {
      const lx = sx(sc.xMax) + (o.numbers ? 15 : 5);
      g += text(lx, y - 1, 'predicted', { palette, size: fs, fill: palette.axis });
      g += text(lx, y + fs, 'FVC', { palette, size: fs, fill: palette.axis });
    }
  }
  const muted = (it) => d.quality && d.view !== 'best' && !it.m.accepted;
  const flat = d.shown.flatMap(({ set, items }) => items.map((it) => ({ set, it })));
  const order = [...flat.filter(({ it }) => muted(it)), ...flat.filter(({ it }) => !muted(it) && !it.best), ...flat.filter(({ it }) => !muted(it) && it.best)];
  for (const { set, it } of order) {
    const m = it.m, st = itemStyle(d.view, it);
    const pts = [[sx(sc.xMin), sy(0)], ...m.t.map((t, i) => [sx(t), sy(m.v[i])])];
    g += P(poly(pts), { stroke: muted(it) ? palette.rejected : seriesColor(palette, set.id), width: o.lw ?? st.width, opacity: muted(it) ? 0.9 : st.opacity });
  }
  // Maneuver numbers at the end of each trace when several are overlaid (outside the curve, to its right).
  if (o.numbers) {
    for (const { set, it } of flat) {
      const m = it.m, tEnd = m.t[m.t.length - 1];
      g += text(sx(tEnd) + 3, sy(m.fvc) + fs * 0.35, String(m.number), { palette, size: fs, fill: seriesColor(palette, set.id) });
    }
  }
  // Back-extrapolation line of the best curve of the first set: from time zero to just past the peak.
  if (o.tangent) {
    const first = d.shown[0]?.items.find((it) => it.best) ?? d.shown[0]?.items[0];
    if (first) {
      const m = first.m;
      const tx = Math.min(m.tPeak + 0.45, sc.yMax / Math.max(m.pef, 1e-6));
      g += line(sx(0), sy(0), sx(tx), sy(m.pef * tx), { stroke: palette.mark, width: 1.1, dash: DASH.mark });
    }
  }
  // FEV1: a short tick across the trace at t = 1 s, and the word beside the lowest tick.
  const ticks = flat.filter(({ it }) => it.best || d.view === 'separate' || d.view === 'best');
  let lowest = Infinity;
  for (const { set, it } of ticks) {
    const px = sx(1), py = sy(it.m.fev1);
    g += line(px, py - 6, px, py + 6, { stroke: seriesColor(palette, set.id), width: 1.8 });
    lowest = Math.min(lowest, it.m.fev1);
  }
  if (Number.isFinite(lowest) && o.titles !== false) {
    const px = sx(1), py = sy(lowest), w = 'FEV1'.length * fs * 0.52;
    const obstacles = flat.map(({ it }) => dense([[sx(sc.xMin), sy(0)], ...it.m.t.map((t, i) => [sx(t), sy(it.m.v[i])])]));
    obstacles.push(dense([[sx(0), sy(0)], [sx(0), sy(sc.yMax)]]));
    if (d.predicted) obstacles.push(dense([[sx(sc.xMin), sy(d.predicted.fvc)], [sx(sc.xMax), sy(d.predicted.fvc)]]));
    if (o.tangent) obstacles.push(dense([[sx(0), sy(0)], [sx(1), sy(sc.yMax)]]));
    const c = place([
      { x: px + 7, y: py + 4, w, h: fs }, { x: px - 8 - w, y: py - 12 - fs, w, h: fs },
      { x: px + 7, y: py - fs / 2, w, h: fs }, { x: px - 8 - w, y: py + 4, w, h: fs },
    ], obstacles);
    g += text(c.x, c.y + fs * 0.85, 'FEV1', { palette, size: fs, fill: palette.axis });
  }
  return g;
}

/* ------------------------------------------------------------------------------------------- legend */

/** Legend in rows that wrap at maxW; item width is estimated from the label (the face is narrow: 0.5 em per character). */
export function legendRows(items, x, y, maxW, palette, size = 10.5) {
  let out = '', cx = 0, row = 0;
  const rowH = size + 5, sample = 22;
  for (const it of items) {
    const w = sample + 6 + it.label.length * size * 0.5 + 16;
    if (cx > 0 && cx + w > maxW) { cx = 0; row++; }
    const yy = y + row * rowH;
    out += line(x + cx, yy - size * 0.32, x + cx + sample, yy - size * 0.32, { stroke: it.color, width: it.width ?? 2, dash: it.dash });
    out += text(x + cx + sample + 6, yy, it.label, { palette, size });
    cx += w;
  }
  return { markup: out, rows: row + 1, height: (row + 1) * rowH };
}

/** Legend entries for the drawn series. */
export function legendItems(data, shown, view, palette, { quality, tidal = true, tangent = true } = {}) {
  const items = [];
  const multi = data.sets.length > 1;
  for (const { set, items: its } of shown) {
    const nums = its.map((it) => it.m.number).sort((a, b) => a - b);
    const many = view !== 'best' && its.length > 1;
    const label = (multi ? set.label : 'Measured') + (many ? `, maneuvers ${nums.join(', ')}${view === 'all' ? ' (best emphasized)' : ''}` : view === 'best' ? ', best maneuver' : '');
    items.push({ label, color: seriesColor(palette, set.id), width: 2.2 });
  }
  if (quality && view !== 'best' && shown.some(({ items: its }) => its.some((it) => !it.m.accepted))) items.push({ label: 'Not acceptable', color: palette.rejected, width: 1.6 });
  if (data.predicted) items.push({ label: predictedLabel(data.predicted), color: palette.predicted, width: 1.7, dash: DASH.predicted });
  if (tidal && data.tidal) items.push({ label: 'Tidal breathing at the end-expiratory level (from IC)', color: palette.mark, width: 1.3 });
  if (tangent) items.push({ label: 'Back-extrapolation line', color: palette.mark, width: 1.1, dash: DASH.mark });
  return items;
}

/* --------------------------------------------------------------------------------- separate tiles */

const clip = (s, n) => (s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s);

/** Technologist comment of a maneuver and, when quality is shown, the verdicts. */
export function tileLines(set, m, quality, maxChars) {
  const lines = [`FEV1 ${fix(m.fev1, 2)} L; FVC ${fix(m.fvc, 2)} L`, `Comment: ${m.commentShort || 'none'}`];
  if (quality) {
    const v = m.verdicts;
    const word = (x) => (x.acceptable ? 'acceptable' : x.usable ? 'usable' : 'not usable');
    lines.push(`FEV1 ${word(v.fev1)}; FVC ${word(v.fvc)}`);
  }
  return lines.map((l) => clip(l, maxChars));
}

/**
 * Grid of small panels, one per maneuver. `content` draws the plots of one tile inside a box and returns markup.
 * @returns {{ markup: string, height: number }}
 */
export function tileGrid({ palette, tiles, W, top, plotH, quality, drawPlots, cols = 2 }) {
  const M = 12, gap = 16;
  const tileW = (W - 2 * M - gap * (cols - 1)) / cols;
  const textLines = quality ? 3 : 2;
  const tileH = 34 + plotH + 16 + textLines * 12.5 + 12;
  let g = '';
  tiles.forEach((t, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x0 = M + col * (tileW + gap), y0 = top + row * tileH;
    g += `<rect x="${r1(x0 - 4)}" y="${r1(y0)}" width="${r1(tileW + 8)}" height="${r1(tileH - 8)}" rx="4" fill="none" stroke="${palette.grid}" stroke-width="1"/>`;
    const best = quality && t.it.best;
    g += text(x0, y0 + 13, `${SET_SHORT[t.set.id]} ${t.it.m.number}${best ? ' (best)' : ''}`, { palette, size: 11.5, weight: 600, fill: seriesColor(palette, t.set.id) });
    g += drawPlots({ x: x0, y: y0 + 34, w: tileW, h: plotH }, t);
    const lines = tileLines(t.set, t.it.m, quality, Math.floor(tileW / 5.2));
    lines.forEach((l, k) => { g += text(x0, y0 + 34 + plotH + 29 + k * 12.5, l, { palette, size: 10.5, fill: k === 0 ? palette.text : palette.axis }); });
  });
  const rows = Math.ceil(tiles.length / cols);
  return { markup: g, height: rows * tileH };
}

/* ---------------------------------------------------------------------------------------- the panel */

function render(data, opts = {}) {
  const palette = resolvePalette(opts.palette);
  const W = opts.width ?? 672;
  const view = ['best', 'all', 'separate'].includes(opts.view) ? opts.view : 'best';
  const quality = opts.showQuality ?? data.revealed ?? false;
  const shown = chooseShown(data, view, opts.selected);
  const drawn = shown.flatMap((s) => s.items.map((it) => it.m));
  const fs = 10;
  const dData = { palette, shown, view, predicted: data.predicted, tidal: view === 'best' || view === 'all' ? data.tidal : null, quality };
  let g = '', H;

  if (!drawn.length) {
    H = opts.height ?? 120;
    g += text(W / 2, H / 2, 'No maneuver selected', { palette, anchor: 'middle', size: 12, fill: palette.axis });
  } else if (view === 'separate') {
    const LR = loopRanges(drawn, [data.predicted]);
    const VR = vtRanges(drawn, data.predicted?.fvc ?? 0);
    const plotH = 120;
    const tiles = shown.flatMap(({ set, items }) => items.map((it) => ({ set, it })));
    const grid = tileGrid({
      palette, tiles, W, top: 8, plotH, quality,
      drawPlots: (box, t) => {
        const one = [{ set: t.set, items: [t.it] }];
        const dd = { ...dData, shown: one, tidal: null };
        const loop = loopScale(LR, { x: box.x + 26, y: box.y, w: Math.min(box.w * 0.4, 150), h: box.h });
        let out = `<g data-subplot="flow-volume-${t.set.id}-${t.it.m.number}">${drawLoop(loop, dd, { fs: 9.5, titles: false, units: true, labelPef: false, tidalLabel: false })}</g>`;
        const vx = loop.x + loop.w + 30;
        const vt = { x: vx, y: box.y, w: box.x + box.w - vx - 16, h: box.h, ...VR };
        out += `<g data-subplot="volume-time-${t.set.id}-${t.it.m.number}">${drawVolumeTime(vt, dd, { fs: 9.5, titles: false, units: true })}</g>`;
        return out;
      },
    });
    g += grid.markup;
    const items = legendItems(data, shown, view, palette, { quality, tidal: false, tangent: false });
    const lg = legendRows(items, 12, 8 + grid.height + 8, W - 24, palette);
    g += lg.markup;
    H = Math.ceil(8 + grid.height + 8 + lg.height + 6);
  } else {
    H = opts.height ?? 340;
    const lg = legendRows(legendItems(data, shown, view, palette, { quality }), 12, 0, W - 24, palette);
    const notes = noteLines(shown, view);
    const bottom = 2 * fs + 12 + notes.length * 13 + 8 + lg.height + 4;
    const top = 24;
    const plotBottom = H - bottom;
    const plotH = Math.max(80, plotBottom - top);
    const LR = loopRanges(drawn, [data.predicted, data.tidal]);
    const lxr = LR.xMax - LR.xMin, lyr = LR.yMax - LR.yMin;
    const left = 50;
    const maxLoopW = (W - left - 12) * 0.47;
    const pxPerL = Math.min(plotH / (lyr / 2), maxLoopW / lxr);
    const loop = loopScale(LR, { x: left, y: top, w: lxr * pxPerL, h: plotH });
    const vx = loop.x + loop.w + 54;
    const VR = vtRanges(drawn, data.predicted?.fvc ?? 0);
    const vt = { x: vx, y: top, w: W - 60 - vx, h: plotH, ...VR };
    g += text(loop.x, top - 8, 'Flow-volume', { palette, size: 11.5, weight: 600 });
    g += `<g data-subplot="flow-volume">${drawLoop(loop, dData, { fs })}</g>`;
    g += text(vt.x, top - 8, 'Volume-time', { palette, size: 11.5, weight: 600 });
    g += `<g data-subplot="volume-time">${drawVolumeTime(vt, dData, { fs, tangent: true, numbers: view === 'all' && drawn.length > 1 })}</g>`;
    const ny = plotBottom + 2 * fs + 12 + 6;
    notes.forEach((n, i) => { g += text(vt.x, ny + i * 13, n, { palette, size: 10.5, fill: palette.axis }); });
    const ly = ny + Math.max(notes.length, 1) * 13 + 4 + 10.5;
    g += legendRows(legendItems(data, shown, view, palette, { quality }), 12, ly, W - 24, palette).markup;
    H = Math.max(H, Math.ceil(ly + lg.height));
    H = opts.height ?? H;
  }

  const title = opts.title ?? 'Spirometry: flow-volume loop and volume-time curve';
  const description = opts.description ?? describe(data, shown, view);
  return wrapSvg({ palette, width: W, height: H, title, description, body: g, attrs: TRACE_RENDERING_ATTRS });
}

/** Notes under the volume-time plot (outside the curves): back-extrapolated volume and the last-second volume change. */
export function noteLines(shown, view) {
  const rows = shown.map(({ set, items }) => ({ set, m: (items.find((it) => it.best) ?? items[0]).m }));
  const multi = rows.length > 1;
  const pre = (s) => (multi ? `${SET_SHORT[s.id].toLowerCase()} ` : '');
  const join = (f) => rows.map(({ set, m }) => `${pre(set)}${f(m)}`).join(', ');
  const which = view === 'best' ? '' : ' (best maneuver)';
  return [
    `Back-extrapolated volume: ${join((m) => `${fix(m.bev, 3)} L`)}${which}`,
    `Volume change in the last 1 s: ${join((m) => `${fix(m.plateau, 3)} L`)}${which}`,
  ];
}

function describe(data, shown, view) {
  const n = shown.map(({ set, items }) => `${items.length} ${set.label.toLowerCase()}`).join(' and ');
  const pred = data.predicted ? ` The dashed predicted expiratory curve is constructed from the predicted ${data.predicted.points.map((p) => p.name).join(', ')} (${data.predicted.equationIds.map(equationLabel).join('; ')}).` : '';
  const tidal = data.tidal && view !== 'separate' ? ' The small tidal loop sits at the end-expiratory level given by the inspiratory capacity.' : '';
  return `Spirometry panel, ${view} view: flow-volume loop of ${n} maneuver${shown.length > 1 || shown[0]?.items.length > 1 ? 's' : ''} (flow in liters per second against exhaled volume in liters, expiration up, 2 L/s drawn as long as 1 L) and volume-time curve (exhaled volume against time from 1 s before time zero).${pred}${tidal}`;
}

function dataFor(c, interp) {
  return spirometryData(c, interp);
}

export default { id: 'panel-spirometry', title: 'Spirometry panel: flow-volume loop and volume-time curve', render, dataFor };
