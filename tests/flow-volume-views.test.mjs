import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDatasets } from '../src/reference/load.js';
import { createReference } from '../src/reference/gli.js';
import { buildCase } from '../src/core/case.js';
import { interpret } from '../src/interpret/interpret.js';
import { FIGURES } from '../src/ui/figures/index.js';
import { flowVolumeLayout } from '../src/ui/figures/flow-volume.js';
import { PALETTES, PALETTE_IDS } from '../src/ui/palettes.js';
import { assertWellFormed, assertSelfContained } from './helpers/svg.mjs';

const ds = await loadDatasets();
const { resolveReference } = createReference(ds);
const caseData = (descriptor, extra = {}) => {
  const c = buildCase(descriptor, ds);
  return { ...c, interp: interpret(c.report, resolveReference, 'GLIglobal'), revealed: false, showSchematic: true, ...extra };
};
const POOR = { seed: 4, archetype: 'obstruction', technique: 'poor' };
const fv = FIGURES['flow-volume'], vt = FIGURES['volume-time'];
const strokeWidths = (svg, hex) => [...svg.matchAll(new RegExp(`<path d="M[^"]*" fill="none" stroke="${hex}" stroke-width="([\\d.]+)"`, 'g'))].map((m) => m[1]).filter((w) => w !== '1.4');

test('the standalone figures keep the registry interface and accept view, selected and showQuality', () => {
  for (const f of [fv, vt]) {
    assert.equal(typeof f.render, 'function');
    assert.equal(f.dataFor({}), null);
    const cd = caseData(POOR);
    const data = f.dataFor(cd);
    for (const view of ['best', 'all', 'separate']) for (const p of PALETTE_IDS) {
      const svg = f.render(data, { palette: PALETTES[p], view, selected: [1, 2], showQuality: view === 'separate' });
      assertWellFormed(svg, `${f.id}/${view}/${p}`);
      assertSelfContained(svg, `${f.id}/${view}/${p}`);
    }
  }
});

test('flow-volume: the default view overlays every maneuver with the best emphasized; best draws one loop per set; selection filters', () => {
  const cd = caseData(POOR);
  const data = fv.dataFor(cd);
  const n = cd.spirometry.pre.maneuvers.length;
  const pal = PALETTES.dark;
  const all = fv.render(data, { palette: pal });
  assert.equal(strokeWidths(all, pal.measured).length, n);
  assert.equal(strokeWidths(all, pal.measured).filter((w) => w === '2.1').length, 1);
  assert.equal(strokeWidths(fv.render(data, { palette: pal, view: 'best' }), pal.measured).length, 1);
  assert.equal(strokeWidths(fv.render(data, { palette: pal, selected: [1, 3] }), pal.measured).length, 2);
  const sep = fv.render(data, { palette: pal, view: 'separate', selected: [2] });
  assert.ok(/>Pre 2</.test(sep) && !/>Pre 1</.test(sep));
  assert.ok(/No maneuver selected/.test(fv.render(data, { palette: pal, selected: [] })));
});

test('flow-volume: no lower-limit loop; the predicted curve is constructed and named; the corner is rounded', () => {
  const cd = caseData({ seed: 21, archetype: 'obstruction', severity: 3 });
  const data = fv.dataFor(cd);
  const svg = fv.render(data, { palette: PALETTES.white });
  assert.ok(!/LLN|lower limit|schematic/i.test(svg));
  assert.ok(/Predicted, constructed from FEV1 and FVC \(GLI Global 2022\)/.test(svg));
  assert.ok(/ C[\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+/.test(svg.replace(/([\d.])C/g, '$1 C')), 'cubic join at the end of expiration');
  assert.equal(fv.dataFor({ ...cd, showSchematic: false }).predicted, null);
  assert.ok(data.sets[0].maneuvers.every((m) => m.peak && Number.isFinite(m.peak.f)), 'PEF positions are in the data');
  assert.ok(/<path d="M[\d.]+ [\d.]+L[\d.]+ [\d.]+L[\d.]+ [\d.]+L[\d.]+ [\d.]+Z" fill="none"/.test(svg), 'PEF marker');
});

test('flow-volume: the layout keeps 2 L/s as long as 1 L at the sizes of the report, the panel and a small embed', () => {
  for (const [w, h] of [[640, 480], [640, 340], [672, 349], [500, 300], [336, 260]]) {
    for (const descriptor of [{ seed: 11, archetype: 'normal' }, { seed: 21, archetype: 'obstruction', severity: 3 }, POOR]) {
      const data = fv.dataFor(caseData(descriptor));
      const L = flowVolumeLayout(data, w, h, { legendH: 40 });
      assert.ok(Math.abs(L.pxPerL - 2 * L.pxPerLps) < 1e-9);
      assert.ok(Math.abs((L.sx(1) - L.sx(0)) - (L.sy(0) - L.sy(2))) < 1e-9, '1 L and 2 L/s are the same length');
      assert.ok(L.x0 >= 0 && L.x0 + L.plotW <= w && L.y0 >= 0 && L.y0 + L.plotH <= h);
    }
  }
});

test('volume-time: the default shows the best maneuver of each set; all numbers the traces; notes are below the axis title and clear of the curves', () => {
  const cd = caseData({ seed: 21, archetype: 'obstruction', severity: 3 });
  const data = vt.dataFor(cd);
  const pal = PALETTES.white;
  assert.equal(strokeWidths(vt.render(data, { palette: pal }), pal.measured).length, 1);
  const all = vt.render(data, { palette: pal, view: 'all' });
  assert.equal(strokeWidths(all, pal.measured).length, cd.spirometry.pre.maneuvers.length);
  assert.ok(/>1</.test(all));
  const svg = vt.render(data, { palette: pal });
  const y = (re) => Number(re.exec(svg)[1]);
  const axisTitle = y(/y="([\d.]+)"[^>]*>Time \(s\)/);
  assert.ok(y(/y="([\d.]+)"[^>]*>Volume change in the last 1 s/) > axisTitle && y(/y="([\d.]+)"[^>]*>Back-extrapolated volume/) > axisTitle);
  // The plot's lowest y (the axis) is above both notes.
  const plotBottom = Math.max(...[...svg.matchAll(/<line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="\1" stroke="#56615E" stroke-width="1.2"/g)].map((m) => Number(m[1])));
  assert.ok(plotBottom < axisTitle);
  assert.ok(!/<circle/.test(svg));
});

test('volume-time data keep the best maneuver on the set and plot the record from the start of the forced expiration with no pre-test wave', () => {
  const cd = caseData(POOR);
  const data = vt.dataFor(cd);
  data.sets.forEach((s) => {
    const m = s.maneuvers[s.best];
    assert.equal(s.fev1, m.fev1);
    assert.equal(s.t, m.t);
    assert.equal(s.tidal, undefined);
    assert.ok(s.t[0] <= 0 && s.t[0] > -1.5 && s.v[0] === 0);
  });
});
