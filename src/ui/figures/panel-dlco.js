/**
 * Report panel for the single-breath diffusing capacity: the tracer and CO fractions against expired volume
 * (the form the 2017 standard asks the test to be reviewed in) above a validity strip.
 *
 * Plot: CO (series color `measured`) and tracer gas (`second`) in percent against expired volume. The washout
 * (discarded) volume and the alveolar sample window are shaded, the dead-space volume VD is a dashed marker,
 * and the phase II transition and the sloping alveolar plateau are visible directly. There is no time axis,
 * so nothing is drawn for the breath-hold: no gas reaches the analyzer during the hold, and the time view that
 * does show it (dlco-trace.js) marks the interval "not sampled".
 *
 * Validity strip: plain text columns under the plot, one row per test shown: VI/VC, time to 85% of VI,
 * breath-hold time, washout and sample volume, VA, DLCO, KCO and (only with `showQuality`) the test grade.
 * The grade, the failed criteria and the marks on out-of-range values are the answer to a learner question and
 * are drawn only when `showQuality` is true. Flag color is text only: a value outside its criterion is marked by
 * an asterisk and the `second` series color, never by a fill.
 *
 * Views (docs/REPORT-PAGE-PLAN.md, Separable loops): the case may hold several tests (an array of traces or
 * `{ tests: [...] }`; today it holds one). `view` is 'best' (the best test only, the report default), 'all'
 * (the selected tests overlaid, the best emphasized and every test numbered) or 'separate' (one small plot per
 * selected test on common axes, with its number and values underneath). `selected` is a list of 1-based test
 * numbers; the default is every test. With one test 'best' and 'all' draw it and 'separate' draws it alone.
 *
 * Text is 9.5 to 12 px at the default 672 px width (7 in at 96 px/in), i.e. 7 to 9 pt when printed at 7 in.
 * Random streams: none (the data are drawn by buildDlcoTrace).
 */
import { PALETTES } from '../palettes.js';
import { DLCO_MODEL } from '../../core/dlco-trace.js';
import dlcoTraceFigure, { dlcoTests, bestDlcoIndex } from './dlco-trace.js';
import { open, close, text, line, rect, polyline, scale, niceTicks, frame, num } from './fig-a-kit.js';

const niceTop = (x) => { const t = niceTicks(0, x, 4); const top = t[t.length - 1]; return top >= x ? top : top + (t[1] - t[0]); };

/** Value flags for the strip, from the same limits the grade uses (answer-key content; drawn only with showQuality). */
function flagsOf(t) {
  const q = t.quality ?? {};
  const [bhLo, bhHi] = DLCO_MODEL.breathHoldWindowS.value;
  const wr = DLCO_MODEL.washoutVolumeL.value, sr = DLCO_MODEL.sampleVolumeL.value;
  const washMin = q.vcL < DLCO_MODEL.washoutVolumeL.smallVcLimitL ? DLCO_MODEL.washoutVolumeL.smallVcMin : wr[0];
  return {
    vi: q.viOverVc < DLCO_MODEL.viOverVcMin.value,
    t85: q.t85S >= DLCO_MODEL.inspiration85PctMaxS.value,
    hold: q.breathHoldS < bhLo || q.breathHoldS > bhHi,
    wash: q.washoutL < washMin - 1e-9 || q.washoutL > wr[1] + 1e-9,
    sample: q.sampleL > sr[1] + 1e-9 || (q.sampleL < sr[0] - 1e-9 && q.vcL >= 1.0),
  };
}

const GRADE_TEXT = (g, many) => g.origin === 'interim2017' ? `Interim maneuver row ${g.grade}${g.acceptable ? ', acceptable' : ', requires qualification/review'}` : `${many ? 'Rubric' : 'Simulator rubric'} ${g.grade}${g.wouldBeRejected ? ', requires review' : g.grade === 'B' ? ', accepted with a note' : ', acceptable'}`;

/**
 * Gas-against-volume plot for a list of tests.
 * @param {object} o x0, y0, w, h in px; items [{ t, k, emph }]; xMax, yMax shared range; small (separate view)
 */
