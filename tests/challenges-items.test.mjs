import test from 'node:test';
import assert from 'node:assert/strict';
import { forEachCase, failureLog, interpret, resolveReference } from './helpers/rt-cases.mjs';
import { buildRtReport, statementVerdict } from '../src/core/rt-report.js';
import { buildChallenges, scoreChallenge } from '../src/challenges/index.js';
import { FAULT_TEXT } from '../src/core/quality.js';

const IDS = ['acceptableManeuversPre', 'acceptableManeuversPost', 'gradePreFev1', 'gradePreFvc', 'gradePostFev1', 'gradePostFvc', 'representativeLoopOk', 'bdInterpretable', 'dlcoAcceptable', 'plethAcceptable', 'rtConsistent'];
const BAD_WORDS = /\b(treat\w*|therap\w*|prescrib\w*|recommend\w*|initiat\w*|should|asthma|diagnos\w*|undefined|NaN)\b|[{}]/i;
const log = failureLog();
const seen = { cases: 0, ids: new Set(), bdNotInterpretable: 0, bdInterpretable: 0, verdicts: new Set(), otherEq: 0 };

forEachCase(100, (c, input) => {
  seen.cases++;
  const rt = buildRtReport(c);
  const interp = interpret(c.report, resolveReference, 'GLIglobal');
  const other = interpret(c.report, resolveReference, 'GLI2012');
  const qc = seen.cases % 2 === 0;
  const items = buildChallenges(c, { rt, interp, interpOther: other, qualityChallenge: qc });
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  const id = `${input.archetype} s${input.seed}`;
  for (const i of items) seen.ids.add(i.id);

  log.check('ids', items.every((i) => IDS.includes(i.id)) && new Set(items.map((i) => i.id)).size === items.length, id);
  // data present or absent
  log.check('post items follow the post set', Boolean(by.acceptableManeuversPost) === Boolean(c.spirometry.post) && Boolean(by.gradePostFev1) === Boolean(c.spirometry.post) && Boolean(by.gradePostFvc) === Boolean(c.spirometry.post) && Boolean(by.bdInterpretable) === Boolean(c.spirometry.post && interp.bd), id);
  log.check('dlco and pleth items follow the tests', Boolean(by.dlcoAcceptable) === Boolean(c.dlcoTrace) && Boolean(by.plethAcceptable) === Boolean(c.pleth), id);
  log.check('always present', Boolean(by.acceptableManeuversPre && by.gradePreFev1 && by.gradePreFvc && by.representativeLoopOk && by.rtConsistent), id);

  // keys are the engine's own
  const g = c.report.grades;
  log.check('pre grade keys', by.gradePreFev1.key === g.fev1 && by.gradePreFvc.key === g.fvc && g.fev1 === c.spirometry.pre.summary.grades.fev1, id);
  if (c.spirometry.post) log.check('post grade keys', by.gradePostFev1.key === g.postFev1 && by.gradePostFvc.key === g.postFvc && g.postFvc === c.spirometry.post.summary.grades.fvc, id);
  for (const set of ['pre', 'post']) {
    const item = by[set === 'pre' ? 'acceptableManeuversPre' : 'acceptableManeuversPost'];
    if (!item) continue;
    const ev = c.spirometry[set].summary.evaluations;
    log.check('acceptability rows', item.rows.length === 2 * ev.length && item.rows.every((r) => item.key[r.id] === (ev[Number(r.id.split(':')[1])][r.id.split(':')[0]].acceptable ? 'yes' : 'no')), id);
  }
  log.check('loop keys', ['pre', 'post'].every((s) => !rt.representative[s] || by.representativeLoopOk.key[s] === (rt.representative[s].faults[0] ?? 'acceptable')) && Object.keys(by.representativeLoopOk.key).length === (rt.representative.post ? 2 : 1), id);
  log.check('loop options derive from the fault text', by.representativeLoopOk.options.every(([v, l]) => v === 'acceptable' || (v in FAULT_TEXT && l.toLowerCase() === FAULT_TEXT[v].toLowerCase())), id);
  if (by.bdInterpretable) {
    const bd = by.bdInterpretable;
    const grades = [...Object.values(rt.truth.pre), ...Object.values(rt.truth.post)];
    const blocked = (interp.key.caveatIds ?? []).some((x) => ['bd-timing-short', 'bd-effort-artifact'].includes(x));
    log.check('bd response key', bd.key.response === (interp.bd.rule2022.significant ? 'significant' : 'not-significant') && bd.otherKey.response === (other.bd.rule2022.significant ? 'significant' : 'not-significant'), id);
    log.check('bd interpretable key', bd.key.interpretable === (grades.every((x) => ['A', 'B', 'C'].includes(x)) && !blocked ? 'yes' : 'no'), id);
    log.check('bd item marks the project threshold', /project choice/.test(bd.why), id);
    seen[bd.key.interpretable === 'yes' ? 'bdInterpretable' : 'bdNotInterpretable']++;
    if (bd.otherKey.response !== bd.key.response) seen.otherEq++;
  }
  if (by.dlcoAcceptable) log.check('dlco key', by.dlcoAcceptable.key === (c.dlcoTrace.grade.acceptable ? 'acceptable' : 'not-acceptable'), id);
  if (by.plethAcceptable) log.check('pleth key', by.plethAcceptable.key === (['A', 'B'].includes(c.pleth.grade) ? 'acceptable' : 'not-acceptable'), id);
  const verdict = statementVerdict(rt);
  seen.verdicts.add(verdict);
  log.check('rtConsistent key', by.rtConsistent.key === verdict && by.rtConsistent.stage === (qc ? 2 : 1), id);
  log.check('other items are asked at stage 1', items.filter((i) => i.id !== 'rtConsistent').every((i) => i.stage === 1), id);

  // every item is well formed
  for (const i of items) {
    const optionsFor = (row) => i.rowOptions?.[row] ?? i.options;
    const keyOk = i.rows ? i.rows.every((r) => optionsFor(r.id).some(([v]) => v === i.key[r.id])) : i.options.some(([v]) => v === i.key);
    log.check('key is an option', keyOk, `${id} ${i.id}`);
    log.check('item text', [i.title, i.prompt, i.why].every((t) => typeof t === 'string' && t.length > 10 && !BAD_WORDS.test(t)) && typeof i.needsDetails === 'boolean', `${id} ${i.id}: ${(i.why.match(BAD_WORDS) ?? [''])[0]}`);
    const perfect = i.rows ? Object.fromEntries(i.rows.map((r) => [r.id, i.key[r.id]])) : i.key;
    log.check('the key scores correct', scoreChallenge(i, perfect).status === 'correct', `${id} ${i.id}`);
    log.check('no answer is unanswered', scoreChallenge(i, null).status === 'unanswered' && scoreChallenge(i, {}).status === 'unanswered', `${id} ${i.id}`);
  }
  log.check('detail text', rt.detailsReasons.every((t) => !BAD_WORDS.test(t)) && rt.qualityLines.every((t) => !BAD_WORDS.test(t)), id);

  // grade items need the details exactly when the summary does not settle them
  const stated = (s, k) => rt.stated[s]?.[k];
  log.check('grade needsDetails', by.gradePreFev1.needsDetails === (stated('pre', 'fev1') !== rt.truth.pre.fev1) && by.gradePreFvc.needsDetails === (stated('pre', 'fvc') !== rt.truth.pre.fvc), id);
  log.check('acceptability needs the details', by.acceptableManeuversPre.needsDetails === true, id);
  log.check('loop item does not need the details', by.representativeLoopOk.needsDetails === false, id);

  // the key does not depend on the technologist's statement
  const silent = { ...rt, honesty: 'silent', stated: { pre: null, post: null, dlco: null, pleth: null }, qualityLines: [], interpretationLines: [], detailsReasons: [] };
  const alt = buildChallenges(c, { rt: silent, interp, interpOther: other, qualityChallenge: qc });
  log.check('keys independent of the statement', items.filter((i) => i.id !== 'rtConsistent').every((i, k) => JSON.stringify(i.key) === JSON.stringify(alt.filter((j) => j.id !== 'rtConsistent')[k].key)), id);
});

