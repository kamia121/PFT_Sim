import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateManeuver, summarizeSession } from '../src/core/quality.js';

const good = (fvc, fev1, extra = {}) => ({ fvc, fev1, pef: 8, fef2575: 3, fet: 7, bev: 0.03, plateau: 0.01, faults: [], ...extra });

test('hand-built maneuvers are classified by the start-of-test and end-of-test criteria', () => {
  assert.equal(evaluateManeuver(good(4, 3.2)).acceptable, true);
  assert.equal(evaluateManeuver(good(4, 3.2, { bev: 0.25 })).usable, false);
  assert.equal(evaluateManeuver(good(4, 3.2, { faults: ['cough'] })).usable, false);
  const noPlateau = evaluateManeuver(good(4, 3.2, { plateau: 0.2, fet: 6 }));
  assert.deepEqual([noPlateau.usable, noPlateau.acceptable], [true, false]);
  assert.equal(evaluateManeuver(good(4, 3.2, { plateau: 0.2, fet: 15 })).acceptable, true);
  // Limit is the larger of 5% of FVC and 0.100 L.
  assert.equal(evaluateManeuver(good(4, 3.2, { bev: 0.19 })).usable, true);
  assert.equal(evaluateManeuver(good(1.5, 1.2, { bev: 0.09 })).usable, true);
  assert.equal(evaluateManeuver(good(1.5, 1.2, { bev: 0.11 })).usable, false);
});

test('reported values are the largest acceptable FVC and FEV1 taken separately', () => {
  const s = summarizeSession([good(4.0, 3.30), good(4.1, 3.2), good(3.95, 3.25)]);
  assert.equal(s.fvc, 4.1);
  assert.equal(s.fev1, 3.3);
  assert.ok(Math.abs(s.ratio - 3.3 / 4.1) < 1e-12);
});

test('grades follow the number of acceptable maneuvers and the spread of the two largest', () => {
  assert.equal(summarizeSession([good(4, 3.2), good(4.05, 3.22), good(4.02, 3.2)]).grade, 'A');
  assert.equal(summarizeSession([good(4, 3.2), good(4.05, 3.22)]).grade, 'B');
  assert.equal(summarizeSession([good(4, 3.2), good(4.18, 3.22), good(3.9, 3)]).grade, 'C');
  assert.equal(summarizeSession([good(4, 3.2), good(4.23, 3.22)]).grade, 'D');
  assert.equal(summarizeSession([good(4, 3.2), good(4.4, 3.22)]).grade, 'E');
  assert.equal(summarizeSession([good(4, 3.2)]).grade, 'E');
  assert.equal(summarizeSession([good(4, 3.2, { plateau: 0.3, fet: 5 })]).grade, 'U');
  assert.equal(summarizeSession([good(4, 3.2, { bev: 0.5 })]).grade, 'F');
});
