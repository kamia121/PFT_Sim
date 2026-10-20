import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateManeuver, summarizeSession } from '../src/core/quality.js';

const m = (fvc, fev1, extra = {}) => ({ fvc, fev1, pef: 8, fef2575: 3, fet: 7, bev: 0.03, plateau: 0.01, coughFirstSecond: false, glottisClosedAt: null, ...extra });

test('Table 7: cough in the first second spoils FEV1 but not FVC', () => {
  const e = evaluateManeuver(m(4, 3.2, { coughFirstSecond: true }));
  assert.deepEqual([e.fev1.acceptable, e.fvc.acceptable, e.fvc.usable], [false, true, true]);
});

test('Table 7: glottic closure in the first second spoils both; later closure spoils FVC only', () => {
  const early = evaluateManeuver(m(4, 3.2, { glottisClosedAt: 0.6 }));
  assert.deepEqual([early.fev1.usable, early.fvc.usable], [false, false]);
  const late = evaluateManeuver(m(4, 3.2, { glottisClosedAt: 3 }));
  assert.deepEqual([late.fev1.acceptable, late.fvc.acceptable, late.fvc.usable], [true, false, true]);
});

test('Table 7: BEV limit is the larger of 5% of FVC and 0.100 L and applies to both variables', () => {
  assert.equal(evaluateManeuver(m(4, 3.2, { bev: 0.19 })).fev1.usable, true);
  assert.equal(evaluateManeuver(m(4, 3.2, { bev: 0.21 })).fev1.usable, false);
  assert.equal(evaluateManeuver(m(1.5, 1.2, { bev: 0.09 })).fvc.usable, true);
  const bad = evaluateManeuver(m(1.5, 1.2, { bev: 0.11 }));
  assert.deepEqual([bad.fev1.usable, bad.fvc.usable], [false, false]);
});

test('Table 7: FVC needs a plateau, FET of 15 s, or an FVC within 0.150 L of the largest FVC in the set; FEV1 does not', () => {
  const noPlateau = m(3.5, 2.8, { plateau: 0.2, fet: 6 });
  const e = evaluateManeuver(noPlateau, 4.0);
  assert.deepEqual([e.fvc.acceptable, e.fvc.usable, e.fev1.acceptable], [false, true, true]);
  assert.equal(evaluateManeuver(m(3.9, 2.8, { plateau: 0.2, fet: 6 }), 4.0).fvc.acceptable, true);
  assert.equal(evaluateManeuver(m(3.5, 2.8, { plateau: 0.2, fet: 15 }), 4.0).fvc.acceptable, true);
});

test('reported values are the largest acceptable FVC and FEV1, taken separately', () => {
  const s = summarizeSession([m(4.0, 3.30), m(4.1, 3.2), m(3.95, 3.25)]);
  assert.equal(s.fvc, 4.1);
  assert.equal(s.fev1, 3.3);
  assert.ok(Math.abs(s.ratio - 3.3 / 4.1) < 1e-12);
});

test('Table 10: grades follow the count of acceptable maneuvers and the spread of the two largest', () => {
  const grade = (list) => summarizeSession(list).grades;
  assert.deepEqual(grade([m(4, 3.2), m(4.05, 3.22), m(4.02, 3.2)]), { fev1: 'A', fvc: 'A' });
  assert.deepEqual(grade([m(4, 3.2), m(4.05, 3.22)]), { fev1: 'B', fvc: 'B' });
  assert.deepEqual(grade([m(4, 3.2), m(4.18, 3.22), m(3.9, 3)]), { fev1: 'A', fvc: 'C' });
  assert.deepEqual(grade([m(4, 3.2), m(4.23, 3.22)]), { fev1: 'B', fvc: 'D' });
  assert.deepEqual(grade([m(4, 3.2), m(4.4, 3.22)]).fvc, 'E');
  assert.deepEqual(grade([m(4, 3.2)]), { fev1: 'E', fvc: 'E' });
});

test('Table 10: FEV1 and FVC are graded separately, and U and F need zero acceptable', () => {
  // Three cough-in-first-second maneuvers: FVC stays acceptable, FEV1 has none acceptable and none usable.
  const s = summarizeSession([m(4, 3.2, { coughFirstSecond: true }), m(4.05, 3.2, { coughFirstSecond: true }), m(4.02, 3.2, { coughFirstSecond: true })]);
  assert.deepEqual(s.grades, { fev1: 'F', fvc: 'A' });
  assert.equal(s.fev1, null);
  // Usable but not acceptable FVC (late glottic closure): grade U.
  const u = summarizeSession([m(4, 3.2, { glottisClosedAt: 3 })]);
  assert.deepEqual(u.grades, { fev1: 'E', fvc: 'U' });
  assert.equal(u.fvc, 4);
});
