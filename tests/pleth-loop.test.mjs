import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDatasets } from '../src/reference/load.js';
import { ARCHETYPES, TECHNIQUE_LEVELS } from '../src/core/descriptor.js';
import { buildCase } from '../src/core/case.js';
import { buildPleth, RAW_MORPHOLOGIES, RAW_LOOP_MODEL, shiftMlPerPa } from '../src/core/pleth.js';

const ds = await loadDatasets();
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function slopeOf(x, y) {
  const mx = mean(x), my = mean(y);
  let a = 0, b = 0;
  for (let i = 0; i < x.length; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; }
  return a / b;
}
const pleth = (c, extra = {}) => buildPleth({ seed: c.descriptor.seed, truth: c.truth, volumes: c.volumes, technique: c.descriptor.technique, ...extra });

/** Indices j where the series changes sign between sample j and j + 1, away from the ends. */
const reversals = (v) => { const out = []; for (let j = 6; j < v.length - 8; j++) if (v[j] * v[j + 1] < 0) out.push(j); return out; };
/** Largest change of slope at a reversal relative to the largest change of slope in its neighbourhood: about 1 for a smooth series, large for a kink. */
function slopeKinkRatio(y, t, at) {
  const s = []; for (let j = 1; j < y.length; j++) s.push((y[j] - y[j - 1]) / (t[j] - t[j - 1]));
  const change = (k) => Math.abs(s[k] - s[k - 1]);
  let worst = 0;
  for (const j of at) {
    let nb = 0;
    for (let k = j - 5; k <= j + 6; k++) if (k >= 1 && k < s.length && k !== j && k !== j + 1) nb = Math.max(nb, change(k));
    worst = Math.max(worst, Math.max(change(j), change(j + 1)) / (nb || 1e-9));
  }
  return worst;
}
/** Largest single-sample step across a reversal relative to the largest step in its neighbourhood. */
function valueJumpRatio(y, at) {
  let worst = 0;
  for (const j of at) {
    let nb = 0;
    for (let k = j - 5; k <= j + 5; k++) if (k !== j) nb = Math.max(nb, Math.abs(y[k + 1] - y[k]));
    worst = Math.max(worst, Math.abs(y[j + 1] - y[j]) / nb);
  }
  return worst;
}

test('the jump metric separates a phase-continuous signal from the earlier construction (half-sine breaths with a tau * dv/dt term)', () => {
  const dt = 0.04, tau = 0.3, w = (2 * Math.PI) / 3;
  const vSmooth = [], pSmooth = [], vKinked = [], pKinked = [];
  for (let i = 0; i < 200; i++) { const x = i * dt; vSmooth.push(Math.sin(w * x)); pSmooth.push(Math.sin(w * x) + tau * w * Math.cos(w * x)); }
  // half-sines of different duration (Ti 1.3 s, Te 1.65 s): the dv/dt term jumps at every zero crossing
  for (let sign = -1; vKinked.length < 200; sign = -sign) {
    const T = sign < 0 ? 1.3 : 1.65;
    for (let j = 0; j < Math.round(T / dt) && vKinked.length < 200; j++) {
      const u = ((j + 0.5) * dt) / T;
      vKinked.push(sign * Math.sin(Math.PI * u));
      pKinked.push(sign * Math.sin(Math.PI * u) + tau * sign * Math.cos(Math.PI * u) * (Math.PI / T));
    }
  }
  assert.ok(valueJumpRatio(pSmooth, reversals(vSmooth)) < 1.2);
  assert.ok(valueJumpRatio(pKinked, reversals(vKinked)) > 2.5);
});

