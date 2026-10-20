import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDescriptor, serializeDescriptor, parseDescriptor, deriveDemographics } from '../src/core/descriptor.js';

test('a bare link of version, seed and archetype reproduces the same case', () => {
  const d = resolveDescriptor({ seed: 2024, archetype: 'obstruction' });
  const q = serializeDescriptor(d);
  assert.equal(q, `v=${d.v}&s=2024&a=obstruction`);
  assert.deepEqual(parseDescriptor(q), d);
});

test('only overridden fields enter the link, and they round-trip', () => {
  const base = resolveDescriptor({ seed: 5, archetype: 'normal' });
  const d = resolveDescriptor({ seed: 5, archetype: 'mixed', age: base.age === 50 ? 51 : 50, technique: 'poor', severity: 3 });
  const q = new URLSearchParams(serializeDescriptor(d));
  assert.deepEqual([...q.keys()].sort(), ['a', 'ag', 's', 'sv', 't', 'v']);
  assert.deepEqual(parseDescriptor(q.toString()), d);
});

test('demographics are a pure function of the seed and stay in range', () => {
  for (let seed = 0; seed < 2000; seed++) {
    const a = deriveDemographics(seed);
    assert.deepEqual(a, deriveDemographics(seed));
    assert.ok(a.age >= 18 && a.age <= 80 && a.heightCm >= 140 && a.heightCm <= 205 && a.hbGdl >= 7 && a.hbGdl <= 19);
  }
});

test('archetype changes BMI and hemoglobin only, never the other demographic fields', () => {
  for (let seed = 0; seed < 300; seed++) {
    const n = deriveDemographics(seed, 'normal'), o = deriveDemographics(seed, 'obesity-low-erv'), a = deriveDemographics(seed, 'anemia');
    for (const k of ['age', 'sex', 'heightCm', 'group']) { assert.equal(o[k], n[k]); assert.equal(a[k], n[k]); }
    assert.ok(o.weightKg / (o.heightCm / 100) ** 2 >= 34.5);
    assert.ok(a.hbGdl >= 7 && a.hbGdl <= 9);
    assert.equal(o.hbGdl, n.hbGdl);
    assert.equal(a.weightKg, n.weightKg);
  }
});

test('bad links fail loudly', () => {
  assert.throws(() => parseDescriptor('v=1&a=normal'), /seed/);
  assert.throws(() => parseDescriptor('v=99&s=1&a=normal'), /generator version/);
  assert.throws(() => parseDescriptor('v=1&s=1&a=bogus'), /archetype/);
  assert.throws(() => parseDescriptor('v=1&s=-3&a=normal'), /seed/);
  assert.throws(() => parseDescriptor('v=1&s=1&a=normal&h=3000'), /heightCm/);
});
