/**
 * The row items (acceptability per maneuver, representative loop per set, bronchodilator pair) through the real modules:
 * buildChallenges -> the form markup -> the collector -> the scorer, with no stand-ins. The controls are read back out of the markup
 * as a browser would submit them, so a row that the page cannot render, or a field name the collector cannot read, fails here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ds, resolveReference } from './report-helpers.mjs';
import { buildCase } from '../src/core/case.js';
import { interpret } from '../src/interpret/interpret.js';
import { buildChallenges, scoreChallenge } from '../src/challenges/index.js';
import { buildRtReport } from '../src/core/rt-report.js';
import { itemFieldsetHtml, interpretationBoxHtml } from '../src/app/practice-view.js';
import { emptyResponses, applyChange, collectEntries, answerFor, challengeRowField } from '../src/app/collect.js';
import { scoreAll } from '../src/app/feedback.js';

const INPUT = { seed: 8, archetype: 'bd-discordant', technique: 'poor' };

function build(input = INPUT) {
  const caseData = buildCase(input, ds);
  const interp = interpret(caseData.report, resolveReference, 'GLIglobal');
  const interpOther = interpret(caseData.report, resolveReference, 'GLI2012');
  const rt = buildRtReport(caseData);
  const items = buildChallenges(caseData, { rt, interp, interpOther, qualityChallenge: true });
  return { caseData, interp, interpOther, rt, items };
}

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** The radio inputs of a rendered item: { name, value, checked, disabled }. */
function inputsOf(html) {
  return [...html.matchAll(/<input type="radio" name="([^"]*)" value="([^"]*)" ([^>]*)>/g)].map((m) => ({ name: decode(m[1]), value: decode(m[2]), checked: /\bchecked\b/.test(m[3]), disabled: /\bdisabled\b/.test(m[3]) }));
}

const rowItems = (items) => items.filter((i) => Array.isArray(i.rows));

test('every row of every row item has its own labelled radio group offering the item\'s options or the row\'s own list', () => {
  const { items } = build();
  const rows = rowItems(items);
  assert.deepEqual(rows.map((i) => i.id).sort(), ['acceptableManeuversPost', 'acceptableManeuversPre', 'bdInterpretable', 'representativeLoopOk']);
  for (const item of rows) {
    const html = itemFieldsetHtml(item, emptyResponses(), false);
    const inputs = inputsOf(html);
    for (const row of item.rows) {
      const name = challengeRowField(item.id, row.id);
      const options = (item.rowOptions?.[row.id] ?? item.options).map(([v]) => v);
      assert.deepEqual(inputs.filter((x) => x.name === name).map((x) => x.value), options, `${item.id} ${row.id}`);
      assert.ok(html.includes(`<legend>${row.label}</legend>`) || html.includes(`<legend>${row.label.replace(/&/g, '&amp;')}</legend>`), `legend of ${row.id}`);
    }
    assert.equal(new Set(inputs.map((x) => x.name)).size, item.rows.length, `${item.id}: one group per row`);
    assert.ok(!inputs.some((x) => x.checked), 'nothing is preselected');
  }
});

test('the markup of a row item carries no key and no explanation', () => {
  const { items } = build();
  for (const item of rowItems(items)) {
    const html = itemFieldsetHtml(item, emptyResponses(), false);
    assert.ok(!html.includes(item.why), 'explanation in the markup');
    assert.doesNotMatch(html, /\bkey\b|data-key|data-correct/i);
  }
});

test('answering every row through its field name reaches the scorer: a fully correct map earns full credit', () => {
  const { items } = build();
  for (const item of rowItems(items)) {
    let r = emptyResponses();
    for (const row of item.rows) r = applyChange(r, { name: challengeRowField(item.id, row.id), value: item.key[row.id] });
    const answer = answerFor(item, r);
    assert.deepEqual(answer, item.key, `${item.id}: the collector builds the key's map`);
    const res = scoreChallenge(item, answer);
    assert.equal(res.status, 'correct', item.id);
    assert.equal(res.perItem.fraction, 1);
    assert.deepEqual(res.perItem.wrong, []);
  }
});

