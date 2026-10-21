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
import { createStage, setReview, canSetReview, showStatement, check, setQualityChallenge, canEnableQualityChallenge, normalizeReview, qualityAnswersLocked, canCheck } from '../src/app/stage.js';
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
  const j = studyJudgement(rt, c.report.caveatIds);
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
    const { key } = studyJudgement(rt, c.report.caveatIds);
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
    const k = studyJudgement(rt, c.report.caveatIds).key;
    const altered = { ...rt, honesty: 'optimistic', stated: { pre: { fev1: 'A', fvc: 'A' }, post: null, dlco: 'acceptable', pleth: 'acceptable' }, qualityLines: [] };
    assert.equal(studyJudgement(altered, c.report.caveatIds).key, k);
  });
});

test('a poor optional test limits the study and never invalidates a usable baseline', () => {
  assert.ok(OPTIONAL_ONLY.length > 0, 'the sample has a case whose limitation comes from an optional test alone');
  for (const { input, limits } of OPTIONAL_ONLY) {
    assert.ok(limits.length > 0 && !limits.includes('the baseline spirometry'));
    const rt = buildRtReport(buildCase(input, ds));
    assert.equal(studyJudgement(rt, buildCase(input, ds).report.caveatIds).key, 'limited');
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
  const ctx = { caseData: c, interp, equation: 'GLIglobal', flags: 'lln', qualityChallenge, review, stage: st.stage, scored: false, detailsOpen: false, vis, canCheck: canCheck(st), rt, items, responses: emptyResponses(), model: null, sheets: {}, figView: {}, resolve: resolveReference };
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

// ---- review round 1 (Codex): the supported bronchodilator caveats, the disclosure lock, the wording of the reported value ----

import { parseDescriptor } from '../src/core/descriptor.js';

for (const si of ['qs-bd-timing-short', 'qs-bd-better-effort']) {
  test(`basic review: ${si} limits the study through the bronchodilator comparison and leaves the usable baseline interpretable (agrees with the advanced item)`, () => {
    const c = buildCase(parseDescriptor(`v=2&s=1&a=obstruction&sc=light&si=${si}`), ds);
    const rt = buildRtReport(c);
    const interp = interpret(c.report, resolveReference, 'GLIglobal');
    // The premise of the repro: every grade is A and every optional test is acceptable, so only the caveat can limit the study.
    assert.deepEqual([rt.truth.pre.fev1, rt.truth.pre.fvc, rt.truth.post.fev1, rt.truth.post.fvc], ['A', 'A', 'A', 'A']);
    assert.ok(!rt.truth.dlco || rt.truth.dlco.acceptable);
    const item = buildChallenges(c, { rt, interp, review: 'basic' })[0];
    assert.equal(item.key, 'limited');
    assert.match(item.why, /bronchodilator/);
    const adv = buildChallenges(c, { rt, interp, review: 'advanced' }).find((i) => i.id === 'bdInterpretable');
    assert.equal(adv.key.interpretable, 'no', 'the advanced item calls the comparison unreliable');
    // Never insufficient, and the same under the other equation.
    const other = interpret(c.report, resolveReference, 'GLI2012');
    assert.equal(buildChallenges(c, { rt, interp: other, review: 'basic' })[0].key, 'limited');
  });
}

test('basic review: the same scenario without the caveat, and a caveat on a case with no post-bronchodilator set, do not limit the study', () => {
  const plain = buildCase(parseDescriptor('v=2&s=1&a=obstruction'), ds);
  const rt = buildRtReport(plain);
  assert.equal(buildChallenges(plain, { rt, review: 'basic' })[0].key, studyJudgement(rt, plain.report.caveatIds).key);
  const noPost = { ...plain, spirometry: { ...plain.spirometry, post: null }, report: { ...plain.report, caveatIds: ['bd-timing-short'] } };
  assert.ok(!studyJudgement({ ...rt, truth: { ...rt.truth, post: null } }, ['bd-timing-short']).limits.includes('the bronchodilator comparison'));
  assert.equal(noPost.spirometry.post, null);
});

test('explanation: a reported value is the largest acceptable value, or the largest usable value when no maneuver is acceptable (grade U)', () => {
  const c = buildCase({ seed: 12, archetype: 'obstruction', technique: 'fair' }, ds);
  const item = buildChallenges(c, { rt: buildRtReport(c), review: 'basic' })[0];
  assert.match(item.why, /among the usable ones/);
  assert.match(item.why, /grade U/);
});

// ---- the disclosure lock ----

const vis = (s) => visibility({ qualityChallenge: s.qualityChallenge, stage: s.stage });

test('disclosure history: set at creation with the challenge off, by the statement, by either check, and by turning the challenge off; never reset', () => {
  assert.equal(createStage({ qualityChallenge: true }).disclosed, false);
  assert.equal(createStage({ qualityChallenge: false }).disclosed, true);
  assert.equal(showStatement(createStage({ qualityChallenge: true })).disclosed, true);
  assert.equal(check(createStage({ qualityChallenge: true }), { scored: false }).disclosed, true);
  assert.equal(check(showStatement(createStage({ qualityChallenge: true })), { scored: true }).disclosed, true);
  for (const stage2 of [false, true]) {
    let s = createStage({ qualityChallenge: true });
    if (stage2) s = showStatement(s);
    const off = setQualityChallenge(s, false);
    assert.equal(off.disclosed, true);
    assert.equal(off.stage, 1);
  }
  // Turning the challenge on again is refused once anything was disclosed; the state object is returned unchanged.
  for (const s of [createStage({ qualityChallenge: false }), setQualityChallenge(showStatement(createStage({ qualityChallenge: true })), false)]) {
    assert.equal(canEnableQualityChallenge(s), false);
    assert.equal(setQualityChallenge(s, true), s);
  }
  // Before any disclosure the setting can be turned on; turning it off is itself a disclosure and cannot be undone.
  const fresh = createStage({ qualityChallenge: true });
  assert.equal(canEnableQualityChallenge(fresh), true);
  assert.equal(canEnableQualityChallenge(setQualityChallenge(fresh, false)), false);
  assert.equal(setQualityChallenge(setQualityChallenge(fresh, false), true).qualityChallenge, false);
});

test('the reviewer’s chain: basic, challenge on, statement shown, challenge off, advanced, challenge on ends with the challenge off, advanced, everything visible and the address free of qc', () => {
  let s = createStage({ qualityChallenge: true, review: 'basic' });
  s = showStatement(s);
  assert.equal(qualityAnswersLocked(s), true);
  s = setQualityChallenge(s, false);
  s = setReview(s, 'advanced');
  assert.equal(s.review, 'advanced');
  s = setQualityChallenge(s, true);
  assert.equal(s.qualityChallenge, false, 'refused');
  assert.deepEqual(vis(s), { showQualityLines: true, showGradeColumns: true, showStatementInSummary: true });
  assert.equal(qualityAnswersLocked(s), false, 'nothing is withheld, so nothing is a withheld judgement');
  assert.ok(!buildSearch({ query: 'v=2&s=7&a=normal', qualityChallenge: s.qualityChallenge, review: s.review }).includes('qc=1'));
  // Stage 3 is unaffected by any of it.
  const done = check(createStage({ qualityChallenge: true }), { scored: false });
  assert.equal(done.stage, 3);
  assert.equal(setQualityChallenge(done, false), done);
  assert.equal(setQualityChallenge(done, true), done);
});

test('every action sequence of length up to 6 from both starting states keeps the invariant: with the challenge on and nothing released (stage 1), nothing has been disclosed, and the quality answers never unlock while the challenge stays on', () => {
  const actions = {
    on: (s) => setQualityChallenge(s, true),
    off: (s) => setQualityChallenge(s, false),
    adv: (s) => setReview(s, 'advanced'),
    basic: (s) => setReview(s, 'basic'),
    statement: (s) => showStatement(s),
    check: (s) => check(s, { scored: true }),
    key: (s) => check(s, { scored: false }),
  };
  const names = Object.keys(actions);
  let visited = 0;
  const walk = (s, depth, trail) => {
    visited++;
    if (s.qualityChallenge && s.stage === 1) assert.equal(s.disclosed, false, `disclosed while the challenge is on and nothing was released: ${trail.join(' > ')}`);
    if (s.qualityChallenge && s.stage === 1) assert.equal(qualityAnswersLocked(s), false);
    // The gate: with the challenge on at stage 1 a scored check is available exactly in the basic review.
    if (s.qualityChallenge && s.stage === 1) assert.equal(canCheck(s), s.review === 'basic', `gate: ${trail.join(' > ')}`);
    if (s.qualityChallenge && s.stage === 1) assert.equal(check(s, { scored: true }) !== s, s.review === 'basic');
    if (depth === 0) return;
    for (const n of names) {
      const next = actions[n](s);
      // A locked judgement stays locked while the challenge stays on: stage never decreases unless the challenge was turned off.
      if (s.qualityChallenge && next.qualityChallenge) assert.ok(next.stage >= s.stage, `stage fell with the challenge on: ${[...trail, n].join(' > ')}`);
      // Once disclosed, always disclosed.
      if (s.disclosed) assert.ok(next.disclosed, `disclosure forgotten: ${[...trail, n].join(' > ')}`);
      // A level change is applied only at stage 1.
      if (s.stage !== 1) assert.equal(next.review, s.review);
      walk(next, depth - 1, [...trail, n]);
    }
  };
  walk(createStage({ qualityChallenge: true }), 6, []);
  walk(createStage({ qualityChallenge: false }), 6, []);
  assert.ok(visited > 100000, `visited ${visited}`);
});

test('a new case starts fresh: the previous case’s disclosure does not carry', () => {
  const old = setQualityChallenge(showStatement(createStage({ qualityChallenge: true })), false);
  assert.equal(old.disclosed, true);
  const next = createStage({ qualityChallenge: true, review: old.review });
  assert.equal(next.disclosed, false);
  assert.equal(next.stage, 1);
  assert.equal(canEnableQualityChallenge(next), true);
});

test('over the sample: whenever a post-bronchodilator set exists and a supported caveat applies, the basic key is limited (or insufficient only with a failed baseline), the advanced comparison item says unreliable, and the key is the same under both equations', () => {
  let n = 0;
  forEachCase(30, (c) => {
    const ids = c.report.caveatIds ?? [];
    if (!c.spirometry.post || !ids.some((id) => id === 'bd-timing-short' || id === 'bd-effort-artifact')) return;
    n++;
    const rt = buildRtReport(c);
    for (const eq of ['GLIglobal', 'GLI2012']) {
      const interp = interpret(c.report, resolveReference, eq);
      const key = buildChallenges(c, { rt, interp, review: 'basic' })[0].key;
      assert.equal(key, rt.truth.pre.fev1 === 'F' || rt.truth.pre.fvc === 'F' ? 'insufficient' : 'limited');
      const adv = buildChallenges(c, { rt, interp, review: 'advanced' }).find((i) => i.id === 'bdInterpretable');
      if (adv) assert.equal(adv.key.interpretable, 'no');
    }
  });
  assert.ok(n > 0, 'the sample holds a case with a supported bronchodilator caveat');
});

// ---- the basic flow: no forced technologist-statement step, direct check, optional release ----

test('basic review, challenge on: a scored check is available from stage 1 with no statement release; the advanced review is still gated', () => {
  const basic = createStage({ qualityChallenge: true, review: 'basic' });
  assert.equal(canCheck(basic), true);
  const done = check(basic, { scored: true });
  assert.deepEqual([done.stage, done.scored, done.disclosed], [3, true, true]);
  const adv = createStage({ qualityChallenge: true, review: 'advanced' });
  assert.equal(canCheck(adv), false);
  assert.equal(check(adv, { scored: true }), adv);
  // Old links (qc=1 without qd) open as basic and therefore ungated.
  assert.equal(canCheck(createStage({ qualityChallenge: true, review: parseAddress('?c=x&qc=1').review })), true);
});

test('basic review: the release of the statement is optional, locks the study answer, and does not change what a later check needs', () => {
  let s = createStage({ qualityChallenge: true, review: 'basic' });
  const released = showStatement(s);
  assert.equal(released.stage, 2);
  assert.equal(qualityAnswersLocked(released), true);
  assert.equal(canCheck(released), true);
  assert.equal(check(released, { scored: true }).stage, 3);
  // Without the release the answer is simply scored at the check; nothing was disclosed before it.
  assert.equal(s.disclosed, false);
  assert.equal(qualityAnswersLocked(s), false);
});

test('switching the level at stage 1 re-gates or ungates the check; after the release the level is fixed, and the button follows the case’s level', () => {
  let s = createStage({ qualityChallenge: true, review: 'basic' });
  s = setReview(s, 'advanced');
  assert.equal(canCheck(s), false);
  s = setReview(s, 'basic');
  assert.equal(canCheck(s), true);
  const released = showStatement(s);
  assert.equal(setReview(released, 'advanced'), released);
  assert.equal(canCheck(setReview(released, 'advanced')), true, 'the case keeps its level, so the gate follows the case');
  // The sticky disclosure and the lock chain still hold on the basic flow.
  let t = showStatement(createStage({ qualityChallenge: true, review: 'basic' }));
  t = setQualityChallenge(t, false);
  t = setReview(t, 'advanced');
  t = setQualityChallenge(t, true);
  assert.equal(t.qualityChallenge, false);
  assert.equal(t.disclosed, true);
});

test('basic page, challenge on, stage 1: the check is enabled with no hint, the copy does not send the learner to the maneuvers, and the source holds no grade or statement text', () => {
  const { html, rt } = pageFor(seen.limited[0], { qualityChallenge: true, stage: 1, review: 'basic' });
  assert.doesNotMatch(html, /id="check-hint"/);
  assert.doesNotMatch(html, /id="check-answers"[^>]*disabled/);
  assert.doesNotMatch(html, /Judge the tests from the maneuvers/);
  assert.match(html, /Page 2 lists the maneuvers and tests behind the study\. Showing the statement before the check locks the study-level answer\./);
  assert.match(html, /Show the technologist’s statement and lock the study answer/);
  assert.doesNotMatch(html, /\bfixes\b/);
  for (const line of rt.qualityLines) assert.ok(!html.includes(line));
  assert.doesNotMatch(html, /FEV(?:1|₁)\s*-\s*[A-FU]\b|FVC\s*-\s*[A-FU]\b/);
});

test('advanced page, challenge on, stage 1: the maneuver instruction and the gate are unchanged', () => {
  const { html } = pageFor(seen.limited[0], { qualityChallenge: true, stage: 1, review: 'advanced' });
  assert.match(html, /Judge the tests from the maneuvers on page 2/);
  assert.match(html, /id="check-answers"[^>]*disabled/);
  assert.match(html, /id="check-hint"/);
  assert.match(html, />Show the technologist’s statement<\/button>/);
});

test('basic stage 2 note locks only the study answer; an unanswered study item scores as unanswered at a direct check', () => {
  const { html } = pageFor(seen.limited[0], { qualityChallenge: true, stage: 2, review: 'basic' });
  assert.match(html, /The study-level answer is locked; the other answers remain open\./);
  const c = buildCase(seen.limited[0], ds);
  const rt = buildRtReport(c);
  const interp = interpret(c.report, resolveReference, 'GLIglobal');
  const items = buildChallenges(c, { rt, interp, review: 'basic' });
  assert.equal(scoreChallenge(items[0], answerFor(items[0], emptyResponses())).status, 'unanswered');
});

test('the quiz states its scope', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../quiz.html', import.meta.url), 'utf8');
  assert.match(html, /id="quiz-scope"[^>]*>Scope: the quiz asks the FEV₁ and FVC quality grades as items of their own\./);
});
