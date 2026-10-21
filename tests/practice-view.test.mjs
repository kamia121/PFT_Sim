import test from 'node:test';
import assert from 'node:assert/strict';
import { ds, resolveReference } from './report-helpers.mjs';
import { buildCase } from '../src/core/case.js';
import { interpret, compareEquations } from '../src/interpret/interpret.js';
import { buildReportModel } from '../src/report/model.js';
import { PALETTES } from '../src/ui/palettes.js';
import { renderPractice, injectInterpretation, interpretationBoxHtml, SUMMARY_MISSING, DETAILS_MISSING } from '../src/app/practice-view.js';
import { buildFeedback, scoreAll, qualityFeedback, detailsLine, addToTally } from '../src/app/feedback.js';
import { emptyResponses, applyChange, challengeField } from '../src/app/collect.js';
import { createStage, showStatement, check, fallbackVisibility } from '../src/app/stage.js';
import * as stub from './helpers/practice-stub.mjs';

const CASES = {
  easy: { seed: 5, archetype: 'normal', technique: 'good' },
  obstruction: { seed: 12, archetype: 'obstruction', technique: 'fair' },
  poor: { seed: 8, archetype: 'bd-discordant', technique: 'poor' },
};
const STUB_SHEETS = { summarySheetHtml: stub.summarySheetHtml, detailsSheetHtml: stub.detailsSheetHtml };
const NO_SHEETS = { summarySheetHtml: null, detailsSheetHtml: null };

/** The context main.js builds, for a case and a stage state, with the stand-in modules. */
function makeCtx(input, { qualityChallenge = false, stage = 1, detailsOpen = false, sheets = STUB_SHEETS, responses = emptyResponses(), detailsOpened = false } = {}) {
  const caseData = buildCase(input, ds);
  const equation = 'GLIglobal';
  const interp = interpret(caseData.report, resolveReference, equation);
  const interpOther = interpret(caseData.report, resolveReference, 'GLI2012');
  const cmp = compareEquations(caseData.report, resolveReference, 'GLI2012', 'GLIglobal');
  const rt = stub.buildRtReport(caseData);
  const items = stub.buildChallenges(caseData, { rt, interp, qualityChallenge });
  let st = createStage({ qualityChallenge });
  if (stage >= 2) st = showStatement(st);
  if (detailsOpened) st = { ...st, detailsOpened: true };
  if (stage === 3) st = check(st, { scored: true });
  const vis = stub.visibility({ qualityChallenge, stage: st.stage });
  const model = buildReportModel(caseData, interp, { equation, includeGrades: vis.showGradeColumns, resolve: resolveReference, palette: PALETTES.white });
  const feedback = st.stage === 3 ? buildFeedback({ caseData, interp, interpOther, equation, responses, items, scoreChallenge: stub.scoreChallenge, rt, detailsOpened: st.detailsOpened }) : null;
  return { caseData, interp, interpOther, cmp, equation, flags: 'lln', qualityChallenge, stage: st.stage, scored: st.scored, detailsOpen, vis, canCheck: st.stage !== 3 && (!qualityChallenge || st.stage === 2), rt, items, responses, model, sheets, palette: PALETTES.white, figView: {}, showSchematic: false, resolve: resolveReference, feedback, rtReport: rt };
}

const textOf = (html) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

/** Markers that must not be in the page source until the stage that releases them. */
function assertNoQualityLeak(html, ctx, where) {
  for (const line of ctx.rt.qualityLines) assert.ok(!html.includes(line), `${where}: quality statement line is in the page source`);
  assert.doesNotMatch(html, /WHY:|NOTE:|TRUTH:/, `${where}: key, explanation or truth text in the page source`);
  assert.doesNotMatch(html, /FEV(?:1|₁) - [A-FU]\b/, `${where}: a grade statement in the page source`);
  assert.doesNotMatch(html, /Grade [A-FU] requires/, `${where}: grade criteria in the page source`);
  assert.doesNotMatch(html, />\s*(?:not )?acceptable\s*<|>\s*(?:not )?usable\s*</, `${where}: an acceptability cell in the page source`);
  assert.doesNotMatch(html, /data-key|data-why|data-truth/, `${where}: key attribute in the page source`);
  assert.ok(!html.includes('#6A7572'), `${where}: a maneuver drawn as rejected`);
}

