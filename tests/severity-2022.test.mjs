/** Severity of obstruction under the ERS/ATS 2022 scale (Table 1, p.12, Figure 7 caption): deferred item 6a. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { interpret, severityOf, severityAlso, FEV1_NORMAL } from '../src/interpret/interpret.js';
import { scoreAnswers, QUESTIONS, PRACTICE_QUESTIONS } from '../src/app/answers.js';
import { buildCase } from '../src/core/case.js';
import { ds, resolveReference } from './report-helpers.mjs';
import fs from 'node:fs';

const S1 = ((f) => f.cases ?? f)(JSON.parse(fs.readFileSync(new URL('./fixtures/interpretation-cases.json', import.meta.url), 'utf8'))).find((x) => x.branch === 'S1');
const s1 = (opts) => interpret(S1.report, resolveReference, 'GLIglobal', opts);

const find = (pred, n = 600) => {
  for (let seed = 1; seed <= n; seed++) for (const archetype of ['obstruction', 'mixed', 'normal']) {
    const c = buildCase({ seed, archetype, technique: 'good' }, ds);
    const a = interpret(c.report, resolveReference, 'GLIglobal');
    if (pred(a)) return { c, a };
  }
  throw new Error('no case');
};

test('obstruction with the FEV1 within normal limits is mild under the 2024 clarification', () => {
  const a = s1();
  assert.equal(a.pattern, 'obstruction');
  assert.equal(a.key.severity, 'mild');
  assert.equal(a.severity.scored, true);
  assert.equal(a.severity.notGraded, undefined);
  assert.ok(a.severity.z >= -1.645);
  assert.equal(a.severity.measure, 'fev1');
});

test('obstruction with a low FEV1 is graded by the three bands, cut points -2.5 and -4.0 and the key is the band', () => {
  const { a } = find((x) => x.pattern === 'obstruction' && x.severity?.scored);
  assert.equal(a.key.severity, severityOf(a.severity.z));
  assert.ok(a.severity.z < -1.645);
  for (const [z, band] of [[-1.7, 'mild'], [-2.5, 'mild'], [-2.51, 'moderate'], [-4.0, 'moderate'], [-4.01, 'severe']]) assert.equal(severityOf(z), band, String(z));
});

test('a z-score that prints as a cut point is accepted in either adjacent band; elsewhere only the key', () => {
  const sev = (z, id, scored = true) => ({ z, id, scored, notGraded: scored ? undefined : id });
  assert.deepEqual(severityAlso(sev(-2.503, 'moderate')), ['mild']);
  assert.deepEqual(severityAlso(sev(-2.497, 'mild')), ['moderate']);
  assert.deepEqual(severityAlso(sev(-4.004, 'severe')), ['moderate']);
  assert.deepEqual(severityAlso(sev(-1.646, 'mild')), []);
  assert.deepEqual(severityAlso(sev(-1.644, 'mild')), []);
  for (const z of [-1.7, -2.0, -3.0, -3.9, -4.2]) assert.deepEqual(severityAlso(sev(z, severityOf(z))), [], String(z));
  const key = { pattern: 'obstruction', severity: 'moderate', severityAlso: ['mild'] };
  const score = (answer) => scoreAnswers({ severity: answer }, key, key, 'GLIglobal', PRACTICE_QUESTIONS).find((s) => s.id === 'severity');
  assert.equal(score('moderate').status, 'correct');
  assert.equal(score('mild').status, 'correct');
  assert.match(score('mild').note, /cut point/);
  assert.equal(score('severe').status, 'incorrect');
});

test('the obsolete normal-FEV1 ungraded option is absent and mild is correct', () => {
  const sev = QUESTIONS.find((q) => q.id === 'severity');
  assert.deepEqual(sev.options.map(([v]) => v), ['mild', 'moderate', 'severe', 'not-graded', 'na']);
  const a = s1();
  const s = scoreAnswers({ severity: 'mild' }, a.key, a.key, 'GLIglobal', PRACTICE_QUESTIONS).find((x) => x.id === 'severity');
  assert.equal(s.status, 'correct');
  assert.equal(s.expected, 'mild');
});

test('mixed disease is "not graded for this pattern", not "not applicable (no obstruction)"; no obstruction is not applicable', () => {
  const m = find((x) => x.pattern === 'mixed');
  const n = find((x) => x.pattern === 'normal');
  const exp = (a) => scoreAnswers({}, a.key, a.key, 'GLIglobal', PRACTICE_QUESTIONS).find((x) => x.id === 'severity').expected;
  assert.equal(exp(m.a), 'not-graded');
  assert.equal(exp(n.a), 'na');
});

test('the generator\'s own form of the key (case.anchorKey) keeps the FEV1 band whatever the learner key says', () => {
  const g = s1({ generatorKey: true });
  assert.equal(g.key.severity, 'mild');
  assert.equal(g.key.severityAlso, undefined);
  assert.equal(s1().key.severity, 'mild');
  const c = buildCase({ seed: 12, archetype: 'obstruction' }, ds);
  assert.deepEqual(c.anchorKey, interpret(c.report, resolveReference, 'GLIglobal', { generatorKey: true }));
});
