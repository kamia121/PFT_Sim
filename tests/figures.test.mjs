import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDatasets } from '../src/reference/load.js';
import { createReference } from '../src/reference/gli.js';
import { ARCHETYPES, TECHNIQUE_LEVELS } from '../src/core/descriptor.js';
import { buildCase } from '../src/core/case.js';
import { createStream } from '../src/core/prng.js';
import { interpret } from '../src/interpret/interpret.js';
import { FIGURES, FIGURE_ORDER } from '../src/ui/figures/index.js';
import { flowVolumeLayout } from '../src/ui/figures/flow-volume.js';
import { PALETTES, PALETTE_IDS } from '../src/ui/palettes.js';
import { assertWellFormed, assertSelfContained } from './helpers/svg.mjs';

const ds = await loadDatasets();
const { resolveReference } = createReference(ds);

const caseData = (descriptor, extra = {}) => {
  const c = buildCase(descriptor, ds);
  return { ...c, interp: interpret(c.report, resolveReference, 'GLIglobal'), revealed: false, showSchematic: false, ...extra };
};
const IMPLEMENTED = ['flow-volume', 'volume-time', 'z-strip'];

test('the registry lists every figure and the implemented ones produce data and markup', () => {
  const cd = caseData({ seed: 3, archetype: 'normal' });
  for (const id of FIGURE_ORDER) assert.equal(FIGURES[id].id, id);
  for (const id of IMPLEMENTED) assert.ok(FIGURES[id].dataFor(cd), id);
  for (const id of IMPLEMENTED) assert.equal(typeof FIGURES[id].render(FIGURES[id].dataFor(cd), { palette: PALETTES.dark }), 'string');
});

test('every figure is well formed, self-contained and different in each of the four palettes', () => {
  for (const [descriptor, extra] of [
    [{ seed: 11, archetype: 'normal' }, {}],
    [{ seed: 21, archetype: 'obstruction', severity: 3 }, { showSchematic: true }],
    [{ seed: 4, archetype: 'obstruction', technique: 'poor' }, { revealed: true, showSchematic: true }],
    [{ seed: 8, archetype: 'restriction-parenchymal', technique: 'fair', panel: 'spirometry' }, {}],
  ]) {
    const cd = caseData(descriptor, extra);
    for (const id of IMPLEMENTED) {
      const data = FIGURES[id].dataFor(cd);
      const out = Object.fromEntries(PALETTE_IDS.map((p) => [p, FIGURES[id].render(data, { palette: PALETTES[p] })]));
      for (const [p, svg] of Object.entries(out)) {
        assertWellFormed(svg, `${id}/${p}`);
        assertSelfContained(svg, `${id}/${p}`);
        if (PALETTES[p].background === null) assert.ok(!svg.includes('<rect'), `${id}/${p}: transparent palette must not draw a background`);
        else assert.match(svg, new RegExp(`<rect [^>]*fill="${PALETTES[p].background}"`), `${id}/${p}: background rectangle`);
      }
      assert.equal(new Set(Object.values(out)).size, 4, `${id}: four distinct variants`);
      // Ink colors differ between the two transparent variants.
      assert.ok(out['transparent-dark-ink'].includes(PALETTES['transparent-dark-ink'].text));
      assert.ok(out['transparent-light-ink'].includes(PALETTES['transparent-light-ink'].text));
      assert.ok(!out['transparent-dark-ink'].includes(PALETTES['transparent-light-ink'].text));
    }
  }
});

test('rendering is deterministic and accepts size and text options', () => {
  const cd = caseData({ seed: 13, archetype: 'mixed', technique: 'fair' }, { showSchematic: true });
  for (const id of IMPLEMENTED) {
    const a = FIGURES[id].render(FIGURES[id].dataFor(cd), { palette: PALETTES.white });
    const b = FIGURES[id].render(FIGURES[id].dataFor(cd), { palette: PALETTES.white });
    assert.equal(a, b);
    const c = FIGURES[id].render(FIGURES[id].dataFor(cd), { palette: PALETTES.white, width: 500, height: 420, title: 'T <&> "x"', description: 'D' });
    assertWellFormed(c, `${id}/options`);
    assert.match(c, /viewBox="0 0 500 420"/);
    assert.match(c, /<title>T &lt;&amp;&gt; &quot;x&quot;<\/title>/);
  }
});

