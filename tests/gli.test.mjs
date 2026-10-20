import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createReference, lms, valueAtZ, zScore, GROUP_TO_GLI2012 } from '../src/reference/gli.js';

const load = (f) => JSON.parse(fs.readFileSync(new URL(`../src/reference/data/${f}`, import.meta.url), 'utf8'));
const datasets = { GLI2012: load('gli2012.json'), GLIglobal: load('gli_global.json'), GLI2021vol: load('gli_volumes.json'), GLI2017tlco: load('gli_tlco.json') };
const { resolveReference } = createReference(datasets);

const lines = fs.readFileSync(new URL('./vectors/rspiro-vectors.csv', import.meta.url), 'utf8').trim().split('\n').slice(1);
const vectors = lines.map((l) => { const f = l.replaceAll('"', '').split(','); return { equation: f[0], eth: f[1], param: f[2], gender: Number(f[3]), age: Number(f[4]), h: Number(f[5]), pred: Number(f[6]), lln: Number(f[7]), z80: Number(f[8]) }; });
const MEASURE = { FEV1: 'fev1', FVC: 'fvc', FEV1FVC: 'fev1_fvc' };
const GROUP_BY_CODE = Object.fromEntries(Object.entries(GROUP_TO_GLI2012).map(([g, c]) => [c, g]));

// Ceiling set by the project physician: predicted values may differ from rspiro by up to 2%.
const CEILING = 0.02;
// Largest differences observed when the port was verified (2026-10-20). Any increase fails.
// GLI Global agrees with rspiro to floating-point precision. GLI-2012 differs by up to about 2e-4 relative
// because the workbook carries regression coefficients rounded to 3 to 6 decimals (for example a0 = -10.342 for male FEV1),
// while rspiro appears to use more precise values. Observed: predicted 2.07e-4, LLN 2.40e-4, z at 80% of predicted 1.70e-3.
const RECORDED = {
  GLIglobal: { rel: 1e-12, z: 1e-9 },
  GLI2012: { rel: 3e-4, z: 2.5e-3 },
};

test('predicted values, lower limits and z-scores agree with rspiro 0.5 on every vector', () => {
  const worst = { GLIglobal: { rel: 0, z: 0 }, GLI2012: { rel: 0, z: 0 } };
  for (const v of vectors) {
    const group = v.equation === 'GLI2012' ? GROUP_BY_CODE[v.eth] : 'White';
    const r = resolveReference(MEASURE[v.param], { age: v.age, sex: v.gender === 1 ? 'M' : 'F', heightCm: v.h, group }, v.equation);
    assert.equal(r.available, true);
    const w = worst[v.equation];
    w.rel = Math.max(w.rel, Math.abs(r.predicted - v.pred) / v.pred, Math.abs(r.lln - v.lln) / v.lln);
    // z is evaluated at the measured value 0.8 x rspiro's predicted, the same input the vector's z80 used.
    w.z = Math.max(w.z, Math.abs(zScore(r.lms, 0.8 * v.pred) - v.z80));
  }
  for (const [eq, w] of Object.entries(worst)) {
    assert.ok(w.rel < CEILING, `${eq}: relative difference ${w.rel} exceeds the 2% ceiling`);
    assert.ok(w.rel <= RECORDED[eq].rel, `${eq}: relative difference ${w.rel} exceeds recorded ${RECORDED[eq].rel}`);
    assert.ok(w.z <= RECORDED[eq].z, `${eq}: z difference ${w.z} exceeds recorded ${RECORDED[eq].z}`);
  }
});

test('z-score and value-at-z are inverses, and the median has z = 0', () => {
  const p = { L: 0.9, M: 4.2, S: 0.12 };
  for (const z of [-3, -1.645, 0, 1, 2.5]) assert.ok(Math.abs(zScore(p, valueAtZ(p, z)) - z) < 1e-12);
  assert.ok(Math.abs(zScore({ L: 0, M: 3, S: 0.1 }, 3)) < 1e-15);
  assert.ok(Math.abs(zScore({ L: 0, M: 3, S: 0.1 }, valueAtZ({ L: 0, M: 3, S: 0.1 }, 1.2)) - 1.2) < 1e-12);
});

test('volumes and TLCO fall back to the European equation for other groups, and say so', () => {
  const white = resolveReference('tlc', { age: 50, sex: 'M', heightCm: 178, group: 'White' });
  const black = resolveReference('tlc', { age: 50, sex: 'M', heightCm: 178, group: 'Black or African American' });
  assert.deepEqual([white.matched, white.fallbackReason], [true, null]);
  assert.deepEqual([black.matched, black.fallbackReason], [false, 'equation-derived-in-european-ancestry-only']);
  assert.equal(white.predicted, black.predicted);
  assert.equal(resolveReference('dlco', { age: 50, sex: 'F', heightCm: 165, group: 'Asian: Northeast' }).matched, false);
});

test('GLI Global ignores group; GLI-2012 uses it; both are matched for spirometry', () => {
  const a = resolveReference('fvc', { age: 40, sex: 'F', heightCm: 165, group: 'White' }, 'GLIglobal');
  const b = resolveReference('fvc', { age: 40, sex: 'F', heightCm: 165, group: 'Asian: Southeast' }, 'GLIglobal');
  assert.equal(a.predicted, b.predicted);
  const c = resolveReference('fvc', { age: 40, sex: 'F', heightCm: 165, group: 'White' }, 'GLI2012');
  const d = resolveReference('fvc', { age: 40, sex: 'F', heightCm: 165, group: 'Asian: Southeast' }, 'GLI2012');
  assert.ok(d.predicted < c.predicted);
  assert.ok(a.matched && d.matched);
});

test('ages outside the published range are reported, not extrapolated', () => {
  assert.equal(resolveReference('fvc', { age: 2.5, sex: 'M', heightCm: 90, group: 'White' }).available, false);
  assert.equal(resolveReference('tlc', { age: 85, sex: 'M', heightCm: 175, group: 'White' }).fallbackReason, 'age-outside-range');
  assert.equal(resolveReference('dlco', { age: 90, sex: 'M', heightCm: 175, group: 'White' }).available, true);
  assert.equal(resolveReference('dlco', { age: 90.5, sex: 'M', heightCm: 175, group: 'White' }).available, false);
});

test('spline interpolation is linear between the workbook rows', () => {
  const e = datasets.GLIglobal.measures.fev1.male;
  const a = lms(e, 'GLIglobal', { age: 40, heightCm: 175 }), b = lms(e, 'GLIglobal', { age: 40.25, heightCm: 175 }), mid = lms(e, 'GLIglobal', { age: 40.125, heightCm: 175 });
  assert.ok(mid.M > Math.min(a.M, b.M) - 1e-9 && mid.M < Math.max(a.M, b.M) + 1e-9);
});
