import test from 'node:test';
import assert from 'node:assert/strict';
import { visibility } from '../src/challenges/visibility.js';
import { visibility as fromIndex } from '../src/challenges/index.js';

const KEYS = ['showQualityLines', 'showGradeColumns', 'showStatementInSummary'];

test('visibility is one function, re-exported from the challenge index', () => {
  assert.equal(fromIndex, visibility);
});

test('quality challenge off: the statement and the grade columns are shown from the start, at every stage', () => {
  for (const stage of [1, 2, 3]) assert.deepEqual(visibility({ qualityChallenge: false, stage }), { showQualityLines: true, showGradeColumns: true, showStatementInSummary: true });
});

test('quality challenge on, stage 1: nothing about quality is shown', () => {
  assert.deepEqual(visibility({ qualityChallenge: true, stage: 1 }), { showQualityLines: false, showGradeColumns: false, showStatementInSummary: false });
});

test('quality challenge on, stage 2: the statement is released, the grade columns are not', () => {
  assert.deepEqual(visibility({ qualityChallenge: true, stage: 2 }), { showQualityLines: true, showGradeColumns: false, showStatementInSummary: true });
});

test('quality challenge on, stage 3: the answers are checked and everything is shown', () => {
  assert.deepEqual(visibility({ qualityChallenge: true, stage: 3 }), { showQualityLines: true, showGradeColumns: true, showStatementInSummary: true });
});

test('the statement in the summary follows the quality lines, and nothing is hidden again at a later stage', () => {
  for (const qualityChallenge of [false, true]) {
    let prev = null;
    for (const stage of [1, 2, 3]) {
      const v = visibility({ qualityChallenge, stage });
      assert.deepEqual(Object.keys(v), KEYS);
      assert.equal(v.showStatementInSummary, v.showQualityLines);
      if (prev) for (const k of KEYS) assert.ok(v[k] || !prev[k], `${k} hidden again at stage ${stage}`);
      prev = v;
    }
  }
});

test('a stage outside 1 to 3 is an error', () => {
  for (const stage of [0, 4, '1', undefined, null]) assert.throws(() => visibility({ qualityChallenge: true, stage }), RangeError);
});