for (const [name, input] of Object.entries(CASES)) {
  for (const [sheetsName, sheets] of [['stub sheets', STUB_SHEETS], ['card view', NO_SHEETS]]) {
    test(`page source, quality challenge on, stage 1, ${name}, ${sheetsName}: no grade, acceptability or quality statement`, () => {
      const ctx = makeCtx(input, { qualityChallenge: true, stage: 1, detailsOpen: true, sheets });
      const html = renderPractice(ctx);
      assertNoQualityLeak(html, ctx, name);
      assert.match(html, /id="show-statement"/);
      assert.match(html, /id="check-answers" disabled/, 'a scored check is not offered before the statement');
      assert.match(html, /Page 2: detailed report/);
      assert.ok(html.includes('id="sheet-interpretation"') || sheets === NO_SHEETS);
    });

    test(`page source, quality challenge on, stage 2, ${name}, ${sheetsName}: the statement, still no grades`, () => {
      const ctx = makeCtx(input, { qualityChallenge: true, stage: 2, detailsOpen: true, sheets });
      const html = renderPractice(ctx);
      const statementShown = ctx.rt.qualityLines.every((l) => html.includes(l));
      assert.ok(statementShown, 'statement lines are shown at stage 2');
      assert.doesNotMatch(html, /WHY:|NOTE:|TRUTH:|Grade [A-FU] requires/);
      assert.doesNotMatch(html, />\s*(?:not )?acceptable\s*<|>\s*(?:not )?usable\s*</);
      assert.match(html, /data-item="statement-consistent"/, 'the consistency item appears with the statement');
      assert.match(html, /<input type="radio" name="ch:grade-fev1-pre" value="A"\s+disabled>/, 'quality answers are fixed');
      assert.doesNotMatch(html, /id="show-statement"/);
    });
  }

  test(`page source, quality challenge off, stage 1, ${name}: statement from the start, no key`, () => {
    const ctx = makeCtx(input, { qualityChallenge: false, stage: 1, detailsOpen: true });
    const html = renderPractice(ctx);
    assert.ok(ctx.rt.qualityLines.every((l) => html.includes(l)));
    assert.doesNotMatch(html, /WHY:|NOTE:|TRUTH:|Grade [A-FU] requires/);
    assert.match(html, /data-item="statement-consistent"/);
    assert.doesNotMatch(html, /id="show-statement"/);
    assert.match(html, /id="check-answers"\s*>/, 'a scored check is offered');
  });

  test(`page source, stage 3, ${name}: key, feedback, quality section and details line`, () => {
    const ctx = makeCtx(input, { qualityChallenge: true, stage: 3, detailsOpen: false });
    const html = renderPractice(ctx);
    assert.match(html, /id="reveal"/);
    assert.match(html, /id="h-quality"/);
    assert.match(html, /Grade [A-FU] requires/);
    assert.match(html, /WHY:|Key:/);
    assert.match(html, /Compare the interpretation/);
    assert.match(html, /Composed summary/);
    assert.match(html, /class="stmt-impression"/);
    assert.match(html, /Supporting explanation/);
  });
}

test('the interpretation box lands inside the sheet element; a sheet without it gets the box after it', () => {
  const sheet = '<article><div id="sheet-interpretation"></div><p>after</p></article>';
  assert.equal(injectInterpretation(sheet, '<b>box</b>'), '<article><div id="sheet-interpretation"><b>box</b></div><p>after</p></article>');
  assert.equal(injectInterpretation('<article>x</article>', '<b>box</b>'), '<article>x</article><b>box</b>');
  const html = renderPractice(makeCtx(CASES.easy, { detailsOpen: false }));
  assert.match(html, /id="sheet-interpretation"><section class="interp-box"/);
  assert.equal((html.match(/id="answer-form"/g) ?? []).length, 1);
});

test('without the sheet modules the page says so and keeps the card view', () => {
  const closed = renderPractice(makeCtx(CASES.obstruction, { sheets: NO_SHEETS }));
  assert.ok(textOf(closed).includes(SUMMARY_MISSING));
  assert.ok(!textOf(closed).includes(DETAILS_MISSING), 'page 2 is not drawn until opened');
  assert.match(closed, /id="spiro-table"/);
  assert.match(closed, /id="sheet-interpretation"><section class="interp-box"/);
  assert.match(closed, /aria-expanded="false"/);
  const open = renderPractice(makeCtx(CASES.obstruction, { sheets: NO_SHEETS, detailsOpen: true }));
  assert.ok(textOf(open).includes(DETAILS_MISSING));
  assert.match(open, /id="pre-maneuvers"/);
  assert.match(open, /aria-expanded="true"/);
});

test('the needsDetails hint, key and explanation are never in the source before checking', () => {
  const ctx = makeCtx(CASES.poor, { qualityChallenge: true, stage: 2, detailsOpen: false });
  const html = interpretationBoxHtml(ctx);
  assert.doesNotMatch(html, /needsDetails|needs-details|details held/);
  for (const item of ctx.items) assert.ok(!html.includes(String(item.why)), `explanation of ${item.id}`);
});

test('the interpretation box is keyboard-usable: labelled controls, one form, an optional impression', () => {
  const html = interpretationBoxHtml(makeCtx(CASES.obstruction, { qualityChallenge: true }));
  assert.match(html, /<label for="impression">/);
  assert.match(html, /<legend>Pattern<\/legend>/);
  assert.doesNotMatch(html, /gradeFev1|gradeFvc/, 'the grade questions are not among the structured questions');
  assert.match(html, /type="checkbox" name="ch:accept-fev1-pre"/);
  assert.match(html, /aria-describedby="check-hint"/);
});

