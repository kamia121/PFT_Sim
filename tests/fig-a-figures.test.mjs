import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDatasets } from '../src/reference/load.js';
import { ARCHETYPES } from '../src/core/descriptor.js';
import { buildCase } from '../src/core/case.js';
import { buildPleth } from '../src/core/pleth.js';
import { buildDlcoTrace } from '../src/core/dlco-trace.js';
import { PALETTES, PALETTE_IDS, FONT_STACK } from '../src/ui/palettes.js';
import plethShutter from '../src/ui/figures/pleth-shutter.js';
import plethRaw from '../src/ui/figures/pleth-raw.js';
import dlcoTrace from '../src/ui/figures/dlco-trace.js';

const ds = await loadDatasets();
const FIGS = [plethShutter, plethRaw, dlcoTrace];

/** Minimal well-formedness check: balanced tags, quoted attributes, escaped text. Returns the list of element names seen. */
function checkXml(svg) {
  const names = [];
  const stack = [];
  let pos = 0;
  const tag = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g;
  let m;
  while ((m = tag.exec(svg))) {
    const between = svg.slice(pos, m.index);
    assert.ok(!/[<>]/.test(between), `stray angle bracket near ${between.slice(0, 40)}`);
    assert.ok(!/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(between), 'unescaped ampersand in text');
    pos = tag.lastIndex;
    const [, closing, name, , selfClose] = m;
    names.push(name);
    if (closing) { assert.equal(stack.pop(), name, `mismatched </${name}>`); } else if (!selfClose) stack.push(name);
  }
  assert.equal(svg.slice(pos).trim(), '', 'trailing content after the last tag');
  assert.deepEqual(stack, [], 'unclosed elements');
  return names;
}

