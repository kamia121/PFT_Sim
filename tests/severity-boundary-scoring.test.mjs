/**
 * An answer accepted at a cut point of the 2022 severity scale (key.severityAlso) is scored as correct in the practice page and in the quiz,
 * ahead of the other equation's key and of the partial credit for an adjacent band (Codex review of b7de2a1; seeds 99 and 164, GLI Global).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCase } from '../src/core/case.js';
import { interpret } from '../src/interpret/interpret.js';
import { scoreAnswers, PRACTICE_QUESTIONS } from '../src/app/answers.js';
import { scoreItem } from '../src/quiz/scoring.js';
import { ds, resolveReference } from './report-helpers.mjs';
import { build } from './quiz-helpers.mjs';

const keys = (seed, severity) => {
  const c = buildCase({ seed, archetype: 'obstruction', technique: 'good', ...(severity ? { severity } : {}) }, ds);
  return { c, a: interpret(c.report, resolveReference, 'GLIglobal'), b: interpret(c.report, resolveReference, 'GLI2012') };
};
const practice = (x, answer) => scoreAnswers({ severity: answer }, x.a.key, x.b.key, 'GLIglobal', PRACTICE_QUESTIONS).find((s) => s.id === 'severity');

test('practice, seed 164 (z -2.5016, key moderate, mild accepted, GLI-2012 key is mild): mild is correct, not "other equation"', () => {
  const x = keys(164);
  assert.ok(Math.abs(x.a.severity.z + 2.50157254) < 1e-6);
  assert.equal(x.a.key.severity, 'moderate');
  assert.deepEqual(x.a.key.severityAlso, ['mild']);
  assert.equal(x.b.key.severity, 'mild');
  assert.equal(practice(x, 'moderate').status, 'correct');
  assert.equal(practice(x, 'mild').status, 'correct');
  assert.match(practice(x, 'mild').note, /cut point/);
  assert.equal(practice(x, 'severe').status, 'incorrect');
  assert.equal(practice(x, 'fev1-normal').status, 'incorrect');
});

test('practice control: away from a cut point the other equation\'s key is still labelled as such', () => {
  let n = 0;
  for (let seed = 1; seed <= 300 && n < 3; seed++) {
    const x = keys(seed);
    if (x.a.key.severityAlso || !x.a.key.severity || !x.b.key.severity || x.a.key.severity === x.b.key.severity) continue;
    n++;
    assert.equal(practice(x, x.b.key.severity).status, 'other-equation');
    assert.equal(practice(x, x.a.key.severity).status, 'correct');
  }
  assert.ok(n >= 1, 'a case whose keys differ away from a cut point exists');
});

test('quiz, seed 99 severity 1 (z -1.6486, key mild, fev1-normal accepted): the accepted band earns full credit', () => {
  const { items, prep } = build({ seed: 99, archetype: 'obstruction', severity: 1, technique: 'good' });
  assert.ok(Math.abs(prep.a.severity.z + 1.64858037) < 1e-6);
  const item = items.find((i) => i.id === 'severity');
  assert.ok(item, 'the severity item is asked');
  assert.equal(item.key.correct, 'mild');
  assert.deepEqual(item.key.also, ['fev1-normal']);
  const r = scoreItem(item, 'fev1-normal');
  assert.equal(r.score, 1);
  assert.equal(r.status, 'correct');
  assert.equal(scoreItem(item, 'mild').score, 1);
  // Controls: a band two steps away earns nothing, and the unanswered item earns nothing.
  assert.equal(scoreItem(item, 'severe').score, 0);
  assert.equal(scoreItem(item, 'moderate').score, 0.5, 'the adjacent band on the other side keeps its partial credit');
  assert.equal(scoreItem(item, undefined).status, 'unanswered');
});

test('quiz, seed 164: the accepted band is full credit although it is also the other equation\'s key', () => {
  const { items } = build({ seed: 164, archetype: 'obstruction', technique: 'good' });
  const item = items.find((i) => i.id === 'severity');
  assert.ok(item);
  assert.deepEqual(item.key.also, ['mild']);
  assert.equal(scoreItem(item, 'mild').score, 1);
  assert.equal(scoreItem(item, 'mild').status, 'correct');
  assert.equal(scoreItem(item, 'severe').score, 0.5, 'one step from the key keeps the partial credit');
});

test('a quiz item away from a cut point carries no accepted list, and its scoring is unchanged', () => {
  const { items } = build({ seed: 12, archetype: 'obstruction', severity: 2, technique: 'good' });
  const item = items.find((i) => i.id === 'severity');
  if (item) {
    assert.equal(item.key.also, undefined);
    assert.equal(scoreItem(item, item.key.correct).score, 1);
  }
});

test('the answer key CSV has a separate accepted-at-a-cut-point column with the option letter and label, and the other-equation column keeps its own meaning', async () => {
  const { keyCsv } = await import('../src/quiz/export.js');
  const { lettered } = await import('../src/quiz/exam.js');
  const { TOPICS, TECHNIQUE_MIXES, PANEL_MIXES, SKILLS, validateExam } = await import('../src/quiz/codes.js');
  const def = validateExam({ n: 2, seed: 5, archetypes: [...new Set(Object.values(TOPICS).flatMap((t) => t.archetypes))], scenario: 'none', technique: TECHNIQUE_MIXES.mostly.weights, panel: PANEL_MIXES.mixed.weights, timeLimit: 0, shuffleSeed: 7, equation: 'GLIglobal', skills: SKILLS.slice() });
  const b99 = build({ seed: 99, archetype: 'obstruction', severity: 1, technique: 'good' });
  const b164 = build({ seed: 164, archetype: 'obstruction', technique: 'good' });
  const b12 = build({ seed: 12, archetype: 'obstruction', severity: 2, technique: 'good' });
  const cases = [b99, b164, b12].map((b, index) => ({ index, descriptor: { archetype: 'obstruction', technique: 'good', panel: 'full' }, prep: b.prep, items: b.items }));
  const csv = keyCsv(def, cases).split('\r\n');
  assert.match(csv[0], /,also accepted \(other equation\),also accepted \(at a cut point\)$/);
  const row = (i) => csv.slice(1).filter((r) => r.startsWith(`${i + 1},`)).find((r) => r.includes(',Severity,'));
  const opt = (i, id) => { const it = cases[i].items.find((x) => x.id === 'severity'); return lettered(it, def, i).find((o) => o.id === id); };
  // Seed 99: key mild; fev1-normal accepted at the cut point; no other-equation key differs.
  const r99 = row(0).split(',');
  assert.equal(r99.at(-1), `${opt(0, 'fev1-normal').letter} ${opt(0, 'fev1-normal').label}`);
  assert.equal(r99.at(-2), '', 'the other-equation column stays empty for it');
  // Seed 164: mild is accepted at the cut point and is also the GLI-2012 key: both columns are filled, independently.
  const r164 = row(1).split(',');
  assert.equal(r164.at(-1), `${opt(1, 'mild').letter} ${opt(1, 'mild').label}`);
  assert.equal(r164.at(-2), `${opt(1, 'mild').letter} ${opt(1, 'mild').label}`);
  // Control: away from a cut point the new column is empty.
  assert.equal(row(2).split(',').at(-1), '');
});

test('a post-bronchodilator study with no usable FEV1 or FVC renders without error in the quiz chart and the card view (exam-sheet failure seen in CI, run 39551898946)', async () => {
  const { renderBronchodilator } = await import('../src/app/render.js');
  const { renderChart } = await import('../src/quiz/chart.js');
  const { loadAdapters } = await import('../src/quiz/adapters.js');
  const adapters = await loadAdapters();
  // Seed 1, normal, technique poor, moderate notes: the post FEV1 is missing (qs-slow-start, qs-bd-set-small) and interpret() has no bronchodilator result.
  const c = buildCase({ seed: 1, archetype: 'normal', technique: 'poor', scenarioLevel: 'moderate' }, ds);
  const a = interpret(c.report, resolveReference, 'GLIglobal');
  assert.ok(c.spirometry.post && !a.bd, 'the case has a post study and no bd result');
  const html = renderBronchodilator(c, a, { maneuvers: false });
  assert.match(html, /No change from baseline is calculated/);
  const { prep } = build({ seed: 1, archetype: 'normal', technique: 'poor', scenarioLevel: 'moderate' }, { adapters });
  assert.doesNotThrow(() => renderChart(prep, { adapters }));
  // Control: a complete study still shows the change table.
  const ok = buildCase({ seed: 12, archetype: 'obstruction', technique: 'good' }, ds);
  const oa = interpret(ok.report, resolveReference, 'GLIglobal');
  if (ok.spirometry.post) assert.match(renderBronchodilator(ok, oa, { maneuvers: false }), /Change from baseline/);
});

test('the chart renders for 300 random exam-like cases, including those with no bronchodilator result', async () => {
  const { renderChart } = await import('../src/quiz/chart.js');
  const { loadAdapters } = await import('../src/quiz/adapters.js');
  const adapters = await loadAdapters();
  let nullBd = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const d = { seed, archetype: ['normal', 'obstruction', 'mixed', 'nonspecific'][seed % 4], technique: 'poor', scenarioLevel: 'heavy' };
    const { prep } = build(d, { adapters });
    assert.doesNotThrow(() => renderChart(prep, { adapters }), JSON.stringify(d));
    if (prep.caseData.spirometry.post && !prep.a.bd) nullBd++;
  }
  assert.ok(nullBd >= 1, `${nullBd} cases with a post study and no bd result were rendered`);
});
