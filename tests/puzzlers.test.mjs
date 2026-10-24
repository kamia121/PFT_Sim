import test from 'node:test';
import assert from 'node:assert/strict';
import { PUZZLERS, findPuzzler } from '../src/puzzlers/catalog.js';
import { definePuzzler, startPuzzler, puzzlerView, answerPuzzler, advancePuzzler } from '../src/puzzlers/session.js';
import { renderPuzzler } from '../src/puzzlers/view.js';

test('every authored case completes deterministically with immutable raw values and separate reasoning scores', () => {
  for (const c of PUZZLERS) {
    const original = structuredClone(c.measurements);
    let state = startPuzzler(c);
    for (let i = 0; i < c.stages.length; i++) {
      const view = puzzlerView(c, state);
      assert.equal(view.feedback, null);
      assert.equal(view.reveals.length, i + 1);
      assert.equal(view.question.accepted, undefined);
      assert.equal(view.question.why, undefined);
      const snapshot = JSON.stringify(view);
      for (const future of c.stages.slice(i + 1)) assert.ok(!snapshot.includes(future.reveal));
      const previous = structuredClone(state);
      state = answerPuzzler(c, state, c.stages[i].question.accepted[0]);
      assert.deepEqual(previous.answers.length, i);
      assert.deepEqual(puzzlerView(c, state).measurements, original);
      assert.ok(puzzlerView(c, state).feedback.correct);
      if (i < c.stages.length - 1) state = advancePuzzler(c, state);
    }
    const end = puzzlerView(c, state);
    assert.ok(end.complete);
    assert.ok(end.scores.metadata.total > 0 && end.scores.uncertainty.total > 0);
    assert.equal(end.scores.interpretation.total, 0, 'no uncomputed pattern-label key');
    assert.throws(() => advancePuzzler(c, state));
    assert.throws(() => { c.measurements[0].value = 0; });
  }
});

test('invalid transitions, unknown choices and cross-case state fail explicitly', () => {
  const [a, b] = PUZZLERS, start = startPuzzler(a);
  assert.throws(() => advancePuzzler(a, start));
  assert.throws(() => answerPuzzler(a, start, 'invented'));
  assert.throws(() => puzzlerView(b, start));
  assert.throws(() => findPuzzler('missing'));
  const wrong = a.stages[0].question.options.find(([id]) => !a.stages[0].question.accepted.includes(id))[0];
  const state = answerPuzzler(a, start, wrong);
  assert.equal(puzzlerView(a, state).feedback.correct, false);
  assert.throws(() => answerPuzzler(a, state, a.stages[0].question.accepted[0]));
  assert.deepEqual(startPuzzler(a), start, 'restart clears history deterministically');
  assert.throws(() => definePuzzler({ ...a, stages: [a.stages[0], a.stages[0]] }));
});

test('source-review gates prevent scoring disputed claims and reject invented source IDs/reference outputs', () => {
  const draft = structuredClone(PUZZLERS[0]);
  draft.stages[0].question.claims = ['severity.obstruction-normal-fev1'];
  const c = definePuzzler(draft);
  let state = answerPuzzler(c, startPuzzler(c), c.stages[0].question.accepted[0]);
  assert.equal(puzzlerView(c, state).feedback.scored, false);
  assert.equal(puzzlerView(c, state).feedback.correct, null);
  for (let i = 1; i < c.stages.length; i++) {
    state = advancePuzzler(c, state);
    state = answerPuzzler(c, state, c.stages[i].question.accepted[0]);
  }
  assert.equal(puzzlerView(c, state).scores.metadata.unscored, 1);
  draft.stages[0].question.claims = ['invented'];
  assert.throws(() => definePuzzler(draft));
  for (const key of ['predicted', 'lln', 'uln', 'z', 'pctPred', 'percentPredicted']) assert.throws(() => definePuzzler({ ...PUZZLERS[0], derived: { [key]: 1 } }));
});

test('rendering uses only released projection, escapes text and hides feedback until submission', () => {
  const c = PUZZLERS[0], state = startPuzzler(c);
  const html = renderPuzzler(puzzlerView(c, state));
  assert.ok(!html.includes(c.stages[1].reveal));
  assert.ok(!html.includes(c.stages[0].question.why));
  assert.ok(!html.includes('Sources and scope'));
  assert.match(html, /type="submit"/);
  const view = structuredClone(puzzlerView(c, state));
  view.title = '<script>bad()</script>';
  assert.ok(!renderPuzzler(view).includes('<script>'));
  const checked = renderPuzzler(puzzlerView(c, answerPuzzler(c, state, 'metadata')));
  assert.ok(checked.includes(c.stages[0].question.why));
  assert.ok(!checked.includes(c.stages[1].reveal));
  assert.match(checked, /disabled/);
});