test('the resistance loop is phase-continuous: no jumps and no slope kinks at flow reversals, in every archetype and technique', () => {
  let n = 0, crossings = 0;
  for (const archetype of ARCHETYPES) for (const technique of TECHNIQUE_LEVELS) for (let seed = 1; seed <= 6; seed++) {
    const c = buildCase({ seed, archetype, technique, severity: 1 + (seed % 3) }, ds);
    const r = c.pleth.raw;
    assert.equal(r.t.length, r.flow.length);
    assert.ok(r.t.every((x, j) => j === 0 || x > r.t[j - 1]), 'time increases');
    const at = reversals(r.flow);
    crossings += at.length;
    assert.ok(at.length >= 6, 'five breaths have at least ten reversals');
    const f = slopeKinkRatio(r.flow, r.t, at), p = valueJumpRatio(r.pbox, at);
    assert.ok(f < 1.5, `${archetype} ${technique} ${seed}: flow slope kink ${f.toFixed(2)}`);
    assert.ok(p < 2, `${archetype} ${technique} ${seed}: box signal jump ${p.toFixed(2)}`);
    // consecutive samples of the box signal never differ by more than a quarter of the loop height
    const peak = Math.max(...r.pbox.map(Math.abs));
    for (let j = 1; j < r.pbox.length; j++) assert.ok(Math.abs(r.pbox[j] - r.pbox[j - 1]) < 0.25 * peak);
    n++;
  }
  assert.ok(n >= 180 && crossings > 1500);
});

test('every breath starts and ends at zero flow: five closed loops from one phase variable', () => {
  const c = buildCase({ seed: 14, archetype: 'obstruction', severity: 2 }, ds);
  const r = c.pleth.raw;
  assert.equal(Math.max(...r.breath) + 1, RAW_LOOP_MODEL.nBreaths);
  for (let b = 0; b < RAW_LOOP_MODEL.nBreaths; b++) {
    const idx = r.breath.map((x, j) => (x === b ? j : -1)).filter((j) => j >= 0);
    assert.ok(Math.abs(r.flow[idx[0]]) < 0.15, `breath ${b} starts near zero flow (the first sample is within one step of the end-expiration)`);
    assert.ok(Math.abs(r.volumeL[idx[0]]) < 0.02, 'tidal volume starts at the end-expiratory level');
    assert.ok(Math.max(...idx.map((j) => r.volumeL[j])) > 0.4, 'each breath has a tidal volume');
  }
  const last = r.flow.length - 1;
  assert.ok(Math.abs(r.flow[last]) < 0.05 && Math.abs(r.volumeL[last]) < 0.02);
  // volume is the integral of flow: expiration positive, so volume falls while flow is positive
  for (let j = 1; j < r.flow.length; j++) {
    const dv = (r.volumeL[j] - r.volumeL[j - 1]) / (r.t[j] - r.t[j - 1]);
    assert.ok(Math.abs(dv + (r.flow[j] + r.flow[j - 1]) / 2) < 0.06, `flow is minus dV/dt at ${j}`);
  }
});

test('regression slope recovery: sRaw recomputed from the stored arrays equals the physiological target (within 1%)', () => {
  let n = 0;
  for (const archetype of ARCHETYPES) for (const technique of TECHNIQUE_LEVELS) for (let seed = 1; seed <= 8; seed++) {
    const c = buildCase({ seed, archetype, technique, severity: 1 + (seed % 3) }, ds);
    const p = c.pleth, r = p.raw;
    const fx = [], fy = [];
    r.flow.forEach((v, j) => { if (Math.abs(v) <= r.fitRangeLs) { fx.push(v); fy.push(r.pbox[j]); } });
    assert.equal(fx.length, r.estimator.nPoints);
    const slope = slopeOf(fx, fy);
    const sRaw = (slope * p.box.pbMinusPh2oKpa * p.box.freeVolumeL) / p.box.barometricPa;
    assert.ok(Math.abs(sRaw / r.sRawKpaS - 1) < 1e-3, 'reported sRaw is the fit of the stored arrays');
    // target: the model Raw of the case times the true thoracic gas volume (noise is orthogonal to the design, so the fit is not perturbed)
    assert.ok(Math.abs(r.sRawKpaS / (r.modelRawKpaSL * p.trueFrcL) - 1) < 0.01, `${archetype} ${technique} ${seed}: ${r.sRawKpaS} vs ${r.modelRawKpaSL * p.trueFrcL}`);
    n++;
  }
  assert.ok(n >= 240);
});

