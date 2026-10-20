import test from 'node:test';
import assert from 'node:assert/strict';
import { normQuantile, normCdf, truncatedNormal } from '../src/core/stats.js';

test('quantile and CDF are inverses and match known values', () => {
  assert.ok(Math.abs(normQuantile(0.975) - 1.959964) < 1e-5);
  assert.ok(Math.abs(normQuantile(0.05) + 1.644854) < 1e-5);
  for (const p of [0.001, 0.02, 0.3, 0.5, 0.8, 0.999]) assert.ok(Math.abs(normCdf(normQuantile(p)) - p) < 5e-7);
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-7);
});

test('truncated draws stay inside their bounds and cover the interval', () => {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 2000; i++) {
    const z = truncatedNormal((i + 0.5) / 2000, 0, 1, -2.5, -1.8);
    assert.ok(z >= -2.5 - 1e-6 && z <= -1.8 + 1e-6);
    min = Math.min(min, z); max = Math.max(max, z);
  }
  assert.ok(min < -2.45 && max > -1.85);
  assert.ok(truncatedNormal(0.5, 0, 1, -1.2) > -1.2);
});
