import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDatasets } from '../src/reference/load.js';
import { createReference } from '../src/reference/gli.js';
import { buildCase } from '../src/core/case.js';
import { interpret } from '../src/interpret/interpret.js';
import panel, { predictedCurve, predictedLabel, tidalLoop, chooseShown, loopPath, spirometryData, TIDAL } from '../src/ui/figures/panel-spirometry.js';
import { PALETTES, PALETTE_IDS } from '../src/ui/palettes.js';
import { assertWellFormed, assertSelfContained } from './helpers/svg.mjs';

const ds = await loadDatasets();
const { resolveReference } = createReference(ds);

const caseData = (descriptor, extra = {}, equation = 'GLIglobal') => {
  const c = buildCase(descriptor, ds);
  return { ...c, interp: interpret(c.report, resolveReference, equation), revealed: false, ...extra };
};
const CASES = {
  normal: { seed: 11, archetype: 'normal' },
  obstructionBd: { seed: 21, archetype: 'obstruction', severity: 3 },
  restriction: { seed: 8, archetype: 'restriction-parenchymal', technique: 'fair' },
  poor: { seed: 4, archetype: 'obstruction', technique: 'poor' },
  spirometryOnly: { seed: 8, archetype: 'restriction-parenchymal', technique: 'fair', panel: 'spirometry' },
};
const render = (cd, opts = {}) => panel.render(panel.dataFor(cd), { palette: PALETTES.white, ...opts });
const subplots = (svg) => [...svg.matchAll(/<g data-subplot="([^"]+)"/g)].map((m) => m[1]);

test('the module exports the registry entry and returns no data without spirometry', () => {
  assert.equal(panel.id, 'panel-spirometry');
  assert.equal(typeof panel.title, 'string');
  assert.equal(typeof panel.render, 'function');
  assert.equal(panel.dataFor({}), null);
  assert.equal(panel.dataFor(null), null);
});

test('every case renders well formed, self-contained SVG in all four palettes, in every view', () => {
  for (const [name, d] of Object.entries(CASES)) {
    const cd = caseData(d);
    const data = panel.dataFor(cd);
    assert.ok(data, name);
    for (const view of ['best', 'all', 'separate']) {
      const out = PALETTE_IDS.map((p) => panel.render(data, { palette: PALETTES[p], view }));
      out.forEach((svg, i) => {
        assertWellFormed(svg, `${name}/${view}/${PALETTE_IDS[i]}`);
        assertSelfContained(svg, `${name}/${view}/${PALETTE_IDS[i]}`);
        if (PALETTES[PALETTE_IDS[i]].background === null) assert.ok(!svg.includes('<rect x="0"'), 'transparent palette has no background');
      });
      assert.equal(new Set(out).size, 4, `${name}/${view}: four distinct variants`);
    }
  }
});

test('the default panel is 672 px wide (7 in at 96 px per inch), the viewBox follows the options, and rendering is deterministic', () => {
  const data = panel.dataFor(caseData(CASES.obstructionBd));
  const a = panel.render(data, { palette: PALETTES.dark });
  assert.ok(/viewBox="0 0 672 \d+"/.test(a));
  assert.equal(a, panel.render(data, { palette: PALETTES.dark }));
  const b = panel.render(data, { palette: PALETTES.dark, width: 500, height: 330, title: 'T <&> "x"', description: 'D' });
  assert.ok(/viewBox="0 0 500 330"/.test(b));
  assert.ok(b.includes('<title>T &lt;&amp;&gt; &quot;x&quot;</title>'));
  assertWellFormed(b, 'options');
});

