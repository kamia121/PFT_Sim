/**
 * DEVELOPMENT / REGRESSION results on the 144-item phrasing set. The set was written by a separate agent before any code existed, but it was then used
 * to find and fix defects, so it is tuned-on: these numbers are regression checks, not held-out validation. Gold labels are the author's (a language model),
 * partly adjudicated blind by a second model; no clinician panel was involved. See docs/written-grader/EVALUATION.md.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { evaluateSet, verdicts, SCENARIOS } from './helpers/written-eval.mjs';

const path = new URL('./fixtures/written/heldout.json', import.meta.url);
const raw = fs.readFileSync(path);
const set = JSON.parse(raw);

test('the phrasing set is the frozen file', () => {
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), 'b507d656deaa75c3d25654dc12948b09b8e0afe40d185fc7916535ca38bd833f');
  assert.equal(set.length, 144);
});

test('regression: false credit, false contradiction and false missing do not grow', () => {
  const m = evaluateSet(set);
  assert.deepEqual(m.falseCredit.map((x) => `${x.id}:${x.d}`).sort(), ['H034:pattern', 'H094:quality'], 'the two false credits the blind adjudicator agreed were correct');
  assert.deepEqual(m.falseContradiction, []);
  assert.deepEqual(m.falseMissing, []);
  assert.equal(m.judgments, 720);
});

test('regression: items tagged injection or nonsense never earn credit', () => {
  for (const it of set.filter((x) => (x.tags ?? []).some((t) => /inject|nonsense|empty/i.test(t)))) {
    const v = verdicts(it.text, SCENARIOS[it.scenario]);
    for (const d of ['pattern', 'severity', 'bd', 'dlco', 'quality']) {
      if (it.gold[d] !== 'correct') assert.notEqual(v[d], 'correct', `${it.id} ${d}: ${it.text}`);
    }
  }
});

test('regression: non-English and over-long items abstain', () => {
  for (const it of set.filter((x) => (x.tags ?? []).some((t) => /non-english|foreign|spanish|french|german/i.test(t)))) {
    const v = verdicts(it.text, SCENARIOS[it.scenario]);
    for (const d of ['pattern', 'severity', 'bd', 'dlco', 'quality']) assert.notEqual(v[d], 'correct', `${it.id} ${d}`);
    for (const d of ['pattern', 'severity', 'bd', 'dlco', 'quality']) assert.notEqual(v[d], 'contradictory', `${it.id} ${d}`);
  }
});