function checkFigure(svg, palette, label) {
  assert.ok(svg.startsWith('<svg '), label);
  const names = checkXml(svg);
  assert.equal(names[0], 'svg');
  assert.ok(names.includes('title') && names.includes('desc'), `${label}: title and desc`);
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"') && svg.includes('viewBox="0 0 '), label);
  assert.ok(!/var\(/.test(svg), `${label}: no CSS variables`);
  assert.ok(!/(https?:)?\/\/(?!www\.w3\.org\/2000\/svg)/.test(svg.replace('xmlns="http://www.w3.org/2000/svg"', '')), `${label}: no external references`);
  assert.ok(!/<(script|image|style|foreignObject|use|link)\b/i.test(svg), `${label}: no script, image or style elements`);
  assert.ok(!/NaN|undefined|Infinity/.test(svg), `${label}: no invalid numbers`);
  assert.ok(svg.includes(FONT_STACK.replace(/"/g, '&quot;')) || svg.includes(FONT_STACK), `${label}: font stack`);
  assert.ok(svg.includes(palette.measured) && svg.includes(palette.text) && svg.includes(palette.axis), `${label}: palette colors used`);
  if (palette.background) assert.ok(svg.includes(`<rect x="0" y="0" width="640" height="360" fill="${palette.background}"/>`), `${label}: background`);
  else assert.ok(!/<rect x="0" y="0" width="640" height="360"/.test(svg), `${label}: transparent`);
  // Every color attribute is a palette color or none.
  const allowed = new Set([...Object.values(palette).filter((v) => typeof v === 'string' && v.startsWith('#')), 'none']);
  for (const [, v] of svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)) assert.ok(allowed.has(v), `${label}: color ${v} not in palette`);
  // Axis labels with units.
}

const CASES = [['normal', 5], ['obstruction', 3], ['restriction-parenchymal', 4]].map(([a, s]) => buildCase({ seed: s, archetype: a, severity: 2 }, ds));

test('ids and default-export shape are the registry contract', () => {
  assert.deepEqual(FIGS.map((f) => f.id), ['pleth-shutter', 'pleth-raw', 'dlco-trace']);
  for (const f of FIGS) {
    assert.equal(typeof f.title, 'string');
    assert.equal(typeof f.render, 'function');
    assert.equal(typeof f.dataFor, 'function');
  }
});

test('every figure renders valid, self-contained SVG in every palette for normal, obstruction and restriction cases', () => {
  let count = 0;
  for (const c of CASES) for (const fig of FIGS) {
    const data = fig.dataFor(c);
    assert.ok(data, `${fig.id} data`);
    for (const pid of PALETTE_IDS) for (const showQuality of [false, true]) {
      const svg = fig.render(data, { palette: PALETTES[pid], showQuality });
      checkFigure(svg, PALETTES[pid], `${fig.id} ${c.descriptor.archetype} ${pid}`);
      count++;
    }
  }
  assert.equal(count, 3 * 3 * 4 * 2);
});

test('axes carry units, legends are present, markers are annotated', () => {
  const c = CASES[1];
  const shutter = plethShutter.render(plethShutter.dataFor(c), { palette: PALETTES.white });
  for (const s of ['Mouth pressure (kPa)', 'Box pressure (Pa)', 'Shutter trace', 'Least-squares slope', 'Reported FRC', 'Hz', 'PB − 47']) assert.ok(shutter.includes(s), s);
  const raw = plethRaw.render(plethRaw.dataFor(c), { palette: PALETTES.white });
  for (const s of ['Box pressure (Pa)', 'Flow (L/s)', 'sRaw', 'Raw', 'sGaw', 'kPa', 'upper limit']) assert.ok(raw.includes(s), s);
  const dlco = dlcoTrace.render(dlcoTrace.dataFor(c), { palette: PALETTES.white });
  for (const s of ['Time (s)', 'Expired volume (L)', 'Concentration (%)', 'CO (%)', 'tracer', 'Volume (L', 'breath-hold', 'washout', 'sample', 'VA ', 'DLCO ', 'mL/min/mmHg']) assert.ok(dlco.includes(s), s);
});

test('acceptability is hidden unless showQuality is set', () => {
  const c = buildCase({ seed: 3, archetype: 'obstruction', severity: 2, technique: 'poor' }, ds);
  c.scenario = { ids: ['PLE-01', 'DLC-04'] };
  const shutter = plethShutter.dataFor(c), dlco = dlcoTrace.dataFor(c);
  assert.ok(!/acceptable|rejected|usable|Grade/.test(plethShutter.render(shutter, { palette: PALETTES.dark }).replace('mean of the acceptable trials', '')));
  assert.ok(/rejected|usable/.test(plethShutter.render(shutter, { palette: PALETTES.dark, showQuality: true })));
  assert.ok(!/Test grade|rejected/.test(dlcoTrace.render(dlco, { palette: PALETTES.dark })));
  assert.match(dlcoTrace.render(dlco, { palette: PALETTES.dark, showQuality: true }), /Test grade D, would be rejected: Valsalva/);
});

test('rendering is deterministic and honors size, title and description options', () => {
  const c = CASES[0];
  for (const fig of FIGS) {
    const data = fig.dataFor(c);
    const a = fig.render(data, { palette: PALETTES.dark }), b = fig.render(data, { palette: PALETTES.dark });
    assert.equal(a, b);
    const sized = fig.render(data, { palette: PALETTES.white, width: 800, height: 420, title: 'My <title> & more', description: 'My "desc"' });
    checkXml(sized);
    assert.ok(sized.includes('viewBox="0 0 800 420"') && sized.includes('My &lt;title&gt; &amp; more') && sized.includes('My &quot;desc&quot;'));
    assert.equal(fig.render(null, { palette: PALETTES.dark }), '');
  }
});

test('dataFor returns null without the test, uses stored data when present, and otherwise builds it from the case', () => {
  const spiro = buildCase({ seed: 3, archetype: 'normal', panel: 'spirometry' }, ds);
  for (const fig of FIGS) assert.equal(fig.dataFor(spiro), null);
  for (const fig of FIGS) assert.equal(fig.dataFor(null), null);
  const c = buildCase({ seed: 7, archetype: 'mixed', technique: 'fair' }, ds);
  const d = c.descriptor;
  const expectedPleth = buildPleth({ seed: d.seed, truth: c.truth, volumes: c.volumes, technique: d.technique, scenario: null });
  assert.deepEqual(plethShutter.dataFor(c), expectedPleth);
  assert.deepEqual(plethRaw.dataFor(c), expectedPleth);
  const expectedTrace = buildDlcoTrace({ seed: d.seed, truth: c.truth, dlco: c.dlco, volumes: c.volumes, patient: d, technique: d.technique, scenario: null });
  assert.deepEqual(dlcoTrace.dataFor(c), expectedTrace);
  const stored = { pleth: { marker: 1 }, dlcoTrace: { marker: 2 } };
  assert.equal(plethShutter.dataFor(stored), stored.pleth);
  assert.equal(plethRaw.dataFor(stored), stored.pleth);
  assert.equal(dlcoTrace.dataFor(stored), stored.dlcoTrace);
});

test('300+ random cases render all three figures in two palettes without exceptions', () => {
  let n = 0;
  for (const archetype of ARCHETYPES) for (const technique of ['good', 'fair', 'poor']) for (let seed = 400; seed < 410; seed++) {
    const c = buildCase({ seed, archetype, technique, severity: 1 + (seed % 3) }, ds);
    for (const fig of FIGS) {
      const data = fig.dataFor(c);
      for (const pid of ['dark', 'transparent-dark-ink']) checkXml(fig.render(data, { palette: PALETTES[pid], showQuality: seed % 2 === 0 }));
    }
    n++;
  }
  assert.ok(n >= 300);
});
