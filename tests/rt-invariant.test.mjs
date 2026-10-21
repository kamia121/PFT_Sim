import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCase, interpret, resolveReference, ds, sampleInput, ARCHETYPES, deepFreeze } from './helpers/rt-cases.mjs';
import { buildRtReport, representativeFor } from '../src/core/rt-report.js';
import { buildChallenges } from '../src/challenges/index.js';

const inputs = ARCHETYPES.flatMap((a) => [3, 4, 5, 8, 11, 14].map((k) => sampleInput(a, k)));

test('the case and its key are byte-identical with and without the technologist report and the challenges', () => {
  for (const input of inputs) {
    const plain = buildCase(input, ds);
    const used = buildCase(input, ds);
    const keyPlain = JSON.stringify(interpret(plain.report, resolveReference, 'GLIglobal'));
    const before = JSON.stringify(used);
    const rt = buildRtReport(used);
    representativeFor(used);
    const interp = interpret(used.report, resolveReference, 'GLIglobal');
    for (const qualityChallenge of [false, true]) buildChallenges(used, { rt, interp, interpOther: interpret(used.report, resolveReference, 'GLI2012'), qualityChallenge });
    assert.equal(JSON.stringify(used), before, `${input.archetype} ${input.seed}: case changed`);
    assert.equal(JSON.stringify(plain), before, `${input.archetype} ${input.seed}: case differs from an untouched build`);
    assert.equal(JSON.stringify(interpret(used.report, resolveReference, 'GLIglobal')), keyPlain, `${input.archetype} ${input.seed}: key changed`);
  }
});

test('nothing is written to the case: a deeply frozen case gives the same report', () => {
  for (const input of inputs.filter((_, i) => i % 3 === 0)) {
    const c = buildCase(input, ds);
    const expected = JSON.stringify(buildRtReport(c));
    deepFreeze(c);
    const rt = buildRtReport(c);
    assert.equal(JSON.stringify(rt), expected);
    buildChallenges(c, { rt, interp: interpret(c.report, resolveReference, 'GLIglobal'), qualityChallenge: true });
  }
});

test('the report does not depend on what was built before it', () => {
  const cases = inputs.slice(0, 24).map((i) => buildCase(i, ds));
  const forward = cases.map((c) => JSON.stringify(buildRtReport(c)));
  const backward = cases.map((c) => c).reverse().map((c) => JSON.stringify(buildRtReport(c))).reverse();
  assert.deepEqual(backward, forward);
});

test('the report draws only from the stream labelled rt-report', () => {
  const src = readFileSync(new URL('../src/core/rt-report.js', import.meta.url), 'utf8');
  const calls = [...src.matchAll(/createStream\(([^)]*)\)/g)].map((m) => m[1].replace(/\s+/g, ' '));
  assert.ok(calls.length >= 1);
  for (const call of calls) assert.match(call, /'rt-report'\s*$/, call);
  assert.ok(!/Math\.random|Date\.now|new Date/.test(src), 'no source of nondeterminism');
});

test('the challenge modules draw nothing', () => {
  for (const f of ['index.js', 'items.js', 'score.js', 'visibility.js']) {
    const src = readFileSync(new URL(`../src/challenges/${f}`, import.meta.url), 'utf8');
    assert.ok(!/createStream|Math\.random|Date\.now|document\.|window\./.test(src), f);
  }
});
