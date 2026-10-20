import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInspiratory, applyArtifacts, sampleExpiration, plotGrid, loopClosure, loopTolerance } from '../src/core/inspiratory.js';
import { solveCurve, volume, flow, backExtrapolation, peakFlow } from '../src/core/curve.js';
import { createStream } from '../src/core/prng.js';

const trapz = (x, y) => y.reduce((s, _, i) => (i ? s + 0.5 * (y[i] + y[i - 1]) * (x[i] - x[i - 1]) : s), 0);
const fns = { volume, flow };
const curveOf = (fvc, fev1, k = 0.9, r = 0.035, T = 12) => solveCurve({ fvc, fev1, k, r, T }).curve;

test('the loop tolerance is the larger of 0.100 L and 5% of FVC, and closure is classified against it', () => {
  assert.equal(loopTolerance(1.5), 0.1);
  assert.ok(Math.abs(loopTolerance(4) - 0.2) < 1e-12);
  assert.equal(loopClosure(4, 4.19), 'closed');
  assert.equal(loopClosure(4, 3.79), 'incomplete-loop');
  assert.equal(loopClosure(4, 3.81), 'closed');
  assert.equal(loopClosure(4, 4.21), 'fivc-exceeds-fvc');
  assert.equal(loopClosure(1.5, 1.45), 'closed');
  assert.equal(loopClosure(1.5, 1.35), 'incomplete-loop');
});

test('buildInspiratory is deterministic and depends on seed and index', () => {
  const m = { fvc: 4.2, faults: [] };
  const a = buildInspiratory(m, { seed: 99, index: 2 });
  assert.deepEqual(a, buildInspiratory(m, { seed: 99, index: 2 }));
  assert.notDeepEqual(a.f, buildInspiratory(m, { seed: 99, index: 3 }).f);
  assert.notDeepEqual(a.f, buildInspiratory(m, { seed: 100, index: 2 }).f);
});

test('a good maneuver closes the loop: FIVC within max(0.100 L, 5% of FVC), smooth negative flow, volume from FVC downward', () => {
  const rng = createStream(5, 'test-good');
  for (let n = 0; n < 300; n++) {
    const fvc = rng.range(0.8, 7.5);
    const insp = buildInspiratory({ fvc, faults: [] }, { seed: rng.int(0, 2 ** 31), index: n % 8 });
    assert.ok(Math.abs(insp.fivc - fvc) <= loopTolerance(fvc) + 1e-12, `FIVC ${insp.fivc} vs FVC ${fvc}`);
    assert.equal(insp.flags[0], 'closed');
    assert.equal(insp.v[0], fvc);
    assert.ok(Math.abs(insp.v[insp.v.length - 1] - (fvc - insp.fivc)) < 1e-9);
    assert.ok(insp.f.every((x) => x <= 1e-12), 'inspiratory flow is negative');
    assert.equal(insp.f[0], -0);
    assert.ok(Math.abs(insp.f[insp.f.length - 1]) < 1e-9, 'flow returns to zero');
    for (let i = 1; i < insp.v.length; i++) assert.ok(insp.v[i] <= insp.v[i - 1] + 1e-12, 'volume decreases');
    // Smooth: no step between neighbours larger than 12% of the peak.
    for (let i = 1; i < insp.f.length; i++) assert.ok(Math.abs(insp.f[i] - insp.f[i - 1]) < 0.12 * insp.pif);
    // Volume is the integral of flow.
    assert.ok(Math.abs(trapz(insp.t, insp.f.map((x) => -x)) - insp.fivc) < 1e-9);
    assert.ok(Math.abs(insp.pif - Math.max(...insp.f.map((x) => -x))) < 1e-12);
  }
});

test('a leak or mouthpiece obstruction leaves the loop open with a FIVC shortfall', () => {
  const rng = createStream(6, 'test-leak');
  for (const fault of ['leak', 'mouthpiece-obstruction']) {
    for (let n = 0; n < 100; n++) {
      const fvc = rng.range(1, 7);
      const insp = buildInspiratory({ fvc, faults: [fault] }, { seed: rng.int(0, 2 ** 31), index: n % 8 });
      assert.ok(fvc - insp.fivc > loopTolerance(fvc), `${fault}: shortfall ${fvc - insp.fivc}`);
      assert.equal(insp.flags[0], 'incomplete-loop');
      assert.ok(insp.v[insp.v.length - 1] > loopTolerance(fvc), 'the loop ends away from zero volume');
    }
  }
});

test('starting below TLC makes FIVC exceed FVC by more than the tolerance', () => {
  const insp = buildInspiratory({ fvc: 3.2, faults: ['start-below-tlc'] }, { seed: 4, index: 0 });
  assert.equal(insp.flags[0], 'fivc-exceeds-fvc');
  assert.ok(insp.fivc - 3.2 > loopTolerance(3.2));
});

