import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadDatasets } from '../src/reference/load.js';
import { ARCHETYPES, TECHNIQUE_LEVELS } from '../src/core/descriptor.js';
import { buildCase } from '../src/core/case.js';
import { buildPleth, gradeFrc, repeatableGroup, spreadFraction, obstructionMeasure } from '../src/core/pleth.js';
import { identityDescriptors, frozenHash } from './helpers/pleth-identity.mjs';

const ds = await loadDatasets();
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const pleth = (c, extra = {}) => buildPleth({ seed: c.descriptor.seed, truth: c.truth, volumes: c.volumes, technique: c.descriptor.technique, ...extra });

// Independent re-implementation of the Boyle's law readout, written from the physics and not from src/core/pleth.js.
function slopeOf(x, y) {
  const mx = mean(x), my = mean(y);
  let a = 0, b = 0;
  for (let i = 0; i < x.length; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; }
  return a / b;
}
const tgvFromSlope = (slopePaPerKpa, box) => {
  // dPbox = PB dV / Vbox  and  TGV = dV/dPm * (PB - 47)
  const pbPa = box.barometricMmHg * 133.322, pbMinus47Kpa = (box.barometricMmHg - 47) * 0.133322;
  const dVperKpa = (slopePaPerKpa * box.freeVolumeL) / pbPa; // L per kPa
  return dVperKpa * pbMinus47Kpa;
};

test('a plethysmography result is a pure function of its inputs', () => {
  for (const archetype of ['normal', 'obstruction', 'restriction-parenchymal']) {
    const c = buildCase({ seed: 11, archetype, technique: 'fair' }, ds);
    assert.equal(JSON.stringify(pleth(c)), JSON.stringify(pleth(c)));
  }
  const c = buildCase({ seed: 12, archetype: 'normal' }, ds);
  assert.notEqual(JSON.stringify(pleth(c)), JSON.stringify(buildPleth({ seed: 13, truth: c.truth, volumes: c.volumes })));
});

test('null when there are no volumes', () => {
  const c = buildCase({ seed: 3, archetype: 'normal', panel: 'spirometry' }, ds);
  assert.equal(c.volumes, null);
  assert.equal(pleth(c), null);
});

