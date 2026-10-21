import test from 'node:test';
import assert from 'node:assert/strict';
import { createStage, showStatement, canCheck, check, openDetails, setQualityChallenge, qualityAnswersLocked, fallbackVisibility } from '../src/app/stage.js';
import { parseAddress, buildSearch } from '../src/app/address.js';
import { encodeCase, decodeCase } from '../src/core/code.js';
import { serializeDescriptor, parseDescriptor } from '../src/core/descriptor.js';
import { visibility as planVisibility } from './helpers/practice-visibility.mjs';
import { loadOptionalModules } from '../src/app/modules.js';
import { emptyResponses, applyChange, collectEntries, answerFor, isMultiItem, isStatementItem, challengeField } from '../src/app/collect.js';

test('stage machine, challenge off: answers can be checked at once, and checking is final', () => {
  let s = createStage({ qualityChallenge: false });
  assert.equal(s.stage, 1);
  assert.equal(canCheck(s), true);
  assert.equal(showStatement(s), s, 'there is no statement step without the challenge');
  s = check(s, { scored: true });
  assert.deepEqual([s.stage, s.scored], [3, true]);
  assert.equal(check(s, { scored: false }), s, 'a checked state does not change');
  assert.equal(setQualityChallenge(s, true), s, 'the setting waits for the next case once checked');
});

test('stage machine, challenge on: the statement comes before a scored check', () => {
  let s = createStage({ qualityChallenge: true });
  assert.equal(canCheck(s), false);
  assert.equal(check(s, { scored: true }), s, 'a scored check is refused at stage 1');
  assert.equal(qualityAnswersLocked(s), false);
  s = showStatement(s);
  assert.equal(s.stage, 2);
  assert.equal(qualityAnswersLocked(s), true);
  assert.equal(showStatement(s), s);
  assert.equal(canCheck(s), true);
  assert.equal(check(s, { scored: true }).stage, 3);
  // The key can always be shown without scoring.
  const k = check(createStage({ qualityChallenge: true }), { scored: false });
  assert.deepEqual([k.stage, k.scored], [3, false]);
});

test('opening page 2 is recorded only while answers are open', () => {
  let s = createStage();
  assert.equal(s.detailsOpened, false);
  s = openDetails(s);
  assert.equal(s.detailsOpened, true);
  const late = openDetails(check(createStage(), { scored: true }));
  assert.equal(late.detailsOpened, false, 'opening after the check does not count');
  const kept = check(s, { scored: true });
  assert.equal(kept.detailsOpened, true, 'the record survives the check');
});

test('changing the quality challenge before the check restarts the stages', () => {
  let s = showStatement(createStage({ qualityChallenge: true }));
  s = setQualityChallenge(s, false);
  assert.deepEqual([s.qualityChallenge, s.stage], [false, 1]);
  assert.equal(setQualityChallenge(s, false), s);
});

test('the page fallback visibility agrees with the plan rule in every mode and stage', () => {
  for (const qualityChallenge of [false, true]) for (const stage of [1, 2, 3]) {
    assert.deepEqual(fallbackVisibility({ qualityChallenge, stage }), planVisibility({ qualityChallenge, stage }), `qc ${qualityChallenge} stage ${stage}`);
  }
  assert.equal(fallbackVisibility({ qualityChallenge: true, stage: 1 }).showQualityLines, false);
  assert.equal(fallbackVisibility({ qualityChallenge: true, stage: 1 }).showGradeColumns, false);
  assert.equal(fallbackVisibility({ qualityChallenge: false, stage: 1 }).showQualityLines, true);
});

test('address: qc, flags and equation ride beside the case without changing it', () => {
  const d = parseDescriptor('v=2&s=12&a=obstruction&t=fair');
  const query = serializeDescriptor(d);
  const plain = buildSearch({ query });
  assert.equal(plain, `?c=${encodeCase(query)}`, 'defaults leave the address short');
  const full = buildSearch({ query, equation: 'GLI2012', qualityChallenge: true, flags: 'none' });
  const a = parseAddress(full);
  assert.deepEqual([a.kind, a.equation, a.qualityChallenge, a.flags], ['code', 'GLI2012', true, 'none']);
  assert.equal(parseDescriptor(decodeCase(a.code)).seed, 12);
  const b = parseAddress(plain);
  assert.deepEqual([b.equation, b.qualityChallenge, b.flags], [null, false, 'lln']);
  // The same case with and without the settings has the same descriptor code.
  assert.equal(parseAddress(full).code, parseAddress(plain).code);
});

