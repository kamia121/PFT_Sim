import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { loadDatasets } from '../src/reference/load.js';
import { buildCase } from '../src/core/case.js';
import { GENERATOR_VERSION } from '../src/core/standards.js';
import { BASELINE_DESCRIPTORS, hashCase } from '../tools/baseline-hashes.mjs';

const ds = await loadDatasets();
const stored = JSON.parse(fs.readFileSync(new URL('./fixtures/versioned-case-hashes.json', import.meta.url), 'utf8'));

test('reviewed case snapshots are explicit for every supported generator; historical baseline stays unchanged', () => {
  const original = fs.readFileSync(new URL('./fixtures/baseline-case-hashes.json', import.meta.url));
  assert.equal(createHash('sha256').update(original).digest('hex'),stored.originalFixtureSha256);
  assert.deepEqual(Object.keys(stored.versions),['2','3','4','5']);
  assert.equal(Number(Object.keys(stored.versions).at(-1)),GENERATOR_VERSION,'the default generator must have a reviewed snapshot');
  for(const [version,rows] of Object.entries(stored.versions)) {
    assert.equal(rows.length,50);assert.equal(BASELINE_DESCRIPTORS.length,50);
    rows.forEach((row,i)=>{
      const {sha256,...descriptor}=row;
      assert.deepEqual(descriptor,BASELINE_DESCRIPTORS[i]);
      const c=buildCase({...descriptor,v:Number(version)},ds);
      assert.equal(hashCase(c),sha256,`v${version} case ${i} changed`);
      assert.equal(c.scenario.level,'none');assert.equal('scenarioLevel' in c.descriptor,false);
      assert.equal('caveatIds' in c.anchorKey.key,false);assert.equal('caveatIds' in c.report,false);
    });
  }
});

test('explicit scenario level none equals the plain case within each supported generator', () => {
 for(const [version,rows] of Object.entries(stored.versions)) for(const row of rows) {
   const {sha256,...descriptor}=row;
   const plain=buildCase({...descriptor,v:Number(version)},ds);
   const explicit=buildCase({...descriptor,v:Number(version),scenarioLevel:'none'},ds);
   assert.equal(hashCase(explicit),hashCase(plain));assert.equal(hashCase(explicit),sha256);
 }
});

test('a case with scenarios shares its demographics and true physiology with the plain case', () => {
  for (const row of stored.versions['5'].slice(0, 20)) {
    const { sha256, ...descriptor } = row;
    const plain = buildCase(descriptor, ds);
    const s = buildCase({ ...descriptor, scenarioLevel: 'moderate' }, ds);
    assert.deepEqual(s.truth, plain.truth, 'true physiology is never edited');
    for (const k of ['age', 'sex', 'heightCm', 'weightKg', 'hbGdl', 'group', 'seed', 'archetype']) assert.equal(s.descriptor[k], plain.descriptor[k]);
  }
});

test('versioned case regression hashes detect a measured-value change',()=>{
 const c=buildCase({v:5,seed:3,archetype:'normal'},ds), before=hashCase(c);
 c.report.spirometry.fev1+=.000001;
 assert.notEqual(hashCase(c),before);
});
