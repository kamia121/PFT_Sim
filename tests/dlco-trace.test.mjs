import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadDatasets } from '../src/reference/load.js';
import { ARCHETYPES, TECHNIQUE_LEVELS } from '../src/core/descriptor.js';
import { buildCase } from '../src/core/case.js';
import { buildDlcoTrace, gradeDlcoTest, vaStpdMl } from '../src/core/dlco-trace.js';

const ds = await loadDatasets();
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const trace = (c, extra = {}) => buildDlcoTrace({ seed: c.descriptor.seed, truth: c.truth, dlco: c.dlco, volumes: c.volumes, patient: c.descriptor, technique: c.descriptor.technique, ...extra });

/**
 * Standard single-breath equations written out independently of src/core/dlco-trace.js, applied only
 * to the plotted arrays and the stated gas, volumes and pressure.
 */
function recompute(t) {
  const pb = t.barometricMmHg;
  const { volumeL, co, tracer } = t.byVolume;
  const win = volumeL.map((v, i) => i).filter((i) => volumeL[i] >= t.markers.sample.startL - 1e-9 && volumeL[i] <= t.markers.sample.endL + 1e-9);
  const faTr = mean(win.map((i) => tracer[i])) / 100, faCo = mean(win.map((i) => co[i])) / 100;
  const fiTr = t.gas.fiTracerPct / 100, fiCo = t.gas.fiCoPct / 100;
  // Breath-hold: from 30% of VI (interpolated on the volume trace) to the midpoint of the sample (expired volume interpolated on the exhalation).
  const T = t.time.t, V = t.time.volumeL;
  const interp = (target, from, to, dir) => {
    for (let j = from; j < to; j++) {
      const a = V[j], b = V[j + 1];
      if ((dir > 0 && a < target && b >= target) || (dir < 0 && a > target && b <= target)) return T[j] + ((target - a) / (b - a)) * (T[j + 1] - T[j]);
    }
    return NaN;
  };
  const viMax = Math.max(...V);
  const jPeak = V.indexOf(viMax);
  const t30 = interp(0.3 * viMax, 0, jPeak, +1);
  const jExh = T.findIndex((x) => x >= t.markers.tExhaleStartS);
  const vStart = V[jExh];
  const mid = (t.markers.sample.startL + t.markers.sample.endL) / 2;
  const tMid = interp(vStart - mid, jExh, T.length - 1, -1);
  const tBh = tMid - t30;
  const vaBtps = (fiTr / faTr) * (t.inspired.volumeL - t.deadSpaceL);
  const vaStpd = vaBtps * 1000 * ((pb - 47) / 760) * (273 / 310);
  const fCo0 = fiCo * (faTr / fiTr);
  const dlco = (vaStpd / ((tBh / 60) * (pb - 47))) * Math.log(fCo0 / faCo);
  return { vaBtps, dlco, tBh, faTr, faCo };
}

test('a DLCO trace is a pure function of its inputs', () => {
  for (const archetype of ['normal', 'obstruction', 'restriction-parenchymal']) {
    const c = buildCase({ seed: 31, archetype, technique: 'poor' }, ds);
    assert.equal(JSON.stringify(trace(c)), JSON.stringify(trace(c)));
  }
});