function volumePlot({ x0, y0, w, h, items, xMax, yMax, palette, small = false, labelCurves = false }) {
  const out = [];
  const xs = scale(0, xMax, x0, x0 + w), ys = scale(0, yMax, y0 + h, y0);
  const lead = items.find((it) => it.emph) ?? items[0];
  const mk = lead.t.markers;
  out.push(frame({
    x0, y0, w, h, xs, ys, xRange: [0, xMax], yRange: [0, yMax], xTicks: niceTicks(0, xMax, small ? 3 : 5), yTicks: niceTicks(0, yMax, small ? 3 : 4),
    xLabel: 'Expired volume (L)', yLabel: small ? '' : 'Gas fraction (%)', palette,
  }));
  // Washout (discarded) and sample window of the emphasized test, then the dead-space marker.
  out.push(rect(xs(0), y0, xs(mk.washout.endL) - xs(0), h, { fill: palette.mark, opacity: 0.2 }));
  out.push(rect(xs(mk.sample.startL), y0, xs(mk.sample.endL) - xs(mk.sample.startL), h, { fill: palette.measured, opacity: 0.25 }));
  out.push(text((xs(0) + xs(mk.washout.endL)) / 2, y0 + 12, small ? 'washout' : 'washout (discarded)', { size: 9.5, anchor: 'middle', fill: palette.text }));
  out.push(text((xs(mk.sample.startL) + xs(mk.sample.endL)) / 2, y0 + 12, small ? 'sample' : 'sample window', { size: 9.5, anchor: 'middle', fill: palette.text }));
  const vdx = xs(lead.t.deadSpaceL);
  out.push(line(vdx, y0 + 17, vdx, y0 + h, { stroke: palette.mark, width: 1, dash: '4 3' }));
  out.push(text(vdx + 3, y0 + h - 5, `VD ${num(lead.t.deadSpaceL, 2)} L`, { size: 9.5, fill: palette.axis }));
  // Curves; non-emphasized tests are thinner and fainter, and numbered at their right end.
  for (const it of [...items].sort((a, b) => Number(a.emph) - Number(b.emph))) {
    const bv = it.t.byVolume;
    const n = bv.volumeL.findIndex((x) => x > xMax + 1e-9);
    const nv = n < 0 ? bv.volumeL.length : n;
    for (const [arr, stroke] of [[bv.tracer, palette.second], [bv.co, palette.measured]]) {
      out.push(polyline(bv.volumeL.slice(0, nv).map((x, j) => [xs(x), ys(arr[j])]), { stroke, width: it.emph ? 1.9 : 1.2, opacity: it.emph ? 1 : 0.55 }));
    }
  }
  if (labelCurves) {
    // Test numbers at the right end of each curve, pushed apart so that close curves keep readable labels.
    for (const [key, stroke] of [['tracer', palette.second], ['co', palette.measured]]) {
      const ends = items.map((it) => {
        const bv = it.t.byVolume;
        const n = bv.volumeL.findIndex((x) => x > xMax + 1e-9);
        const nv = n < 0 ? bv.volumeL.length : n;
        return { it, x: xs(bv.volumeL[nv - 1]), y: ys(bv[key][nv - 1]) + 3.5 };
      }).sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 10.5) ends[i].y = ends[i - 1].y + 10.5;
      for (const e of ends) out.push(text(e.x + 4, e.y, String(e.it.k), { size: 9.5, weight: e.it.emph ? 700 : 400, fill: stroke }));
    }
  }
  return out.join('');
}

