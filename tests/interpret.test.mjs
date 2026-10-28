import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { interpret, compareEquations, labelOf, borderlineOf, severityOf } from '../src/interpret/interpret.js';

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/interpretation-cases.json', import.meta.url), 'utf8'));

// Linear fake reference: z = (x - pred) / sd, limits at +/-1.645 sd. Exact, so fixtures can state z-scores by construction.
function fakeResolve(measure, patient) {
  const { pred, sd } = fx.reference[measure];
  const out = { measure, equationId: 'FAKE', matched: true, fallbackReason: null, available: true, predicted: pred, lln: pred - 1.645 * sd, uln: pred + 1.645 * sd, z: null, percentPredicted: null };
  if (patient.measured !== undefined) { out.z = (patient.measured - pred) / sd; out.percentPredicted = (100 * patient.measured) / pred; }
  return out;
}

for (const c of fx.cases) {
  test(`[${c.branch}] ${c.name}`, () => {
    const r = interpret(c.report, fakeResolve, 'GLIglobal');
    const e = c.expect;
    if (e.pattern !== undefined) assert.equal(r.pattern, e.pattern);
    if (e.severity !== undefined) assert.equal(r.key.severity, e.severity);
    if (e.fev1WithinLimits !== undefined) assert.equal(r.severity.fev1WithinLimits, e.fev1WithinLimits);
    if (e.flags !== undefined) assert.deepEqual(r.flags.map((f) => f.id).sort(), [...e.flags].sort());
    if (e.dlco !== undefined) assert.equal(r.dlco.category, e.dlco);
    if (e.subtype !== undefined) assert.equal(r.dlco.subtype, e.subtype);
    if (e.bd !== undefined) assert.equal(r.key.bronchodilator, e.bd);
    if (e.rule2022 !== undefined) assert.equal(r.bd.rule2022.significant, e.rule2022);
    if (e.rule2005 !== undefined) assert.equal(r.bd.rule2005.significant, e.rule2005);
    if (e.qualityLimited !== undefined) assert.equal(r.qualityLimited, e.qualityLimited);
  });
}

test('labels use z-scores with the lower limit at -1.645, and borderline marks +/-0.25 z around a limit', () => {
  assert.equal(labelOf(-1.645), 'normal');
  assert.equal(labelOf(-1.646), 'low');
  assert.equal(labelOf(1.7), 'high');
  assert.equal(borderlineOf(-1.7), true);
  assert.equal(borderlineOf(-1.4), true);
  assert.equal(borderlineOf(-2.0), false);
  assert.equal(borderlineOf(0), false);
});

test('severity bands follow z -2.5 and -4.0', () => {
  assert.equal(severityOf(-2.5), 'mild');
  assert.equal(severityOf(-2.51), 'moderate');
  assert.equal(severityOf(-4.0), 'moderate');
  assert.equal(severityOf(-4.01), 'severe');
});

test('restrictive impairment is graded on TLC after the 2024 clarification', () => {
  const r = interpret(fx.cases.find((c) => c.name.startsWith('Restriction: preserved')).report, fakeResolve);
  assert.equal(r.severity.scored, true);
  assert.equal(r.severity.measure, 'tlc');
  assert.equal(r.key.severity, severityOf(r.measures.tlc.z));
});

test('equation comparison attributes a label change to the spirometry measurement that moved', () => {
  // Two fake equations that differ only in the FEV1/FVC predicted value.
  const resolve = (measure, patient, family) => {
    const base = fakeResolve(measure, patient);
    if (measure !== 'fev1_fvc' || family !== 'GLI2012') return { ...base, equationId: family };
    const shift = 0.03;
    const out = { ...base, equationId: family, predicted: base.predicted + shift, lln: base.lln + shift, uln: base.uln + shift };
    if (patient.measured !== undefined) out.z = (patient.measured - out.predicted) / fx.reference.fev1_fvc.sd;
    return out;
  };
  const report = { ...fx.cases[0].report, spirometry: { fev1: 3.8, fvc: 5.0, post: null } }; // ratio 0.76: z -1.17 under A, -0.67 under B: no flip
  const none = compareEquations(report, resolve);
  assert.equal(none.labelChanges.length, 0);
  const flip = compareEquations({ ...report, spirometry: { fev1: 3.585, fvc: 5.0, post: null } }, resolve); // ratio 0.717: z -1.38 (B) vs -1.88 (A)
  assert.deepEqual(flip.labelChanges.map((c) => [c.measure, c.from, c.to]), [['fev1_fvc', 'low', 'normal']]);
  assert.equal(flip.patternChanged, true);
  assert.deepEqual(flip.borderline, ['fev1_fvc']);
});