test('one wrong row is the only row identified; untouched rows stay unanswered and count as wrong', () => {
  const { items } = build();
  const item = items.find((i) => i.id === 'acceptableManeuversPre');
  const target = item.rows[3];
  const wrong = item.options.map(([v]) => v).find((v) => v !== item.key[target.id]);
  let r = emptyResponses();
  for (const row of item.rows) r = applyChange(r, { name: challengeRowField(item.id, row.id), value: row.id === target.id ? wrong : item.key[row.id] });
  const res = scoreChallenge(item, answerFor(item, r));
  assert.equal(res.status, 'wrong');
  assert.deepEqual(res.perItem.wrong, [target.id]);
  assert.equal(res.perItem.correct, item.rows.length - 1);
  // Only two rows touched: the other ten are unanswered and wrong.
  let few = emptyResponses();
  for (const row of item.rows.slice(0, 2)) few = applyChange(few, { name: challengeRowField(item.id, row.id), value: item.key[row.id] });
  const res2 = scoreChallenge(item, answerFor(item, few));
  assert.equal(res2.perItem.correct, 2);
  assert.equal(res2.perItem.wrong.length, item.rows.length - 2);
  assert.equal(scoreChallenge(item, answerFor(item, emptyResponses())).status, 'unanswered');
});

test('changing one row keeps the other rows of the item, and other items are untouched', () => {
  const { items } = build();
  const [a, b] = rowItems(items);
  let r = applyChange(emptyResponses(), { name: challengeRowField(a.id, a.rows[0].id), value: a.options[0][0] });
  r = applyChange(r, { name: challengeRowField(a.id, a.rows[1].id), value: a.options[1][0] });
  r = applyChange(r, { name: challengeRowField(b.id, b.rows[0].id), value: b.options[0][0] });
  r = applyChange(r, { name: challengeRowField(a.id, a.rows[0].id), value: a.options[1][0] });
  assert.deepEqual(r.challenge[a.id], { [a.rows[0].id]: a.options[1][0], [a.rows[1].id]: a.options[1][0] });
  assert.deepEqual(r.challenge[b.id], { [b.rows[0].id]: b.options[0][0] });
});

test('submitted entries with row names are collected into the same map as one-at-a-time changes', () => {
  const { items } = build();
  const item = items.find((i) => i.id === 'bdInterpretable');
  const entries = item.rows.map((row) => [challengeRowField(item.id, row.id), item.key[row.id]]);
  assert.deepEqual(collectEntries(entries).challenge[item.id], item.key);
});

test('the rendered answers survive the lock of the quality items: the map is kept, the controls are disabled', () => {
  const { items } = build();
  const item = items.find((i) => i.id === 'acceptableManeuversPost');
  let r = emptyResponses();
  for (const row of item.rows) r = applyChange(r, { name: challengeRowField(item.id, row.id), value: item.key[row.id] });
  const open = inputsOf(itemFieldsetHtml(item, r, false));
  const locked = inputsOf(itemFieldsetHtml(item, r, true));
  assert.equal(open.filter((x) => x.checked).length, item.rows.length, 'one checked option per row');
  assert.deepEqual(locked.map(({ name, value, checked }) => ({ name, value, checked })), open.map(({ name, value, checked }) => ({ name, value, checked })));
  assert.ok(locked.every((x) => x.disabled) && open.every((x) => !x.disabled));
  assert.deepEqual(answerFor(item, r), item.key, 'the stored map is untouched by the lock');
});

test('scoreAll over the real items: a fully answered form scores every row item as correct and names its rows in words', () => {
  const { caseData, interp, interpOther, items } = build();
  let r = emptyResponses();
  for (const item of rowItems(items)) for (const row of item.rows) r = applyChange(r, { name: challengeRowField(item.id, row.id), value: item.key[row.id] });
  const { rows } = scoreAll({ caseData, interp, interpOther, equation: 'GLIglobal', responses: r, items, scoreChallenge });
  for (const item of rowItems(items)) {
    const row = rows.find((x) => x.id === item.id);
    assert.equal(row.status, 'correct', item.id);
    assert.doesNotMatch(row.answer, /no answer/);
  }
});

test('the whole interpretation box renders the row items inside the form, so the page can collect them', () => {
  const { caseData, rt, items } = build();
  const vis = { showQualityLines: false, showGradeColumns: false, showStatementInSummary: false };
  const html = interpretationBoxHtml({ caseData, responses: emptyResponses(), items, stage: 1, qualityChallenge: true, vis, canCheck: false });
  const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'));
  for (const item of rowItems(items).filter((i) => i.stage !== 2)) for (const row of item.rows) assert.ok(form.includes(`name="${challengeRowField(item.id, row.id)}"`), `${item.id} ${row.id} in the form`);
  assert.ok(rt);
});
