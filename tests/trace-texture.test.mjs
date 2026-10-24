/**
 * Within-blow texture of the plotted spirometry traces (src/core/trace-texture.js) and the open-shutter resistance figure of the
 * summary sheet. The texture is display only: these tests check that it leaves the case and every tabulated value alone, that the
 * plotted trace keeps the values a reader takes from the plot (FVC, FEV1 at 1 s after time zero, PEF, BEV, the FEF25-75 crossings,
 * the plateau) for maneuvers without fault artifacts, that the named fault artifacts are drawn on exactly the samples they were
 * drawn on before, and that the modulation is smooth, bounded and not periodic. Numerical agreement is not clinical validation:
 * the amplitudes are unverified teaching values (docs/trace-texture-model.md).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { loadDatasets } from '../src/reference/load.js';
import { buildCase } from '../src/core/case.js';
import { ARCHETYPES, TECHNIQUE_LEVELS } from '../src/core/descriptor.js';
import { GENERATOR_VERSION } from '../src/core/standards.js';
import { volume, flow, peakFlow, timeAtVolume, solveCurve } from '../src/core/curve.js';
import { sampleExpiration, applyArtifacts, buildInspiratory, loopClosure } from '../src/core/inspiratory.js';
import { expiratoryTexture, sampleTextured, warpAt, textureInspiration, TRACE_RENDERING_ID } from '../src/core/trace-texture.js';
import { maneuverTrace, computeManeuverTrace, traceFingerprint, artifactSeed } from '../src/ui/figures/traces.js';
import { spirometryData } from '../src/ui/figures/panel-spirometry.js';
import { createReference } from '../src/reference/gli.js';
import { interpret } from '../src/interpret/interpret.js';
import { FIGURES } from '../src/ui/figures/index.js';
import { repPlethLoop } from '../src/ui/figures/representative.js';
import { TRACE_DESCRIPTORS, traceHashes } from '../tools/trace-rendering-hashes.mjs';

const ds = await loadDatasets();

/** Every maneuver of a sweep: 12 seeds x 10 archetypes, technique and severity cycling, plus scenario cases with fault artifacts. */
const SWEEP = [];
for (let s = 1; s <= 12; s++) for (const a of ARCHETYPES) SWEEP.push({ seed: s, archetype: a, technique: TECHNIQUE_LEVELS[s % 3], severity: 1 + (s % 3) });
for (const ids of [['qs-cough-first-second'], ['qs-leak'], ['qs-tongue-teeth'], ['qs-variable-effort'], ['qs-slow-start'], ['qs-glottic-closure']]) SWEEP.push({ seed: 21, archetype: 'obstruction', technique: 'fair', scenarioIds: ids });
const ROWS = [];
for (const d of SWEEP) {
  const c = buildCase(d, ds);
  for (const [set, ms] of [['pre', c.spirometry.pre], ['post', c.spirometry.post]]) {
    if (!ms) continue;
    ms.maneuvers.forEach((m, i) => ROWS.push({ c, d, set, i, m }));
  }
}
const CLEAN = ROWS.filter((r) => !r.m.faults.length);

/** The plotted expiration as it was drawn before the texture existed: the curve sampled on the plot grid, then the artifacts. */
const before = ({ c, set, i, m }) => applyArtifacts(sampleExpiration({ volume, flow }, m.curve, m.fet), m.faults, artifactSeed(c.descriptor.seed, i, set));
const after = ({ c, set, i, m }) => maneuverTrace(m, { seed: c.descriptor.seed, index: i, set, scenario: c.scenario ?? null });