test('only pleth- streams are used, so existing cases cannot change', () => {
  const src = fs.readFileSync(new URL('../src/core/pleth.js', import.meta.url), 'utf8');
  const names = [...src.matchAll(/createStream\([^,]+,\s*([`'][^`']+[`'])\)/g)].map((m) => m[1]);
  assert.ok(names.length >= 3);
  for (const n of names) assert.match(n, /^[`']pleth-/);
});

test('trial FRC equals Boyle\'s law applied to the plotted shutter arrays (within 1%)', () => {
  let n = 0;
  for (const archetype of ARCHETYPES) for (const technique of TECHNIQUE_LEVELS) for (let seed = 1; seed <= 6; seed++) {
    const c = buildCase({ seed, archetype, technique }, ds);
    const p = pleth(c);
    for (const tr of p.trials) {
      assert.equal(tr.pm.length, tr.pbox.length);
      const frc = tgvFromSlope(slopeOf(tr.pm, tr.pbox), p.box);
      assert.ok(Math.abs(frc / tr.frcL - 1) < 0.01, `${archetype} ${technique} ${seed} trial ${tr.index}: ${frc} vs ${tr.frcL}`);
      n++;
    }
  }
  assert.ok(n > 300);
});

test('good technique recovers the true FRC from the traces and reports the mean of acceptable trials', () => {
  for (const archetype of ARCHETYPES) for (let seed = 1; seed <= 10; seed++) {
    const c = buildCase({ seed, archetype, technique: 'good' }, ds);
    const p = pleth(c);
    assert.ok(p.trials.length >= 3 && p.trials.length <= 5);
    for (const tr of p.trials) {
      assert.ok(tr.panFreqHz >= 0.5 && tr.panFreqHz <= 1.0, `pant frequency ${tr.panFreqHz}`);
      assert.equal(tr.status, 'acceptable');
      assert.ok(Math.abs(tr.frcL / c.truth.frc - 1) < 0.06);
    }
    assert.equal(p.grade, 'A');
    assert.ok(Math.abs(p.reportedFrcL / c.truth.frc - 1) < 0.04);
    assert.ok(Math.abs(p.reportedFrcL - mean(p.trials.filter((t) => t.acceptable).map((t) => t.frcL))) < 1e-3);
    assert.equal(p.faults.length, 0);
  }
});

test('the reported FRC is the mean of acceptable trials only', () => {
  let checked = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const c = buildCase({ seed, archetype: 'obstruction', technique: 'poor', severity: 1 + (seed % 3) }, ds);
    const p = pleth(c);
    const acc = p.trials.filter((t) => t.acceptable);
    if (acc.length && acc.length < p.trials.length) {
      assert.ok(Math.abs(p.reportedFrcL - mean(acc.map((t) => t.frcL))) < 1e-3);
      checked++;
    }
  }
  assert.ok(checked > 5, 'poor technique should produce mixed acceptable and unacceptable trials');
});

test('replicate rule: spread is (highest - lowest) / mean, 5% for grades A and B, 10% for grade C', () => {
  assert.ok(Math.abs(spreadFraction([3.0, 3.1, 3.2]) - 0.2 / 3.1) < 1e-12);
  assert.deepEqual(repeatableGroup([3.0, 3.1, 3.4], 0.05).sort(), [0, 1]);
  assert.equal(gradeFrc([3.0, 3.05, 3.1], 0), 'A');
  assert.equal(gradeFrc([3.0, 3.05, 3.4], 0), 'B');
  assert.equal(gradeFrc([3.0, 3.2], 0), 'C'); // 6.5% apart
  assert.equal(gradeFrc([3.0, 3.5], 0), 'E');
  assert.equal(gradeFrc([3.0], 0), 'D');
  assert.equal(gradeFrc([], 2), 'U');
  assert.equal(gradeFrc([], 0), 'F');
});

test('forced scenario behaviors produce the documented faults and FRC errors', () => {
  const c = buildCase({ seed: 3, archetype: 'obstruction', severity: 2 }, ds);
  const clean = pleth(c);
  const fast = pleth(c, { scenario: { ids: ['PLE-02'] } });
  assert.ok(fast.trials.every((t) => t.faults.includes('fast-panting') && t.status === 'rejected'));
  assert.ok(fast.reportedFrcL > clean.reportedFrcL * 1.03, 'fast panting overestimates FRC in obstruction');
  assert.ok(fast.reportedFrcL < clean.reportedFrcL * 1.3, 'the inflation is bounded');
  const cheek = pleth(c, { scenario: { ids: ['PLE-03'] } });
  assert.ok(cheek.trials.every((t) => t.faults.includes('cheek-compliance')));
  assert.ok(cheek.reportedFrcL > clean.reportedFrcL);
  const leak = pleth(c, { scenario: { ids: ['PLE-04'] } });
  assert.ok(leak.reportedFrcL < clean.reportedFrcL);
  const drift = pleth(c, { scenario: { ids: ['PLE-01'] } });
  assert.ok(drift.trials.some((t) => t.faults.includes('thermal-drift')));
  assert.notEqual(drift.grade, 'A');
  const eel = pleth(c, { scenario: { ids: ['PLE-05'] } });
  assert.ok(eel.trials.every((t) => t.status !== 'acceptable'));
  assert.ok(eel.faults.length >= 3 && eel.faults.every((s) => typeof s === 'string'));
});

test('fast panting inflates FRC more with obstruction than without', () => {
  const c = buildCase({ seed: 8, archetype: 'normal' }, ds);
  const scenario = { ids: ['PLE-02'] };
  const plain = pleth(c, { scenario, ratioZ: 0.2 });
  const obstructed = pleth(c, { scenario, ratioZ: -4 });
  assert.ok(obstructed.reportedFrcL / c.truth.frc > plain.reportedFrcL / c.truth.frc + 0.02);
});

test('a tolerated panting frequency (1.0 to 1.5 Hz) is acceptable without obstruction and not with it', () => {
  let tolerated = 0, notTolerated = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const c = buildCase({ seed, archetype: 'normal', technique: 'poor' }, ds);
    for (const tr of pleth(c, { ratioZ: 0 }).trials) if (tr.panFreqHz > 1.0 && tr.panFreqHz <= 1.5 && tr.faults.length === 0) { assert.equal(tr.status, 'acceptable'); tolerated++; }
    for (const tr of pleth(c, { ratioZ: -3 }).trials) if (tr.panFreqHz > 1.0 && tr.panFreqHz <= 1.5) { assert.notEqual(tr.status, 'acceptable'); notTolerated++; }
  }
  assert.ok(tolerated > 5 && notTolerated > 5);
});

test('airway resistance: sRaw follows the FEV1/FVC z-score monotonically and the loop shape follows the physiology', () => {
  const c = buildCase({ seed: 21, archetype: 'normal' }, ds);
  let last = 0;
  for (const z of [1.5, 0.5, -0.5, -1.5, -2.5, -3.5, -4.5]) {
    const s = pleth(c, { ratioZ: z }).raw.sRawKpaS;
    assert.ok(s > last * 0.97, `sRaw should not fall as z falls (${z})`);
    last = s;
  }
  assert.ok(pleth(c, { ratioZ: -4.5 }).raw.sRawKpaS > 3 * pleth(c, { ratioZ: 0.5 }).raw.sRawKpaS);
  assert.ok(obstructionMeasure(-3) > obstructionMeasure(-2) && obstructionMeasure(-2) > obstructionMeasure(0));
  assert.equal(pleth(c, { ratioZ: 0.3 }).raw.shape.descriptor, 'closed, nearly linear');
  const open = pleth(c, { ratioZ: -3.5 }).raw.shape.descriptor;
  assert.match(open, /open/);
  assert.match(open, /golf club/);
  assert.equal(pleth(c, { ratioZ: -3.5 }).raw.morphology.id, 'golf-club');
  // A healthy adult sits near the published medians and under the upper limit.
  const healthy = pleth(c, { ratioZ: 0.2 }).raw;
  assert.ok(healthy.sRawKpaS > 0.3 && healthy.sRawKpaS < 1.2, `healthy sRaw ${healthy.sRawKpaS}`);
});

test('sRaw, sGaw and Raw are recomputed from the plotted loop arrays within 1%', () => {
  for (const archetype of ['normal', 'obstruction', 'mixed', 'restriction-parenchymal']) for (let seed = 1; seed <= 8; seed++) {
    const c = buildCase({ seed, archetype, severity: 2 }, ds);
    const p = pleth(c), r = p.raw;
    const fx = [], fy = [];
    r.flow.forEach((v, j) => { if (Math.abs(v) <= 0.5) { fx.push(v); fy.push(r.pbox[j]); } });
    const slope = slopeOf(fx, fy); // Pa per L/s
    const sRaw = slope * ((p.box.barometricMmHg - 47) * 0.133322 * p.box.freeVolumeL) / (p.box.barometricMmHg * 133.322); // kPa.s
    assert.ok(Math.abs(sRaw / r.sRawKpaS - 1) < 0.01);
    assert.ok(Math.abs(1 / sRaw / r.sGawPerKpaS - 1) < 0.01);
    assert.ok(Math.abs(sRaw / p.reportedFrcL / r.rawKpaSL - 1) < 0.01, 'Raw = sRaw / FRC');
  }
});

test('300+ random cases across archetypes: no exceptions, positive volumes, consistent arrays', () => {
  let n = 0;
  for (const archetype of ARCHETYPES) for (const technique of TECHNIQUE_LEVELS) for (let seed = 100; seed < 112; seed++) {
    const c = buildCase({ seed, archetype, technique, severity: 1 + (seed % 3) }, ds);
    const p = pleth(c);
    const v = p.suggestedVolumes;
    for (const key of ['frc', 'erv', 'ic', 'tlc', 'rv', 'vc']) assert.ok(v[key] > 0 && Number.isFinite(v[key]), `${key} ${v[key]}`);
    assert.ok(Math.abs(v.tlc - (v.rv + v.vc)) < 1e-9 && Math.abs(v.frc - (v.rv + v.erv)) < 1e-9 && Math.abs(v.ic - (v.tlc - v.frc)) < 1e-9);
    assert.ok(p.reportedFrcL > 0 && p.raw.sRawKpaS > 0 && p.raw.rawKpaSL > 0 && p.raw.sGawPerKpaS > 0);
    assert.equal(p.replicateTable.length, p.trials.length);
    for (const tr of p.trials) {
      assert.ok(tr.frcL > 0);
      assert.ok(tr.t.length === tr.pm.length && tr.pm.length === tr.pbox.length && tr.pm.every(Number.isFinite) && tr.pbox.every(Number.isFinite));
      assert.ok(['acceptable', 'usable', 'rejected'].includes(tr.status));
    }
    assert.ok(['A', 'B', 'C', 'D', 'E', 'U', 'F'].includes(p.grade));
    JSON.stringify(p);
    n++;
  }
  assert.ok(n >= 300);
});

test('scenario-forced faults in the full set of ids never throw', () => {
  const c = buildCase({ seed: 5, archetype: 'mixed', severity: 3, technique: 'poor' }, ds);
  for (const ids of [[], ['PLE-01', 'PLE-02', 'PLE-03', 'PLE-04', 'PLE-05'], ['DLC-01'], ['PLE-05', 'PLE-01']]) {
    const p = pleth(c, { scenario: { ids } });
    assert.ok(p.reportedFrcL > 0);
  }
});

test('numerical identity: every non-resistance value of 2230 cases (220 seeds x 10 archetypes, plus scenarios) is unchanged', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/pleth-identity-hashes.json', import.meta.url), 'utf8'));
  const descriptors = identityDescriptors();
  assert.equal(fixture.n, descriptors.length);
  assert.ok(descriptors.length >= 2200);
  const bad = [];
  descriptors.forEach((d, i) => {
    if (frozenHash(buildCase(d, ds)) !== fixture.hashes[i]) bad.push(`${d.seed}/${d.archetype}`);
  });
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} cases differ`);
});
