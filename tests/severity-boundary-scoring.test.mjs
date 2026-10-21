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
