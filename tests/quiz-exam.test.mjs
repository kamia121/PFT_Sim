import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHETYPES } from '../src/core/descriptor.js';
import { encodeExam, decodeExam, encodeResults, decodeResults, SKILLS } from '../src/quiz/codes.js';
import { buildExamCases, lettered, orderSeedFor } from '../src/quiz/exam.js';
import { NO_ADAPTERS } from '../src/quiz/adapters.js';
import { renderChart, groupDisplay, smokingStatus, scopeIds } from '../src/quiz/chart.js';
import { publicItem, displayOptions } from '../src/quiz/items.js';
import { summarize, scoreItem } from '../src/quiz/scoring.js';
import { csvCell, toCsv, learnerCsv, keyCsv, classSummary, classCsv } from '../src/quiz/export.js';
import { studentSheetHtml, keySheetHtml, resultSheetHtml } from '../src/quiz/print.js';
import { makeCtx } from './quiz-helpers.mjs';

const def = { n: 6, seed: 2024, archetypes: ARCHETYPES, scenario: 'light', technique: [60, 30, 10], panel: [80, 20], timeLimit: 30, shuffleSeed: 555, equation: 'GLIglobal', skills: SKILLS };
const code = encodeExam(def);
const build = () => buildExamCases(decodeExam(code), makeCtx({ equation: def.equation }));
const cases = build();

test('everyone with the code gets the same cases, items and charts', () => {
  const again = build();
  assert.equal(JSON.stringify(cases.map((c) => c.items)), JSON.stringify(again.map((c) => c.items)));
  assert.equal(cases.map((c, i) => renderChart(c.prep, { adapters: NO_ADAPTERS, index: i })).join(), again.map((c, i) => renderChart(c.prep, { adapters: NO_ADAPTERS, index: i })).join());
  assert.equal(cases.length, def.n);
});

test('option order differs between learner seeds and is fixed for a seed; the printed sheet uses the shuffle seed alone', () => {
  const lim = cases[0].items.find((i) => i.id === 'limitations');
  const order = (learner) => displayOptions(lim, orderSeedFor(def, learner), 0).map((o) => o.id).join();
  assert.equal(order(11), order(11));
  assert.notEqual(order(11), order(12));
  assert.equal(orderSeedFor(def, 0), def.shuffleSeed);
  const letters = lettered(lim, def, 0);
  assert.equal(letters[0].letter, 'A');
  assert.deepEqual(letters.map((o) => o.id), displayOptions(lim, def.shuffleSeed, 0).map((o) => o.id));
  // Across the exam, positions of the correct option are not constant
  const positions = new Set();
  for (let learner = 1; learner <= 30; learner++) positions.add(displayOptions(cases[0].items.find((i) => i.id === 'final'), orderSeedFor(def, learner), 0).findIndex((o) => o.id === cases[0].items.find((i) => i.id === 'final').key.correct));
  assert.ok(positions.size >= 3);
});

test('the chart shows what a laboratory chart shows', () => {
  for (const [i, c] of cases.entries()) {
    const html = renderChart(c.prep, { adapters: NO_ADAPTERS, index: i });
    const text = html.replace(/<[^>]+>/g, ' ');
    for (const s of ['Age', 'Sex used for the reference', 'Height used', 'Weight', 'BMI', 'Group on requisition', 'Smoking', 'Reference equation for each index', 'Intake and technologist notes', 'Pre-bronchodilator forced maneuvers', 'Reported spirometry', 'GLI Global 2022']) assert.ok(text.includes(s), `case ${i + 1} shows ${s}`);
    assert.equal(html.includes('Lung volumes'), Boolean(c.prep.caseData.volumes));
    assert.equal(html.includes('Single-breath diffusing capacity'), Boolean(c.prep.caseData.dlco));
    assert.equal(html.includes('After bronchodilator'), Boolean(c.prep.caseData.spirometry.post));
    assert.ok(html.includes('<svg'), 'at least the legacy figures are drawn while the registry holds placeholders');
    assert.doesNotMatch(html, /restriction-|bd-discordant|low-dlco|obesity-low-erv|ground truth|archetype/i, 'the chart never names the archetype');
  }
});

test('requisition group wording varies for the other-or-mixed set only; smoking status is context drawn from the seed', () => {
  assert.equal(groupDisplay('White', 3), 'White');
  const seen = new Set(Array.from({ length: 40 }, (_, s) => groupDisplay('Other or mixed', s)));
  assert.ok(seen.size >= 2 && [...seen].every((x) => /^Other|^Not recorded/.test(x)));
  const smoke = new Set(Array.from({ length: 60 }, (_, s) => smokingStatus(55, s).split(',')[0]));
  assert.deepEqual([...smoke].sort(), ['Current smoker', 'Former smoker', 'Never smoker']);
  assert.equal(smokingStatus(55, 9), smokingStatus(55, 9));
  assert.match(smokingStatus(55, 1, 3).concat(smokingStatus(55, 2, 3), smokingStatus(55, 3, 3), smokingStatus(55, 4, 3), smokingStatus(55, 5, 3), smokingStatus(55, 6, 3), smokingStatus(55, 7, 3), smokingStatus(55, 8, 3)), /last smoked 3 h before the test|Never|Former/);
});

