import test from 'node:test';
import assert from 'node:assert/strict';
import REPRESENTATIVE_FIGURES, { repFlowVolume, repVolumeTime, repPlethLoop, repDlco, representativeCaptions } from '../src/ui/figures/representative.js';
import { PALETTES, PALETTE_IDS } from '../src/ui/palettes.js';
import { assertWellFormed, assertSelfContained } from './helpers/svg.mjs';
import { sheetCase, SHEET_CASES, stubRt } from './summary-sheet-helpers.mjs';

const withInterp = (k) => ({ ...k.c, interp: k.interp, equation: 'GLIglobal' });
const IDS = ['rep-flow-volume', 'rep-volume-time', 'rep-pleth-loop', 'rep-dlco'];

test('four figures with the ids the sheet and the integrator use', () => {
  assert.deepEqual(REPRESENTATIVE_FIGURES.map((f) => f.id), IDS);
  assert.deepEqual([repFlowVolume, repVolumeTime, repPlethLoop, repDlco].map((f) => f.id), IDS);
  for (const f of REPRESENTATIVE_FIGURES) assert.ok(typeof f.title === 'string' && typeof f.render === 'function' && typeof f.dataFor === 'function');
});

test('every figure in every palette is well formed and self-contained', () => {
  for (const name of Object.keys(SHEET_CASES)) {
    const k = sheetCase(name);
    const cd = withInterp(k);
    for (const f of REPRESENTATIVE_FIGURES) {
      const data = f.dataFor(cd, k.rt);
      const expectNull = (name === 'spirometryOnly') && (f.id === 'rep-pleth-loop' || f.id === 'rep-dlco');
      assert.equal(data === null, expectNull, `${name}/${f.id}`);
      if (!data) continue;
      for (const p of PALETTE_IDS) {
        const svg = f.render(data, { palette: PALETTES[p] });
        assertWellFormed(svg, `${f.id} ${name}/${p}`);
        assertSelfContained(svg, `${f.id} ${name}/${p}`);
        assert.match(svg, /viewBox="0 0 250 210"/, 'default compact size');
      }
      const sized = f.render(data, { palette: 'white', width: 336, height: 120 });
      assertWellFormed(sized, `${f.id} sized`);
      assert.match(sized, /viewBox="0 0 336 120"/);
    }
  }
});

test('text is 7 pt (9.33 px) or smaller; nothing larger is drawn', () => {
  const k = sheetCase('obstruction');
  for (const f of REPRESENTATIVE_FIGURES) {
    const svg = f.render(f.dataFor(withInterp(k), k.rt), { palette: 'white' });
    const sizes = [...svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.ok(sizes.length > 5, f.id);
    assert.ok(Math.max(...sizes) <= 9.34, `${f.id}: ${Math.max(...sizes)}`);
  }
});

test('captions name the maneuver, trial and test and never its kind', () => {
  for (const name of ['obstruction', 'mixed', 'normal']) {
    const k = sheetCase(name);
    const cap = representativeCaptions(withInterp(k), k.rt);
    const r = k.rt.representative;
    const pre = k.c.spirometry.pre.maneuvers.length;
    assert.ok(cap['rep-flow-volume'].startsWith(`Pre: maneuver ${r.pre.index + 1} of ${pre}`), cap['rep-flow-volume']);
    if (k.c.spirometry.post) assert.ok(cap['rep-flow-volume'].includes(`; post: maneuver ${r.post.index + 1} of ${k.c.spirometry.post.maneuvers.length}`));
    assert.equal(cap['rep-flow-volume'], cap['rep-volume-time']);
    assert.equal(cap['rep-pleth-loop'], `Plethysmography: trial ${r.pleth.trial + 1} of ${k.c.pleth.trials.length}`);
    assert.equal(cap['rep-dlco'], 'Single-breath DLCO: test 1 of 1');
    for (const f of REPRESENTATIVE_FIGURES) {
      const svg = f.render(f.dataFor(withInterp(k), k.rt), { palette: 'white' });
      assert.ok(svg.includes(`>${cap[f.id]}<`), `${f.id}: caption in the figure`);
      assert.ok(!/flawed|best|accept|grade/i.test(svg.replace(/<desc>[\s\S]*?<\/desc>/, '')), `${f.id}: no quality wording`);
    }
  }
});

test('the maneuver named by rt.representative is the one drawn', () => {
  const k = sheetCase('obstruction');
  const cd = withInterp(k);
  const n = k.c.spirometry.pre.maneuvers.length;
  const svgs = [];
  for (let i = 0; i < n; i++) {
    const rt = { ...k.rt, representative: { ...k.rt.representative, pre: { index: i, kind: 'flawed', faults: [] } } };
    const d = repVolumeTime.dataFor(cd, rt);
    assert.equal(d.sets[0].m.number, i + 1);
    svgs.push(repVolumeTime.render(d, { palette: 'white' }));
  }
  assert.equal(new Set(svgs).size, n, 'different maneuvers draw different curves');
  // A flawed representative (stub choice) differs from the best one when the case has a faulty maneuver.
  const flawed = stubRt(k.c, { kind: 'flawed' });
  assert.equal(repFlowVolume.dataFor(cd, flawed).sets[0].m.index, flawed.representative.pre.index);
  // Without rt the best maneuver is drawn, and an out-of-range index falls back to it.
  const none = repFlowVolume.dataFor(cd, null), bad = repFlowVolume.dataFor(cd, { representative: { pre: { index: 99 } } });
  assert.equal(none.sets[0].m.index, bad.sets[0].m.index);
});

test('the flow-volume loop carries the dashed predicted curve when the interpretation is given, and the pre and post series', () => {
  const k = sheetCase('obstruction');
  const withPred = repFlowVolume.render(repFlowVolume.dataFor(withInterp(k), k.rt), { palette: 'white', width: 336, height: 170 });
  assert.match(withPred, /stroke-dasharray="7 5"/);
  assert.ok(withPred.includes(PALETTES.white.measured) && withPred.includes(PALETTES.white.second));
  assert.ok(withPred.includes('>Predicted<') && withPred.includes('>Pre<') && withPred.includes('>Post<'));
  const noInterp = repFlowVolume.dataFor({ ...k.c, interp: undefined }, k.rt);
  assert.equal(noInterp.predicted, null);
});

test('figures are pure and do not mutate the case', () => {
  const k = sheetCase('mixed');
  const before = JSON.stringify(k.c.pleth.trials[0].pm.slice(0, 5)) + k.c.spirometry.pre.maneuvers.length;
  const a = repPlethLoop.render(repPlethLoop.dataFor(withInterp(k), k.rt), { palette: 'dark' });
  const b = repPlethLoop.render(repPlethLoop.dataFor(withInterp(k), k.rt), { palette: 'dark' });
  assert.equal(a, b);
  assert.equal(before, JSON.stringify(k.c.pleth.trials[0].pm.slice(0, 5)) + k.c.spirometry.pre.maneuvers.length);
});