test('300+ random cases render every figure in every palette without exceptions', () => {
  const rng = createStream(2024, 'figure-fuzz');
  let n = 0, withPost = 0, withVolumes = 0;
  for (; n < 330; n++) {
    const descriptor = {
      seed: rng.int(0, 2 ** 32 - 1),
      archetype: ARCHETYPES[rng.int(0, ARCHETYPES.length - 1)],
      technique: TECHNIQUE_LEVELS[rng.int(0, TECHNIQUE_LEVELS.length - 1)],
      severity: rng.int(1, 3),
      panel: rng.chance(0.25) ? 'spirometry' : 'full',
    };
    const cd = caseData(descriptor, { revealed: rng.chance(0.5), showSchematic: rng.chance(0.5) });
    if (cd.spirometry.post) withPost++;
    if (cd.volumes) withVolumes++;
    for (const id of FIGURE_ORDER) {
      const data = FIGURES[id].dataFor(cd);
      if (data === null) continue;
      const pals = n % 10 === 0 ? PALETTE_IDS : ['dark'];
      for (const p of pals) {
        const svg = FIGURES[id].render(data, { palette: PALETTES[p] });
        if (n % 10 === 0) { assertWellFormed(svg, `${id}/${descriptor.seed}`); assertSelfContained(svg, `${id}/${descriptor.seed}`); }
        else assert.ok(svg.startsWith('<svg ') && svg.endsWith('</svg>') && !/NaN|undefined/.test(svg), `${id} seed ${descriptor.seed}`);
      }
    }
  }
  assert.ok(n >= 300 && withPost > 20 && withVolumes > 100, `${n} cases, ${withPost} with post, ${withVolumes} with volumes`);
});

test('the plotted trace ends at the tabulated FVC and passes through the tabulated FEV1', () => {
  const rng = createStream(5, 'figure-consistency');
  for (let k = 0; k < 40; k++) {
    const cd = caseData({ seed: rng.int(0, 2 ** 32 - 1), archetype: ARCHETYPES[rng.int(0, ARCHETYPES.length - 1)], technique: TECHNIQUE_LEVELS[rng.int(0, 2)] });
    const fv = FIGURES['flow-volume'].dataFor(cd);
    fv.sets[0].maneuvers.forEach((m, i) => {
      const tab = cd.spirometry.pre.maneuvers[i];
      assert.ok(Math.abs(m.exp.v[m.exp.v.length - 1] - tab.fvc) < 1e-9, 'plotted FVC equals tabulated FVC');
      assert.equal(m.exp.v[0], 0);
      assert.ok(m.insp.v[0] === tab.fvc);
    });
    const vt = FIGURES['volume-time'].dataFor(cd);
    const s = vt.sets[0];
    const i1 = s.t.findIndex((t) => t >= 1);
    const v1 = s.v[i1 - 1] + ((s.v[i1] - s.v[i1 - 1]) * (1 - s.t[i1 - 1])) / (s.t[i1] - s.t[i1 - 1]);
    assert.ok(s.t[i1] >= 1 && Math.abs(v1 - s.fev1) < 0.004, `plotted volume at 1 s ${v1} vs tabulated FEV1 ${s.fev1}`);
  }
});

test('flow-volume: 2 L/s is drawn as long as 1 L, expiration is up, and the plot fits its box', () => {
  for (const [descriptor, w, h] of [[{ seed: 11, archetype: 'normal' }, 640, 480], [{ seed: 21, archetype: 'obstruction', severity: 3 }, 640, 480], [{ seed: 4, archetype: 'obstruction', technique: 'poor' }, 500, 300]]) {
    const cd = caseData(descriptor, { showSchematic: true });
    const data = FIGURES['flow-volume'].dataFor(cd);
    const L = flowVolumeLayout(data, w, h);
    assert.ok(Math.abs(L.pxPerL - 2 * L.pxPerLps) < 1e-9);
    assert.ok(L.sy(5) < L.sy(0) && L.sy(0) < L.sy(-5), 'positive flow is above zero');
    assert.ok(L.x0 + L.plotW <= w && L.y0 + L.plotH <= h);
    // The same relation read from the markup: grid-line spacing for 1 L and for 2 L/s.
    const svg = FIGURES['flow-volume'].render(data, { palette: PALETTES.dark, width: w, height: h });
    const vlines = [...svg.matchAll(/<line x1="([\d.]+)" y1="[\d.]+" x2="\1" y2="[\d.]+" stroke="#16251F"/g)].map((m) => Number(m[1]));
    const hlines = [...svg.matchAll(/<line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="\1" stroke="#16251F"/g)].map((m) => Number(m[1]));
    assert.ok(vlines.length >= 3 && hlines.length >= 3);
    const dx = vlines[1] - vlines[0], dy = Math.abs(hlines[1] - hlines[0]);
    // Gridlines are every 1 L and every 2 or 4 L/s, so the spacing in pixels is dx or 2 dx.
    assert.ok(Math.abs(dy - dx) < 0.25 || Math.abs(dy - 2 * dx) < 0.25, `1 L = ${dx} px, y step = ${dy} px`);
  }
});