test('element ids are scoped so several cases can share a page', () => {
  const a = renderChart(cases[0].prep, { adapters: NO_ADAPTERS, index: 0 });
  const b = renderChart(cases[1].prep, { adapters: NO_ADAPTERS, index: 1 });
  const ids = (h) => [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set([...ids(a), ...ids(b)]).size, ids(a).length + ids(b).length);
  assert.equal(scopeIds('<svg id="g"><path fill="url(#g)"/><use href="#g"/></svg><h2 id="h"></h2><section aria-labelledby="h">', 'x-'), '<svg id="x-g"><path fill="url(#x-g)"/><use href="#x-g"/></svg><h2 id="x-h"></h2><section aria-labelledby="x-h">');
});

test('the exam presentation holds no key: public items and the chart can be built without any key field', () => {
  const pub = cases.map((c) => c.items.map(publicItem));
  const json = JSON.stringify(pub);
  assert.doesNotMatch(json, /"key"|"correct"|"truth"|"flaw"/);
  const html = cases.map((c, i) => renderChart(c.prep, { adapters: NO_ADAPTERS, index: i })).join('');
  assert.doesNotMatch(html, /Key:|class="feedback"|Differs from the key/);
  // the maneuver table hides acceptability until feedback
  assert.doesNotMatch(html, /<th class="l">FEV₁<\/th><th class="l">FVC<\/th>/);
});

function respond(kind) {
  return cases.map((c) => Object.fromEntries(c.items.map((it) => {
    if (kind === 'perfect') return [it.id, it.key.correct];
    if (kind === 'wrong') return [it.id, it.type === 'multi' ? [it.options.find((o) => !it.key.correct.includes(o.id)).id] : it.options.find((o) => o.id !== it.key.correct && o.id !== it.key.alt).id];
    return [it.id, it.type === 'multi' ? [] : undefined];
  })));
}

test('results code round trip scores identically to the learner', () => {
  const responses = respond('perfect');
  const rc = encodeResults({ exam: code, learnerSeed: 77, name: 'A', elapsed: 600, responses });
  const back = decodeResults(rc);
  assert.equal(back.exam, code);
  const s = summarize(cases.map((c, i) => ({ items: c.items, responses: back.responses[i] })));
  assert.equal(s.total, s.max);
  assert.ok(rc.length < 6000, `results code length ${rc.length}`);
});

test('class summary: per-skill, per-case and common wrong answers', () => {
  const mk = (name, kind) => ({ exam: code, learnerSeed: 1, name, elapsed: 10, responses: respond(kind) });
  const s = classSummary(cases, [mk('p', 'perfect'), mk('w1', 'wrong'), mk('w2', 'wrong')]);
  assert.equal(s.n, 3);
  assert.ok(Math.abs(s.learners[0].pct - 100) < 1e-9);
  assert.ok(s.learners[1].pct < 20);
  assert.ok(s.meanPct > 30 && s.meanPct < 45, `mean ${s.meanPct}`);
  for (const k of SKILLS) if (s.perSkill[k] !== null) assert.ok(s.perSkill[k] > 0.25 && s.perSkill[k] < 0.75, `${k} ${s.perSkill[k]}`);
  assert.equal(s.perCase.length, def.n);
  assert.ok(s.commonWrong.length > 5 && s.commonWrong[0].count === 2, 'both wrong learners gave the same wrong answers');
  assert.ok(s.perItem.every((x) => x.answered === 3));
  const csv = classCsv(cases, s);
  assert.match(csv, /^learner,learner seed,total,max,percent,seconds/);
  assert.match(csv, /most common wrong answers/);
  assert.equal(classSummary(cases, []).n, 0);
});

test('CSV: quoting and spreadsheet formula neutralization', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('-3'), "'-3");
  assert.equal(csvCell(null), '');
  assert.equal(toCsv([['a', 1], ['b', 'c\nd']]), 'a,1\r\nb,"c\nd"\r\n');
  const lc = learnerCsv(cases, respond('perfect'));
  const rows = lc.trim().split('\r\n');
  assert.equal(rows[0], 'case,item,skill,response,key,score,max,status');
  assert.equal(rows.length - 1, cases.reduce((t, c) => t + c.items.length, 0));
  assert.ok(rows.slice(1).every((r) => r.endsWith(',1,1,correct')));
  const kc = keyCsv(def, cases);
  assert.match(kc, /^case,archetype,technique,panel,item,skill,key letters,key/);
  // key letters in the CSV match the letters on the printed question sheet
  const first = cases[0].items[0];
  const letter = lettered(first, def, 0).find((o) => o.id === first.key.correct).letter;
  assert.match(kc.split('\r\n')[1], new RegExp(`,${letter},`));
});

test('printable sheets: the student sheet has no key; the key sheet and the result sheet do', () => {
  const student = studentSheetHtml(def, code, cases, NO_ADAPTERS);
  assert.match(student, /Case 6 of 6/);
  assert.match(student, /Name:/);
  assert.doesNotMatch(student, /answer key|Archetype|ground truth/i);
  for (const c of cases) assert.ok(student.includes(c.items[0].stem));
  const key = keySheetHtml(def, code, cases);
  assert.match(key, /answer key/i);
  assert.equal((key.match(/<table/g) ?? []).length, def.n);
  for (const c of cases) assert.ok(key.includes(`Archetype ${c.descriptor.archetype}`));
  const responses = respond('perfect');
  const summary = summarize(cases.map((c, i) => ({ items: c.items, responses: responses[i] })));
  const res = resultSheetHtml(def, code, cases, summary, { name: 'Q <b>', learnerSeed: 1, elapsed: 125 });
  assert.match(res, /Rubric by skill/);
  assert.match(res, /Q &lt;b&gt;/);
  assert.match(res, /2 min 5 s/);
});

test('a missing response scores zero without error', () => {
  assert.equal(scoreItem(cases[0].items[0], undefined).score, 0);
});
