import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDatasets } from '../src/reference/load.js';
import { createReference } from '../src/reference/gli.js';
import { buildCase } from '../src/core/case.js';
import { interpret } from '../src/interpret/interpret.js';
import { standaloneSvg, svgVariants, downloadSvg, figureFilename, seedCode } from '../src/ui/svg-export.js';
import { availableFigures, downloadControlsHtml, VARIANTS } from '../src/app/figure-downloads.js';
import { FIGURE_ORDER } from '../src/ui/figures/index.js';
import { PALETTE_IDS, PALETTES } from '../src/ui/palettes.js';
import { assertWellFormed, assertSelfContained } from './helpers/svg.mjs';

const ds = await loadDatasets();
const { resolveReference } = createReference(ds);
const c = buildCase({ seed: 21, archetype: 'obstruction', severity: 3 }, ds);
const caseData = { ...c, interp: interpret(c.report, resolveReference, 'GLIglobal'), revealed: false, showSchematic: true };

test('standaloneSvg adds the XML declaration, xmlns, width and height, and is idempotent', () => {
  const bare = '<svg viewBox="0 0 320 180"><title>t</title></svg>';
  const out = standaloneSvg(bare);
  assert.match(out, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<svg /);
  assert.match(out, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(out, /width="320"/);
  assert.match(out, /height="180"/);
  assert.equal(standaloneSvg(out), out);
  assertWellFormed(out, 'standalone');
  const keep = standaloneSvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20" viewBox="0 0 320 180"></svg>');
  assert.equal((keep.match(/width=/g) ?? []).length, 1);
  assert.equal((keep.match(/xmlns=/g) ?? []).length, 1);
  assert.throws(() => standaloneSvg('<div></div>'));
});

test('svgVariants returns four standalone, different SVG strings for each available figure', () => {
  const figs = availableFigures(caseData);
  // Plethysmography and DLCO figures join this list when their modules are merged; the first three are always there.
  assert.deepEqual(figs.map((f) => f.id).slice(0, 3), ['flow-volume', 'volume-time', 'z-strip']);
  for (const { id } of figs) {
    const v = svgVariants(id, caseData);
    assert.deepEqual(Object.keys(v).sort(), [...PALETTE_IDS].sort());
    assert.equal(new Set(Object.values(v)).size, 4);
    for (const [pal, svg] of Object.entries(v)) {
      assert.ok(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg '), `${id}/${pal}`);
      assertWellFormed(svg, `${id}/${pal}`);
      assertSelfContained(svg, `${id}/${pal}`);
      assert.match(svg, /width="\d+" height="\d+"/);
      assert.equal(/<rect /.test(svg), PALETTES[pal].background !== null);
    }
  }
});

test('svgVariants honors size and title options and returns an empty object for a missing figure or test', () => {
  const v = svgVariants('flow-volume', caseData, { width: 480, height: 400, title: 'Loop' });
  assert.match(v.dark, /viewBox="0 0 480 400" width="480" height="400"/);
  assert.match(v.dark, /<title>Loop<\/title>/);
  assert.deepEqual(svgVariants('no-such-figure', caseData), {});
  assert.deepEqual(svgVariants('pleth-shutter', caseData), {});
  assert.deepEqual(svgVariants('flow-volume', {}), {});
});

test('exported figures follow the revealed state of the page', () => {
  const poor = buildCase({ seed: 4, archetype: 'obstruction', technique: 'poor' }, ds);
  const interp = interpret(poor.report, resolveReference, 'GLIglobal');
  const hidden = svgVariants('flow-volume', { ...poor, interp, revealed: false }).dark;
  const shown = svgVariants('flow-volume', { ...poor, interp, revealed: true }).dark;
  assert.ok(!hidden.includes(PALETTES.dark.rejected));
  assert.ok(shown.includes(PALETTES.dark.rejected));
});

test('file names carry the figure, the case seed code and the palette', () => {
  assert.equal(figureFilename('flow-volume', '1x2y', 'dark'), 'pft-flow-volume-1x2y-dark.svg');
  assert.equal(figureFilename('Z strip', 'A/B', 'transparent-dark-ink'), 'pft-z-strip-a-b-transparent-dark-ink.svg');
  assert.equal(seedCode({ descriptor: { seed: 21 } }), (21).toString(36));
  assert.equal(seedCode({}), 'case');
  const names = PALETTE_IDS.map((p) => figureFilename('volume-time', seedCode(caseData), p));
  assert.equal(new Set(names).size, 4);
});

test('downloadSvg is guarded outside a browser', () => {
  assert.equal(typeof document, 'undefined');
  assert.equal(downloadSvg('x.svg', '<svg/>'), false);
});

test('download controls offer the four variants with download and copy, for every registry figure with data', () => {
  assert.deepEqual(VARIANTS.map(([id]) => id).sort(), [...PALETTE_IDS].sort());
  const html = downloadControlsHtml('flow-volume');
  assert.match(html, /<summary>Download SVG<\/summary>/);
  for (const [id, label] of VARIANTS) {
    assert.ok(html.includes(`data-pal="${id}"`) && html.includes(label), id);
    assert.ok(html.includes(`data-fig-dl="flow-volume" data-pal="${id}" data-act="download"`));
    assert.ok(html.includes(`data-fig-dl="flow-volume" data-pal="${id}" data-act="copy"`));
  }
  const ids = availableFigures(caseData).map((f) => f.id);
  for (const id of ids) assert.ok(FIGURE_ORDER.includes(id));
  assert.deepEqual(ids, FIGURE_ORDER.filter((id) => ids.includes(id)), 'page order follows FIGURE_ORDER');
  assert.deepEqual(availableFigures({}), []);
});