test('technique faults usually, but not always, give an incomplete loop', () => {
  let open = 0, total = 0;
  for (let seed = 1; seed <= 200; seed++) for (const fault of ['early-termination', 'cough', 'glottic-closure']) {
    total++;
    if (buildInspiratory({ fvc: 3.5, faults: [fault] }, { seed, index: 0 }).flags[0] === 'incomplete-loop') open++;
  }
  assert.ok(open > 0.15 * total && open < 0.7 * total, `${open} of ${total}`);
});

test('variable effort gives loops that differ in peak flow and shape, not only in size', () => {
  const loops = [];
  for (let i = 0; i < 8; i++) loops.push(buildInspiratory({ fvc: 4, faults: ['variable-effort'] }, { seed: 21, index: i }));
  const pifs = loops.map((l) => l.pif);
  assert.ok(Math.max(...pifs) / Math.min(...pifs) > 1.25, `PIF ratio ${Math.max(...pifs) / Math.min(...pifs)}`);
  // Compare shapes after normalizing: flow as a fraction of PIF against inspired fraction of volume.
  const shape = (l) => {
    const total = l.v[0] - l.v[l.v.length - 1];
    return [0.1, 0.25, 0.5, 0.75, 0.9].map((q) => {
      const i = l.v.findIndex((x) => (l.v[0] - x) / total >= q);
      return -l.f[i] / l.pif;
    });
  };
  const ref = shape(loops[0]);
  const maxDiff = Math.max(...loops.slice(1).map((l) => Math.max(...shape(l).map((x, j) => Math.abs(x - ref[j])))));
  assert.ok(maxDiff > 0.04, `normalized shapes differ by at most ${maxDiff}`);
  // A set of good maneuvers is much more alike.
  const good = [0, 1, 2, 3].map((i) => buildInspiratory({ fvc: 4, faults: [] }, { seed: 21, index: i }));
  const gp = good.map((l) => l.pif);
  assert.ok(Math.max(...gp) / Math.min(...gp) < 1.2);
  assert.ok(loops.some((l) => l.flags.includes('variable-inspiratory-effort')));
});

test('a scenario can add faults without editing the maneuver', () => {
  const insp = buildInspiratory({ fvc: 3, faults: [] }, { seed: 1, index: 0, scenario: { faults: ['leak'] } });
  assert.equal(insp.flags[0], 'incomplete-loop');
});

test('the plot grid is fine near the start and the end, coarse in between, and ends exactly at the stop', () => {
  for (const tEnd of [0.5, 2.7, 6, 15]) {
    const g = plotGrid(tEnd);
    assert.equal(g[0], 0);
    assert.equal(g[g.length - 1], tEnd);
    for (let i = 1; i < g.length; i++) assert.ok(g[i] > g[i - 1]);
    assert.ok(g.length < 520, `${g.length} points for ${tEnd} s`);
  }
});

const FAULT_SETS = [['cough'], ['glottic-closure'], ['early-termination'], ['leak'], ['mouthpiece-obstruction'], ['variable-effort'], ['slow-start'], ['cough', 'variable-effort', 'leak']];

test('artifacts keep the end volume and the FEV1 volume, flow stays non-negative, and the input is not mutated', () => {
  for (const [fvc, fev1, k, T, tStop] of [[4.5, 3.6, 0.9, 12, 12], [3.2, 1.2, 0.7, 15, 15], [2.5, 2.0, 1.0, 12, 3.1], [5, 3.9, 0.95, 12, 1.4]]) {
    const curve = curveOf(fvc, fev1, k, 0.035, T);
    const base = sampleExpiration(fns, curve, tStop);
    const copy = JSON.parse(JSON.stringify(base));
    const { t0 } = backExtrapolation(curve);
    for (const faults of FAULT_SETS) for (const seed of [1, 2, 3, 77]) {
      const out = applyArtifacts(base, faults, seed);
      assert.deepEqual(base, copy);
      const n = out.t.length;
      assert.equal(n, base.t.length);
      assert.ok(Math.abs(out.v[n - 1] - base.v[n - 1]) < 1e-9, `end volume, ${faults}`);
      if (t0 + 1 < tStop) {
        const i = base.t.findIndex((x) => x >= t0 + 1);
        assert.ok(Math.abs(out.v[i] - base.v[i]) < 0.004, `FEV1 volume moved by ${out.v[i] - base.v[i]} with ${faults}`);
      }
      assert.ok(out.f.every((x) => x >= -1e-9), `negative flow with ${faults}`);
      assert.ok(out.v.every(Number.isFinite) && out.f.every(Number.isFinite));
      // Volume is the integral of the plotted flow (the sampled flow integrates to the sampled volume to within quadrature error).
      assert.ok(Math.abs(trapz(out.t, out.f) - (out.v[n - 1] - out.v[0])) < 0.03 * fvc, `volume and flow disagree with ${faults}`);
    }
  }
});

