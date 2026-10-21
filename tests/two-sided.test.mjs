/** One definition of the two-sided indices, shared by the engine, the ATS-style graphic, the inline graphics and the sheet flags (deferred item 5). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TWO_SIDED, labelOf, LLN_Z } from '../src/interpret/interpret.js';
import { TWO_SIDED as zStripSet } from '../src/ui/figures/z-strip.js';
import { TWO_SIDED as panelsSet, inlineCell } from '../src/report-page/panels.js';
import { zInline } from '../src/ui/figures/z-inline.js';
import zStrip from '../src/ui/figures/z-strip.js';
import { PALETTES, PALETTE_IDS } from '../src/ui/palettes.js';
import { makeModel, resolveReference } from './report-helpers.mjs';

test('every module uses the engine\'s set, and none defines its own', () => {
  assert.deepEqual([...TWO_SIDED].sort(), ['dlco', 'kco', 'rv', 'rv_tlc', 'tlc']);
  assert.equal(zStripSet, TWO_SIDED);
  assert.equal(panelsSet, TWO_SIDED);
  for (const f of ['src/ui/figures/z-strip.js', 'src/report-page/panels.js', 'src/sheets/summary.js', 'src/ui/figures/z-inline.js']) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /new Set\(\[\s*'tlc'/, `${f} defines a set of its own`);
  }
});

test('FEV1, FVC, FEV1/FVC and VA stay one-sided though labelOf can say high for them', () => {
  for (const id of ['fev1', 'fvc', 'fev1_fvc', 'va']) assert.ok(!TWO_SIDED.has(id), id);
  assert.equal(labelOf(2.5), 'high');
});

const ulnLines = (svg) => (svg.match(/stroke-dasharray="1 2"/g) ?? []).length;

test('the inline cell draws an upper limit for DLCO and KCO as for TLC, RV and RV/TLC, and not for VA or spirometry', () => {
  for (const id of ['dlco', 'kco', 'tlc', 'rv', 'rv_tlc']) {
    const svg = inlineCell(zInline, id, { z: 0.4 }, LLN_Z, PALETTES.white);
    assert.equal(ulnLines(svg), 2, `${id}: LLN and ULN lines`);
  }
  for (const id of ['va', 'fvc', 'fev1', 'fev1_fvc']) assert.equal(ulnLines(inlineCell(zInline, id, { z: 0.4 }, LLN_Z, PALETTES.white)), 1, `${id}: LLN line only`);
});

test('both limits, the exact boundary, off-scale and post values read the same in the inline graphic, the ATS graphic and the engine', () => {
  const where = (svg) => /above the upper limit/.test(svg) ? 'high' : /below the lower limit/.test(svg) ? 'low' : 'ok';
  for (const [z, want] of [[-1.646, 'low'], [-1.645, 'ok'], [0, 'ok'], [1.645, 'ok'], [1.646, 'high'], [3.7, 'high'], [-6, 'low']]) {
    for (const id of ['dlco', 'kco', 'tlc']) assert.equal(where(inlineCell(zInline, id, { z }, LLN_Z, PALETTES.white)), want, `${id} z ${z}`);
    assert.equal(where(inlineCell(zInline, 'va', { z }, LLN_Z, PALETTES.white)), want === 'high' ? 'ok' : want, `va z ${z}`);
  }
  assert.match(inlineCell(zInline, 'dlco', { z: 3.7 }, LLN_Z, PALETTES.white), /<polygon[^>]*fill="none"/, 'off scale is a hollow star');
  const { c, interp } = makeModel({ seed: 12, archetype: 'obstruction' });
  const data = zStrip.dataFor({ ...c, interp, resolve: resolveReference, equation: 'GLIglobal' });
  for (const r of data.rows) assert.equal(r.twoSided, TWO_SIDED.has(r.id), r.id);
  assert.ok(data.rows.some((r) => r.id === 'kco' && r.twoSided));
  assert.ok(data.hasPost, 'post rows exist, for spirometry only');
  assert.ok(data.rows.filter((r) => r.post).every((r) => !r.twoSided));
});

test('every palette draws the DLCO upper limit', () => {
  for (const id of PALETTE_IDS) assert.equal(ulnLines(inlineCell(zInline, 'dlco', { z: 1 }, LLN_Z, PALETTES[id])), 2, id);
});