test('feedback: every item with status and note, a quality section, and the details line', () => {
  const responses = [['pattern', 'normal'], [challengeField('grade-fev1-pre'), 'F']].reduce((r, [name, value]) => applyChange(r, { name, value }), emptyResponses());
  const ctx = makeCtx(CASES.poor, { qualityChallenge: true, stage: 3, responses });
  const fb = ctx.feedback;
  assert.equal(fb.rows.length, 4 + ctx.items.length);
  const byId = Object.fromEntries(fb.rows.map((r) => [r.id, r]));
  assert.equal(byId.pattern.status, ctx.interp.key.pattern === 'normal' ? 'correct' : byId.pattern.status);
  assert.equal(byId['grade-fev1-pre'].status, 'incorrect');
  assert.equal(byId['grade-fev1-pre'].answer, 'F');
  assert.match(byId['grade-fev1-pre'].why, /^WHY/);
  assert.equal(byId['accept-fev1-pre'].status, 'unanswered');
  assert.equal(byId['accept-fev1-pre'].answer, null);
  assert.ok(fb.quality.lines.some((l) => /grade/.test(l)));
  assert.ok(fb.quality.lines.some((l) => /not acceptable|criterion|cough|glottic|end-of-forced/.test(l)), 'the failed criteria are named');
  assert.match(fb.detailsLine, /^Here the details, which were not opened before the answers were checked, held /);
  assert.equal(fb.matched, fb.rows.filter((r) => r.status === 'correct' || r.status === 'other-equation').length);
});

test('feedback: the multi-answer item is scored as a set and a key hit is correct', () => {
  const ctx = makeCtx(CASES.obstruction, { qualityChallenge: true, stage: 3 });
  const item = ctx.items.find((i) => i.id === 'accept-fev1-pre');
  const responses = applyChange(emptyResponses(), { name: challengeField(item.id), type: 'checkbox', value: item.key[0], checkedValues: [...item.key].reverse() });
  const fb = scoreAll({ caseData: ctx.caseData, interp: ctx.interp, interpOther: ctx.interpOther, equation: 'GLIglobal', responses, items: [item], scoreChallenge: stub.scoreChallenge });
  assert.equal(fb.rows.find((r) => r.id === item.id).status, 'correct');
  assert.equal(fb.rows.find((r) => r.id === item.id).why, '');
});

test('details line: what page 2 held, whether or not it was opened, never scored and never "unnecessary"', () => {
  const rt = { needsDetails: true, detailsReasons: ['a cough in the first second of maneuver 2 lowers the FEV1 grade.'] };
  assert.equal(detailsLine(rt, true), 'Here the details held a cough in the first second of maneuver 2 lowers the FEV1 grade.');
  assert.match(detailsLine(rt, false), /^Here the details, which were not opened before the answers were checked, held a cough/);
  const none = detailsLine({ needsDetails: false, detailsReasons: [] }, false);
  assert.doesNotMatch(none, /unnecessary|need(ed)? not|did not need|no need/i);
  assert.equal(detailsLine(null, true), null);
  assert.equal(detailsLine({}, true), null);
  // Opening the details does not change a single status or the tally.
  const a = makeCtx(CASES.poor, { qualityChallenge: true, stage: 3, detailsOpened: true }).feedback;
  const b = makeCtx(CASES.poor, { qualityChallenge: true, stage: 3, detailsOpened: false }).feedback;
  assert.deepEqual(a.rows, b.rows);
  assert.deepEqual([a.matched, a.total], [b.matched, b.total]);
});

test('quality section: the true grades against the stated ones; null without a technologist report', () => {
  const caseData = buildCase(CASES.poor, ds);
  const rt = stub.buildRtReport(caseData);
  const q = qualityFeedback(rt, caseData);
  assert.ok(q.lines[0].startsWith('Before bronchodilator: FEV₁ grade'));
  assert.ok(q.lines.some((l) => l.startsWith('Stated by the technologist:')));
  assert.ok(q.lines.some((l) => /better than the maneuvers earn/.test(l)), 'an optimistic statement is named as such');
  assert.equal(qualityFeedback(null, caseData), null);
  assert.equal(addToTally({ answered: 1, matched: 3, items: 5 }, { matched: 2, total: 4 }).items, 9);
});

test('the practice page works with no technologist report: structured questions only', () => {
  const ctx = makeCtx(CASES.easy, { sheets: NO_SHEETS });
  const html = renderPractice({ ...ctx, rt: null, items: [] });
  assert.doesNotMatch(html, /Test quality<\/h3>/);
  assert.match(html, /<legend>Pattern<\/legend>/);
  const fb = buildFeedback({ caseData: ctx.caseData, interp: ctx.interp, interpOther: ctx.interpOther, equation: 'GLIglobal', responses: emptyResponses(), items: [], scoreChallenge: null, rt: null });
  assert.equal(fb.rows.length, 4);
  assert.equal(fb.quality, null);
  assert.equal(fb.detailsLine, null);
  const revealed = renderPractice({ ...ctx, rt: null, items: [], stage: 3, scored: false, feedback: fb, vis: fallbackVisibility({ qualityChallenge: false, stage: 3 }) });
  assert.match(revealed, /Session quality/);
});
