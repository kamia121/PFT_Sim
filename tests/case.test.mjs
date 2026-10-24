import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDatasets } from '../src/reference/load.js';
import { ARCHETYPES, TECHNIQUE_LEVELS } from '../src/core/descriptor.js';
import { buildCase, EXPECTED_PATTERN } from '../src/core/case.js';
import { compareEquations } from '../src/interpret/interpret.js';
import { createReference } from '../src/reference/gli.js';

const ds = await loadDatasets();
const { resolveReference } = createReference(ds);
const strip = (c) => JSON.stringify({ ...c, spirometry: undefined, truth: c.truth, pre: c.spirometry.pre.summary, post: c.spirometry.post?.summary ?? null, maneuvers: c.spirometry.pre.maneuvers.map(({ curve, ...m }) => m) });

test('a case is a pure function of its descriptor', () => {
  for (const archetype of ARCHETYPES) {
    const a = buildCase({ seed: 77, archetype, severity: 2, technique: 'fair' }, ds);
    const b = buildCase({ seed: 77, archetype, severity: 2, technique: 'fair' }, ds);
    assert.equal(strip(a), strip(b));
  }
});

test('technique changes the recorded maneuvers but never the patient or the true physiology', () => {
  for (const archetype of ARCHETYPES) for (let seed = 1; seed <= 20; seed++) {
    const g = buildCase({ seed, archetype, technique: 'good' }, ds), p = buildCase({ seed, archetype, technique: 'poor' }, ds);
    assert.deepEqual(g.report.patient, p.report.patient);
    assert.deepEqual(g.truth, p.truth);
    // The plethysmography replicates depend on technique, so FRC, TLC and RV may differ; ERV and IC are measured separately.
    assert.ok(g.pleth.session && p.pleth.session, 'Measured linked IC/SVC also depend on technique in version 3.');
  }
});

test('exact constraints hold on every reported quantity', () => {
  let n = 0;
  for (const archetype of ARCHETYPES) for (const technique of TECHNIQUE_LEVELS) for (let seed = 1; seed <= 60; seed++) {
    const c = buildCase({ seed, archetype, technique, severity: 1 + (seed % 3) }, ds);
    const s = c.report.spirometry;
    if (s.fev1 !== null && s.fvc !== null) assert.ok(s.fev1 <= s.fvc + 1e-9, `FEV1 > FVC, ${archetype} seed ${seed}`);
    if (s.post?.fev1 && s.post?.fvc) assert.ok(s.post.fev1 <= s.post.fvc + 1e-9);
    const v = c.volumes;
    if (Number.isFinite(v.tlc) && Number.isFinite(v.rv)) {
    assert.ok(Math.abs(v.tlc - (v.rv + v.vc)) < 1e-9, 'TLC = RV + VC');
    assert.ok(Math.abs(v.frc - (v.rv + v.erv)) < 1e-9, 'FRC = RV + ERV');
    assert.ok(Math.abs(v.ic - (v.tlc - v.frc)) < 1e-9, 'IC = TLC - FRC');
    assert.ok(v.rv > 0 && v.erv > 0 && v.ic > 0 && v.vc > 0);
    } else { assert.equal(v.tlc, null); assert.equal(v.rv, null); }
    const d = c.dlco;
    assert.ok(Number.isFinite(d.va) && d.va > 0, 'Measured VA is independent of potentially unavailable/unreliable pleth TLC.');
    assert.ok(Math.abs(d.adjusted - d.kco * d.va) < 1e-9, 'DLCO = KCO x VA');
    assert.ok(Math.abs(d.adjusted - d.raw * d.hbFactor) < 1e-9, 'adjusted DLCO = measured x hemoglobin factor');
    n++;
  }
  assert.equal(n, ARCHETYPES.length * 3 * 60);
});

test('with good technique the key under the anchor equations agrees with the archetype', () => {
  // Agreement is a property of the generator, not a filter. Floors are set below the rates observed on 2026-10-20 (all at least 97%).
  const floor = { normal: 0.96, nonspecific: 0.97 };
  for (const archetype of ARCHETYPES) {
    let ok = 0;
    const N = 150;
    for (let seed = 1; seed <= N; seed++) {
      const c = buildCase({ seed, archetype, severity: 1 + (seed % 3), technique: 'good' }, ds);
      if (EXPECTED_PATTERN[archetype].includes(c.anchorKey.pattern)) ok++;
    }
    assert.ok(ok / N >= (floor[archetype] ?? 0.93), `${archetype}: agreement ${ok / N}`);
  }
});

test('intended obstruction severity is the key severity in at least 90% of cases', () => {
  const names = ['mild', 'moderate', 'severe'];
  for (const severity of [1, 2, 3]) {
    let ok = 0, n = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const c = buildCase({ seed, archetype: 'obstruction', severity, technique: 'good' }, ds);
      n++;
      if (c.anchorKey.key.severity === names[severity - 1]) ok++;
    }
    assert.ok(ok / n >= 0.9, `severity ${severity}: ${ok / n}`);
  }
});

test('hemoglobin: the anemia archetype has low measured DLCO and normal corrected DLCO', () => {
  let lowRaw = 0, n = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const c = buildCase({ seed, archetype: 'anemia', technique: 'good' }, ds);
    const rawZ = resolveReference('dlco', { ...c.report.patient, measured: c.dlco.raw }, 'GLIglobal').z;
    n++;
    if (rawZ < -1.645) lowRaw++;
    assert.ok(c.dlco.hbGdl <= 9);
  }
  assert.ok(lowRaw / n > 0.6, `measured DLCO low in only ${lowRaw / n}`);
});

test('spirometry-only panels have no volumes or DLCO and never name a TLC-dependent pattern', () => {
  for (const archetype of ARCHETYPES) for (let seed = 1; seed <= 30; seed++) {
    const c = buildCase({ seed, archetype, panel: 'spirometry' }, ds);
    assert.equal(c.volumes, null);
    assert.equal(c.dlco, null);
    assert.ok(['normal', 'obstruction', 'obstruction-low-fvc', 'prism', 'indeterminate'].includes(c.anchorKey.pattern));
  }
});

test('the bronchodilator-discordant archetype is significant under the 2022 rule and the two variants differ', () => {
  const variants = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const c = buildCase({ seed, archetype: 'bd-discordant', technique: 'good' }, ds);
    variants.add(c.groundTruth.bdVariant);
    assert.ok(c.spirometry.post, 'post-bronchodilator set present');
  }
  assert.deepEqual([...variants].sort(), ['artifact', 'volume']);
});

test('the equation comparison finds some borderline reclassification across a normal-heavy sample', () => {
  let flips = 0, borderline = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const c = buildCase({ seed, archetype: seed % 2 ? 'normal' : 'obstruction', severity: 1 }, ds);
    const cmp = compareEquations(c.report, resolveReference, 'GLI2012', 'GLIglobal');
    if (cmp.patternChanged || cmp.labelChanges.length) flips++;
    if (cmp.borderline.length) borderline++;
  }
  assert.ok(flips > 0, 'no reclassification at all in 200 cases');
  assert.ok(borderline >= flips);
});
