/**
 * Basic (study-level) and advanced (maneuver-level) quality review: the one study-level item, its key, the level setting in the stage
 * machine and the addresses, and what the page source holds at each stage. The key is checked against the engine and against the
 * technologist's statement, which it must not depend on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { forEachCase, resolveReference, interpret, buildCase, ds } from './helpers/rt-cases.mjs';
import { buildRtReport } from '../src/core/rt-report.js';
import { buildChallenges, scoreChallenge, studyJudgement } from '../src/challenges/index.js';
import { createStage, setReview, canSetReview, showStatement, check, setQualityChallenge, normalizeReview } from '../src/app/stage.js';
import { parseAddress, buildSearch } from '../src/app/address.js';
import { parseReportQuery, reportQuery, practiceHref } from '../src/report-page/query.js';
import { emptyResponses, applyChange, answerFor } from '../src/app/collect.js';
import { buildFeedback } from '../src/app/feedback.js';
import { renderPractice, itemFieldsetHtml } from '../src/app/practice-view.js';
import { visibility } from '../src/challenges/visibility.js';
import { serializeDescriptor } from '../src/core/descriptor.js';
import { encodeCase } from '../src/core/code.js';

const seen = { interpretable: [], limited: [], insufficient: [] };
const OPTIONAL_ONLY = [];

forEachCase(14, (c, input) => {
  const rt = buildRtReport(c);
  const j = studyJudgement(rt);
  seen[j.key].push(input);
  const baselineOk = !['D', 'E', 'U', 'F'].some((g) => g === rt.truth.pre.fev1 || g === rt.truth.pre.fvc);
  if (baselineOk && j.key === 'limited') OPTIONAL_ONLY.push({ input, limits: j.limits });
});

test('the sample holds every study-level key, so no assertion below is vacuous', () => {
  assert.ok(seen.interpretable.length > 20, `interpretable ${seen.interpretable.length}`);
  assert.ok(seen.limited.length > 5, `limited ${seen.limited.length}`);
  assert.ok(seen.insufficient.length > 0, 'insufficient: at least one baseline without a usable FEV₁ or FVC');
});

test('the key agrees with the engine under both equations: insufficient exactly when the pattern is indeterminate, never interpretable when qualityLimited', () => {
  forEachCase(14, (c, input) => {
    const rt = buildRtReport(c);
    const { key } = studyJudgement(rt);
    for (const eq of ['GLIglobal', 'GLI2012']) {
      const i = interpret(c.report, resolveReference, eq);
      assert.equal(key === 'insufficient', i.pattern === 'indeterminate', `${JSON.stringify(input)} ${eq}`);
      if (i.qualityLimited) assert.notEqual(key, 'interpretable', `${JSON.stringify(input)} ${eq}`);
      if (!i.qualityLimited && i.pattern !== 'indeterminate' && !c.dlco && !c.spirometry.post) assert.equal(key, 'interpretable');
    }
  });
});

test('the key does not depend on the technologist’s statement, the honesty type or the stated grades', () => {
  forEachCase(8, (c) => {
    const rt = buildRtReport(c);
    const k = studyJudgement(rt).key;
    const altered = { ...rt, honesty: 'optimistic', stated: { pre: { fev1: 'A', fvc: 'A' }, post: null, dlco: 'acceptable', pleth: 'acceptable' }, qualityLines: [] };
    assert.equal(studyJudgement(altered).key, k);
  });
});

test('a poor optional test limits the study and never invalidates a usable baseline', () => {
  assert.ok(OPTIONAL_ONLY.length > 0, 'the sample has a case whose limitation comes from an optional test alone');
  for (const { input, limits } of OPTIONAL_ONLY) {
    assert.ok(limits.length > 0 && !limits.includes('the baseline spirometry'));
    const rt = buildRtReport(buildCase(input, ds));
    assert.equal(studyJudgement(rt).key, 'limited');
  }
});

test('one failed variable at baseline is insufficient even when the other is graded A to C, and the explanation names the variable', () => {
  const c = buildCase(seen.insufficient[0], ds);
  const rt = buildRtReport(c);
  const item = buildChallenges(c, { rt, review: 'basic' })[0];
  assert.equal(item.key, 'insufficient');
  assert.match(item.why, /FEV₁|FVC/);
});

test('basic review is one item with constant options and no rows; advanced is the earlier list; no review argument keeps the earlier list', () => {
  const idsAdv = new Set();
  forEachCase(3, (c) => {
    const rt = buildRtReport(c);
    const interp = interpret(c.report, resolveReference, 'GLIglobal');
    const basic = buildChallenges(c, { rt, interp, review: 'basic' });
    assert.equal(basic.length, 1);
    assert.equal(basic[0].id, 'studyInterpretable');
    assert.equal(basic[0].rows, undefined);
    assert.deepEqual(basic[0].options.map(([v]) => v), ['interpretable', 'limited', 'insufficient']);
    assert.equal(basic[0].stage, 1);
    const adv = buildChallenges(c, { rt, interp, review: 'advanced' });
    const none = buildChallenges(c, { rt, interp });
    assert.deepEqual(none.map((i) => i.id), adv.map((i) => i.id));
    assert.ok(adv.some((i) => i.id === 'acceptableManeuversPre') && adv.some((i) => i.id === 'rtConsistent'));
    assert.ok(!adv.some((i) => i.id === 'studyInterpretable'));
    adv.forEach((i) => idsAdv.add(i.id));
  });
});

test('scoring covers only the items displayed: answers held for the other level are ignored', () => {
  const c = buildCase({ seed: 12, archetype: 'obstruction', technique: 'fair' }, ds);
  const rt = buildRtReport(c);
  const interp = interpret(c.report, resolveReference, 'GLIglobal');
  const basic = buildChallenges(c, { rt, interp, review: 'basic' });
  let r = applyChange(emptyResponses(), { name: 'ch:acceptableManeuversPre#fev1:0', value: 'yes' });
  r = applyChange(r, { name: 'ch:studyInterpretable', value: basic[0].key });
  const fb = buildFeedback({ caseData: c, interp, interpOther: interp, equation: 'GLIglobal', responses: r, items: basic, scoreChallenge, rt, detailsOpened: false });
  assert.equal(fb.total, fb.rows.length);
  assert.equal(fb.rows.filter((x) => /Quality of the study/.test(JSON.stringify(x))).length >= 1, true);
  assert.equal(JSON.stringify(fb.rows).includes('acceptableManeuversPre'), false);
  assert.equal(scoreChallenge(basic[0], answerFor(basic[0], r)).status, 'correct');
  assert.equal(scoreChallenge(basic[0], answerFor(basic[0], emptyResponses())).status, 'unanswered');
});

test('stage machine: the level defaults to basic, normalizes junk, and changes only at stage 1', () => {
  assert.equal(createStage().review, 'basic');
  assert.equal(createStage({ review: 'advanced' }).review, 'advanced');
  for (const junk of [undefined, null, '', 'ADVANCED', 'adv', 3]) assert.equal(normalizeReview(junk), 'basic');
  for (const qc of [false, true]) {
    let s = createStage({ qualityChallenge: qc });
    assert.ok(canSetReview(s));
    s = setReview(s, 'advanced');
    assert.equal(s.review, 'advanced');
    assert.equal(s.stage, 1);
    assert.equal(setReview(s, 'advanced'), s);
    s = setReview(s, 'nonsense');
    assert.equal(s.review, 'basic');
    const done = check(s, { scored: false });
    assert.equal(canSetReview(done), false);
    assert.equal(setReview(done, 'advanced'), done);
  }
  const staged = showStatement(createStage({ qualityChallenge: true }));
  assert.equal(staged.stage, 2);
  assert.equal(canSetReview(staged), false);
  assert.equal(setReview(staged, 'advanced'), staged);
  assert.equal(setQualityChallenge(createStage({ review: 'advanced' }), true).review, 'advanced');
  assert.equal(check(createStage({ review: 'advanced' }), { scored: true }).review, 'advanced');
});

const realQuery = serializeDescriptor(buildCase({ seed: 7, archetype: 'normal' }, ds).descriptor);

test('address: qd=adv selects advanced; missing or invalid is basic; the key never reaches the descriptor; round trip', () => {
  const token = encodeCase(realQuery);
  for (const [qd, want] of [['adv', 'advanced'], ['basic', 'basic'], ['', 'basic'], ['x', 'basic'], [null, 'basic']]) {
    const a = parseAddress(`?c=${token}${qd === null ? '' : `&qd=${qd}`}`);
    assert.equal(a.review, want);
    assert.equal(a.code, token);
  }
  const plain = parseAddress(`?${realQuery}&qd=adv&qc=1`);
  assert.equal(plain.kind, 'plain');
  assert.ok(!/qd=|qc=/.test(plain.plainQuery), plain.plainQuery);
  assert.equal(plain.review, 'advanced');
  const search = buildSearch({ query: 'v=2&s=7&a=normal', qualityChallenge: true, equation: 'GLI2012', flags: 'none', review: 'advanced' });
  const back = parseAddress(search);
  assert.deepEqual([back.review, back.qualityChallenge, back.equation, back.flags], ['advanced', true, 'GLI2012', 'none']);
  assert.ok(!buildSearch({ query: 'v=2&s=7&a=normal' }).includes('qd'));
  assert.ok(!buildSearch({ query: 'v=2&s=7&a=normal', review: 'basic' }).includes('qd'));
});

test('report page: the level rides through the report address and back to the practice page, and does not change the report', () => {
  const token = encodeCase(realQuery);
  for (const review of ['basic', 'advanced']) {
    const q = reportQuery({ token, qualityChallenge: true, review, stage: 2 });
    const p = parseReportQuery(q);
    assert.equal(p.review, review);
    assert.equal(p.qualityChallenge, true);
    assert.equal(p.stage, 2);
    const href = practiceHref({ token, qualityChallenge: true, review });
    assert.equal(parseAddress(href.replace('./', '')).review, review);
  }
  assert.equal(parseReportQuery(`?c=${token}&qd=junk`).review, 'basic');
  assert.ok(!reportQuery({ token }).includes('qd'));
  assert.equal(parseReportQuery(`?${realQuery}&qd=adv`).review, 'advanced');
});

function pageFor(input, { qualityChallenge, stage, review }) {
  const c = buildCase(input, ds);
  const rt = buildRtReport(c);
  const interp = interpret(c.report, resolveReference, 'GLIglobal');
  const items = buildChallenges(c, { rt, interp, qualityChallenge, review });
  let st = createStage({ qualityChallenge, review });
  if (stage >= 2) st = showStatement(st);
  const vis = visibility({ qualityChallenge, stage: st.stage });
  const ctx = { caseData: c, interp, equation: 'GLIglobal', flags: 'lln', qualityChallenge, review, stage: st.stage, scored: false, detailsOpen: false, vis, canCheck: st.stage === 2, rt, items, responses: emptyResponses(), model: null, sheets: {}, figView: {}, resolve: resolveReference };
  return { html: renderPractice(ctx), items, rt };
}

test('basic review with the challenge on: the study item’s markup is the same for every case and holds no verdict, explanation or key, at stages 1 and 2', () => {
  const inputs = [seen.interpretable[0], seen.limited[0], seen.insufficient[0]];
  for (const stage of [1, 2]) {
    const markup = new Set();
    for (const input of inputs) {
      const { html, items } = pageFor(input, { qualityChallenge: true, stage, review: 'basic' });
      assert.equal(items.length, 1);
      const frag = itemFieldsetHtml(items[0], emptyResponses(), stage === 2);
      assert.ok(html.includes(frag));
      markup.add(frag);
      assert.ok(!html.includes(items[0].why), 'explanation in the source');
      assert.doesNotMatch(frag, /data-key|checked/);
      assert.doesNotMatch(html, /id="statement-consistency"|ch:rtConsistent|ch:acceptableManeuvers|ch:grade|ch:representativeLoopOk/);
    }
    assert.equal(markup.size, 1, `the question markup depends on nothing in the case (stage ${stage})`);
  }
});

test('the level note is static text: basic points to the advanced review; advanced with the challenge off says the answers are printed; neither depends on the case', () => {
  const input = seen.limited[0];
  const basic = pageFor(input, { qualityChallenge: false, stage: 1, review: 'basic' }).html;
  assert.match(basic, /id="review-note"[^>]*>Study-level review/);
  const advOff = pageFor(input, { qualityChallenge: false, stage: 1, review: 'advanced' }).html;
  assert.match(advOff, /quality challenge is off, so the grades and the acceptability/);
  const advOn = pageFor(input, { qualityChallenge: true, stage: 1, review: 'advanced' }).html;
  assert.doesNotMatch(advOn, /quality challenge is off/);
  assert.match(advOn, /Advanced review: maneuver-level questions\./);
});

test('every grade pair maps by the stated rule', () => {
  const mk = (pre, post = null, dlco = null, pleth = null) => ({ truth: { pre: { fev1: pre[0], fvc: pre[1] }, post: post && { fev1: post[0], fvc: post[1] }, dlco, pleth } });
  const GR = ['A', 'B', 'C', 'D', 'E', 'U', 'F'];
  for (const a of GR) for (const b of GR) {
    const want = a === 'F' || b === 'F' ? 'insufficient' : ['D', 'E', 'U'].some((g) => g === a || g === b) ? 'limited' : 'interpretable';
    assert.equal(studyJudgement(mk([a, b])).key, want, `${a}${b}`);
  }
  assert.equal(studyJudgement(mk(['A', 'A'], ['F', 'F'])).key, 'limited', 'a failed post set limits the study, it does not invalidate the baseline');
  assert.equal(studyJudgement(mk(['C', 'C'], ['C', 'C'], { acceptable: true, reasons: [] }, { acceptable: true, reasons: [] })).key, 'interpretable');
  assert.equal(studyJudgement(mk(['B', 'B'], null, { acceptable: false, reasons: ['x'] })).key, 'limited');
  assert.equal(studyJudgement(mk(['F', 'A'], null, { acceptable: true, reasons: [] })).key, 'insufficient');
});
