import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const text = fs.readFileSync(new URL('./vectors/rspiro-vectors.csv', import.meta.url), 'utf8').trim().split('\n');
const header = text[0].split(',').map((h) => h.replaceAll('"', ''));
const rows = text.slice(1).map((line) => Object.fromEntries(line.split(',').map((v, i) => [header[i], v.replaceAll('"', '')])));

test('the rspiro vector file has the expected shape and no missing values', () => {
  assert.deepEqual(header, ['equation', 'ethnicity', 'param', 'gender', 'age', 'height_cm', 'pred', 'lln', 'z80']);
  assert.equal(rows.length, 2664);
  const keys = new Set(rows.map((r) => [r.equation, r.ethnicity, r.param, r.gender, r.age, r.height_cm].join('|')));
  assert.equal(keys.size, rows.length, 'duplicate grid points');
  for (const r of rows) for (const f of ['pred', 'lln', 'z80']) assert.ok(Number.isFinite(Number(r[f])), `${f} missing in ${JSON.stringify(r)}`);
  const counts = {};
  for (const r of rows) counts[`${r.equation}|${r.ethnicity}`] = (counts[`${r.equation}|${r.ethnicity}`] ?? 0) + 1;
  assert.deepEqual(Object.keys(counts).sort(), ['GLI2012|1', 'GLI2012|2', 'GLI2012|3', 'GLI2012|4', 'GLI2012|5', 'GLIglobal|NA']);
  assert.ok(Object.values(counts).every((n) => n === 444));
});

test('vectors are internally coherent: LLN below predicted and a value at 80% of predicted has a negative z-score', () => {
  for (const r of rows) {
    const pred = Number(r.pred), lln = Number(r.lln), z = Number(r.z80);
    assert.ok(pred > lln && lln > 0);
    assert.ok(z < 0);
  }
});

test('the validation note records the package\'s lower-limit convention of z = -1.645', () => {
  const note = fs.readFileSync(new URL('./vectors/rspiro-validation.txt', import.meta.url), 'utf8');
  assert.match(note, /-1\.645/);
});