test('Raw = sRaw / reported FRC (the mean of the acceptable trials), and the basis is stated in the data', () => {
  for (const archetype of ['normal', 'obstruction', 'mixed', 'restriction-parenchymal']) for (let seed = 1; seed <= 6; seed++) {
    const c = buildCase({ seed, archetype, technique: 'fair', severity: 2 }, ds);
    const p = c.pleth, r = p.raw;
    assert.equal(r.rawBasis.frcL, p.reportedFrcL);
    assert.ok(Math.abs(r.rawKpaSL - r.sRawKpaS / p.reportedFrcL) < 5e-4);
    assert.ok(Math.abs(r.sGawPerKpaS - 1 / r.sRawKpaS) < 5e-4 * (1 + 1 / r.sRawKpaS ** 2));
    assert.match(r.rawBasis.definition, /sRaw \/ reported FRC/);
    assert.equal(p.suggestedVolumes.frc, p.reportedFrcL === undefined ? null : p.suggestedVolumes.frc);
    assert.ok(Math.abs(p.suggestedVolumes.frc - p.reportedFrcL) < 5e-5);
  }
});

test('the estimator and the breathing mode are named in the data', () => {
  const c = buildCase({ seed: 9, archetype: 'normal' }, ds);
  const r = c.pleth.raw;
  assert.equal(r.estimator.id, 'ls-slope-abs-flow');
  assert.match(r.estimator.label, /least-squares slope/);
  assert.match(r.estimator.label, /0\.5 L\/s/);
  assert.equal(r.breathingMode.id, 'tidal');
  assert.ok(r.breathingMode.tidalVolumeL > 0.5 && r.breathingMode.tidalVolumeL < 1.0);
  assert.ok(r.breathingMode.inspiratoryTimeS > 0.9 && r.breathingMode.inspiratoryTimeS < 1.8);
  assert.ok(r.breathingMode.expiratoryTimeS > r.breathingMode.inspiratoryTimeS);
  assert.ok(r.breathingMode.ratePerMin > 12 && r.breathingMode.ratePerMin < 30);
  assert.ok(Number.isFinite(r.alternativeEstimates.sRtotKpaS) && r.alternativeEstimates.sRtotKpaS > 0);
  assert.ok(r.tangentSlopePaPerLs > 0);
});

test('shift volume is the box signal in mL (pbox x Vbox / PB)', () => {
  const c = buildCase({ seed: 9, archetype: 'obstruction', severity: 2 }, ds);
  const r = c.pleth.raw, box = c.pleth.box;
  r.pbox.forEach((q, j) => assert.ok(Math.abs(r.shiftMl[j] - q * shiftMlPerPa(box)) < 6e-4));
  // 1 Pa in a 600 L box at 101.3 kPa is about 5.9 mL
  assert.ok(Math.abs(shiftMlPerPa(box) - 5.92) < 0.02);
});

test('morphologies: closed for normal, golf club for obstruction, steep closed for restriction; sigmoid only on request', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 25; seed++) {
    for (const [archetype, expected] of [['normal', 'closed'], ['obstruction', 'golf-club'], ['restriction-parenchymal', 'restriction'], ['restriction-extraparenchymal', 'restriction'], ['mixed', 'golf-club'], ['bd-discordant', 'golf-club']]) {
      const m = buildCase({ seed, archetype, severity: 2 }, ds).pleth.raw.morphology;
      assert.equal(m.id, expected, `${archetype} ${seed}`);
      seen.add(m.id);
    }
  }
  assert.deepEqual([...seen].sort(), ['closed', 'golf-club', 'restriction']);
  const c = buildCase({ seed: 3, archetype: 'normal' }, ds);
  const sig = pleth(c, { morphology: 'sigmoid' }).raw;
  assert.equal(sig.morphology.id, 'sigmoid');
  assert.equal(sig.shape.descriptor, 'S-shaped');
  for (const m of Object.values(RAW_MORPHOLOGIES)) {
    assert.ok(['verified', 'secondary', 'MEM'].includes(m.source.tag));
    assert.ok(m.source.text.length > 20 && m.label && m.appearance);
  }
  assert.equal(RAW_MORPHOLOGIES.restriction.source.tag, 'MEM');
  assert.equal(RAW_MORPHOLOGIES.sigmoid.source.tag, 'secondary');
  const dumped = buildCase({ seed: 3, archetype: 'obstruction', severity: 2 }, ds).pleth.raw.morphology;
  assert.equal(dumped.parameterVerification, 'unverified');
  assert.ok(dumped.parameters.cubicExpiratory > dumped.parameters.cubicInspiratory);
});