const interp = (t, y, x) => { let k = 1; while (k < t.length - 1 && t[k] < x) k++; return y[k - 1] + ((y[k] - y[k - 1]) * (x - t[k - 1])) / (t[k] - t[k - 1]); };
const crossing = (t, v, y) => { for (let k = 1; k < v.length; k++) if (v[k] >= y) return t[k - 1] + ((y - v[k - 1]) * (t[k] - t[k - 1])) / (v[k] - v[k - 1]); return NaN; };
/** What a reader takes from the plotted arrays, computed the way the figures and applyArtifacts do. */
function readOff(e, m) {
  let ip = 0;
  for (let k = 1; k < e.t.length && e.t[k] <= 2; k++) if (e.f[k] > e.f[ip]) ip = k;
  const pef = e.f[ip], t0 = Math.max(0, e.t[ip] - e.v[ip] / pef), n = e.t.length, fvc = e.v[n - 1];
  return {
    pef, bev: interp(e.t, e.v, t0), fev1: interp(e.t, e.v, m.t0 + 1), fvc,
    plateau: fvc - interp(e.t, e.v, e.t[n - 1] - 1),
    fef2575: (0.5 * fvc) / (crossing(e.t, e.v, 0.75 * fvc) - crossing(e.t, e.v, 0.25 * fvc)),
  };
}
const trapzError = (e) => {
  let acc = e.v[0], worst = 0;
  for (let k = 1; k < e.t.length; k++) { acc += 0.5 * (e.f[k] + e.f[k - 1]) * (e.t[k] - e.t[k - 1]); worst = Math.max(worst, Math.abs(acc - e.v[k])); }
  return worst;
};

test('the sweep covers clean and faulty maneuvers, pre and post', () => {
  assert.ok(CLEAN.length > 200, `${CLEAN.length} clean maneuvers`);
  assert.ok(ROWS.length - CLEAN.length > 200, `${ROWS.length - CLEAN.length} maneuvers with faults`);
  assert.ok(ROWS.some((r) => r.set === 'post'));
  assert.ok(ROWS.filter((r) => after(r).texture.active).length > 0.8 * CLEAN.length);
});

test('drawing a trace does not change the case: the case hash is the same before and after rendering every maneuver', () => {
  const c = buildCase({ seed: 11, archetype: 'mixed' }, ds);
  const h = () => createHash('sha256').update(JSON.stringify(c)).digest('hex');
  const h0 = h();
  for (const [set, ms] of [['pre', c.spirometry.pre], ['post', c.spirometry.post]]) ms?.maneuvers.forEach((m, i) => maneuverTrace(m, { seed: 11, index: i, set }));
  assert.equal(h(), h0);
  assert.equal(GENERATOR_VERSION, 2);
});

test('exact anchors: the warped volume equals the curve at the guard, 25, 50 and 75% of FVC, FEV1 time and the quiet end', () => {
  for (const { c, set, i, m } of CLEAN) {
    const tex = expiratoryTexture(m.curve, m.fet, { seed: c.descriptor.seed, set, index: i });
    if (!tex.active) continue;
    const vAt = (x) => volume(m.curve, x + warpAt(tex, x).delta);
    for (const a of tex.anchors) assert.ok(Math.abs(vAt(a) - volume(m.curve, a)) < 1e-9, `${set}:${i} anchor ${a}`);
    assert.ok(Math.abs(vAt(m.t0 + 1) - m.fev1) < 1e-6, 'FEV1 within 0.001 mL');
    assert.ok(Math.abs(vAt(m.fet) - m.fvc) < 1e-9, 'FVC');
    for (const q of [0.25, 0.5, 0.75]) { const tq = timeAtVolume(m.curve, q * m.fvc); if (Number.isFinite(tq)) assert.ok(Math.abs(vAt(tq) - q * m.fvc) < 1e-9, `${q} of FVC`); }
    assert.ok(Math.max(...tex.m.map(Math.abs)) <= 0.08 + 1e-12, 'cap of 8%');
  }
});

test('clean maneuvers: PEF, BEV, FVC and the plateau read from the plot are those of the previous rendering, bit for bit', () => {
  for (const r of CLEAN) {
    const o = readOff(before(r), r.m), n = readOff(after(r).exp, r.m);
    for (const k of ['pef', 'bev', 'fvc', 'plateau']) assert.equal(n[k], o[k], `${r.d.archetype} ${r.set}:${r.i} ${k}`);
    assert.ok(Math.abs(n.fev1 - r.m.fev1) <= 0.001, `FEV1 at 1 s from the plot within 1 mL of the table: ${n.fev1 - r.m.fev1}`);
    assert.ok(Math.abs(n.fev1 - o.fev1) <= 1e-4, 'FEV1 at 1 s moves by at most 0.1 mL against the previous rendering');
    assert.ok(Math.abs(n.fef2575 / o.fef2575 - 1) <= 0.002, 'FEF25-75 from the plotted crossings within 0.2% of the previous rendering');
    assert.ok(Math.abs(n.fef2575 / r.m.fef2575 - 1) <= 0.005, 'and within 0.5% of the table');
  }
});