const NAMES = ['ids', 'post items follow the post set', 'dlco and pleth items follow the tests', 'always present', 'pre grade keys', 'post grade keys', 'acceptability rows', 'loop keys', 'loop options derive from the fault text', 'bd response key', 'bd interpretable key', 'bd item marks the project threshold', 'dlco key', 'pleth key', 'rtConsistent key', 'other items are asked at stage 1', 'key is an option', 'item text', 'the key scores correct', 'no answer is unanswered', 'detail text', 'grade needsDetails', 'acceptability needs the details', 'loop item does not need the details', 'keys independent of the statement'];
for (const name of NAMES) test(`1500 cases: ${name}`, () => assert.equal(log.report(name), ''));

test('the sample reaches every item, every verdict, and both outcomes of the bronchodilator interpretability key', () => {
  assert.deepEqual([...seen.ids].sort(), [...IDS].sort());
  assert.deepEqual([...seen.verdicts].sort(), ['consistent', 'not-stated', 'overstated', 'understated']);
  assert.ok(seen.bdInterpretable > 20 && seen.bdNotInterpretable > 0, `interpretable ${seen.bdInterpretable}, not ${seen.bdNotInterpretable}`);
});

// ---- scoring --------------------------------------------------------------------------------------------------------

const rowsItem = (n, bad = []) => {
  const rows = Array.from({ length: n }, (_, i) => [{ id: `fev1:${i}`, label: `Maneuver ${i + 1}, FEV₁` }, { id: `fvc:${i}`, label: `Maneuver ${i + 1}, FVC` }]).flat();
  return { id: 'acceptableManeuversPre', stage: 1, title: 't', prompt: 'p', why: 'w', needsDetails: true, options: [['yes', 'Acceptable'], ['no', 'Not acceptable']], rows, key: Object.fromEntries(rows.map((r) => [r.id, bad.includes(r.id) ? 'no' : 'yes'])) };
};