test('golf club: the expiratory limb bends toward the shift axis, the inspiratory limb stays near linear, and the loop opens', () => {
  const c = buildCase({ seed: 2, archetype: 'obstruction', severity: 3 }, ds);
  const r = c.pleth.raw;
  const slopeOver = (lo, hi, sign) => {
    const x = [], y = [];
    r.flow.forEach((v, j) => { if (sign * v >= lo && sign * v <= hi) { x.push(v); y.push(r.pbox[j]); } });
    return slopeOf(x, y);
  };
  const expLow = slopeOver(0.05, 0.25, 1), expHigh = slopeOver(0.4, 2, 1);
  const inLow = slopeOver(0.05, 0.25, -1), inHigh = slopeOver(0.4, 2, -1);
  assert.ok(expHigh > 1.3 * expLow, 'more shift per unit flow at high expiratory flow');
  assert.ok(inHigh < 1.5 * inLow, 'the inspiratory limb is near linear');
  assert.ok(r.shape.opening > 0.05, 'open at zero flow');
  assert.ok(r.tangentSlopePaPerLs < r.fitSlopePaPerLs, 'the zero-flow tangent is flatter in flow than the fit across the bend');
  // restriction and normal loops stay closed
  for (const archetype of ['normal', 'restriction-parenchymal']) {
    const q = buildCase({ seed: 2, archetype, severity: 2 }, ds).pleth.raw;
    assert.ok(q.shape.opening < 0.05 && q.shape.sIndex < 0.15, `${archetype} loop is closed and near linear`);
    assert.equal(q.shape.descriptor, 'closed, nearly linear');
  }
});

test('the opening term is symmetric about the fit line: more opening does not change the recovered slope', () => {
  const c = buildCase({ seed: 6, archetype: 'normal' }, ds);
  const closed = pleth(c, { ratioZ: 0.3, morphology: 'closed' }).raw;
  const golf = pleth(c, { ratioZ: 0.3, morphology: 'golf-club' }).raw;
  assert.ok(golf.shape.opening > closed.shape.opening * 2);
  assert.ok(Math.abs(golf.sRawKpaS / closed.sRawKpaS - 1) < 0.01, 'same physiological target, same recovered sRaw');
});

test('with eelShift set the record starts at the stable level and closes away from it by the shift', () => {
  const c = buildCase({ seed: 3, archetype: 'obstruction', severity: 2 }, ds);
  const p = pleth(c, { scenario: { ids: ['PLE-05'] } });
  for (const tr of p.timeline.trials) {
    assert.equal(tr.offsetFromStable, true);
    const off = tr.levels.closureOffsetL;
    assert.ok(Math.abs(off) > 0.15 && Math.abs(off) < 0.7, `closure offset ${off}`);
    assert.ok(Math.abs(tr.eelL[tr.eelL.length - 1] - tr.levels.trialFrcL) < 1e-9);
    // the quiet breaths drift from the stable level toward the closure level
    assert.ok(Math.abs(tr.eelL[0] - tr.levels.stableEelL) < Math.abs(off) * 0.5 + 0.1);
  }
  const clean = pleth(c);
  assert.ok(clean.timeline.trials.every((tr) => !tr.offsetFromStable));
});