test('address: plain descriptor links keep working and the settings never reach the descriptor parser', () => {
  const search = `?${serializeDescriptor(parseDescriptor('v=2&s=44&a=mixed&p=spirometry'))}&qc=1&eq=GLI2012&flags=none`;
  const a = parseAddress(search);
  assert.equal(a.kind, 'plain');
  assert.doesNotMatch(a.plainQuery, /qc=|eq=|flags=/);
  assert.equal(parseDescriptor(a.plainQuery).archetype, 'mixed');
  assert.equal(a.qualityChallenge, true);
  assert.match(buildSearch({ query: serializeDescriptor(parseDescriptor(a.plainQuery)), mode: 'plain', qualityChallenge: true }), /&qc=1$/);
  assert.equal(parseAddress('?qc=1').kind, null);
  assert.equal(parseAddress('?c=abc&eq=bogus&qc=0&flags=weird').equation, null);
  assert.equal(parseAddress('?c=abc&qc=0&flags=weird').flags, 'lln');
});

test('optional modules: a missing or incomplete module leaves its functions null', async () => {
  const ok = (o) => () => Promise.resolve(o);
  const fail = () => Promise.reject(new Error('404'));
  const mods = await loadOptionalModules({
    summary: ok({ summarySheetHtml: () => '' }),
    details: fail,
    rt: ok({ buildRtReport: () => ({}) }),
    challenges: ok({ buildChallenges: () => [] }),
    visibility: ok({ visibility: () => ({}) }),
  });
  assert.equal(typeof mods.summarySheetHtml, 'function');
  assert.equal(mods.detailsSheetHtml, null);
  assert.equal(mods.scoreChallenge, null, 'a module that lacks one of its functions is treated as missing');
  assert.equal(mods.buildChallenges, null);
  assert.deepEqual(mods.missing, ['challenges', 'details']);
});

test('responses: radio, checkbox group and impression changes', () => {
  let r = emptyResponses();
  r = applyChange(r, { name: 'pattern', value: 'obstruction' });
  r = applyChange(r, { name: challengeField('grade'), value: 'B' });
  r = applyChange(r, { name: challengeField('accept'), type: 'checkbox', value: '2', checkedValues: ['1', '2'] });
  r = applyChange(r, { name: 'impression', value: 'Obstruction.' });
  assert.deepEqual(r, { structured: { pattern: 'obstruction' }, challenge: { grade: 'B', accept: ['1', '2'] }, impression: 'Obstruction.' });
  const cleared = applyChange(r, { name: challengeField('accept'), type: 'checkbox', value: '1', checkedValues: [] });
  assert.deepEqual(cleared.challenge.accept, [], 'unchecking every box is an answer (none), not a missing one');
  assert.equal(emptyResponses().structured !== emptyResponses().structured, true, 'each call gives fresh objects');
});

test('responses: answers handed to scoring, with the multi-answer item recognised three ways', () => {
  const multi = { id: 'accept', key: ['1'], options: [['1', 'Maneuver 1']] };
  const multiFlag = { id: 'x', multi: true, key: 'a' };
  const single = { id: 'grade', key: 'A' };
  assert.deepEqual([isMultiItem(multi), isMultiItem(multiFlag), isMultiItem({ id: 'y', type: 'multi' }), isMultiItem(single)], [true, true, true, false]);
  const r = collectEntries([['pattern', 'normal'], ['ch:accept', '1'], ['ch:accept', '3'], ['ch:grade', 'C'], ['impression', 'text']]);
  assert.deepEqual(r.challenge.accept, ['1', '3']);
  assert.equal(r.structured.pattern, 'normal');
  assert.deepEqual(answerFor(multi, r), ['1', '3']);
  assert.equal(answerFor(single, r), 'C');
  assert.equal(answerFor({ id: 'untouched', key: 'x' }, r), null);
  assert.deepEqual(answerFor(multi, collectEntries([['ch:accept', '2']])), ['2'], 'one checked box still gives a list');
  assert.equal(challengeField('a'), 'ch:a');
});

test('the item that needs the statement is recognised by id, stage or flag', () => {
  assert.equal(isStatementItem({ id: 'statement-consistent' }), true);
  assert.equal(isStatementItem({ id: 'consistency' }), true);
  assert.equal(isStatementItem({ id: 'q', stage: 2 }), true);
  assert.equal(isStatementItem({ id: 'q', needsStatement: true }), true);
  assert.equal(isStatementItem({ id: 'grade-fev1-pre' }), false);
});
