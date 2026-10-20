import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAdapters } from '../src/quiz/adapters.js';
import { ARCHETYPES } from '../src/core/descriptor.js';
import { scoreItem } from '../src/quiz/scoring.js';
import { createStream } from '../src/core/prng.js';
import { build, makeCtx } from './quiz-helpers.mjs';

// Test-taking strategies that use the form of an option and not its content. Each must stay within 10 points of what random choice earns.
const adapters = await loadAdapters();
const LEVELS = ['light', 'moderate', 'heavy'];
const N = Number(process.env.QUIZ_SIM_CASES ?? 500);

const HEDGE = /\b(can|may|might|could|often|usually|commonly|possible|possibly|likely|tends?)\b/gi;
const ABSOLUTE = /\b(always|never|entirely|only|any|all|every|cannot|must|invalid|invalidates|unreliable)\b/gi;
const count = (re, t) => (t.match(re) ?? []).length;

function simulate(n = N) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const d = { seed: 20000 + i * 31, archetype: ARCHETYPES[i % ARCHETYPES.length], severity: 1 + (i % 3), technique: ['good', 'fair', 'poor'][i % 3], panel: i % 6 === 5 ? 'spirometry' : 'full', scenarioLevel: LEVELS[i % 3] };
    const { items } = build(d, { adapters });
    rows.push({ d, final: items.find((x) => x.id === 'final'), lim: items.find((x) => x.id === 'limitations') });
  }
  return rows;
}
const rows = simulate();

test('the simulation uses the real narrative and scenario modules', () => {
  assert.ok(adapters.composeNarrative && adapters.scenarios);
  assert.ok(rows.every((r) => r.final.explain.source === 'narrative'));
  assert.ok(rows.some((r) => r.d.scenarioLevel === 'heavy'));
});

test('final interpretation: the longest and the most hedged option are not right more often than chance', () => {
  let longest = 0, hedged = 0, absolute = 0, shortest = 0, n = 0;
  const pickBy = (opts, score, sign) => {
    const best = Math.max(...opts.map((o) => sign * score(o)));
    const tied = opts.filter((o) => sign * score(o) === best);
    return tied; // credit is split over ties, as a guess among them would earn
  };
  for (const { final } of rows) {
    const opts = final.explain.options;
    const credit = (tied) => (tied.some((o) => o.truth) ? 1 / tied.length : 0);
    longest += credit(pickBy(opts, (o) => o.text.length, 1));
    shortest += credit(pickBy(opts, (o) => o.text.length, -1));
    hedged += credit(pickBy(opts, (o) => count(HEDGE, o.text), 1));
    absolute += credit(pickBy(opts, (o) => count(ABSOLUTE, o.text), 1));
    n++;
  }
  // "The one that is neither the longest nor the shortest": two options remain, so chance is one half.
  let middle = 0;
  for (const { final } of rows) {
    const lens = final.explain.options.map((o) => o.text.length);
    const lo = Math.min(...lens), hi = Math.max(...lens);
    const mids = final.explain.options.filter((o) => o.text.length !== lo && o.text.length !== hi);
    middle += mids.length ? (mids.some((o) => o.truth) ? 1 / mids.length : 0) : 0.25;
  }
  assert.ok(middle / n <= 0.5 + 0.10, `middle-length strategy is right ${(100 * middle / n).toFixed(1)}% of the time`);
  const chance = 0.25;
  for (const [name, hits] of Object.entries({ longest, shortest, hedged, absolute })) {
    assert.ok(hits / n <= chance + 0.10, `${name}-option strategy is right ${(100 * hits / n).toFixed(1)}% of the time over ${n} cases`);
  }
});

test('final interpretation: the phrases that used to mark a flawed statement are no more common in wrong options than in the right one', () => {
  const tells = [/unchanged by the choice of reference equation/, /accepted at face value/, /the criterion this laboratory applies/, /The diagnosis is/, /no other criterion is applied/, /is therefore (?:normal|reduced)/];
  for (const re of tells) {
    for (const { final } of rows) for (const o of final.explain.options) assert.doesNotMatch(o.text, re, `${re} appears in a final-interpretation option`);
  }
  // The percent-predicted convention and the equation sentence appear in correct statements as well as in distractors.
  const has = (re) => rows.reduce((acc, { final }) => { for (const o of final.explain.options) if (re.test(o.text)) acc[o.truth ? 'right' : 'wrong']++; return acc; }, { right: 0, wrong: 0 });
  const pct = has(/conventional 80% threshold/);
  assert.ok(pct.right > 0 && pct.wrong > 0, `80% convention: ${JSON.stringify(pct)}`);
  const same = has(/the same(?: way)? under both reference equations/);
  assert.ok(same.right > 0 && same.wrong > 0, `equation sentence: ${JSON.stringify(same)}`);
});

