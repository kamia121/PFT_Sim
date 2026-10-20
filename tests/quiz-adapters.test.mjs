import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAdapters, descriptorExtras, narrativeFor, figuresFor, NO_ADAPTERS } from '../src/quiz/adapters.js';
import { PALETTES } from '../src/ui/palettes.js';
import { build, sweep } from './quiz-helpers.mjs';
import { renderChart } from '../src/quiz/chart.js';
import { buildItems } from '../src/quiz/items.js';

const missing = async () => { throw new Error('Failed to fetch dynamically imported module'); };

test('every optional module can be absent: the adapters degrade to the built-in paths', async () => {
  const a = await loadAdapters(missing);
  assert.equal(a.scenarios, null);
  assert.equal(a.composeNarrative, null);
  assert.equal(a.figures, null);
  assert.deepEqual(a.status, { scenarios: false, narrative: false, figures: 0 });
  assert.deepEqual(descriptorExtras(a, 'heavy'), {});
  assert.equal(narrativeFor(a, {}), null);
  assert.deepEqual(figuresFor(a, {}), []);
});

test('the default importer never throws, whatever is installed', async () => {
  const a = await loadAdapters();
  assert.equal(typeof a.status.figures, 'number');
  assert.ok(a.palettes?.dark);
});

test('mock modules that follow the contract are picked up', async () => {
  const compose = () => ({ sections: [], finalStatement: 'MOCK FINAL', findings: [], distractors: [{ id: 'd1', text: 'MOCK D1', flaw: 'flaw one' }, { id: 'd2', text: 'MOCK D2', flaw: 'flaw two' }] });
  const FIGURES = {
    'flow-volume': { id: 'flow-volume', title: 'Flow', render: () => '', dataFor: () => ({}) },
    'z-strip': { id: 'z-strip', title: 'Z strip', render: (data, { palette }) => `<svg data-palette="${palette.id}"></svg>`, dataFor: () => ({ ok: 1 }) },
    'dlco-trace': { id: 'dlco-trace', title: 'DLCO', render: () => '<svg></svg>', dataFor: () => null },
    'pleth-raw': { id: 'pleth-raw', title: 'Pleth', render: () => '<svg></svg>', dataFor: () => { throw new Error('boom'); } },
  };
  const mods = { scenarios: { SCENARIO_LEVELS: [] }, narrative: { composeNarrative: compose }, figures: { FIGURES, FIGURE_ORDER: Object.keys(FIGURES) }, palettes: { PALETTES } };
  const a = await loadAdapters(async (spec) => mods[spec]);
  assert.deepEqual(a.status, { scenarios: true, narrative: true, figures: 4 });
  assert.deepEqual(descriptorExtras(a, 'heavy'), { scenario: 'heavy' });
  assert.deepEqual(descriptorExtras(a, 'none'), {});
  const figs = figuresFor(a, {}, 'dark');
  assert.deepEqual(figs.map((f) => f.id), ['z-strip'], 'placeholders returning empty strings, null data and throwing figures are skipped');
  assert.match(figs[0].svg, /data-palette="dark"/);
});

test('a narrative module that throws or returns the wrong shape is ignored', () => {
  const bad = (fn) => narrativeFor({ composeNarrative: fn }, {});
  assert.equal(bad(() => { throw new Error('x'); }), null);
  assert.equal(bad(() => ({})), null);
  assert.equal(bad(() => ({ finalStatement: '  ', distractors: [] })), null);
  const ok = bad(() => ({ finalStatement: 'S', distractors: [{ text: 'D' }, { text: 'S' }, null, { text: '' }] }));
  assert.deepEqual(ok.distractors, [{ text: 'D' }], 'a distractor equal to the final statement or empty is dropped');
});

test('the final-interpretation item uses the narrative module and tops up from the built-in distractors', () => {
  const compose = () => ({ finalStatement: 'MOCK FINAL', distractors: [{ id: 'd1', text: 'MOCK D1', flaw: 'flaw one' }] });
  const adapters = { ...NO_ADAPTERS, composeNarrative: compose };
  for (const d of sweep(2)) {
    const { items } = build(d, { adapters });
    const f = items.find((i) => i.id === 'final');
    const labels = f.options.map((o) => o.label);
    assert.ok(labels.includes('MOCK FINAL') && labels.includes('MOCK D1'));
    assert.equal(f.options.length, 4);
    assert.equal(f.options.find((o) => o.id === f.key.correct).label, 'MOCK FINAL');
    assert.equal(f.explain.options.find((o) => o.text === 'MOCK D1').flaw, 'flaw one');
  }
});

test('with the narrative module absent the rule-based statement is exactly one correct option', () => {
  for (const d of sweep(3)) {
    const { items } = build(d);
    const f = items.find((i) => i.id === 'final');
    assert.equal(f.options.length, 4, `${d.archetype} has four statements`);
    assert.equal(new Set(f.options.map((o) => o.label)).size, 4);
    assert.equal(f.explain.options.filter((o) => o.truth).length, 1);
    assert.equal(f.explain.source, 'fallback');
  }
});

test('scenario caveats and decoys from the case are used alongside the built-in ones', () => {
  const { prep, ctx } = build({ seed: 11, archetype: 'normal', technique: 'good' });
  prep.caseData.scenario = {
    level: 'moderate', ids: [], statements: [{ id: 's1', category: 'medication', text: 'Albuterol taken two hours before arrival.' }], technologistComments: ['Patient coughed on the third effort.'],
    caveats: [{ id: 'cv1', text: 'SCENARIO CAVEAT: bronchodilator was not withheld.', weight: 'major' }],
    decoyCaveats: [{ id: 'dc1', text: 'SCENARIO DECOY: the patient wore a restrictive garment.' }],
    preTest: { lastSabaHours: 2 }, height: { statedCm: 170, trueCm: 168, source: 'reported', note: 'Stated, not measured.' }, referenceSex: { used: 'M', birth: 'F', note: 'Laboratory policy.' }, coHbPercent: 4.2,
  };
  const items = buildItems(prep, ctx);
  const lim = items.find((i) => i.id === 'limitations');
  const text = (id) => lim.options.find((o) => o.id === id)?.label;
  const correct = lim.key.correct.map(text);
  assert.ok(correct.includes('SCENARIO CAVEAT: bronchodilator was not withheld.'));
  assert.ok(lim.explain.options.some((o) => o.text.startsWith('SCENARIO DECOY') && !o.truth));
  assert.ok(lim.options.some((o) => o.id === 'none'));
  const html = renderChart(prep, { adapters: NO_ADAPTERS });
  assert.match(html, /Albuterol taken two hours before arrival/);
  assert.match(html, /Patient coughed on the third effort/);
  assert.match(html, /Sex assigned at birth/);
  assert.match(html, /Female/);
  assert.match(html, /patient-reported/);
  assert.match(html, /COHb 4\.2%/);
  assert.match(html, /Short-acting bronchodilator taken 2 h before the test/);
});
