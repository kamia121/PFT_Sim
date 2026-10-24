import test from 'node:test';
import assert from 'node:assert/strict';
import { interpret, severityOf, severityAlso } from '../src/interpret/interpret.js';
import { summarizeSession, evaluateManeuver } from '../src/core/quality.js';
import { conciseSummary, conciseText } from '../src/report/concise.js';

const r = () => ({ patient: { age: 40, sex: 'F', heightCm: 170, weightKg: 65, group: 'White' }, spirometry: { fev1: 3, fvc: 4, post: null }, volumes: { tlc: 6, rv: 2, vc: 4, frc: 3, erv: 1, ic: 3 }, dlco: { dlcoAdjusted: 20, va: 5 }, grades: { fev1: 'A', fvc: 'A' } });
const resolve = (zs) => (measure) => ({ available: true, predicted: 4, z: zs[measure] ?? 0, equationId: 'test-only-linear-oracle', matched: true });
const maneuver = (fvc, fev1 = fvc - 0.5, extra = {}) => ({ fvc, fev1, pef: 8, fef2575: 3, fet: 7, bev: 0.03, plateau: 0.01, coughFirstSecond: false, glottisClosedAt: null, ...extra });

test('low ratio / normal FEV1 remains mild obstruction; restriction uses TLC, not FEV1', () => {
  const a = interpret(r(), resolve({ fev1_fvc: -2 }));
  assert.equal(a.pattern, 'obstruction'); assert.equal(a.key.severity, 'mild'); assert.equal(a.severity.measure, 'fev1');
  const b = interpret(r(), resolve({ tlc: -3, fev1: -5 }));
  assert.equal(b.pattern, 'restriction'); assert.equal(b.key.severity, 'moderate'); assert.equal(b.severity.measure, 'tlc');
  const text = conciseText(conciseSummary({ caseData: { report: r(), spirometry: {}, dlco: {} }, interp: b }));
  assert.match(text, /moderate by the TLC/); assert.doesNotMatch(text, /not graded|moderate by the FEV/);
});

test('continuous severity bins have no rounded-prose gaps and no obsolete normal-FEV1 alternative', () => {
  for (const [z, expected] of [[-2.499999, 'mild'], [-2.5, 'mild'], [-2.500001, 'moderate'], [-3.999999, 'moderate'], [-4, 'moderate'], [-4.000001, 'severe'], [-4.05, 'severe']]) assert.equal(severityOf(z), expected);
  assert.deepEqual(severityAlso({ scored: true, id: 'mild', z: -1.645 }), []);
  assert.deepEqual(severityAlso({ scored: true, id: 'severe', z: -4.05 }), []);
});

test('DLCO impairment is graded independently of a normal ventilatory pattern', () => {
  const a = interpret(r(), resolve({ dlco: -3, va: -2, kco: 0 }));
  assert.equal(a.pattern, 'normal'); assert.equal(a.dlco.category, 'reduced'); assert.equal(a.dlco.severity, 'moderate');
  assert.equal(a.dlco.subtype, 'low-va-normal-kco');
  assert.match(a.dlco.severityVerification, /2024/);
});

test('large TLC and large RV alone do not establish hyperinflation or gas trapping', () => {
  const a = interpret(r(), resolve({ tlc: 2, rv: 2 }));
  assert.ok(!a.flags.some((f) => ['hyperinflation', 'air-trapping'].includes(f.id)));
  assert.ok(a.flags.some((f) => f.id === 'high-tlc'));
  const b = interpret(r(), resolve({ tlc: 2, rv_tlc: 2 }));
  assert.ok(!b.flags.some((f) => f.id === 'hyperinflation'));
  assert.match(b.flags.find((f) => f.id === 'possible-hyperinflation').text, /FRC\/TLC reference is unavailable/);
  const c = interpret(r(), resolve({ tlc: -2, rv_tlc: 2 }));
  assert.ok(!c.flags.some((f) => f.id === 'air-trapping'));
  assert.ok(c.flags.some((f) => f.id === 'high-rv-tlc'));
});

test('decimal 150mL spread/EOFE equality survives binary arithmetic without rounding measurements', () => {
  const values = [maneuver(3.45), maneuver(3.30)];
  const before = structuredClone(values);
  const s = summarizeSession(values); assert.equal(s.grades.fvc, 'B'); assert.equal(s.repeatable, true);
  assert.equal(evaluateManeuver(maneuver(3.30, 2.8, { plateau: 0.1, fet: 7 }), 3.45).fvc.acceptable, true);
  assert.equal(summarizeSession([maneuver(3.45), maneuver(3.30 - 1e-10)]).grades.fvc, 'C');
  assert.deepEqual(values, before);
});

test('decimal exact 10 percent BDR is negative despite subtraction representation', () => {
  const report = r(); report.spirometry = { fev1: 1, fvc: 4, post: { fev1: 1.1, fvc: 4 } };
  const ref = (measure) => ({ available: true, predicted: measure === 'fev1' ? 1 : 4, z: 0, matched: true });
  const a = interpret(report, ref); assert.equal(a.bd.pctPred.fev1, 10); assert.equal(a.bd.rule2022.significant, false);
  report.spirometry.post.fev1 = 1.100000001;
  assert.equal(interpret(report, ref).bd.rule2022.significant, true);
});

test('a missing or invalid reference-sex input is rejected, not silently treated as female', async () => {
  const { loadDatasets } = await import('../src/reference/load.js');
  const { createReference } = await import('../src/reference/gli.js');
  const ref = createReference(await loadDatasets()).resolveReference;
  for (const sex of [undefined, null, '', 'X', 'woman']) assert.throws(() => ref('fev1', { ...r().patient, sex }), /Reference sex input/);
  assert.ok(ref('fev1', r().patient).available);
});