test('clean maneuvers: outside the active window every plotted sample is unchanged; flow stays non-negative, volume monotone, no new peak', () => {
  for (const r of CLEAN) {
    const o = before(r), { exp: e, texture: tex } = after(r);
    const pef = peakFlow(r.m.curve).pef;
    for (let k = 0; k < e.t.length; k++) {
      assert.ok(Number.isFinite(e.v[k]) && Number.isFinite(e.f[k]));
      assert.ok(e.f[k] >= 0, 'non-negative flow');
      if (k) assert.ok(e.v[k] >= e.v[k - 1] - 1e-12, 'monotone volume');
      if (!tex.active || e.t[k] <= tex.active[0] || e.t[k] >= tex.active[1]) { assert.equal(e.v[k], o.v[k]); assert.equal(e.f[k], o.f[k]); }
      else assert.ok(e.f[k] <= 0.97 * pef + 1e-12, 'no new peak after the guard (fixed 0.97 PEF, independent of the module constant)');
    }
  }
});

test('independent integration of the plotted flow: the texture adds at most 0.5 mL to the trapezoid error of the plot grid, and none on a 1 ms grid', () => {
  let worstAdded = 0, worstFine = 0;
  for (const r of CLEAN) {
    worstAdded = Math.max(worstAdded, trapzError(after(r).exp) - trapzError(before(r)));
    const tex = after(r).texture;
    if (!tex.active) continue;
    const fine = sampleTextured(r.m.curve, Array.from({ length: Math.floor(r.m.fet / 0.001) + 1 }, (_, k) => k * 0.001), tex);
    const base = sampleExpiration({ volume, flow }, r.m.curve, r.m.fet);
    worstFine = Math.max(worstFine, trapzError(fine) - trapzError({ t: fine.t, v: fine.t.map((x) => volume(r.m.curve, x)), f: fine.t.map((x) => flow(r.m.curve, x)) }));
    assert.ok(base.t.length > 0);
  }
  assert.ok(worstAdded <= 0.0005, `added error on the plot grid ${worstAdded} L`);
  assert.ok(worstFine <= 0.0001, `added error on a 1 ms grid ${worstFine} L`);
});

test('maneuvers with fault artifacts: every artifact is drawn on the samples it had before; what the plot shows near the peak is unchanged', () => {
  const faulty = ROWS.filter((r) => r.m.faults.length);
  for (const r of faulty) {
    const o = before(r), { exp: e, texture: tex } = after(r);
    assert.deepEqual(e.applied, o.applied, 'the same artifacts are applied');
    assert.equal(e.endsAbruptly, o.endsAbruptly);
    assert.equal(e.endsAtZeroFlow, o.endsAtZeroFlow);
    for (let k = 0; k < e.t.length; k++) if (!tex.active || e.t[k] <= tex.active[0] || e.t[k] >= tex.active[1]) { assert.equal(e.v[k], o.v[k]); assert.equal(e.f[k], o.f[k]); }
    // PEF and BEV read off the plot are the previous rendering's (they may already differ from the table, e.g. cough spikes).
    const a = readOff(o, r.m), b = readOff(e, r.m);
    assert.equal(b.pef, a.pef); assert.equal(b.bev, a.bev); assert.equal(b.fvc, a.fvc);
  }
});