test('final interpretation: option lengths within a case stay close, and scenario limitations are not quoted', () => {
  let spread = 0;
  for (const { final, d } of rows) {
    const lens = final.explain.options.map((o) => o.text.length);
    spread += (Math.max(...lens) - Math.min(...lens)) / (lens.reduce((a, b) => a + b, 0) / lens.length);
    // A limitation shown in the limitations item never reappears word for word in a final option.
    assert.equal(final.options.length, 4, `${d.archetype}`);
  }
  assert.ok(spread / rows.length < 0.45, `mean relative length range ${(spread / rows.length).toFixed(2)}`);
  for (const { final, lim } of rows) {
    const limTexts = lim.explain.options.filter((o) => o.id !== 'none').map((o) => o.text);
    for (const o of final.explain.options) for (const t of limTexts) assert.ok(!o.text.includes(t), 'a limitations option is quoted in a final option');
  }
});

test('limitations: choose-all and longest-option strategies do not beat random selection by 10 points', () => {
  let all = 0, allSubstantive = 0, longest = 0, randomSingle = 0, randomHalf = 0, n = 0;
  const rng = createStream(77, 'quiz-lexical-sim');
  for (const { lim } of rows) {
    const ids = lim.options.map((o) => o.id);
    const substantive = ids.filter((id) => id !== 'none');
    all += scoreItem(lim, ids).score;
    allSubstantive += scoreItem(lim, substantive).score;
    const sorted = lim.options.filter((o) => o.id !== 'none').slice().sort((a, b) => b.label.length - a.label.length);
    longest += scoreItem(lim, [sorted[0].id]).score;
    randomSingle += scoreItem(lim, [ids[rng.int(0, ids.length - 1)]]).score;
    for (let k = 0; k < 5; k++) { const sel = ids.filter(() => rng.uniform() < 0.5); if (sel.length) randomHalf += scoreItem(lim, sel).score / 5; }
    n++;
  }
  assert.equal(all, 0, 'selecting every option scores exactly 0');
  assert.ok(allSubstantive / n <= randomHalf / n + 0.10, `all substantive options ${(allSubstantive / n).toFixed(3)} vs random subsets ${(randomHalf / n).toFixed(3)}`);
  assert.ok(longest / n <= randomSingle / n + 0.10, `longest option ${(longest / n).toFixed(3)} vs one random option ${(randomSingle / n).toFixed(3)}`);
});

test('limitations: true and irrelevant statements share length and hedging, and distractors are general truths tied to absent case facts', () => {
  const stat = { true: { len: 0, hedge: 0, abs: 0, n: 0 }, decoy: { len: 0, hedge: 0, abs: 0, n: 0 } };
  for (const { lim } of rows) {
    for (const o of lim.explain.options) {
      if (o.id === 'none') continue;
      const g = stat[o.truth ? 'true' : 'decoy'];
      g.len += o.text.length; g.hedge += count(HEDGE, o.text) > 0 ? 1 : 0; g.abs += count(ABSOLUTE, o.text) > 0 ? 1 : 0; g.n++;
      if (!o.truth) assert.ok(o.why, 'a distractor explains which case fact makes it irrelevant');
    }
  }
  const mean = (g) => ({ len: g.len / g.n, hedge: g.hedge / g.n, abs: g.abs / g.n });
  const t = mean(stat.true), w = mean(stat.decoy);
  assert.ok(Math.abs(t.len - w.len) / t.len < 0.2, `mean length ${t.len.toFixed(0)} vs ${w.len.toFixed(0)}`);
  assert.ok(Math.abs(t.hedge - w.hedge) < 0.2, `hedged share ${t.hedge.toFixed(2)} vs ${w.hedge.toFixed(2)}`);
  assert.ok(t.abs > 0 && w.abs > 0, 'absolute wording occurs in both groups');
  assert.ok(t.hedge > 0 && w.hedge > 0, 'hedged wording occurs in both groups');
});
