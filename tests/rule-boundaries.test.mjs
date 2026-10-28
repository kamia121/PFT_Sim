import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { interpret, labelOf, severityOf, compareEquations } from '../src/interpret/interpret.js';
import { zScore, valueAtZ } from '../src/reference/gli.js';
import { hbFactor, hbReferenceMultiplier, cohbReferenceMultiplier } from '../src/core/physiology.js';

const f = JSON.parse(fs.readFileSync(new URL('./fixtures/rule-boundaries.json', import.meta.url)));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('audit fixtures characterize strict label limits and continuous severity edges', () => {
  for (const [z, expected] of f.labels) assert.equal(labelOf(z), expected);
  for (const [z, expected] of f.severity) assert.equal(severityOf(z), expected);
});

test('hand LMS inputs exercise nonzero and zero L with inverse values', () => {
  for (const row of f.lms) {
    close(zScore(row.parameters, row.measured), row.z);
    close(valueAtZ(row.parameters, row.z), row.measured);
  }
  close(zScore({ L: 0, M: 4, S: 0.2 }, 4 * Math.E), 5);
});

const report = (pre, post) => ({
  patient: { age: 40, sex: 'F', heightCm: 170, weightKg: 65, group: 'White' },
  spirometry: { fev1: pre, fvc: 6, post: { fev1: post, fvc: 6 } }, volumes: null, dlco: null, grades: { fev1: 'A', fvc: 'A' },
});
const reference = (predicted) => (measure, patient, equation) => ({ available: true, predicted: measure === 'fev1' ? predicted : 6, z: equation === 'GLI2012' ? -2 : 0, equationId: equation, matched: true });

test('BDR uses predicted rather than baseline denominator and excludes exact 10 percent', () => {
  for (const row of f.bd) {
    const a = interpret(report(row.pre, row.post), reference(row.predicted));
    close(a.bd.pctPred.fev1, row.percentPredicted);
    close(a.bd.pctBase.fev1, row.percentBaseline);
    assert.equal(a.bd.rule2022.significant, row.significant2022);
  }
});

test('reference comparison changes computed labels without mutating any measured value', () => {
  const r = report(2, 2.5), before = structuredClone(r);
  const cmp = compareEquations(r, reference(5));
  assert.deepEqual(r, before);
  for (const k of ['fev1', 'fvc', 'fev1_fvc']) assert.equal(cmp.a.measures[k].value, cmp.b.measures[k].value);
  assert.ok(cmp.labelChanges.length);
});

test('normal FVC does not override an available low TLC in the existing interpretation engine', () => {
  const r = report(4, 4);
  r.volumes = { tlc: 4.5, rv: 1, vc: 3.5, frc: 2, erv: 1, ic: 2.5 };
  const resolve = (measure) => ({ available: true, predicted: 5, z: measure === 'tlc' ? -2 : 0, equationId: measure === 'tlc' ? 'GLI2021vol' : 'GLIglobal', matched: true });
  const a = interpret(r, resolve);
  assert.equal(a.measures.fvc.label, 'normal');
  assert.equal(a.pattern, 'restriction');
});

test('Hb predicted multiplier is reciprocal of measured adjustment; COHb starts above two', () => {
  for (const row of f.hb) {
    close(hbReferenceMultiplier(row.hb, row.sex, row.age), row.predictedMultiplier);
    close(hbFactor(row.hb, row.sex, row.age) * row.predictedMultiplier, 1);
  }
  for (const [cohb, expected] of f.cohb) {
    if (expected === null) assert.equal(cohbReferenceMultiplier(cohb), null);
    else close(cohbReferenceMultiplier(cohb), expected);
  }
});