function render(data, { palette = PALETTES.dark, width = 672, height, title, description, showQuality = false, view = 'best', selected } = {}) {
  const tests = dlcoTests(data);
  if (!tests.length) return '';
  const all = tests.map((t, i) => ({ t, k: i + 1 }));
  let active = Array.isArray(selected) ? all.filter((it) => selected.includes(it.k)) : all;
  if (!active.length) active = all;
  const bestK = active[bestDlcoIndex(active.map((it) => it.t))].k;
  const mode = view === 'all' || view === 'separate' ? view : 'best';
  const shown = mode === 'best' ? active.filter((it) => it.k === bestK) : active;
  const items = shown.map((it) => ({ ...it, emph: it.k === bestK }));
  const lead = items.find((it) => it.emph) ?? items[0];
  const t0 = lead.t;
  const heading = title ?? 'Single-breath DLCO: gas fractions against expired volume';
  const many = tests.length > 1;

  // Shared axes.
  const xMax = Math.min(Math.max(...items.map((it) => it.t.markers.sample.endL)) + 0.6, Math.min(...items.map((it) => it.t.byVolume.volumeL[it.t.byVolume.volumeL.length - 1])));
  const yMax = niceTop(Math.max(...items.flatMap((it) => [...it.t.byVolume.co, ...it.t.byVolume.tracer])) * 1.12);

  const M = 16;
  const out = [];
  const parts = [];
  let y = 0;

  parts.push(text(M, 18, heading, { size: 12, weight: 700, fill: palette.text }));
  // Legend row.
  {
    let lx = M;
    const ly = 36;
    for (const [label, stroke] of [['CO', palette.measured], [`${t0.gas.tracer} tracer`, palette.second]]) {
      parts.push(line(lx, ly - 3.5, lx + 20, ly - 3.5, { stroke, width: 2 }));
      parts.push(text(lx + 25, ly, label, { size: 10, fill: palette.text }));
      lx += 25 + label.length * 5.8 + 16;
    }
    parts.push(rect(lx, ly - 9, 14, 10, { fill: palette.mark, opacity: 0.25 }));
    parts.push(text(lx + 19, ly, 'washout, discarded', { size: 10, fill: palette.text }));
    lx += 19 + 18 * 5.6 + 16;
    parts.push(rect(lx, ly - 9, 14, 10, { fill: palette.measured, opacity: 0.3 }));
    parts.push(text(lx + 19, ly, 'alveolar sample', { size: 10, fill: palette.text }));
    lx += 19 + 15 * 5.6 + 16;
    parts.push(line(lx, ly - 3.5, lx + 20, ly - 3.5, { stroke: palette.mark, width: 1, dash: '4 3' }));
    parts.push(text(lx + 25, ly, 'dead space VD', { size: 10, fill: palette.text }));
  }
  y = 48;

  if (mode !== 'separate') {
    const plotH = height ? Math.max(100, height - 330) : 190;
    const x0 = 56, w = 410;
    parts.push(volumePlot({ x0, y0: y + 6, w, h: plotH, items, xMax, yMax, palette, labelCurves: mode === 'all' && items.length > 1 }));
    // Gas fractions beside the plot (the numbers behind the plateau reading).
    const v = t0.values, g = t0.gas;
    const bx = x0 + w + 22;
    let by = y + 22;
    const rows = [
      ['Inspired gas', null],
      [`FI,CO`, `${num(g.fiCoPct, 3)} %`],
      [`FI,tr (${g.tracer})`, `${num(g.fiTracerPct, 3)} %`],
      ['Alveolar sample', null],
      ['FA,tr', `${num(v.faTracerPct, 3)} %`],
      ['FA,CO', `${num(v.faCoPct, 3)} %`],
      ['FA,CO,0 (from tracer)', `${num(v.faCo0Pct, 3)} %`],
    ];
    for (const [label, val] of rows) {
      if (val === null) { by += 4; parts.push(text(bx, by, label, { size: 10, weight: 700, fill: palette.text })); by += 15; continue; }
      parts.push(text(bx, by, label, { size: 10, fill: palette.axis }));
      parts.push(text(x0 + w + 22 + 168, by, val, { size: 10, anchor: 'end', fill: palette.text }));
      by += 15;
    }
    y += 6 + plotH + 42;
  } else {
    const cols = Math.min(items.length, 3);
    const cw = (width - 2 * M) / cols;
    const sh = 112;
    items.forEach((it, i) => {
      const cx = M + (i % cols) * cw, cy = y + 6 + Math.floor(i / cols) * (sh + 70);
      parts.push(volumePlot({ x0: cx + 38, y0: cy, w: cw - 52, h: sh, items: [{ ...it, emph: true }], xMax, yMax, palette, small: true }));
      parts.push(text(cx + 38, cy + sh + 44, `Test ${it.k}${it.k === bestK && many ? ' (best)' : ''}`, { size: 10.5, weight: 700, fill: palette.text }));
      const v = it.t.values;
      parts.push(text(cx + 38, cy + sh + 58, `VA ${num(v.vaL, 2)} L · DLCO ${num(v.dlcoMlMinMmHg, 1)}${showQuality && it.t.grade ? ` · ${it.t.grade.origin === 'interim2017' ? 'interim row' : 'rubric'} ${it.t.grade.grade}` : ''}`, { size: 9.5, fill: palette.text }));
    });
    y += 6 + Math.ceil(items.length / cols) * (sh + 70) - 6;
  }

  const strip = [];
  // Validity strip.
  const showTest = many;
  const cols = [
    ...(showTest ? [{ k: 'test', h: ['Test', ''], w: 0.6 }] : []),
    { k: 'vi', h: ['VI/VC', '%'], w: 0.85 },
    { k: 't85', h: ['Time to 85%', 'of VI (s)'], w: 1.1 },
    { k: 'hold', h: ['Breath-hold', '(s)'], w: 1 },
    { k: 'wash', h: ['Washout', '(L)'], w: 0.9 },
    { k: 'sample', h: ['Sample', '(L)'], w: 0.9 },
    { k: 'va', h: ['VA', '(L, BTPS)'], w: 1 },
    { k: 'dlco', h: ['DLCO', '(mL/min/mmHg)'], w: 1.3 },
    { k: 'kco', h: ['KCO', '(mL/min/mmHg/L)'], w: 1.45 },
    ...(showQuality ? [{ k: 'grade', h: [t0.grade?.origin === 'interim2017' ? 'Interim' : 'Model', t0.grade?.origin === 'interim2017' ? 'row' : 'rubric'], w: 0.8 }] : []),
  ];
  const tw = cols.reduce((s, c) => s + c.w, 0), usable = width - 2 * M;
  let acc = M;
  for (const c of cols) { c.x0 = acc; c.cx = acc + (c.w / tw) * usable / 2; acc += (c.w / tw) * usable; }
  const stripTop = y + 4;
  strip.push(line(M, stripTop, width - M, stripTop, { stroke: palette.axis, width: 1 }));
  for (const c of cols) {
    strip.push(text(c.cx, stripTop + 14, c.h[0], { size: 9.5, anchor: 'middle', fill: palette.text, weight: 600 }));
    if (c.h[1]) strip.push(text(c.cx, stripTop + 26, c.h[1], { size: 9.5, anchor: 'middle', fill: palette.axis }));
  }
  strip.push(line(M, stripTop + 33, width - M, stripTop + 33, { stroke: palette.grid, width: 1 }));
  let ry = stripTop + 33;
  for (const it of items) {
    ry += 16;
    const q = it.t.quality, v = it.t.values, f = showQuality ? flagsOf(it.t) : {};
    const cell = {
      test: String(it.k),
      vi: num(q.viOverVc * 100, 0), t85: num(q.t85S, 1), hold: num(q.breathHoldS, 1), wash: num(q.washoutL, 2), sample: num(q.sampleL, 2),
      va: num(v.vaL, 2), dlco: num(v.dlcoMlMinMmHg, 1), kco: num(v.kco, 2), grade: it.t.grade?.grade ?? '',
    };
    const flagKey = { vi: 'vi', t85: 't85', hold: 'hold', wash: 'wash', sample: 'sample' };
    for (const c of cols) {
      const bad = f[flagKey[c.k]];
      strip.push(text(c.cx, ry, bad ? `${cell[c.k]}*` : cell[c.k], { size: 10.5, anchor: 'middle', fill: bad || (c.k === 'grade' && it.t.grade?.wouldBeRejected) ? palette.second : palette.text, weight: c.k === 'dlco' || c.k === 'va' ? 600 : 400 }));
    }
  }
  strip.push(line(M, ry + 7, width - M, ry + 7, { stroke: palette.axis, width: 1 }));
  ry += 7;
  if (showQuality) {
    let shownLines = 0;
    for (const it of items) {
      const g = it.t.grade;
      if (!g) continue;
      if (shownLines >= 4) { ry += 13; strip.push(text(M, ry, '...', { size: 9.5, fill: palette.axis })); break; }
      const reasons = [...g.invalid, ...g.failed, ...g.noted, ...(g.unknown ?? [])];
      const s = `${many ? `Test ${it.k}: ` : ''}${GRADE_TEXT(g, many)}${reasons.length ? `: ${reasons.join('; ')}` : ''}`;
      ry += 14;
      strip.push(text(M, ry, s.length > 112 ? `${s.slice(0, 109)}...` : s, { size: 9.5, fill: g.wouldBeRejected ? palette.second : palette.text }));
      shownLines++;
    }
  }
  ry += 14;
  strip.push(text(M, ry, `VA from tracer dilution; DLCO and KCO are before hemoglobin adjustment. Breath-hold from 30% of VI to the sample midpoint. PB ${t0.barometricMmHg} mmHg.`, { size: 9.5, fill: palette.axis }));
  const H = height ?? Math.ceil(ry + 12);

  const desc = description ?? `Single-breath DLCO${mode === 'separate' ? `, ${items.length} test${items.length > 1 ? 's' : ''} on separate plots` : mode === 'all' && items.length > 1 ? `, ${items.length} tests overlaid` : ''}: CO and ${t0.gas.tracer} tracer fractions in percent against expired volume, with the discarded washout to ${num(t0.markers.washout.endL, 2)} L, the alveolar sample from ${num(t0.markers.sample.startL, 2)} to ${num(t0.markers.sample.endL, 2)} L and the dead-space volume ${num(t0.deadSpaceL, 2)} L marked, above a table of inspired volume as a percent of vital capacity, time to 85% of the inspired volume, breath-hold time, washout and sample volumes, VA, DLCO and KCO.`;
  out.push(open({ width, height: H, title: heading, description: desc, palette }));
  out.push(`<g data-subplot="gas-volume">${parts.join('')}</g>`);
  out.push(`<g data-subplot="validity-strip">${strip.join('')}</g>`);
  out.push(close());
  return out.join('');
}

/** Same data as the time-and-volume DLCO figure: case.dlcoTrace, or a trace built from the case. */
const dataFor = (caseData) => dlcoTraceFigure.dataFor(caseData);

export default { id: 'panel-dlco', title: 'Single-breath DLCO panel', render, dataFor };