test('the modulation is smooth, bounded, of a few percent, and not periodic', () => {
  const rms = [], peaks = [];
  for (const { c, set, i, m } of CLEAN) {
    const tex = expiratoryTexture(m.curve, m.fet, { seed: c.descriptor.seed, set, index: i });
    if (!tex.active) continue;
    const N = 1024, [a0, a1] = tex.active, z = [];
    let j = 0;
    for (let k = 0; k < N; k++) { const x = a0 + ((a1 - a0) * (k + 0.5)) / N; while (tex.grid[j + 1] < x) j++; z.push(tex.m[j]); }
    rms.push(Math.sqrt(z.reduce((s, q) => s + q * q, 0) / N));
    const mu = z.reduce((s, q) => s + q, 0) / N, dz = z.map((q) => q - mu), v0 = dz.reduce((s, q) => s + q * q, 0);
    const ac = (L) => { let s = 0; for (let k = 0; k + L < N; k++) s += dz[k] * dz[k + L]; return (s / v0) * (N / (N - L)); };
    let L = 1;
    while (L < N / 2 && ac(L) > 0) L++;
    let peak = -1;
    for (let LL = L; LL < N / 2; LL += 2) peak = Math.max(peak, ac(LL));
    peaks.push(peak);
    // smooth, not white: neighbouring samples of the fine grid 5 ms apart are strongly correlated
    const xs = [], ys = [];
    for (let q = 0; q + 5 < tex.grid.length; q += 7) { xs.push(tex.m[q]); ys.push(tex.m[q + 5]); }
    const mx = xs.reduce((s, q) => s + q, 0) / xs.length, my = ys.reduce((s, q) => s + q, 0) / ys.length;
    let sxy = 0, sxx = 0, syy = 0;
    xs.forEach((x, k) => { sxy += (x - mx) * (ys[k] - my); sxx += (x - mx) ** 2; syy += (ys[k] - my) ** 2; });
    assert.ok(sxy / Math.sqrt(sxx * syy) > 0.95, 'lag-5 ms correlation');
  }
  rms.sort((a, b) => a - b);
  const med = rms[rms.length >> 1];
  assert.ok(med > 0.008 && med < 0.03, `median RMS modulation ${med}`);
  assert.ok(Math.max(...peaks) < 0.75, `autocorrelation after the first zero crossing peaks at ${Math.max(...peaks)} (a sinusoid gives 1)`);
});

test('streams: deterministic, distinct for pre and post and for each maneuver, and independent of technique and late faults', () => {
  const c = buildCase({ seed: 11, archetype: 'obstruction' }, ds);
  const m = c.spirometry.pre.maneuvers[0];
  const a = expiratoryTexture(m.curve, m.fet, { seed: 11, set: 'pre', index: 0 });
  assert.deepEqual(expiratoryTexture(m.curve, m.fet, { seed: 11, set: 'pre', index: 0 }), a);
  assert.notDeepEqual(expiratoryTexture(m.curve, m.fet, { seed: 11, set: 'post', index: 0 }).m, a.m);
  assert.notDeepEqual(expiratoryTexture(m.curve, m.fet, { seed: 11, set: 'pre', index: 1 }).m, a.m);
  // Early termination and glottic closure have no window before the quiet end, so the texture is that of the clean maneuver.
  const t1 = maneuverTrace({ ...m, faults: [] }, { seed: 11, index: 0, set: 'pre' }).texture;
  const t2 = maneuverTrace({ ...m, faults: ['early-termination'] }, { seed: 11, index: 0, set: 'pre' }).texture;
  assert.deepEqual(t2.m, t1.m);
});

test('inspiratory limb: FIVC, the closure flag and the sign are kept; PIF is read from the textured flow', () => {
  for (const r of ROWS) {
    const { insp } = after(r);
    const base = r.m.inspiratory ?? buildInspiratory(r.m, { seed: r.c.descriptor.seed, index: r.i + (r.set === 'post' ? 100 : 0), scenario: r.c.scenario ?? null });
    assert.ok(Math.abs((insp.v[0] - insp.v[insp.v.length - 1]) - insp.fivc) < 1e-9, 'FIVC');
    assert.equal(insp.fivc, base.fivc);
    assert.deepEqual(insp.flags, base.flags);
    assert.equal(insp.flags[0], loopClosure(r.m.fvc, insp.fivc));
    assert.ok(insp.f.every((q) => q <= 0), 'inspiratory flow is negative or zero');
    assert.equal(insp.pif, Math.max(...insp.f.map((q) => -q)));
    assert.equal(insp.t.length, base.t.length);
  }
});