test('null without DLCO; only dlco-trace streams are used', () => {
  assert.equal(buildDlcoTrace({ seed: 1, truth: {}, dlco: null }), null);
  const src = fs.readFileSync(new URL('../src/core/dlco-trace.js', import.meta.url), 'utf8');
  const names = [...src.matchAll(/createStream\([^,]+,\s*'([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(names.length >= 2);
  for (const n of names) assert.match(n, /^dlco-trace-/);
});

test('fault-free tests reproduce the case VA and DLCO from the plotted arrays within 1%', () => {
  let n = 0, adjusted = 0;
  for (const archetype of ARCHETYPES) for (let seed = 1; seed <= 25; seed++) {
    const c = buildCase({ seed, archetype, technique: 'good', severity: 1 + (seed % 3) }, ds);
    const t = trace(c);
    const r = recompute(t);
    if (t.adjustments.length) { adjusted++; continue; }
    assert.ok(Math.abs(r.vaBtps / c.dlco.va - 1) < 0.01, `${archetype} ${seed} VA ${r.vaBtps} vs ${c.dlco.va}`);
    assert.ok(Math.abs(r.dlco / c.dlco.raw - 1) < 0.01, `${archetype} ${seed} DLCO ${r.dlco} vs ${c.dlco.raw}`);
    assert.equal(t.reproducesCase, true);
    assert.equal(t.adjusted, null);
    assert.equal(t.faults.length, 0);
    assert.equal(t.grade.grade, 'A');
    n++;
  }
  assert.ok(n >= 200);
  assert.ok(adjusted <= 0.1 * (n + adjusted), `too many adjusted cases: ${adjusted}`);
});

test('reported values always equal the equations applied to the plotted arrays, faults or not', () => {
  for (const archetype of ARCHETYPES) for (const technique of TECHNIQUE_LEVELS) for (let seed = 1; seed <= 12; seed++) {
    const c = buildCase({ seed, archetype, technique }, ds);
    const t = trace(c);
    const r = recompute(t);
    assert.ok(Math.abs(r.vaBtps / t.values.vaL - 1) < 0.01);
    assert.ok(Math.abs(r.dlco / t.values.dlcoMlMinMmHg - 1) < 0.01, `${archetype} ${technique} ${seed}`);
    assert.ok(Math.abs(t.values.kco - t.values.dlcoMlMinMmHg / t.values.vaL) < 1e-3 * t.values.kco);
    assert.equal(t.reproducesCase, Math.abs(t.values.vaL / c.dlco.va - 1) <= 0.01 && Math.abs(t.values.dlcoMlMinMmHg / c.dlco.raw - 1) <= 0.01);
    if (!t.reproducesCase) { assert.ok(t.adjusted); assert.ok(t.adjustments.length > 0); }
  }
});

test('barometric pressure cancels in DLCO but not in the STPD volume', () => {
  const c = buildCase({ seed: 4, archetype: 'normal' }, ds);
  const a = trace(c), b = trace(c, { patient: { ...c.descriptor, barometricMmHg: 630 } });
  assert.ok(Math.abs(recompute(b).dlco / c.dlco.raw - 1) < 0.01);
  assert.ok(Math.abs(recompute(b).vaBtps / c.dlco.va - 1) < 0.01);
  assert.ok(vaStpdMl(5, 630) < vaStpdMl(5, 760));
  assert.ok(Math.abs(vaStpdMl(6, 760) - 6000 * (713 / 760) * (273 / 310)) < 1e-9);
  assert.equal(a.barometricMmHg, 760);
  assert.equal(b.barometricMmHg, 630);
});

test('worked example from the research note: VA 6 L, 10 s, PB 760 gives CO factors 0.79, 0.55 and 0.43 at DLCO 10, 25 and 35', () => {
  for (const [dlco, factor] of [[10, 0.79], [25, 0.55], [35, 0.43]]) {
    const f = Math.exp(-(dlco * (10 / 60) * 713) / vaStpdMl(6, 760));
    assert.ok(Math.abs(f - factor) < 0.01, `${dlco}: ${f}`);
  }
});

test('structural constraints: positive volumes, VI <= VC, sample inside the expiration, breath-hold window, gas fractions', () => {
  let n = 0;
  for (const archetype of ARCHETYPES) for (const technique of TECHNIQUE_LEVELS) for (let seed = 200; seed < 212; seed++) {
    const c = buildCase({ seed, archetype, technique, severity: 1 + (seed % 3) }, ds);
    const t = trace(c);
    const mk = t.markers;
    assert.ok(t.inspired.volumeL > 0 && t.inspired.volumeL <= t.inspired.vcL + 1e-9, 'VI <= VC');
    assert.ok(t.inspired.viOverVc > 0 && t.inspired.viOverVc <= 1);
    assert.ok(t.deadSpaceL > 0 && t.deadSpaceL < t.inspired.volumeL);
    assert.ok(mk.washout.endL > 0 && mk.sample.startL >= mk.washout.endL - 1e-9 && mk.sample.endL > mk.sample.startL);
    assert.ok(mk.sample.endL <= mk.exhalationStartVolumeL, 'sample window inside the expired volume');
    assert.ok(mk.sample.endS <= t.time.t[t.time.t.length - 1] && mk.sample.startS >= mk.tExhaleStartS - 1e-9);
    assert.ok(mk.tInspStartS < mk.t30PctS && mk.t30PctS < mk.tInspEndS && mk.tInspEndS <= mk.tExhaleStartS && mk.tExhaleStartS < mk.sample.startS);
    assert.ok(Math.abs(t.breathHold.seconds - (mk.tSampleMidS - mk.t30PctS)) < 1e-6);
    assert.ok(t.values.vaL > 0 && t.values.dlcoMlMinMmHg > 0 && t.values.kco > 0);
    const fi = t.gas.fiCoPct;
    for (const arr of [t.time.co, t.time.tracer, t.byVolume.co, t.byVolume.tracer]) assert.ok(arr.every((x) => x >= 0 && x <= fi * 1.03 && Number.isFinite(x)));
    assert.ok(t.time.volumeL.every((x) => x >= -1e-9 && x <= t.inspired.vcL + 0.2));
    assert.equal(t.time.t.length, t.time.volumeL.length);
    assert.equal(t.byVolume.volumeL.length, t.byVolume.co.length);
    if (t.faults.length === 0) {
      assert.ok(t.breathHold.seconds >= 8 && t.breathHold.seconds <= 12, `hold ${t.breathHold.seconds}`);
      assert.ok(t.inspired.viOverVc >= 0.9);
      assert.ok(t.quality.sampleEndS <= 4);
    }
    JSON.stringify(t);
    n++;
  }
  assert.ok(n >= 300);
});

test('alveolar CO is below the alveolar tracer by the decay during the hold, and both fall from the inspired fraction', () => {
  const c = buildCase({ seed: 9, archetype: 'normal' }, ds);
  const t = trace(c);
  assert.ok(t.values.faCoPct < t.values.faCo0Pct);
  assert.ok(t.values.faTracerPct < t.gas.fiTracerPct);
  assert.ok(Math.abs(t.values.faCo0Pct - t.gas.fiCoPct * (t.values.faTracerPct / t.gas.fiTracerPct)) < 1e-3);
  // The dead-space gas at the start of exhalation is the inspired mixture.
  assert.ok(Math.abs(t.byVolume.co[0] - t.gas.fiCoPct) < 0.02 * t.gas.fiCoPct);
});

test('forced technique faults: grade, flags and numerical effects', () => {
  const c = buildCase({ seed: 3, archetype: 'obstruction', severity: 2 }, ds);
  const clean = trace(c);
  assert.equal(clean.grade.grade, 'A');
  const by = (id) => trace(c, { scenario: { ids: [id] } });

  const lowVi = by('DLC-01');
  assert.ok(lowVi.inspired.viOverVc < 0.85);
  assert.equal(lowVi.grade.grade, 'D');
  assert.ok(lowVi.grade.wouldBeRejected);
  assert.ok(lowVi.values.vaL < clean.values.vaL);
  assert.ok(lowVi.values.dlcoMlMinMmHg < clean.values.dlcoMlMinMmHg);
  assert.ok(lowVi.values.kco > clean.values.kco, 'KCO rises with a low inspired volume');
  assert.equal(lowVi.reproducesCase, false);
  assert.ok(lowVi.adjustments.some((s) => /VA/.test(s)));

  const slow = by('DLC-02');
  assert.ok(slow.inspired.timeTo85PctS >= 4);
  assert.equal(slow.grade.grade, 'B');
  assert.ok(slow.grade.acceptable && !slow.grade.wouldBeRejected);
  assert.equal(slow.reproducesCase, true);

  const long = by('DLC-03');
  assert.ok(long.breathHold.seconds > 12);
  assert.equal(long.grade.grade, 'C');
  assert.ok(long.grade.wouldBeRejected);
  assert.equal(long.reproducesCase, true, 'the Krogh equation corrects for the hold time');

  const val = by('DLC-04');
  assert.equal(val.grade.grade, 'D');
  assert.ok(val.values.dlcoMlMinMmHg < clean.values.dlcoMlMinMmHg * 0.92);
  assert.ok(Math.max(...val.time.pressureCmH2O) > 8, 'positive mouth pressure channel');
  const mue = by('DLC-05');
  assert.equal(mue.grade.grade, 'D');
  assert.ok(mue.values.dlcoMlMinMmHg > clean.values.dlcoMlMinMmHg * 1.08);
  assert.ok(Math.min(...mue.time.pressureCmH2O) < -8, 'negative mouth pressure channel');

  const leak = by('DLC-06');
  assert.equal(leak.grade.grade, 'D');
  assert.ok(leak.quality.leak);
  assert.equal(leak.reproducesCase, true, 'leak is visual and grading only');
  const hold = leak.time.t.map((x, j) => (x > leak.markers.tInspEndS + 0.3 && x < leak.markers.tExhaleStartS - 0.3 ? leak.time.volumeL[j] : null)).filter((x) => x !== null);
  assert.ok(hold[0] - hold[hold.length - 1] > 0.1, 'volume falls during the hold');

  for (const t of [lowVi, slow, long, val, mue, leak]) assert.ok(t.faults.length >= 1 && t.faults.every((f) => typeof f.text === 'string'));
  assert.deepEqual(leak.faults.map((f) => [f.code, f.visualOnly]), [['leak', true]]);
  assert.equal(val.faults[0].visualOnly, false);
});

test('early alveolar sample: dead-space gas contaminates the sample and underestimates VA and DLCO', () => {
  let seen = 0;
  for (let seed = 1; seed <= 400 && seen < 3; seed++) {
    const c = buildCase({ seed, archetype: 'normal', technique: 'poor' }, ds);
    const t = trace(c);
    if (!t.faults.some((f) => f.code === 'early-sample')) continue;
    seen++;
    assert.ok(t.quality.contamination > 0.03);
    assert.equal(t.grade.grade, 'D');
    assert.ok(t.values.vaL < c.dlco.va);
    assert.ok(t.values.dlcoMlMinMmHg < c.dlco.raw);
  }
  assert.ok(seen >= 3);
});

test('a VA that the tracer cannot dilute to is adjusted and said so', () => {
  const c = buildCase({ seed: 6, archetype: 'normal' }, ds);
  const small = { ...c.dlco, va: 0.45 * c.volumes.vc };
  const t = trace(c, { dlco: small });
  assert.ok(t.adjustments.length >= 1 && /VA raised/.test(t.adjustments[0]));
  assert.ok(t.values.vaL > small.va);
  assert.ok(Math.abs(t.values.dlcoMlMinMmHg / small.raw - 1) < 0.01, 'DLCO is still reproduced');
});

test('grading rules', () => {
  const ok = { viOverVc: 0.95, t85S: 2, breathHoldS: 10, sampleEndS: 2.5, washoutL: 0.8, sampleL: 0.7, vcL: 4, contamination: 0, valsalva: false, mueller: false, leak: false };
  assert.equal(gradeDlcoTest(ok).grade, 'A');
  assert.equal(gradeDlcoTest({ ...ok, t85S: 4.5 }).grade, 'B');
  assert.equal(gradeDlcoTest({ ...ok, breathHoldS: 7.9 }).grade, 'C');
  assert.equal(gradeDlcoTest({ ...ok, breathHoldS: 12.1 }).grade, 'C');
  assert.equal(gradeDlcoTest({ ...ok, breathHoldS: 8 }).grade, 'A');
  assert.equal(gradeDlcoTest({ ...ok, breathHoldS: 12 }).grade, 'A');
  assert.equal(gradeDlcoTest({ ...ok, viOverVc: 0.87 }).grade, 'C');
  assert.equal(gradeDlcoTest({ ...ok, viOverVc: 0.84 }).grade, 'D');
  assert.equal(gradeDlcoTest({ ...ok, sampleEndS: 4.2 }).grade, 'C');
  assert.equal(gradeDlcoTest({ ...ok, washoutL: 0.6 }).grade, 'C');
  assert.equal(gradeDlcoTest({ ...ok, washoutL: 0.5, vcL: 1.8 }).grade, 'A');
  assert.equal(gradeDlcoTest({ ...ok, sampleL: 0.4 }).grade, 'C');
  assert.equal(gradeDlcoTest({ ...ok, contamination: 0.1 }).grade, 'D');
  for (const k of ['valsalva', 'mueller', 'leak']) assert.equal(gradeDlcoTest({ ...ok, [k]: true }).grade, 'D');
  assert.equal(gradeDlcoTest({ ...ok, leak: true }).wouldBeRejected, true);
  assert.equal(gradeDlcoTest(ok).wouldBeRejected, false);
});

test('300+ random cases, every technique, forced faults included, never throw', () => {
  let n = 0;
  const ids = [[], ['DLC-01'], ['DLC-02', 'DLC-03'], ['DLC-04'], ['DLC-05'], ['DLC-06'], ['PLE-01']];
  for (const archetype of ARCHETYPES) for (const technique of TECHNIQUE_LEVELS) for (let seed = 300; seed < 312; seed++) {
    const c = buildCase({ seed, archetype, technique, severity: 1 + (seed % 3) }, ds);
    const t = trace(c, { scenario: { ids: ids[seed % ids.length] } });
    assert.ok(['A', 'B', 'C', 'D'].includes(t.grade.grade));
    assert.equal(t.grade.wouldBeRejected, t.grade.grade === 'C' || t.grade.grade === 'D');
    n++;
  }
  assert.ok(n >= 300);
});