test('no faults, no change; same inputs, same output; different seed, different cough', () => {
  const curve = curveOf(4.5, 3.6);
  const base = sampleExpiration(fns, curve, 12);
  const none = applyArtifacts(base, [], 5);
  assert.deepEqual({ t: none.t, v: none.v, f: none.f }, base);
  assert.equal(none.endsAbruptly, false);
  assert.deepEqual(applyArtifacts(base, ['cough'], 5), applyArtifacts(base, ['cough'], 5));
  assert.notDeepEqual(applyArtifacts(base, ['cough'], 5).f, applyArtifacts(base, ['cough'], 6).f);
});

test('a cough adds zero-net-volume spikes in the first second only', () => {
  const curve = curveOf(4.5, 3.6);
  const base = sampleExpiration(fns, curve, 12);
  for (let seed = 1; seed <= 20; seed++) {
    const out = applyArtifacts(base, ['cough'], seed);
    let maxUp = 0, maxDev = 0;
    out.t.forEach((t, i) => {
      const d = out.f[i] - base.f[i];
      if (t > 1.0 + 1e-9) assert.ok(Math.abs(d) < 1e-9 && Math.abs(out.v[i] - base.v[i]) < 1e-9, 'unchanged after the first second');
      maxUp = Math.max(maxUp, d); maxDev = Math.max(maxDev, Math.abs(d));
    });
    assert.ok(maxUp > 0.5, `spike height ${maxUp} L/s`);
    assert.ok(out.applied.includes('cough'));
    // Net volume change over the whole cough window is zero: at 1 s the volume is back on the curve.
    const i1 = out.t.findIndex((t) => t >= 1.0);
    assert.ok(Math.abs(out.v[i1] - base.v[i1]) < 1e-9);
  }
});

test('glottic closure ends with exactly zero flow after a steep fall, early termination ends at non-zero flow', () => {
  const curve = curveOf(3.2, 1.2, 0.7, 0.035, 15);
  const base = sampleExpiration(fns, curve, 1.8);
  const g = applyArtifacts(base, ['glottic-closure'], 3);
  const n = g.t.length;
  assert.equal(g.f[n - 1], 0);
  assert.ok(g.endsAtZeroFlow && g.endsAbruptly);
  assert.ok(base.f[n - 1] > 0.3, 'the curve itself is still flowing at the stop');
  assert.ok(Math.abs(g.v[n - 1] - base.v[n - 1]) < 1e-12);
  assert.ok(g.f.every((x) => x >= 0));
  const e = applyArtifacts(base, ['early-termination'], 3);
  assert.ok(e.endsAbruptly && !e.endsAtZeroFlow);
  assert.ok(e.f[n - 1] > 0.3);
  assert.deepEqual(e.f, base.f);
});

test('leak and mouthpiece obstruction make the flow irregular; obstruction shows a step in flow', () => {
  const curve = curveOf(4.5, 3.6);
  const base = sampleExpiration(fns, curve, 12);
  const roughness = (f) => f.slice(1).reduce((s, x, i) => s + Math.abs(x - f[i]), 0);
  assert.ok(roughness(applyArtifacts(base, ['leak'], 8).f) > 1.05 * roughness(base.f));
  const o = applyArtifacts(base, ['mouthpiece-obstruction'], 8);
  let maxDrop = 0;
  o.t.forEach((t, i) => { if (t > 0.2 && t < 0.9) maxDrop = Math.max(maxDrop, (base.f[i] - o.f[i]) / base.f[i]); });
  assert.ok(maxDrop > 0.3, `flow reduced by ${maxDrop}`);
});

test('variable effort changes the descending limb but not peak flow time, FVC or FEV1', () => {
  const curve = curveOf(4.5, 3.4);
  const base = sampleExpiration(fns, curve, 12);
  const pk = peakFlow(curve);
  const out = applyArtifacts(base, ['variable-effort'], 12);
  assert.ok(out.applied.includes('variable-effort'));
  const dev = Math.max(...out.v.map((v, i) => Math.abs(v - base.v[i])));
  assert.ok(dev > 0.01 && dev < 0.15, `descending limb deviation ${dev}`);
  out.t.forEach((t, i) => { if (t <= pk.t + 0.05) assert.ok(Math.abs(out.f[i] - base.f[i]) < 1e-9); });
});

test('slow start is applied only to a curve that is not already slow', () => {
  const fast = sampleExpiration(fns, curveOf(4.5, 3.6, 0.9, 0.035), 12);
  const w = applyArtifacts(fast, ['slow-start'], 4);
  assert.ok(w.applied.includes('slow-start'));
  const peakT = (s) => s.t[s.f.indexOf(Math.max(...s.f))];
  assert.ok(peakT(w) > peakT(fast) + 0.05, 'delayed peak');
  assert.ok(Math.max(...w.f) < Math.max(...fast.f) * 0.95, 'lower, rounded peak');
  assert.ok(Math.abs(w.v[w.v.length - 1] - fast.v[fast.v.length - 1]) < 1e-9);
  const slow = sampleExpiration(fns, curveOf(4.5, 3.6, 0.9, 0.2), 12);
  assert.deepEqual(applyArtifacts(slow, ['slow-start'], 4).f, slow.f);
});