test('trace rendering is recorded: fixture, identifier and the svg root of every spirometry figure', () => {
  const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/trace-rendering-hashes.json', import.meta.url), 'utf8'));
  assert.equal(fx.traceRendering, TRACE_RENDERING_ID, 'raise TRACE_TEXTURE_MODEL.version when the plotted traces change, then rewrite the fixture');
  assert.equal(fx.generatorVersion, GENERATOR_VERSION);
  assert.equal(fx.cases.length, TRACE_DESCRIPTORS.length);
  for (const { descriptor, traces } of fx.cases) assert.deepEqual(traceHashes(buildCase(descriptor, ds)), traces, `${descriptor.archetype} ${descriptor.seed}: plotted traces changed under ${TRACE_RENDERING_ID}`);
  const c = buildCase({ seed: 11, archetype: 'mixed' }, ds);
  for (const id of ['panel-spirometry', 'flow-volume', 'volume-time', 'rep-flow-volume', 'rep-volume-time']) {
    const f = FIGURES[id];
    const svg = f.render(f.dataFor({ ...c }), { palette: 'white' });
    assert.match(svg, new RegExp(`^<svg[^>]*data-trace-rendering="${TRACE_RENDERING_ID}"`), id);
  }
});

test('summary plethysmography figure: the open-shutter resistance loop from the stored arrays, the estimator named as the simulator\'s', () => {
  for (const archetype of ['normal', 'obstruction', 'restriction-parenchymal', 'mixed']) {
    const c = buildCase({ seed: 11, archetype }, ds);
    const data = repPlethLoop.dataFor(c);
    assert.equal(data.raw, c.pleth.raw, 'the stored arrays, not a copy or a new model');
    const svg = repPlethLoop.render(data, { palette: 'white', width: 336, height: 106 });
    assert.ok(svg.includes('<title>Specific airway-resistance loop, shutter open</title>'));
    assert.ok(svg.includes('Least-squares fit, |flow| ≤ 0.5 L/s'));
    assert.doesNotMatch(svg, /sRtot|sR0\.5|sReff|sR_?eff|sRmid/i, 'no vendor estimator name');
    assert.doesNotMatch(svg, /accept|usable|reject|grade/i, 'the figure does not state quality');
    assert.match(svg, /expiration/); assert.match(svg, /inspiration/);
    assert.ok(svg.includes('shift + = alveolar compression'));
    // The unit label is right-aligned inside the figure (a 0.8 px overflow of an earlier draft failed the mobile-layout ink check).
    const unit = /<text x="([\d.]+)" y="[\d.]+"[^>]*text-anchor="end"[^>]*>mL<\/text>/.exec(svg);
    assert.ok(unit && Number(unit[1]) <= 336 - 4, 'mL label is anchored at its end inside the figure');
    // One polyline point per stored sample.
    const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((x) => x[1].split(/[ML]/).filter((q) => q.trim()).length);
    assert.ok(paths.includes(c.pleth.raw.flow.length), 'every stored sample is drawn');
    // The caption names the shutter-closed trial with its thoracic gas volume and the reported FRC.
    assert.equal(data.caption, `Shutter closed: trial 1 of ${c.pleth.trials.length}, TGV ${c.pleth.trials[0].frcL.toFixed(2)} L; reported FRC ${c.pleth.reportedFrcL.toFixed(2)} L`);
    // The resistance values in the table come from the same record: Raw = sRaw / reported FRC, sGaw = 1 / sRaw.
    assert.ok(Math.abs(c.pleth.raw.rawKpaSL - c.pleth.raw.sRawKpaS / c.pleth.reportedFrcL) < 1e-3);
    assert.ok(Math.abs(c.pleth.raw.sGawPerKpaS - 1 / c.pleth.raw.sRawKpaS) < 1e-3);
  }
  assert.equal(repPlethLoop.dataFor(buildCase({ seed: 11, archetype: 'normal', panel: 'spirometry' }, ds)), null);
});

test('trace cache: a hit is the same frozen object and equals the uncached computation; it never alters the case', () => {
  const c = buildCase({ seed: 11, archetype: 'obstruction' }, ds);
  const h0 = createHash('sha256').update(JSON.stringify(c)).digest('hex');
  for (const [set, ms] of [['pre', c.spirometry.pre], ['post', c.spirometry.post]]) ms.maneuvers.forEach((m, i) => {
    const o = { seed: 11, index: i, set, scenario: c.scenario ?? null };
    const a = maneuverTrace(m, o), b = maneuverTrace(m, o);
    assert.equal(a, b, 'second call is a cache hit');
    assert.deepEqual(a, computeManeuverTrace(m, o), 'cached output equals the uncached computation');
    assert.ok(Object.isFrozen(a) && Object.isFrozen(a.exp.f) && Object.isFrozen(a.insp.v) && Object.isFrozen(a.exp.applied));
    assert.throws(() => { a.exp.f[3] = 0; }, TypeError, 'writing into a cached array throws');
    assert.throws(() => { a.insp.flags.push('x'); }, TypeError);
    assert.ok(!Object.isFrozen(m) && !Object.isFrozen(m.faults) && !Object.isFrozen(m.curve), 'the maneuver is not frozen');
  });
  assert.equal(createHash('sha256').update(JSON.stringify(c)).digest('hex'), h0);
});

