import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreItem, scoreCase, summarize } from '../src/quiz/scoring.js';
import { SKILLS } from '../src/quiz/codes.js';
import { feedbackHtml } from '../src/quiz/explain.js';
import { build, sweep } from './quiz-helpers.mjs';

const single = (id, correct, alt = null) => ({ id, skill: 'pattern', type: 'single', key: { correct, alt }, options: [] });
const multi = (correct, weights) => ({ id: 'limitations', skill: 'limitations', type: 'multi', key: { correct, weights }, options: [] });

test('single answers: correct, other equation, incorrect, unanswered', () => {
  const it = single('pattern', 'obstruction', 'normal');
  assert.equal(scoreItem(it, 'obstruction').status, 'correct');
  const o = scoreItem(it, 'normal');
  assert.deepEqual([o.status, o.score], ['other-equation', 1]);
  assert.deepEqual([scoreItem(it, 'mixed').status, scoreItem(it, 'mixed').score], ['incorrect', 0]);
  assert.equal(scoreItem(it, undefined).status, 'unanswered');
  assert.equal(scoreItem(it, '').status, 'unanswered');
});

test('partial credit: one band or one grade from the key earns half a point, nothing else does', () => {
  const sev = { ...single('severity', 'moderate'), skill: 'severity' };
  assert.equal(scoreItem(sev, 'mild').score, 0.5);
  assert.equal(scoreItem(sev, 'severe').score, 0.5);
  assert.equal(scoreItem(sev, 'na').score, 0);
  const g = { ...single('gradeFev1', 'C'), skill: 'quality' };
  assert.equal(scoreItem(g, 'B').score, 0.5);
  assert.equal(scoreItem(g, 'D').status, 'partial');
  assert.equal(scoreItem(g, 'A').score, 0);
  assert.equal(scoreItem(g, 'U').score, 0, 'U and F are not on the A to E scale');
  const sevAlt = { ...single('severity', 'mild', 'moderate'), skill: 'severity' };
  assert.equal(scoreItem(sevAlt, 'severe').score, 0.5, 'adjacent to the other equation key');
  assert.equal(scoreItem(single('pattern', 'mixed'), 'restriction').score, 0, 'no partial credit for pattern');
});

test('limitations: harmonic mean of precision and weighted recall', () => {
  const it = multi(['o1', 'o2'], { o1: 2, o2: 1 });
  assert.equal(scoreItem(it, ['o1', 'o2']).score, 1);
  const r = scoreItem(it, ['o1']);
  assert.equal(r.detail.precision, 1);
  assert.ok(Math.abs(r.detail.recall - 2 / 3) < 1e-9);
  assert.ok(Math.abs(r.score - 0.8) < 1e-9);
  assert.deepEqual(r.detail.missed, ['o2']);
  const w = scoreItem(it, ['o2']);
  assert.ok(Math.abs(w.score - (2 * 1 * (1 / 3)) / (1 + 1 / 3)) < 1e-3);
  const x = scoreItem(it, ['o1', 'o2', 'o3', 'o4']);
  assert.equal(x.detail.precision, 0.5);
  assert.ok(Math.abs(x.score - 2 / 3) < 1e-3);
  assert.deepEqual([scoreItem(it, ['o3']).score, scoreItem(it, ['o3']).status], [0, 'incorrect']);
  assert.equal(scoreItem(it, []).status, 'unanswered');
  assert.equal(scoreItem(it, ['o1', 'o1', 'o2']).score, 1, 'a repeated id counts once');
});

test('"none of these" is correct only when the key is none', () => {
  const none = multi(['none'], { none: 1 });
  assert.equal(scoreItem(none, ['none']).score, 1);
  assert.ok(Math.abs(scoreItem(none, ['none', 'o1']).score - 2 / 3) < 1e-3);
  assert.equal(scoreItem(none, ['o1']).score, 0);
  const some = multi(['o1'], { o1: 1 });
  assert.equal(scoreItem(some, ['none']).score, 0);
});

test('perfect and empty responses over real cases, and the rubric by skill adds up', () => {
  const cases = sweep(2).map((d) => build(d).items);
  const perfect = cases.map((items) => ({ items, responses: Object.fromEntries(items.map((it) => [it.id, it.key.correct])) }));
  const s = summarize(perfect);
  assert.equal(s.total, s.max);
  assert.equal(s.pct, 100);
  assert.equal(SKILLS.reduce((t, k) => t + s.bySkill[k].max, 0), s.max);
  assert.equal(SKILLS.reduce((t, k) => t + s.bySkill[k].score, 0), s.total);
  const empty = summarize(cases.map((items) => ({ items, responses: {} })));
  assert.equal(empty.total, 0);
  assert.ok(scoreCase(cases[0], {}).every((r) => r.status === 'unanswered'));
  // every skill is exercised in the sweep
  for (const k of SKILLS) assert.ok(s.bySkill[k].n > 0, `${k} is asked`);
});

test('feedback exists for every item and status, opens on physiology, and flags unchecked rules', () => {
  let flagged = 0;
  for (const d of sweep(3)) {
    const { prep, items } = build(d);
    for (const it of items) {
      const wrong = it.type === 'multi' ? [it.options[0].id] : it.options.find((o) => o.id !== it.key.correct).id;
      for (const resp of [undefined, wrong, it.key.correct]) {
        const html = feedbackHtml(it, prep, scoreItem(it, resp));
        assert.match(html, /class="feedback"/);
        assert.ok(html.length > 150, `${it.id} has an explanation`);
        assert.doesNotMatch(html, /undefined|NaN|\[object/);
        if (/have not been checked|has not been checked|not yet checked/.test(html)) flagged++;
      }
    }
  }
  assert.ok(flagged > 20);
});

test('explanations contain no treatment advice', () => {
  const words = /\b(prescribe|start (a|an|the)|initiate|increase the dose|should be treated|treatment with|inhaler therapy)\b/i;
  for (const d of sweep(3)) {
    const { prep, items } = build(d);
    for (const it of items) assert.doesNotMatch(feedbackHtml(it, prep, scoreItem(it, it.key.correct)), words);
  }
});