test('a per-maneuver item returns the fraction correct and the wrong maneuvers', () => {
  const item = rowsItem(4, ['fev1:1', 'fvc:3']);
  const all = Object.fromEntries(item.rows.map((r) => [r.id, item.key[r.id]]));
  assert.deepEqual(scoreChallenge(item, all).status, 'correct');
  const miss = { ...all, 'fev1:1': 'yes', 'fvc:2': 'no' };
  const r = scoreChallenge(item, miss);
  assert.equal(r.status, 'wrong');
  assert.deepEqual(r.perItem, { correct: 6, total: 8, fraction: 0.75, wrong: ['fev1:1', 'fvc:2'], wrongManeuvers: [2, 3] });
  assert.match(r.note, /6 of 8/);
  assert.match(r.note, /Maneuver 2, FEV₁/);
});

test('a missing row counts as wrong; an empty answer is unanswered; both variables of one maneuver give one wrong maneuver', () => {
  const item = rowsItem(2);
  const half = { 'fev1:0': 'yes', 'fvc:0': 'yes' };
  const r = scoreChallenge(item, half);
  assert.equal(r.status, 'wrong');
  assert.deepEqual(r.perItem.wrongManeuvers, [2]);
  assert.equal(r.perItem.fraction, 0.5);
  assert.equal(scoreChallenge(item, {}).status, 'unanswered');
  assert.equal(scoreChallenge(item, undefined).status, 'unanswered');
  const both = scoreChallenge(item, { 'fev1:0': 'yes', 'fvc:0': 'yes', 'fev1:1': 'no', 'fvc:1': 'no' });
  assert.deepEqual(both.perItem.wrongManeuvers, [2]);
  assert.equal(both.perItem.wrong.length, 2);
});

test('a single item is correct, wrong, unanswered, accepts further correct values and the key of the other equation', () => {
  const item = { id: 'gradePreFev1', stage: 1, title: 't', prompt: 'p', why: 'w', needsDetails: false, options: [['A', 'A'], ['B', 'B'], ['C', 'C']], key: 'B' };
  assert.equal(scoreChallenge(item, 'B').status, 'correct');
  assert.equal(scoreChallenge(item, 'C').status, 'wrong');
  assert.match(scoreChallenge(item, 'C').note, /key is “B”/);
  assert.equal(scoreChallenge(item, '').status, 'unanswered');
  assert.equal(scoreChallenge(item, null).status, 'unanswered');
  assert.equal(scoreChallenge({ ...item, alsoCorrect: ['C'] }, 'C').status, 'correct');
  assert.equal(scoreChallenge({ ...item, otherKey: 'A' }, 'A').status, 'other-equation');
  assert.equal(scoreChallenge({ ...item, otherKey: 'A' }, 'C').status, 'wrong');
});

test('a row item with its own further correct values and an other-equation key', () => {
  const item = {
    id: 'representativeLoopOk', stage: 1, title: 't', prompt: 'p', why: 'w', needsDetails: false,
    options: [['acceptable', 'Acceptable'], ['cough', 'Cough'], ['leak', 'Leak']],
    rows: [{ id: 'pre', label: 'Before' }, { id: 'post', label: 'After' }],
    key: { pre: 'cough', post: 'acceptable' }, alsoCorrect: { pre: ['leak'], post: [] },
  };
  assert.equal(scoreChallenge(item, { pre: 'leak', post: 'acceptable' }).status, 'correct');
  assert.equal(scoreChallenge(item, { pre: 'acceptable', post: 'acceptable' }).status, 'wrong');
  const bd = { ...item, id: 'bdInterpretable', rows: [{ id: 'response', label: 'Response' }, { id: 'interpretable', label: 'Interpretable' }], key: { response: 'significant', interpretable: 'yes' }, alsoCorrect: undefined, otherKey: { response: 'not-significant', interpretable: 'yes' } };
  assert.equal(scoreChallenge(bd, { response: 'not-significant', interpretable: 'yes' }).status, 'other-equation');
  assert.equal(scoreChallenge(bd, { response: 'significant', interpretable: 'yes' }).status, 'correct');
  assert.equal(scoreChallenge(bd, { response: 'not-significant', interpretable: 'no' }).status, 'wrong');
});

test('without the interpretation the bronchodilator item is omitted', () => {
  let tested = false;
  forEachCase(3, (c) => {
    if (tested || !c.spirometry.post) return;
    tested = true;
    const rt = buildRtReport(c);
    assert.ok(!buildChallenges(c, { rt, qualityChallenge: false }).some((i) => i.id === 'bdInterpretable'));
  });
  assert.ok(tested);
});
