import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadDatasets } from '../src/reference/load.js';
import { buildCase } from '../src/core/case.js';
import { BASELINE_DESCRIPTORS, hashCase } from '../tools/baseline-hashes.mjs';

const ds = await loadDatasets();
const stored = JSON.parse(fs.readFileSync(new URL('./fixtures/baseline-case-hashes.json', import.meta.url), 'utf8'));

test('50 cases built with scenario level none are byte-identical to the baseline commit (2ac98e3)', () => {
  assert.equal(stored.cases.length, 50);
  assert.equal(BASELINE_DESCRIPTORS.length, 50);
  stored.cases.forEach((row, i) => {
    const { sha256, ...descriptor } = row;
    assert.deepEqual(descriptor, BASELINE_DESCRIPTORS[i]);
    const c = buildCase(descriptor, ds);
    assert.equal(hashCase(c), sha256, `case ${i} (${row.archetype}, seed ${row.seed}) changed`);
    assert.equal(c.scenario.level, 'none');
    assert.equal('scenarioLevel' in c.descriptor, false);
    assert.equal('caveatIds' in c.anchorKey.key, false);
    assert.equal('caveatIds' in c.report, false);
  });
});

test('asking for level none explicitly changes nothing', () => {
  for (const row of stored.cases.slice(0, 10)) {
    const { sha256, ...descriptor } = row;
    assert.equal(hashCase(buildCase({ ...descriptor, scenarioLevel: 'none' }, ds)), sha256);
  }
});

test('a case with scenarios shares its demographics and true physiology with the plain case', () => {
  for (const row of stored.cases.slice(0, 20)) {
    const { sha256, ...descriptor } = row;
    const plain = buildCase(descriptor, ds);
    const s = buildCase({ ...descriptor, scenarioLevel: 'moderate' }, ds);
    assert.deepEqual(s.truth, plain.truth, 'true physiology is never edited');
    for (const k of ['age', 'sex', 'heightCm', 'weightKg', 'hbGdl', 'group', 'seed', 'archetype']) assert.equal(s.descriptor[k], plain.descriptor[k]);
  }
});
