import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreItem, scoreCase, summarize } from '../src/quiz/scoring.js';
import { SKILLS } from '../src/quiz/codes.js';
import { feedbackHtml } from '../src/quiz/explain.js';
import { build, sweep } from './quiz-helpers.mjs';

const single = (id, correct, alt = null) => ({ id, skill: 'pattern', type: 'single', key: { correct, alt }, options: [] });
const multi = (correct, weights, wrong) => ({ id: 'limitations', skill: 'limitations', type: 'multi', key: { correct, weights, wrong }, options: [...correct, ...wrong].map((id) => ({ id, label: id })) });

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

test('limitations: weighted share of applicable statements selected minus the share of non-applicable ones selected', () => {
  const it = multi(['o1', 'o2'], { o1: 2, o2: 1 }, ['o3', 'o4', 'o5', 'o6']);
  assert.equal(scoreItem(it, ['o1', 'o2']).score, 1);
  const r = scoreItem(it, ['o1']);
  assert.equal(r.detail.falseRate, 0);
  assert.ok(Math.abs(r.detail.recall - 2 / 3) < 1e-9);
  assert.ok(Math.abs(r.score - 2 / 3) < 1e-3);
  assert.deepEqual(r.detail.missed, ['o2']);
  assert.ok(Math.abs(scoreItem(it, ['o2']).score - 1 / 3) < 1e-3);
  // one false selection out of four costs a quarter
  const x = scoreItem(it, ['o1', 'o2', 'o3']);
  assert.equal(x.detail.falseRate, 0.25);
  assert.ok(Math.abs(x.score - 0.75) < 1e-3);
  assert.deepEqual(x.detail.extra, ['o3']);
  assert.deepEqual([scoreItem(it, ['o3']).score, scoreItem(it, ['o3']).status], [0, 'incorrect']);
  assert.equal(scoreItem(it, []).status, 'unanswered');
  assert.equal(scoreItem(it, ['o1', 'o1', 'o2']).score, 1, 'a repeated id counts once');
});

test('limitations: selecting every option scores 0 and random selection is not rewarded', () => {
  const it = multi(['o1', 'o2', 'o3'], { o1: 2, o2: 1, o3: 1 }, ['o4', 'o5', 'o6', 'o7', 'o8']);
  assert.equal(scoreItem(it, [...it.options.map((o) => o.id)]).score, 0);
  // The unclipped expectation of a random subset is 0: recall minus false-positive rate has the same mean for any inclusion probability.
  let seed = 12345;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  for (const p of [0.2, 0.5, 0.8]) {
    let sum = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const sel = it.options.map((o) => o.id).filter(() => rnd() < p);
      if (!sel.length) continue;
      const t = new Set(it.key.correct);
      const w = it.key.weights;
      const rec = sel.filter((s) => t.has(s)).reduce((a, s) => a + w[s], 0) / 4;
      const fp = sel.filter((s) => !t.has(s)).length / 5;
      sum += rec - fp;
    }
    assert.ok(Math.abs(sum / N) < 0.05, `p=${p}: mean ${sum / N}`);
  }
});

test('"none of these" is correct only when the key is none', () => {
  const none = multi(['none'], { none: 1 }, ['o1', 'o2', 'o3']);
  assert.equal(scoreItem(none, ['none']).score, 1);
  assert.ok(Math.abs(scoreItem(none, ['none', 'o1']).score - 2 / 3) < 1e-3);
  assert.equal(scoreItem(none, ['o1']).score, 0);
  assert.equal(scoreItem(none, ['none', 'o1', 'o2', 'o3']).score, 0);
  const some = multi(['o1'], { o1: 1 }, ['none', 'o2']);
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

test('feedback exists for every item and status and uses source-specific verification rather than obsolete disclaimers', () => {
  let sourced = 0;
  for (const d of sweep(3)) {
    const { prep, items } = build(d);
    for (const it of items) {
      const wrong = it.type === 'multi' ? [it.options[0].id] : it.options.find((o) => o.id !== it.key.correct).id;
      for (const resp of [undefined, wrong, it.key.correct]) {
        const html = feedbackHtml(it, prep, scoreItem(it, resp));
        assert.match(html, /class="feedback"/);
        assert.ok(html.length > 150, `${it.id} has an explanation`);
        assert.doesNotMatch(html, /undefined|NaN|\[object/);
        assert.doesNotMatch(html, /Cotes formula, which this tool has not yet checked/);
        if (/2017|2022|2024/.test(html)) sourced++;
      }
    }
  }
  assert.ok(sourced > 0);
});

test('explanations contain no treatment advice', () => {
  const words = /\b(prescribe|start (a|an|the)|initiate|increase the dose|should be treated|treatment with|inhaler therapy)\b/i;
  for (const d of sweep(3)) {
    const { prep, items } = build(d);
    for (const it of items) assert.doesNotMatch(feedbackHtml(it, prep, scoreItem(it, it.key.correct)), words);
  }
});
