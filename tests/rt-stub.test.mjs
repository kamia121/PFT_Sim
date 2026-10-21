import test from 'node:test';
import assert from 'node:assert/strict';
import { stubRtReport, stubChallenges } from './helpers/rt-stub.mjs';
import { buildCase, interpret, resolveReference, ds } from './helpers/rt-cases.mjs';
import { buildRtReport } from '../src/core/rt-report.js';
import { buildChallenges } from '../src/challenges/index.js';

const HONESTY = ['accurate', 'software', 'generic', 'optimistic', 'pessimistic', 'stale', 'silent'];

test('the stub report has the frozen RtReport shape', () => {
  const r = stubRtReport();
  assert.equal(r.version, 1);
  assert.ok(HONESTY.includes(r.honesty));
  assert.deepEqual(Object.keys(r).sort(), ['closing', 'detailsReasons', 'honesty', 'interpretationLines', 'needsDetails', 'qualityLines', 'representative', 'stated', 'truth', 'version']);
  assert.equal(r.closing, 'Official interpretation to follow.');
  assert.deepEqual(Object.keys(r.stated).sort(), ['dlco', 'pleth', 'post', 'pre']);
  assert.deepEqual(Object.keys(r.truth).sort(), ['dlco', 'pleth', 'post', 'pre']);
  assert.deepEqual(Object.keys(r.representative).sort(), ['dlco', 'pleth', 'post', 'pre']);
});

test('overrides merge plain objects and replace arrays and scalars', () => {
  const r = stubRtReport({ honesty: 'silent', qualityLines: [], stated: { post: null }, representative: { pre: { kind: 'best', faults: [] } } });
  assert.equal(r.honesty, 'silent');
  assert.deepEqual(r.qualityLines, []);
  assert.equal(r.stated.post, null);
  assert.deepEqual(r.stated.pre, { fev1: 'A', fvc: 'A' });
  assert.deepEqual(r.representative.pre, { index: 2, kind: 'best', faults: [] });
  assert.notEqual(stubRtReport().stated, stubRtReport().stated, 'each call returns fresh objects');
});

test('stub challenges have the frozen Challenge shape and distinct ids', () => {
  const items = stubChallenges();
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  for (const i of items) {
    for (const f of ['id', 'title', 'prompt', 'options', 'key', 'why', 'needsDetails', 'stage']) assert.ok(f in i, `${i.id} has ${f}`);
    assert.ok(i.options.every(([v, l]) => typeof v === 'string' && typeof l === 'string'));
    if (i.rows) assert.deepEqual(Object.keys(i.key).sort(), i.rows.map((r) => r.id).sort());
    else assert.ok(i.options.some(([v]) => v === i.key), `${i.id} key is an option`);
  }
});

const REAL_CASE = { seed: 8, archetype: 'bd-discordant', technique: 'poor', scenarioLevel: 'moderate' };

test('the stub report has the keys of a real report', () => {
  const real = buildRtReport(buildCase(REAL_CASE, ds));
  const stub = stubRtReport();
  assert.deepEqual(Object.keys(stub).sort(), Object.keys(real).sort());
  for (const part of ['stated', 'truth', 'representative']) assert.deepEqual(Object.keys(stub[part]).sort(), Object.keys(real[part]).sort(), part);
  assert.deepEqual(Object.keys(stub.truth.pre), Object.keys(real.truth.pre));
  assert.deepEqual(Object.keys(stub.truth.dlco), Object.keys(real.truth.dlco));
  assert.deepEqual(Object.keys(stub.representative.pre), Object.keys(real.representative.pre));
});

test('the stub challenges have the ids and fields of real challenges', () => {
  const c = buildCase(REAL_CASE, ds);
  const items = buildChallenges(c, { rt: buildRtReport(c), interp: interpret(c.report, resolveReference, 'GLIglobal'), qualityChallenge: true });
  const stub = stubChallenges();
  assert.deepEqual(stub.map((i) => i.id).sort(), items.map((i) => i.id).sort());
  for (const real of items) {
    const s = stub.find((i) => i.id === real.id);
    for (const f of ['id', 'title', 'prompt', 'options', 'key', 'why', 'needsDetails', 'stage']) assert.equal(typeof s[f], typeof real[f], `${real.id}.${f}`);
    assert.equal(Boolean(s.rows), Boolean(real.rows), `${real.id} rows`);
    if (real.rows && !/^acceptable/.test(real.id)) assert.deepEqual(s.rows.map((r) => r.id).sort(), real.rows.map((r) => r.id).sort(), `${real.id} row ids`);
  }
});