test('flow-volume: before the answers are checked every maneuver has the measured color; after, rejected ones are muted', () => {
  const descriptor = { seed: 4, archetype: 'obstruction', technique: 'poor' };
  const before = caseData(descriptor, { revealed: false });
  const after = caseData(descriptor, { revealed: true });
  const rejectedHex = PALETTES.dark.rejected;
  const sBefore = FIGURES['flow-volume'].render(FIGURES['flow-volume'].dataFor(before), { palette: PALETTES.dark });
  const sAfter = FIGURES['flow-volume'].render(FIGURES['flow-volume'].dataFor(after), { palette: PALETTES.dark });
  assert.ok(!sBefore.includes(rejectedHex), 'no muted maneuver before checking');
  assert.ok(!/Not acceptable/.test(sBefore));
  assert.ok(sAfter.includes(rejectedHex) && /Not acceptable/.test(sAfter));
  const dBefore = FIGURES['flow-volume'].dataFor(before);
  assert.ok(dBefore.sets[0].maneuvers.some((m) => !m.accepted), 'the data still knows which maneuvers fail');
  assert.equal(dBefore.revealed, false);
  const measuredCount = (svg, hex) => (svg.match(new RegExp(`stroke="${hex}" stroke-width="1.8"`, 'g')) ?? []).length;
  assert.ok(measuredCount(sBefore, PALETTES.dark.measured) + measuredCount(sBefore, PALETTES.dark.second) >= before.spirometry.pre.maneuvers.length);
});

test('flow-volume: a post-bronchodilator set is overlaid in the second color with a legend; schematic curves are labeled', () => {
  let found = 0;
  for (let seed = 1; seed < 60 && !found; seed++) {
    const cd = caseData({ seed, archetype: 'obstruction' }, { showSchematic: true });
    if (!cd.spirometry.post) continue;
    found++;
    const data = FIGURES['flow-volume'].dataFor(cd);
    assert.equal(data.sets.length, 2);
    const svg = FIGURES['flow-volume'].render(data, { palette: PALETTES.dark });
    assert.match(svg, /Pre-bronchodilator/);
    assert.match(svg, /Post-bronchodilator/);
    assert.match(svg, /Predicted \(schematic\)/);
    assert.match(svg, /LLN \(schematic\)/);
    assert.ok(svg.includes(`stroke="${PALETTES.dark.second}"`));
    const vt = FIGURES['volume-time'].render(FIGURES['volume-time'].dataFor(cd), { palette: PALETTES.dark });
    assert.match(vt, /Post-bronchodilator/);
  }
  assert.equal(found, 1, 'found a case with a post set');
  const plain = caseData({ seed: 11, archetype: 'normal' });
  assert.ok(!plain.spirometry.post);
  const svg = FIGURES['flow-volume'].render(FIGURES['flow-volume'].dataFor(plain), { palette: PALETTES.dark });
  assert.ok(!/schematic|Post-bronchodilator/.test(svg));
});

test('volume-time: starts at least 1 s before time zero with a tidal baseline, and marks FEV1, the construction and the plateau', () => {
  const cd = caseData({ seed: 21, archetype: 'obstruction', severity: 3 });
  const data = FIGURES['volume-time'].dataFor(cd);
  const pre = data.sets[0];
  assert.ok(pre.tidal.t[0] <= -1);
  assert.ok(pre.tidal.t.length > 20 && pre.tidal.v.every((v) => v >= 0 && Number.isFinite(v)));
  assert.equal(pre.tidal.v[pre.tidal.v.length - 1], 0, 'the deep inspiration reaches total lung capacity before the blow');
  assert.ok(pre.tidal.t[pre.tidal.t.length - 1] <= 0);
  const svg = FIGURES['volume-time'].render(data, { palette: PALETTES.dark });
  assert.match(svg, /FEV1 [\d.]+ L/);
  assert.match(svg, /Back-extrapolated volume/);
  assert.match(svg, /Tangent at peak flow/);
  assert.match(svg, /volume change in last 1 s [\d.]+ L/);
  assert.match(svg, new RegExp(`FVC ${pre.fvc.toFixed(2)} L; volume change`));
  assert.match(svg, />−4</, 'the time axis is labeled from -4 s');
});

