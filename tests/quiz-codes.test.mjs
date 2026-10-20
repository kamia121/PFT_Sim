import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHETYPES } from '../src/core/descriptor.js';
import {
  encodeExam, decodeExam, examDescriptors, encodeResults, decodeResults, extractToken, b64urlDecode, b64urlEncode, splitCodes, SKILLS, TOPICS,
} from '../src/quiz/codes.js';
import { shuffled, mixSeed } from '../src/quiz/shuffle.js';

const base = { n: 12, seed: 98765, archetypes: ARCHETYPES, scenario: 'moderate', technique: [60, 30, 10], panel: [80, 20], timeLimit: 45, shuffleSeed: 31337, equation: 'GLI2012', skills: SKILLS };

test('an exam code round-trips and carries no archetype name in plain or decoded text', () => {
  const code = encodeExam(base);
  assert.deepEqual(decodeExam(code), base);
  const decoded = b64urlDecode(code);
  for (const a of ARCHETYPES) { assert.ok(!code.includes(a)); assert.ok(!decoded.includes(a)); }
  assert.match(code, /^[A-Za-z0-9_-]+$/);
});

test('a subset of topics survives the code and a pasted link is accepted', () => {
  const sub = { ...base, archetypes: [...TOPICS.obstruction.archetypes, ...TOPICS.restriction.archetypes] };
  const code = encodeExam(sub);
  assert.deepEqual(decodeExam(code).archetypes.sort(), sub.archetypes.slice().sort());
  assert.equal(extractToken(`https://example.org/pft/quiz.html?x=${code}&l=5`), code);
  assert.deepEqual(decodeExam(`https://example.org/quiz.html?x=${code}`), decodeExam(code));
});

test('invalid exams and damaged codes are rejected with a clear error', () => {
  assert.throws(() => encodeExam({ ...base, n: 0 }), /number of cases/);
  assert.throws(() => encodeExam({ ...base, n: 41 }), /number of cases/);
  assert.throws(() => encodeExam({ ...base, archetypes: [] }), /topic/);
  assert.throws(() => encodeExam({ ...base, technique: [0, 0, 0] }), /technique/);
  assert.throws(() => encodeExam({ ...base, timeLimit: -1 }), /time limit/);
  assert.throws(() => decodeExam('not a code!'), RangeError);
  assert.throws(() => decodeExam(b64urlEncode('{"v":9}')), /different version/);
  assert.throws(() => decodeExam(b64urlEncode(JSON.stringify({ v: 1, g: 99 }))), /generator version/);
});

test('exam descriptors are deterministic, respect n and the archetype subset, and cover each topic once', () => {
  const a = examDescriptors(base), b = examDescriptors(base);
  assert.deepEqual(a, b);
  assert.equal(a.length, 12);
  const sub = { ...base, n: 6, archetypes: ['normal', 'obstruction', 'mixed'] };
  const d = examDescriptors(sub);
  assert.ok(d.every((x) => sub.archetypes.includes(x.archetype)));
  assert.deepEqual([...new Set(d.slice(0, 6).map((x) => x.archetype))].sort(), ['mixed', 'normal', 'obstruction']);
  assert.notDeepEqual(examDescriptors({ ...base, seed: 1 }).map((x) => x.seed), a.map((x) => x.seed));
  // technique and panel weights are honored
  const only = examDescriptors({ ...base, n: 20, technique: [0, 0, 100], panel: [0, 100] });
  assert.ok(only.every((x) => x.technique === 'poor' && x.panel === 'spirometry'));
  assert.ok(a.every((x) => x.scenarioLevel === 'moderate'));
  assert.ok(examDescriptors({ ...base, scenario: 'none' }).every((x) => x.scenarioLevel === undefined));
});

test('a results code round-trips, keeps non-ASCII names, and detects damage', () => {
  const examCode = encodeExam(base);
  const r = { exam: examCode, learnerSeed: 4242, name: 'Zoë Müller, "MD"', elapsed: 321.4, responses: [{ pattern: 'normal', limitations: ['o1', 'none'] }, {}] };
  const code = encodeResults(r);
  assert.deepEqual(decodeResults(code), { ...r, elapsed: 321 });
  const bytes = b64urlDecode(code);
  const tampered = b64urlEncode(bytes.replace('"normal"', '"mixed"'));
  assert.throws(() => decodeResults(tampered), /damaged/);
  assert.throws(() => decodeResults(code.slice(0, -6)), RangeError);
  assert.throws(() => decodeResults('hello world'), RangeError);
});

test('pasted text splits into several codes', () => {
  assert.deepEqual(splitCodes(' abc\ndef, ghi;jkl  '), ['abc', 'def', 'ghi', 'jkl']);
});

test('shuffles are deterministic permutations that depend on seed and name', () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual(shuffled(xs, 5, 'a'), shuffled(xs, 5, 'a'));
  assert.deepEqual(shuffled(xs, 5, 'a').slice().sort(), xs);
  assert.notDeepEqual(shuffled(xs, 5, 'a'), shuffled(xs, 6, 'a'));
  assert.notDeepEqual(shuffled(xs, 5, 'a'), shuffled(xs, 5, 'b'));
  assert.notEqual(mixSeed(1, 2), mixSeed(2, 1));
});
