import test from 'node:test';
import assert from 'node:assert/strict';
import { solveCurve, volume, backExtrapolation, peakFlow, sampleCurve, flow } from '../src/core/curve.js';

const CASES = [
  { fvc: 4.2, fev1: 3.4, k: 0.9, r: 0.04, T: 10 },
  { fvc: 3.0, fev1: 1.2, k: 0.6, r: 0.04, T: 15 },
  { fvc: 5.1, fev1: 4.5, k: 1.1, r: 0.03, T: 8 },
  { fvc: 2.6, fev1: 1.3, k: 0.7, r: 0.2, T: 15 },
  { fvc: 1.8, fev1: 1.7, k: 1.0, r: 0.05, T: 6 },
];

test('FEV1 one second after the back-extrapolated zero and FVC at the end match their targets within 1 mL', () => {
  for (const p of CASES) {
    const { curve, clamped } = solveCurve(p);
    assert.equal(clamped, false);
    assert.ok(Math.abs(volume(curve, backExtrapolation(curve).t0 + 1) - p.fev1) < 0.001, JSON.stringify(p));
    assert.ok(Math.abs(volume(curve, p.T) - p.fvc) < 0.001, JSON.stringify(p));
  }
});

test('numerical integral of the plotted flow trace equals the tabulated FVC within 1 mL', () => {
  for (const p of CASES) {
    const { curve } = solveCurve(p);
    const { f } = sampleCurve(curve, 0.001);
    let area = 0;
    for (let i = 1; i < f.length; i++) area += 0.5 * (f[i] + f[i - 1]) * 0.001;
    assert.ok(Math.abs(area - p.fvc) < 0.001, `${JSON.stringify(p)} area ${area}`);
  }
});

test('peak flow search agrees with a dense scan, and flow is zero at the start', () => {
  for (const p of CASES) {
    const { curve } = solveCurve(p);
    let best = 0;
    for (let t = 0.0005; t < 3; t += 0.0005) best = Math.max(best, flow(curve, t));
    assert.ok(Math.abs(peakFlow(curve).pef - best) / best < 1e-4, JSON.stringify(p));
    assert.equal(flow(curve, 0), 0);
    assert.equal(volume(curve, 0), 0);
  }
});

test('a ratio the family cannot represent is clamped and flagged, not silently wrong', () => {
  const { clamped } = solveCurve({ fvc: 3, fev1: 3, k: 1, r: 0.04, T: 10 });
  assert.equal(clamped, true);
  assert.equal(solveCurve({ fvc: 3, fev1: 0.01, k: 1, r: 0.04, T: 10 }).clamped, true);
});

test('a slower start raises the back-extrapolated volume', () => {
  const fast = backExtrapolation(solveCurve({ fvc: 4, fev1: 3.2, k: 0.9, r: 0.03, T: 10 }).curve).bev;
  const slow = backExtrapolation(solveCurve({ fvc: 4, fev1: 3.2, k: 0.9, r: 0.25, T: 10 }).curve).bev;
  assert.ok(slow > 3 * fast);
});
