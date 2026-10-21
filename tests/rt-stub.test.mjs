import test from 'node:test';
import assert from 'node:assert/strict';
import { stubRtReport, stubChallenges } from './helpers/rt-stub.mjs';
import { visibility } from '../src/challenges/visibility.js';
import { visibility as visibilityFromIndex } from '../src/challenges/index.js';

const HONESTY = ['accurate', 'software', 'generic', 'optimistic', 'pessimistic', 'stale', 'silent'];

test('the stub report has the frozen RtReport shape', () => {
  const r = stubRtReport();
  assert.equal(r.version, 1);
  assert.ok(HONESTY.includes(r.honesty));
  assert.deepEqual(Object.keys(r).sort(), ['closing', 'detailsReasons', 'honesty', 'interpretationLines', 'needsDetails', 'qualityLines', 'representative', 'stated', 'truth', 'version']);
  assert.equal(r.closing, 'Official interpretation to follow.');
  assert.deepEqual(Object.keys(r.stated).sort(), ['dlco', 'pleth', 'post', 'pre']);
  assert.deepEqual(Object.keys(r.truth).sort(), ['dlco', 'pleth', 'post', 'pre']);
  assert.deepEqual(Object.keys(r.representative).sort(), ['dlco', 'pleth', 'post', 'pre']);
});

test('overrides merge plain objects and replace arrays and scalars', () => {
  const r = stubRtReport({ honesty: 'silent', qualityLines: [], stated: { post: null }, representative: { pre: { kind: 'best', faults: [] } } });
  assert.equal(r.honesty, 'silent');
  assert.deepEqual(r.qualityLines, []);
  assert.equal(r.stated.post, null);
  assert.deepEqual(r.stated.pre, { fev1: 'A', fvc: 'A' });
  assert.deepEqual(r.representative.pre, { index: 2, kind: 'best', faults: [] });
  assert.notEqual(stubRtReport().stated, stubRtReport().stated, 'each call returns fresh objects');
});

test('stub challenges have the frozen Challenge shape and distinct ids', () => {
  const items = stubChallenges();
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  for (const i of items) {
    for (const f of ['id', 'title', 'prompt', 'options', 'key', 'why', 'needsDetails', 'stage']) assert.ok(f in i, `${i.id} has ${f}`);
    assert.ok(i.options.every(([v, l]) => typeof v === 'string' && typeof l === 'string'));
    if (i.rows) assert.deepEqual(Object.keys(i.key).sort(), i.rows.map((r) => r.id).sort());
    else assert.ok(i.options.some(([v]) => v === i.key), `${i.id} key is an option`);
  }
});

test('visibility: quality challenge off shows everything from the start', () => {
  for (const stage of [1, 2, 3]) assert.deepEqual(visibility({ qualityChallenge: false, stage }), { showQualityLines: true, showGradeColumns: true, showStatementInSummary: true });
});

test('visibility: quality challenge on stages the statement and the grade columns', () => {
  assert.deepEqual(visibility({ qualityChallenge: true, stage: 1 }), { showQualityLines: false, showGradeColumns: false, showStatementInSummary: false });
  assert.deepEqual(visibility({ qualityChallenge: true, stage: 2 }), { showQualityLines: true, showGradeColumns: false, showStatementInSummary: true });
  assert.deepEqual(visibility({ qualityChallenge: true, stage: 3 }), { showQualityLines: true, showGradeColumns: true, showStatementInSummary: true });
  assert.throws(() => visibility({ qualityChallenge: true, stage: 4 }), RangeError);
  assert.equal(visibilityFromIndex, visibility);
});
