import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAnswers, label } from '../src/app/answers.js';

const keyA = { pattern: 'obstruction', severity: 'mild', gradeFev1: 'A', gradeFvc: 'B', bronchodilator: 'significant', dlco: null };
const keyB = { ...keyA, pattern: 'normal', severity: null };

test('answers are scored against the key, with the other equation accepted for borderline results', () => {
  const s = scoreAnswers({ pattern: 'normal', severity: 'mild', gradeFev1: 'B', bronchodilator: 'significant', dlco: 'not-done' }, keyA, keyB);
  const by = Object.fromEntries(s.map((r) => [r.id, r.status]));
  assert.equal(by.pattern, 'other-equation');
  assert.equal(by.severity, 'correct');
  assert.equal(by.gradeFev1, 'incorrect');
  assert.equal(by.gradeFvc, 'unanswered');
  assert.equal(by.bronchodilator, 'correct');
  assert.equal(by.dlco, 'correct');
});

test('a case without obstruction expects "not applicable" for severity', () => {
  const s = scoreAnswers({ severity: 'na' }, keyB, keyB);
  assert.equal(s.find((r) => r.id === 'severity').status, 'correct');
  assert.equal(label('pattern', 'mixed'), 'Mixed obstruction and restriction');
});