test('trace cache: seed, set, index and scenario faults select different traces, each equal to its uncached computation', () => {
  const c = buildCase({ seed: 11, archetype: 'mixed' }, ds);
  const m = c.spirometry.pre.maneuvers[0];
  const variants = [{ seed: 11, index: 0, set: 'pre' }, { seed: 12, index: 0, set: 'pre' }, { seed: 11, index: 0, set: 'post' }, { seed: 11, index: 1, set: 'pre' }, { seed: 11, index: 0, set: 'pre', scenario: { faults: ['leak'] } }];
  const got = variants.map((o) => maneuverTrace(m, o));
  variants.forEach((o, k) => assert.deepEqual(got[k], computeManeuverTrace(m, o), JSON.stringify(o)));
  for (let k = 1; k < got.length; k++) assert.notDeepEqual(got[k], got[0], `variant ${k} differs from the first`);
  // Asking for the first variant again after the others still returns its own trace.
  assert.deepEqual(maneuverTrace(m, variants[0]), got[0]);
  // The fingerprint names the trace rendering, so a version change can never reuse an entry.
  assert.ok(traceFingerprint(m, variants[0]).includes(TRACE_RENDERING_ID));
});

test('trace cache: changing a maneuver after a first call recomputes; no stale artifact or curve is returned', () => {
  const c = buildCase({ seed: 11, archetype: 'normal' }, ds);
  const m = structuredClone(c.spirometry.pre.maneuvers[0]);
  const o = { seed: 11, index: 0, set: 'pre' };
  const first = maneuverTrace(m, o);
  assert.deepEqual(first.exp.applied, []);
  m.faults.push('cough');
  const cough = maneuverTrace(m, o);
  assert.notEqual(cough, first);
  assert.deepEqual(cough.exp.applied, ['cough'], 'the newly added fault is drawn');
  assert.deepEqual(cough, computeManeuverTrace(m, o));
  m.faults = [];
  assert.deepEqual(maneuverTrace(m, o).exp.applied, [], 'removing the fault removes the artifact');
  m.curve.k += 0.05;
  assert.deepEqual(maneuverTrace(m, o), computeManeuverTrace(m, o), 'a changed curve recomputes');
  m.fet = Math.min(m.fet, 6);
  assert.deepEqual(maneuverTrace(m, o), computeManeuverTrace(m, o), 'a changed end of expiration recomputes');
  const insp = { ...computeManeuverTrace(m, o).insp, fivc: m.fvc };
  m.inspiratory = insp;
  assert.deepEqual(maneuverTrace(m, o), computeManeuverTrace(m, o), 'an inspiratory limb set on the maneuver is used');
  assert.ok(!Object.isFrozen(insp.t), 'freezing the result never reaches an input array');
});

test('trace cache: a new case, an equation change and the quality setting give the same traces', () => {
  const d = { seed: 11, archetype: 'obstruction' };
  const c1 = buildCase(d, ds), c2 = buildCase(d, ds);
  const { resolveReference } = createReference(ds);
  const a = spirometryData({ ...c1, revealed: false }, interpret(c1.report, resolveReference, 'GLIglobal'));
  const b = spirometryData({ ...c1, revealed: true }, interpret(c1.report, resolveReference, 'GLI2012'));
  const n = spirometryData({ ...c2, revealed: false }, interpret(c2.report, resolveReference, 'GLIglobal'));
  a.sets.forEach((set, k) => set.maneuvers.forEach((m, i) => {
    assert.equal(b.sets[k].maneuvers[i].exp.f, m.exp.f, 'equation and quality setting reuse the cached arrays');
    assert.deepEqual(n.sets[k].maneuvers[i].exp, m.exp, 'a new case object with the same descriptor draws the same trace');
    assert.deepEqual(n.sets[k].maneuvers[i].insp, m.insp);
  }));
  assert.equal(a.sets.length, 2, 'pre and post');
});