test('the panel has a flow-volume and a volume-time sub-plot and text of 7 to 9 pt at 7 inches (9.3 to 12 px)', () => {
  for (const d of [CASES.normal, CASES.obstructionBd, CASES.poor]) {
    for (const view of ['best', 'all', 'separate']) {
      const svg = render(caseData(d), { view });
      if (view === 'separate') assert.ok(subplots(svg).every((s) => /^(flow-volume|volume-time)-/.test(s)));
      else assert.deepEqual(subplots(svg), ['flow-volume', 'volume-time']);
      const sizes = [...svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
      assert.ok(sizes.length > 20);
      assert.ok(Math.min(...sizes) >= 9.3 && Math.max(...sizes) <= 12, `font sizes ${Math.min(...sizes)} to ${Math.max(...sizes)}`);
    }
  }
});

test('the loop keeps 2 L/s as long as 1 L in the panel and draws no lower-limit loop', () => {
  for (const d of [CASES.normal, CASES.obstructionBd, CASES.restriction]) {
    const svg = render(caseData(d), { palette: PALETTES.dark });
    const g = svg.slice(svg.indexOf('<g data-subplot="flow-volume"'), svg.indexOf('<g data-subplot="volume-time"'));
    const grid = PALETTES.dark.grid;
    const xs = [...g.matchAll(new RegExp(`<line x1="([\\d.]+)" y1="[\\d.]+" x2="\\1" y2="[\\d.]+" stroke="${grid}"`, 'g'))].map((m) => Number(m[1]));
    const ys = [...g.matchAll(new RegExp(`<line x1="[\\d.]+" y1="([\\d.]+)" x2="[\\d.]+" y2="\\1" stroke="${grid}"`, 'g'))].map((m) => Number(m[1]));
    const dx = xs[1] - xs[0], dy = Math.abs(ys[1] - ys[0]);
    assert.ok(Math.abs(dy - dx) < 0.25 || Math.abs(dy - 2 * dx) < 0.25 || Math.abs(dy - 2.5 * dx) < 0.3, `1 L = ${dx} px, y step = ${dy} px`);
    assert.ok(!/LLN|lower limit/i.test(svg));
  }
});

test('the predicted curve is built from the equation-backed FVC and FEV1 and is named with its equation', () => {
  for (const equation of ['GLIglobal', 'GLI2012']) {
    const cd = caseData(CASES.obstructionBd, {}, equation);
    const data = panel.dataFor(cd);
    const p = data.predicted;
    assert.ok(p);
    assert.equal(p.fvc, cd.interp.measures.fvc.predicted);
    assert.equal(p.fev1, cd.interp.measures.fev1.predicted);
    assert.ok(Math.abs(p.v[p.v.length - 1] - p.fvc) < 1e-9, 'the curve ends at the predicted FVC');
    assert.deepEqual(p.points.map((x) => x.name), ['FEV1', 'FVC'], 'only equation-backed points: no PEF equation is loaded');
    const label = predictedLabel(p);
    assert.ok(/^Predicted, constructed from FEV1 and FVC/.test(label));
    assert.ok(label.includes(equation === 'GLI2012' ? 'GLI-2012' : 'GLI Global 2022'));
    const svg = panel.render(data, { palette: PALETTES.white });
    assert.ok(svg.includes(label.replace(/&/g, '&amp;')));
    assert.ok(svg.includes('stroke-dasharray="7 5"'), 'predicted is dashed');
  }
  // No interpretation, no predicted curve.
  const c = buildCase(CASES.normal, ds);
  assert.equal(panel.dataFor(c).predicted, null);
  assert.ok(!/Predicted, constructed/.test(panel.render(panel.dataFor(c), { palette: PALETTES.white })));
});

test('when an equation supplies PEF it constrains the constructed curve and is named per point; otherwise it falls back to the ratio', () => {
  const cd = caseData(CASES.normal);
  const base = predictedCurve(cd.interp);
  const target = base.pef * 1.15;
  const withPef = predictedCurve({ measures: { ...cd.interp.measures, pef: { available: true, predicted: target, equationId: 'NHANES3', matched: false } } });
  assert.ok(withPef.pefFromEquation);
  assert.ok(Math.abs(withPef.pef - target) < 0.01 * target, `PEF ${withPef.pef} vs ${target}`);
  assert.deepEqual(withPef.points.map((p) => p.name), ['FEV1', 'FVC', 'PEF']);
  const label = predictedLabel(withPef);
  assert.ok(label.includes('FEV1, FVC and PEF') && label.includes('NHANES III') && label.includes('GLI Global 2022') && label.includes('fallback'));
  // An unreachable PEF is not used.
  const unreachable = predictedCurve({ measures: { ...cd.interp.measures, pef: { available: true, predicted: 60, equationId: 'NHANES3' } } });
  assert.equal(unreachable.pefFromEquation, false);
  assert.deepEqual(unreachable.points.map((p) => p.name), ['FEV1', 'FVC']);
  // A missing FEV1 or FVC prediction gives no curve.
  assert.equal(predictedCurve({ measures: { fvc: cd.interp.measures.fvc } }), null);
  assert.equal(predictedCurve(null), null);
});

test('the tidal loop sits at the end-expiratory level given by the case IC, inside the expiratory envelope; no volumes, no tidal loop', () => {
  let placed = 0;
  for (const name of ['normal', 'restriction', 'poor', 'obstructionBd']) {
    const cd = caseData(CASES[name]);
    const data = panel.dataFor(cd);
    const t = data.tidal;
    assert.ok(t, name);
    assert.equal(t.ic, cd.volumes.ic);
    const bestPre = data.sets[0].maneuvers[data.sets[0].best];
    if (!t.clamped) { assert.equal(t.eel, cd.volumes.ic); placed++; }
    assert.ok(t.eel <= bestPre.exp.v[bestPre.exp.v.length - 1], 'the end-expiratory level is within the forced loop');
    assert.ok(Math.max(...t.v) <= t.eel + 1e-9 && Math.min(...t.v) >= t.eel - t.vt - 1e-9);
    assert.ok(t.vt <= TIDAL.vtL && t.v.every(Number.isFinite) && t.f.every(Number.isFinite));
    // Expiratory tidal flow never exceeds the maximal envelope at the same volume.
    const env = (x) => { const i = bestPre.exp.v.findIndex((v) => v >= x); return i < 0 ? 0 : bestPre.exp.f[i]; };
    t.v.forEach((x, i) => { if (t.f[i] > 0) assert.ok(t.f[i] <= 1.05 * env(x) + 0.02, `tidal flow ${t.f[i]} above envelope ${env(x)} at ${x} L`); });
    assert.ok(/>tidal</.test(render(cd)), 'the loop is labeled');
  }
  assert.ok(placed >= 2, 'IC is used unchanged when it fits');
  const spiro = caseData(CASES.spirometryOnly);
  assert.equal(spiro.volumes, null);
  assert.equal(panel.dataFor(spiro).tidal, null);
  assert.ok(!/>tidal</.test(render(spiro)));
  assert.equal(tidalLoop({ volumes: null }, { v: [0, 1], f: [0, 0] }), null);
  // An IC beyond the end of the forced loop (gas trapping) is clamped to the envelope end and flagged.
  const clamped = tidalLoop({ volumes: { ic: 5 } }, { v: [0, 1, 2], f: [0, 3, 0] });
  assert.ok(clamped.clamped && clamped.eel < 2);
});

test('PEF is marked on the loop and the end of expiration rounds into inspiration through a Bezier corner', () => {
  const cd = caseData(CASES.obstructionBd);
  const data = panel.dataFor(cd);
  const svg = panel.render(data, { palette: PALETTES.white });
  const diamonds = svg.match(/<path d="M[\d.]+ [\d.]+L[\d.]+ [\d.]+L[\d.]+ [\d.]+L[\d.]+ [\d.]+Z" fill="none"/g) ?? [];
  assert.equal(diamonds.length, 2, 'one PEF diamond per set');
  assert.ok(/>PEF</.test(svg));
  for (const s of data.sets) {
    const m = s.maneuvers[s.best];
    const sx = (v) => 100 * v, sy = (f) => -50 * f; // 2 L/s per 1 L
    const d = loopPath(m, sx, sy);
    assert.ok(/C[\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+/.test(d), 'cubic join');
    // The join starts at the last expiratory point and ends on the inspiratory limb within a few pixels' reach.
    const nums = d.match(/C([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)/).slice(1).map(Number);
    const endX = sx(m.exp.v[m.exp.v.length - 1]), endY = sy(m.exp.f[m.exp.f.length - 1]);
    assert.ok(Math.hypot(nums[4] - endX, nums[5] - endY) >= 8 && Math.hypot(nums[4] - endX, nums[5] - endY) < 60, 'join ends a short way down the inspiratory limb');
  }
});

test('volume-time: starts 1 s before time zero at volume 0, a short tick at t = 1 s, no dots, no drop lines, notes outside the plot', () => {
  for (const d of [CASES.normal, CASES.obstructionBd, CASES.poor]) {
    const svg = render(caseData(d), { palette: PALETTES.dark });
    const vt = svg.slice(svg.indexOf('<g data-subplot="volume-time"'));
    assert.ok(!/<circle/.test(svg), 'no filled dots');
    // The record starts 1 s before time zero: the dashed time-zero line is one second (the distance to the t = 1 s tick) from the first point.
    const zero = Number(/<line x1="([\d.]+)" y1="[\d.]+" x2="\1" y2="[\d.]+" stroke="#7E918B" stroke-width="1" stroke-dasharray="4 4"/.exec(vt)[1]);
    const tickX = Number(/<line x1="([\d.]+)" y1="[\d.]+" x2="\1" y2="[\d.]+" stroke="#5FD0BD" stroke-width="1.8"/.exec(vt)[1]);
    // First measured path in the sub-plot: flat at volume 0 up to the start of the blow (no pre-test wave).
    const first = [...vt.matchAll(/<path d="(M[^"]+)" fill="none" stroke="#5FD0BD"/g)][0]?.[1];
    const pts = [...first.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    assert.equal(pts[0][1], pts[1][1], 'baseline segment is flat');
    assert.ok(Math.abs((zero - pts[0][0]) - (tickX - zero)) < 0.6, `record starts ${(zero - pts[0][0]) / (tickX - zero)} s before time zero`);
    // FEV1 tick: a 12 px vertical line in the series color.
    assert.ok(/<line x1="([\d.]+)" y1="[\d.]+" x2="\1" y2="[\d.]+" stroke="#5FD0BD" stroke-width="1.8"\/>/.test(vt), 'tick');
    assert.ok(!/>FEV1 [\d.]/.test(vt) && !/drop/i.test(vt));
    assert.ok(/Volume change in the last 1 s/.test(svg) && /Back-extrapolated volume/.test(svg));
    // The notes lie below the plot: their y is larger than that of the time axis title.
    const yOf = (re) => Number(re.exec(svg)[1]);
    assert.ok(yOf(/y="([\d.]+)"[^>]*>Volume change in the last 1 s/) > yOf(/y="([\d.]+)"[^>]*>Time \(s\)/));
  }
  // The data carry no pre-test breathing.
  assert.equal(panel.dataFor(caseData(CASES.normal)).sets[0].tidal, undefined);
});

test('views: best draws one curve per set; all draws the selected ones with the best emphasized; separate draws one tile per maneuver', () => {
  const cd = caseData(CASES.poor);
  const data = panel.dataFor(cd);
  const nPre = data.sets[0].maneuvers.length, nPost = data.sets[1].maneuvers.length;
  assert.ok(nPre >= 3 && nPost >= 3);
  const shownBest = chooseShown(data, 'best');
  assert.deepEqual(shownBest.map((s) => s.items.length), [1, 1]);
  assert.equal(shownBest[0].items[0].m.number - 1, data.sets[0].best);
  const shownAll = chooseShown(data, 'all');
  assert.deepEqual(shownAll.map((s) => s.items.length), [nPre, nPost]);
  assert.ok(shownAll.every((s) => s.items.filter((it) => it.best).length === 1));
  const sel = chooseShown(data, 'all', [2, 3]);
  assert.deepEqual(sel.map((s) => s.items.map((it) => it.m.number).sort()), [[2, 3], [2, 3]]);
  assert.deepEqual(chooseShown(data, 'all', []), []);
  const sepSelected = chooseShown(data, 'separate', [1]);
  assert.deepEqual(sepSelected.map((s) => s.items.map((it) => it.m.number)), [[1], [1]]);

  const widthsOf = (svg, hex) => [...svg.matchAll(new RegExp(`<path d="M[^"]*" fill="none" stroke="${hex}" stroke-width="([\\d.]+)"`, 'g'))].map((m) => m[1]).filter((w) => w !== '1.4' /* PEF diamond */);
  const pal = PALETTES.white;
  const best = panel.render(data, { palette: pal, view: 'best' });
  // Per set: one loop and one volume-time trace.
  assert.equal(widthsOf(best, pal.measured).length, 2);
  assert.equal(widthsOf(best, pal.second).length, 2);
  const all = panel.render(data, { palette: pal, view: 'all' });
  assert.equal(widthsOf(all, pal.measured).length, 2 * nPre, 'a loop and a trace per pre maneuver');
  assert.equal(widthsOf(all, pal.measured).filter((w) => w === '2.1').length, 2, 'the best is emphasized');
  assert.ok(/stroke-opacity="/.test(all), 'the others are tinted');
  const some = panel.render(data, { palette: pal, view: 'all', selected: [1, 2] });
  assert.equal(widthsOf(some, pal.measured).length, 4);
  const sep = panel.render(data, { palette: pal, view: 'separate' });
  assert.equal(subplots(sep).filter((s) => s.startsWith('flow-volume-')).length, nPre + nPost);
  assert.equal(subplots(sep).filter((s) => s.startsWith('volume-time-')).length, nPre + nPost);
  const empty = panel.render(data, { palette: pal, view: 'all', selected: [] });
  assert.ok(/No maneuver selected/.test(empty));
  assertWellFormed(empty, 'empty selection');
  // An unknown view falls back to best.
  assert.equal(panel.render(data, { palette: pal, view: 'x' }), best);
});

test('separate tiles give the number, FEV1, FVC and the comment; verdicts only when showQuality is true', () => {
  const cd = caseData(CASES.poor);
  const data = panel.dataFor(cd);
  const hidden = panel.render(data, { palette: PALETTES.white, view: 'separate' });
  assert.ok(/>Pre 1</.test(hidden) && />Post 1</.test(hidden));
  const pre = cd.spirometry.pre.maneuvers;
  pre.forEach((m) => assert.ok(hidden.includes(`FEV1 ${m.fev1.toFixed(2)} L; FVC ${m.fvc.toFixed(2)} L`)));
  const faulty = pre.find((m) => m.faults.length);
  assert.ok(faulty, 'a poor-technique case has a recorded fault');
  assert.ok(/Comment: [a-z]/.test(hidden));
  assert.ok(!/acceptable|usable|\(best\)/.test(hidden), 'no verdicts before the answers are checked');
  const shown = panel.render(data, { palette: PALETTES.white, view: 'separate', showQuality: true });
  assert.ok(/acceptable|not usable|usable/.test(shown) && /\(best\)/.test(shown));
  // The case-level reveal flag does the same when the option is absent.
  const revealed = panel.render(panel.dataFor(caseData(CASES.poor, { revealed: true })), { palette: PALETTES.white, view: 'separate' });
  assert.ok(/acceptable|usable/.test(revealed));
  // An explicit false wins over the flag.
  assert.ok(!/acceptable|usable/.test(panel.render(panel.dataFor(caseData(CASES.poor, { revealed: true })), { palette: PALETTES.white, view: 'separate', showQuality: false })));
});

test('unacceptable maneuvers are muted in the all view only when quality is shown', () => {
  const cd = caseData(CASES.poor);
  const data = panel.dataFor(cd);
  assert.ok(data.sets[0].maneuvers.some((m) => !m.accepted));
  const pal = PALETTES.dark;
  const before = panel.render(data, { palette: pal, view: 'all' });
  const after = panel.render(data, { palette: pal, view: 'all', showQuality: true });
  assert.ok(!before.includes(pal.rejected) && !/Not acceptable/.test(before));
  assert.ok(after.includes(`stroke="${pal.rejected}"`) && /Not acceptable/.test(after));
});

test('series color encodes the quantity and dash the relation; all colors are palette colors; flags are text only', () => {
  for (const id of PALETTE_IDS) {
    const pal = PALETTES[id];
    const svg = render(caseData(CASES.obstructionBd), { palette: pal });
    const allowed = new Set([...Object.values(pal).filter((v) => typeof v === 'string' && v.startsWith('#')), 'none']);
    for (const m of svg.matchAll(/\s(fill|stroke)="([^"]*)"/g)) assert.ok(allowed.has(m[2]), `${id}: ${m[2]}`);
    assert.ok(svg.includes(`stroke="${pal.measured}"`) && svg.includes(`stroke="${pal.second}"`));
    // Dashed lines are predicted (7 5) or construction marks (4 4); measured paths are solid.
    for (const m of svg.matchAll(/<path d="[^"]*" fill="none" stroke="([^"]+)"[^>]*?(stroke-dasharray="[^"]+")?\/>/g)) {
      if (m[1] === pal.measured || m[1] === pal.second) assert.equal(m[2], undefined, 'measured is solid');
    }
  }
});

test('a case with only a pre set draws "Measured"; one with both names the sets', () => {
  const only = render(caseData(CASES.restriction));
  assert.ok(/>Measured, best maneuver</.test(only) && !/Post-bronchodilator/.test(only));
  const both = render(caseData(CASES.obstructionBd));
  assert.ok(/>Pre-bronchodilator, best maneuver</.test(both) && />Post-bronchodilator, best maneuver</.test(both));
});

test('data cover the maneuvers as numbered in the case and agree with the tabulated values', () => {
  const cd = caseData(CASES.poor);
  const data = spirometryData(cd);
  ['pre', 'post'].forEach((id, k) => {
    const tab = cd.spirometry[id].maneuvers;
    assert.equal(data.sets[k].maneuvers.length, tab.length);
    data.sets[k].maneuvers.forEach((m, i) => {
      assert.equal(m.number, i + 1);
      assert.equal(m.fvc, tab[i].fvc);
      assert.equal(m.fev1, tab[i].fev1);
      assert.ok(Math.abs(m.exp.v[m.exp.v.length - 1] - tab[i].fvc) < 1e-9);
    });
  });
});

test('120 random cases render in every view without exceptions or non-finite numbers', () => {
  for (let seed = 1; seed <= 120; seed++) {
    const archetypes = ['normal', 'obstruction', 'restriction-parenchymal', 'mixed', 'nonspecific', 'bd-discordant', 'low-dlco', 'obesity-low-erv'];
    const cd = caseData({ seed, archetype: archetypes[seed % archetypes.length], technique: ['good', 'fair', 'poor'][seed % 3], panel: seed % 5 === 0 ? 'spirometry' : 'full' }, { revealed: seed % 2 === 0 });
    const data = panel.dataFor(cd);
    for (const view of ['best', 'all', 'separate']) {
      const svg = panel.render(data, { palette: PALETTES[PALETTE_IDS[seed % 4]], view });
      assert.ok(svg.startsWith('<svg ') && svg.endsWith('</svg>') && !/NaN|undefined|Infinity/.test(svg), `seed ${seed} ${view}`);
    }
  }
});
