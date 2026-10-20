import test from 'node:test';
import assert from 'node:assert/strict';
import { createStream } from '../src/core/prng.js';

test('stream output is fixed for a fixed seed and name', () => {
  const a = createStream(12345, 'demographics');
  const first = Array.from({ length: 5 }, () => a.uniform());
  const b = createStream(12345, 'demographics');
  assert.deepEqual(Array.from({ length: 5 }, () => b.uniform()), first);
  // Frozen regression values recorded from this implementation (not an independent reference): any change here changes every case and needs a generator version increment.
  assert.deepEqual(first.map((x) => Math.round(x * 1e6) / 1e6), [0.927479, 0.39445, 0.379072, 0.570205, 0.867599]);
});

test('streams are independent of each other', () => {
  const a = createStream(7, 'maneuver-0');
  const b1 = createStream(7, 'maneuver-1');
  const expected = Array.from({ length: 4 }, () => b1.uniform());
  for (let i = 0; i < 50; i++) a.uniform();
  const b2 = createStream(7, 'maneuver-1');
  assert.deepEqual(Array.from({ length: 4 }, () => b2.uniform()), expected);
  assert.notDeepEqual(createStream(7, 'maneuver-0').uniform(), createStream(8, 'maneuver-0').uniform());
});

test('uniform draws lie in [0, 1) and normal draws have mean near 0 and sd near 1', () => {
  const r = createStream(99, 'moments');
  let sum = 0, sq = 0;
  const n = 100000;
  for (let i = 0; i < n; i++) {
    const u = r.uniform();
    assert.ok(u >= 0 && u < 1);
    const z = r.normal();
    sum += z; sq += z * z;
  }
  assert.ok(Math.abs(sum / n) < 0.02);
  assert.ok(Math.abs(Math.sqrt(sq / n - (sum / n) ** 2) - 1) < 0.02);
});