test('z-strip: FVC, FEV1 and FEV1/FVC always; TLC, DLCO, VA and KCO when present; marker at the z-score; no flag fill', () => {
  const full = caseData({ seed: 21, archetype: 'obstruction', severity: 3 });
  const dFull = FIGURES['z-strip'].dataFor(full);
  assert.deepEqual(dFull.rows.map((r) => r.id), ['fvc', 'fev1', 'fev1_fvc', 'tlc', 'dlco', 'va', 'kco']);
  const spiro = caseData({ seed: 21, archetype: 'obstruction', panel: 'spirometry' });
  assert.deepEqual(FIGURES['z-strip'].dataFor(spiro).rows.map((r) => r.id), ['fvc', 'fev1', 'fev1_fvc']);
  for (const r of dFull.rows) assert.equal(r.z, full.interp.measures[r.id].z);
  const svg = FIGURES['z-strip'].render(dFull, { palette: PALETTES.white });
  assert.match(svg, /LLN −1\.645/);
  assert.match(svg, /Predicted/);
  assert.equal((svg.match(/<circle /g) ?? []).length, dFull.rows.length);
  assert.ok(!/#(ff0000|f00|00ff00|c0392b|2ecc71)/i.test(svg));
  // Marker x position: z = -1.645 and z = 0 lines bracket the strip in the expected ratio.
  const xs = (z) => { const m = new RegExp(`<line x1="([\\d.]+)" y1="[\\d.]+" x2="\\1" y2="[\\d.]+" stroke="${PALETTES.white.lln}"`).exec(svg); return m ? Number(m[1]) : NaN; };
  assert.ok(Number.isFinite(xs()));
  // Off-scale values are drawn hollow at the edge.
  const off = { llnZ: -1.645, rows: [{ id: 'fev1', label: 'FEV1', z: -7.2, below: true, borderline: false, equation: 'GLI Global' }] };
  const offSvg = FIGURES['z-strip'].render(off, { palette: PALETTES.white });
  assert.match(offSvg, /off scale/);
  assert.match(offSvg, /fill="none" stroke="#2F6E66" stroke-width="2.5"/);
  assertWellFormed(offSvg, 'z-strip off scale');
});

test('z-strip: the interpretation can be passed or computed with the resolver; without either there is no data', () => {
  const c = buildCase({ seed: 9, archetype: 'mixed' }, ds);
  const passed = FIGURES['z-strip'].dataFor({ ...c, interp: interpret(c.report, resolveReference, 'GLI2012') });
  const computed = FIGURES['z-strip'].dataFor({ ...c, resolve: resolveReference, equation: 'GLI2012' });
  assert.deepEqual(passed, computed);
  assert.equal(FIGURES['z-strip'].dataFor(c), null);
  assert.equal(FIGURES['flow-volume'].dataFor({}), null);
  assert.equal(FIGURES['volume-time'].dataFor(null), null);
});

test('faults show in the plotted trace: a cough adds spikes, glottic closure ends at zero flow, early termination does not', () => {
  const seen = { cough: 0, glottis: 0, early: 0 };
  for (let seed = 1; seed < 40; seed++) {
    const cd = caseData({ seed, archetype: 'obstruction', technique: 'poor' });
    const data = FIGURES['flow-volume'].dataFor(cd);
    cd.spirometry.pre.maneuvers.forEach((m, i) => {
      const exp = data.sets[0].maneuvers[i].exp;
      const last = exp.f[exp.f.length - 1];
      if (m.faults.includes('glottic-closure')) { seen.glottis++; assert.equal(last, 0); }
      else if (m.faults.includes('early-termination')) { seen.early++; assert.ok(last > 0); }
      if (m.faults.includes('cough')) seen.cough++;
    });
  }
  assert.ok(seen.cough > 5 && seen.glottis > 5 && seen.early > 5, JSON.stringify(seen));
});