test('trace cache: in-place changes of mutable inputs recompute (review repro: inspiratory flow sample 50 halved after a first call)', () => {
  const { curve } = solveCurve({ fvc: 4, fev1: 3, k: 1, r: 0.05, T: 8 });
  const m = { curve, fvc: 4, fet: 8, faults: [] };
  m.inspiratory = buildInspiratory(m, { seed: 11, index: 0 });
  const o = { seed: 11, index: 0, set: 'pre' };
  const first = maneuverTrace(m, o);
  const f50 = first.insp.f[50];
  m.inspiratory.f[50] *= 0.5;
  const second = maneuverTrace(m, o);
  assert.notEqual(second, first, 'an in-place change of a supplied inspiratory array is not answered from the cache');
  assert.deepEqual(second, computeManeuverTrace(m, o));
  assert.ok(Math.abs(second.insp.f[50] - f50) > 1, `sample 50 follows the input: ${f50} then ${second.insp.f[50]}`);
  // Other in-place changes: a time sample and the FIVC of the supplied limb, a fault pushed into the array, a curve parameter, the end time,
  // and the faults of the scenario object.
  m.inspiratory.t[10] += 1e-4;
  assert.deepEqual(maneuverTrace(m, o), computeManeuverTrace(m, o));
  m.inspiratory.fivc *= 0.99;
  assert.deepEqual(maneuverTrace(m, o), computeManeuverTrace(m, o));
  m.faults.push('variable-effort');
  assert.deepEqual(maneuverTrace(m, o).exp.applied, ['variable-effort']);
  m.curve.r *= 1.1;
  assert.deepEqual(maneuverTrace(m, o), computeManeuverTrace(m, o));
  m.fet = 7;
  assert.deepEqual(maneuverTrace(m, o), computeManeuverTrace(m, o));
  delete m.inspiratory;
  const scenario = { faults: [] };
  const os = { ...o, scenario };
  const before = maneuverTrace(m, os);
  scenario.faults.push('leak');
  const after = maneuverTrace(m, os);
  assert.notEqual(after, before);
  assert.deepEqual(after, computeManeuverTrace(m, os), 'a fault pushed into the scenario array is seen');
  // Unchanged inputs are still a cache hit.
  assert.equal(maneuverTrace(m, os), after);
});

test('inspiratory cap: the final modulation never exceeds 12%, FIVC is kept (review repro: seed 23 and seed 9010; seeds 0 to 9999)', () => {
  const ratio = (inp, out) => {
    let worst = 0;
    for (let j = 1; j < inp.f.length - 1; j++) if (Math.abs(inp.f[j]) > 1e-12) worst = Math.max(worst, Math.abs(out.f[j] / inp.f[j] - 1));
    return worst;
  };
  let violations = 0, worst = 0, binding = 0;
  for (let seed = 0; seed < 10000; seed++) {
    const inp = buildInspiratory({ fvc: 4, faults: [] }, { seed, index: 0 });
    const out = textureInspiration(inp, { seed, set: 'pre', index: 0 });
    const r = ratio(inp, out);
    worst = Math.max(worst, r);
    if (r > 0.12 + 1e-12) violations++;
    if (r > 0.12 - 1e-9) binding++;
    assert.ok(Math.abs((out.v[0] - out.v[out.v.length - 1]) - inp.fivc) < 1e-9, `seed ${seed}: FIVC kept`);
  }
  assert.equal(violations, 0, `largest final modulation ${worst}`);
  assert.ok(binding >= 20, `the cap binds in ${binding} seeds (the review found 23 above it before the correction)`);
  for (const seed of [23, 9010]) {
    const inp = buildInspiratory({ fvc: 4, faults: [] }, { seed, index: 0 });
    const r = ratio(inp, textureInspiration(inp, { seed, set: 'pre', index: 0 }));
    assert.ok(r <= 0.12 + 1e-12 && r > 0.1199, `seed ${seed}: ${r} (was 0.1278 and 0.1402 before the correction)`);
  }
});
