import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDatasets } from '../src/reference/load.js';
import { createReference } from '../src/reference/gli.js';
import { buildCase } from '../src/core/case.js';
import { interpret } from '../src/interpret/interpret.js';
import { ARCHETYPES, resolveDescriptor } from '../src/core/descriptor.js';
import { selectScenarios, applyScenarios, LEVEL_TARGETS } from '../src/scenarios/apply.js';
import { SCENARIOS, getScenario, compatible } from '../src/scenarios/library.js';
import { cohbDlcoFactor, applyAcuteEffects } from '../src/core/physiology.js';

const ds = await loadDatasets();
const { resolveReference } = createReference(ds);
const build = (seed, archetype, ids, extra = {}) => buildCase({ seed, archetype, technique: 'good', scenarioLevel: 'light', scenarioIds: ids, ...extra }, ds);
const plain = (seed, archetype, extra = {}) => buildCase({ seed, archetype, technique: 'good', ...extra }, ds);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const seeds = (n, from = 1) => Array.from({ length: n }, (_, i) => from + i);

test('selection is deterministic and honours the level counts', () => {
  for (const level of Object.keys(LEVEL_TARGETS)) {
    const [lo, hi] = LEVEL_TARGETS[level];
    const counts = new Set();
    for (const seed of seeds(200)) {
      const archetype = ARCHETYPES[seed % ARCHETYPES.length];
      const a = selectScenarios({ seed, level, archetype, panel: 'full' }), b = selectScenarios({ seed, level, archetype, panel: 'full' });
      assert.deepEqual(a, b);
      assert.ok(a.ids.length >= lo && a.ids.length <= hi, `${level}: ${a.ids.length}`);
      counts.add(a.ids.length);
      assert.equal(new Set(a.ids).size, a.ids.length);
      for (let i = 0; i < a.ids.length; i++) for (let j = i + 1; j < a.ids.length; j++) assert.ok(compatible(getScenario(a.ids[i]), getScenario(a.ids[j])), `${a.ids[i]} with ${a.ids[j]}`);
      for (const p of a.picks) assert.ok(p.variant >= 0 && p.variant < getScenario(p.id).variants.length && p.u.length === 16);
    }
    if (level === 'heavy') assert.deepEqual([...counts].sort(), [3, 4]);
  }
  assert.deepEqual(selectScenarios({ seed: 1, level: 'none', archetype: 'normal' }), { level: 'none', ids: [], picks: [] });
});

test('selection respects applicability: bronchodilator studies need a full panel, kyphoscoliosis needs a chest-wall archetype', () => {
  for (const seed of seeds(300)) {
    const s = selectScenarios({ seed, level: 'heavy', archetype: 'restriction-parenchymal', panel: 'spirometry' });
    for (const id of s.ids) {
      assert.ok(!id.startsWith('dlco-') && !id.startsWith('pleth-') && id !== 'med-saba-recent' && id !== 'height-kyphoscoliosis' && id !== 'qs-bd-timing-short', id);
    }
  }
  let seen = 0;
  for (const seed of seeds(200)) if (selectScenarios({ seed, level: 'heavy', archetype: 'restriction-extraparenchymal' }).ids.includes('height-kyphoscoliosis')) seen++;
  assert.ok(seen > 20, `kyphoscoliosis chosen only ${seen} times`);
});

test('forced ids are always included and bad requests fail loudly', () => {
  const s = selectScenarios({ seed: 9, level: 'light', archetype: 'obstruction', forcedIds: ['qs-leak', 'med-saba-recent'] });
  assert.deepEqual(new Set(s.ids), new Set(['qs-leak', 'med-saba-recent']));
  assert.throws(() => selectScenarios({ seed: 9, level: 'light', archetype: 'obstruction', forcedIds: ['nonsense'] }), /unknown scenario/);
  assert.throws(() => selectScenarios({ seed: 9, level: 'light', archetype: 'obstruction', forcedIds: ['qs-leak', 'qs-tongue-teeth'] }), /cannot be combined/);
  assert.throws(() => selectScenarios({ seed: 9, level: 'extreme', archetype: 'obstruction' }), /level/);
});

test('every scenario can be forced onto a case and every variant renders without leftovers', () => {
  for (const s of SCENARIOS) {
    let built = 0;
    for (const seed of seeds(400)) {
      if (built >= 8) break;
      const archetype = ARCHETYPES[seed % ARCHETYPES.length];
      const d = resolveDescriptor({ seed, archetype, panel: 'full' });
      if (!s.applies(d, null)) continue;
      const c = build(seed, archetype, [s.id]);
      built++;
      assert.deepEqual(c.scenario.ids, [s.id]);
      for (const t of [...c.scenario.statements.map((x) => x.text), ...c.scenario.technologistComments]) assert.ok(t.length > 10 && !/[{}]|undefined|NaN/.test(t), `${s.id}: ${t}`);
    }
    assert.ok(built >= 5, `${s.id} applied to only ${built} of 400 cases`);
  }
});

test('height scenarios: the lab uses the estimated height, the lungs come from the true height, and the key follows the lab', () => {
  for (const id of ['height-no-legs', 'height-unable-stand-ulna', 'height-one-forearm-halfspan']) {
    let differs = 0, shifted = 0, flips = 0, n = 0;
    for (const seed of seeds(150)) {
      const archetype = ARCHETYPES[seed % ARCHETYPES.length];
      const p = plain(seed, archetype), c = build(seed, archetype, [id]);
      n++;
      const h = c.scenario.height;
      assert.equal(c.report.patient.heightCm, h.statedCm);
      assert.equal(h.trueCm, c.descriptor.heightCm);
      assert.equal(h.trueCm, p.report.patient.heightCm);
      assert.ok(['arm-span', 'ulna'].includes(h.source), h.source);
      assert.deepEqual(c.truth, p.truth);
      assert.deepEqual(c.volumes, p.volumes, 'lung volumes come from the true height');
      assert.equal(c.report.spirometry.fev1, p.report.spirometry.fev1, 'spirometry comes from the true lungs');
      // The key is a function of what the lab entered.
      const again = interpret(c.report, resolveReference, 'GLIglobal');
      assert.deepEqual(again.key, c.anchorKey.key);
      if (h.statedCm !== h.trueCm) differs++;
      const zStated = c.anchorKey.measures.fev1.z, zTrue = interpret(p.report, resolveReference, 'GLIglobal').measures.fev1.z;
      if (Math.abs(zStated - zTrue) > 0.1) shifted++;
      if (c.anchorKey.pattern !== p.anchorKey.pattern) flips++;
      assert.ok(Object.keys(h.zAtTrueHeight).length >= 3);
    }
    assert.ok(differs / n > 0.9, `${id}: stated height differed in only ${differs}/${n}`);
    assert.ok(shifted / n > 0.4, `${id}: FEV1 z moved by more than 0.1 in only ${shifted}/${n}`);
    assert.ok(flips >= 1, `${id}: no case changed pattern`);
  }
});

test('kyphoscoliosis: the arm-span height replaces a shorter measured standing height', () => {
  let n = 0;
  for (const seed of seeds(100)) {
    const c = build(seed, 'restriction-extraparenchymal', ['height-kyphoscoliosis']);
    const st = c.scenario.statements[0].text;
    assert.match(st, /cm/);
    assert.match(c.scenario.height.note, /Standing height .* unreliable/);
    const standing = Number(/Standing height ([\d.]+) cm/.exec(c.scenario.height.note)[1]);
    assert.ok(standing < c.scenario.height.trueCm);
    n++;
  }
  assert.equal(n, 100);
});

test('chart height is too tall; predicted values rise and z-scores fall', () => {
  const zs = [];
  for (const seed of seeds(120)) {
    const archetype = 'normal';
    const d = resolveDescriptor({ seed, archetype });
    if (d.age < 60) continue;
    const p = plain(seed, archetype), c = build(seed, archetype, ['height-old-chart']);
    assert.ok(c.scenario.height.statedCm > c.scenario.height.trueCm);
    assert.equal(c.scenario.height.source, 'reported');
    zs.push(c.anchorKey.measures.fev1.z - p.anchorKey.measures.fev1.z);
  }
  assert.ok(zs.length > 20);
  assert.ok(zs.every((z) => z < 0), 'a taller stated height lowers z-scores');
});

test('sex scenarios record the sex the lab used, keep birth sex, and show the alternative', () => {
  let flips = 0, n = 0, nonbinary = 0;
  for (const seed of seeds(200)) {
    const archetype = ARCHETYPES[seed % ARCHETYPES.length];
    const birth = resolveDescriptor({ seed, archetype }).sex;
    const d = build(seed, archetype, ['sex-birth-default']);
    assert.equal(d.scenario.referenceSex.birth, birth);
    assert.equal(d.scenario.referenceSex.used, birth);
    assert.equal(d.report.patient.sex, birth);
    assert.match(d.scenario.referenceSex.note, /sex assigned at birth, the laboratory default/);
    assert.notEqual(d.scenario.referenceSex.alternative.sex, birth);
    if (/nonbinary/.test(d.scenario.statements[0].text)) nonbinary++;

    const e = build(seed, archetype, ['sex-identity-entered']);
    assert.equal(e.scenario.referenceSex.birth, birth);
    assert.notEqual(e.scenario.referenceSex.used, birth);
    assert.equal(e.report.patient.sex, e.scenario.referenceSex.used);
    assert.equal(e.descriptor.sex, birth, 'the descriptor keeps the birth sex');
    assert.equal(e.scenario.referenceSex.alternative.sex, birth);
    n++;
    if (e.scenario.referenceSex.alternative.labelChanges.length || e.scenario.referenceSex.alternative.pattern !== e.anchorKey.pattern) flips++;
    // The lungs are the same lungs.
    assert.deepEqual(e.truth, plain(seed, archetype).truth);

    const f = build(seed, archetype, ['sex-not-recorded']);
    assert.ok(['M', 'F'].includes(f.scenario.referenceSex.used));
    assert.match(f.scenario.statements[0].text, /default/i);
  }
  assert.ok(flips / n > 0.2, `the alternative sex changed a label in only ${flips}/${n}`);
  assert.ok(nonbinary > 0 && nonbinary < 100);
});

test('race field scenario changes only the group the lab enters', () => {
  for (const seed of seeds(60)) {
    const p = plain(seed, 'normal'), c = build(seed, 'normal', ['race-field-missing']);
    assert.equal(c.report.patient.group, 'Other or mixed');
    assert.equal(c.scenario.group.used, 'Other or mixed');
    assert.equal(c.report.spirometry.fev1, p.report.spirometry.fev1);
    assert.equal(c.anchorKey.measures.fev1.z, p.anchorKey.measures.fev1.z, 'GLI Global does not use the group');
  }
});

test('smoking: acute airflow effects within the hour, carboxyhemoglobin lowers the measured DLCO', () => {
  const fev1 = [], dl = [], co = [];
  for (const seed of seeds(120)) {
    const p = plain(seed, 'normal'), c = build(seed, 'normal', ['sub-smoked-within-hour']);
    fev1.push(c.report.spirometry.fev1 / p.report.spirometry.fev1);
    dl.push(c.dlco.adjusted / p.dlco.adjusted);
    co.push(c.scenario.coHbPercent);
    assert.ok(c.scenario.preTest.lastSmokingHours < 1);
    assert.ok(c.scenario.coHbPercent > 1.5);
    assert.equal(c.scenario.coHbMeasured, false);
    assert.ok(c.dlco.adjusted < p.dlco.adjusted * 1.0001 || c.dlco.va !== p.dlco.va === false);
    assert.equal(c.dlco.va, p.dlco.va, 'VA is not changed by carboxyhemoglobin');
    const factor = cohbDlcoFactor(c.scenario.coHbPercent);
    assert.ok(Math.abs(c.dlco.adjusted / p.dlco.adjusted - factor) < 1e-9, 'DLCO follows coHbPercent through the documented factor');
  }
  assert.ok(mean(fev1) < 0.99);
  assert.ok(mean(dl) < 0.97);
  assert.ok(Math.min(...co) >= 4 && Math.max(...co) <= 9);
  const m = build(5, 'obstruction', ['sub-cohb-measured']);
  assert.equal(m.scenario.coHbMeasured, true);
  assert.match(m.scenario.statements[0].text, new RegExp(`${m.scenario.coHbPercent.toFixed(1)}%`));
  const spiro = build(5, 'obstruction', ['sub-smoked-within-hour'], { panel: 'spirometry' });
  assert.equal(spiro.scenario.coHbPercent, null);
  assert.ok(!spiro.scenario.caveats.some((c) => c.id === 'smoking-cohb-dlco'), 'no DLCO, no DLCO caveat');
});

test('short-acting bronchodilator before the test: higher baseline, smaller response, deviation recorded', () => {
  const dBase = [], dResp = [];
  for (const seed of seeds(120)) {
    const archetype = ['obstruction', 'mixed', 'normal'][seed % 3];
    const p = plain(seed, archetype), c = build(seed, archetype, ['med-saba-recent']);
    assert.ok(c.spirometry.post, 'a bronchodilator study is performed');
    assert.ok(c.report.spirometry.fev1 >= p.report.spirometry.fev1 - 0.3, 'a bronchodilator study that falls (responses are continuous and can be negative) can only lower the baseline a little');
    dBase.push(c.report.spirometry.fev1 - p.report.spirometry.fev1);
    if (p.spirometry.post) dResp.push((c.report.spirometry.post.fev1 - c.report.spirometry.fev1) - (p.report.spirometry.post.fev1 - p.report.spirometry.fev1));
    const h = c.scenario.preTest.lastSabaHours;
    assert.ok(h > 0 && h < 4);
    assert.ok(c.scenario.statements[0].text.includes(String(h % 1 ? h.toFixed(1) : h)));
    assert.match(c.scenario.preTest.notes, /withholding window/);
  }
  assert.ok(mean(dBase) > 0.02);
  assert.ok(mean(dResp) < -0.02);
});

test('acute-effect function leaves the truth untouched and keeps FEV1 below FVC', () => {
  const truth = plain(3, 'obstruction').truth;
  const snapshot = JSON.stringify(truth);
  const e = applyAcuteEffects(truth, { baselineShiftToPost: 0.9, fvcMult: 0.9, fev1Mult: 1.2, preOnlyMult: { fvc: 0.95 } });
  assert.equal(JSON.stringify(truth), snapshot);
  assert.ok(e.fev1 <= e.fvc);
  assert.ok(e.post.fev1 <= e.post.fvc);
});

test('new maneuver faults: leak, mouthpiece obstruction, pause at TLC and submaximal effort', () => {
  const cases = {
    'qs-leak': 'leak', 'qs-tongue-teeth': 'mouthpiece-obstruction', 'qs-pause-at-tlc': 'pause-at-TLC', 'qs-submaximal-effort': 'submaximal-effort',
    'qs-cough-first-second': 'cough', 'qs-glottic-closure': 'glottic-closure', 'qs-early-termination': 'early-termination', 'qs-slow-start': 'slow-start',
  };
  for (const [id, fault] of Object.entries(cases)) {
    let faulted = 0;
    for (const seed of seeds(60)) {
      const archetype = ['obstruction', 'normal', 'mixed'][seed % 3];
      const c = build(seed, archetype, [id]);
      const mans = c.spirometry.pre.maneuvers;
      const idx = mans.map((m, i) => (m.faults.includes(fault) ? i : -1)).filter((i) => i >= 0);
      assert.ok(idx.length >= 1, `${id}: no maneuver carries ${fault} (seed ${seed})`);
      faulted += idx.length;
      // The statement names exactly the blows that carry the fault.
      if (/blows \d/.test(c.scenario.statements[0].text)) {
        const named = /blows ([\d, and]+)/.exec(c.scenario.statements[0].text)[1].match(/\d+/g).map(Number);
        assert.deepEqual(named, idx.map((i) => i + 1), `${id} seed ${seed}`);
      }
      const ev = c.spirometry.pre.summary.evaluations;
      for (const i of idx) {
        if (fault === 'leak' || fault === 'mouthpiece-obstruction') { assert.equal(ev[i].fev1.acceptable, false); assert.equal(ev[i].fvc.acceptable, false); if (mans[i].faults.length === 1) assert.equal(ev[i].fvc.usable, true); }
        if (fault === 'pause-at-TLC') { assert.ok(mans[i].pauseSeconds > 2); assert.equal(ev[i].fev1.acceptable, false); }
        if (fault === 'cough') assert.equal(ev[i].fev1.acceptable, false);
        if (fault === 'glottic-closure') assert.equal(ev[i].fvc.acceptable, false);
      }
      for (const m of mans) assert.ok(m.fev1 <= m.fvc + 1e-9);
    }
    assert.ok(faulted > 60);
  }
});

test('submaximal effort lowers the peak flow most, leaves FEV1 relatively effort independent, and can raise FVC in obstruction while repeatability stays good', () => {
  const ratios = (archetype) => {
    const r = { fev1: [], fvc: [], pef: [] };
    let good = 0, n = 0;
    for (const seed of seeds(80)) {
      const p = plain(seed, archetype), c = build(seed, archetype, ['qs-submaximal-effort']);
      assert.ok(c.spirometry.pre.maneuvers.every((m) => m.faults.includes('submaximal-effort')));
      r.fev1.push(c.report.spirometry.fev1 / p.report.spirometry.fev1);
      r.fvc.push(c.report.spirometry.fvc / p.report.spirometry.fvc);
      r.pef.push(c.spirometry.pre.summary.pef / p.spirometry.pre.summary.pef);
      n++;
      if (['A', 'B'].includes(c.spirometry.pre.summary.grades.fev1)) good++;
    }
    assert.ok(good / n > 0.8, 'consistently low effort remains repeatable');
    return { fev1: mean(r.fev1), fvc: mean(r.fvc), pef: mean(r.pef) };
  };
  const normal = ratios('normal');
  assert.ok(normal.pef < 0.85, `PEF ratio ${normal.pef}`);
  assert.ok(normal.fev1 > normal.pef + 0.1, 'FEV1 falls much less than the peak flow');
  assert.ok(normal.fvc < 0.97);
  const obstruction = ratios('obstruction');
  assert.ok(obstruction.pef < 0.8);
  assert.ok(obstruction.fvc > 1.0, `FVC ratio ${obstruction.fvc}: less effort can raise the FVC in obstruction`);
});

test('a slow start can push the back-extrapolated volume over the 2019 limit', () => {
  let over = 0, n = 0;
  for (const seed of seeds(60)) {
    const c = build(seed, 'obstruction', ['qs-slow-start']);
    c.spirometry.pre.maneuvers.forEach((m, i) => {
      if (!m.faults.includes('slow-start')) return;
      n++;
      if (m.bev >= Math.max(0.05 * m.fvc, 0.1)) over++;
    });
  }
  assert.ok(over / n > 0.7, `${over}/${n}`);
});

test('a progressive fall in FEV1 stops testing below 80% of the first blow', () => {
  for (const seed of seeds(40)) {
    const c = build(seed, 'obstruction', ['clin-fev1-falls-each-blow']);
    const m = c.spirometry.pre.maneuvers;
    assert.ok(m.length >= 2 && m.length < 8);
    if (m[0].faults.length === 0) assert.ok(m.at(-1).fev1 < 0.8 * m[0].fev1 + 1e-9, 'testing stops once FEV1 is below 80% of the first blow');
    if (m[0].faults.length === 0 && m[1].faults.length === 0) assert.ok(m[1].fev1 < m[0].fev1 * 1.01);
    assert.ok(m.slice(0, -1).every((x, i) => i === 0 || x.fev1 >= 0.8 * m[0].fev1 - 1e-9), 'testing continues only while FEV1 is at least 80% of the first');
  }
});

test('non-contributory statements change no measured value', () => {
  for (const id of ['med-ics-today', 'med-allergy-spray', 'prep-exercise-yesterday', 'iface-dentures-ok']) {
    for (const seed of seeds(30, 100)) {
      const archetype = ARCHETYPES[seed % ARCHETYPES.length];
      const d = resolveDescriptor({ seed, archetype });
      if (!getScenario(id).applies(d, null)) continue;
      const p = plain(seed, archetype), c = build(seed, archetype, [id]);
      const strip = (r) => JSON.stringify({ ...r, caveatIds: undefined });
      assert.equal(strip(c.report), strip(p.report), id);
      assert.ok(c.scenario.caveats[0].text.includes('change the interpretation'));
      assert.deepEqual(c.scenario.noncontributoryIds, [id]);
      assert.ok(c.anchorKey.key.caveatIds.length === 1);
    }
  }
});

test('DLCO technique and reporting scenarios move the DLCO in the documented direction', () => {
  const ratio = (id, field = 'adjusted') => mean(seeds(60).map((seed) => {
    const p = plain(seed, 'normal'), c = build(seed, 'normal', [id]);
    return c.dlco[field] / p.dlco[field];
  }));
  assert.ok(ratio('dlco-valsalva') < 0.95);
  assert.ok(ratio('dlco-mueller') > 1.04);
  assert.ok(ratio('dlco-low-inspired-volume', 'va') < 0.95);
  assert.ok(ratio('dlco-low-inspired-volume') < 1);
  assert.ok(ratio('prep-oxygen-dlco') < 0.99);
  const missing = build(11, 'anemia', ['dlco-hb-missing']);
  assert.equal(missing.dlco.hbGdl, null);
  assert.equal(missing.report.patient.hbGdl, null);
  assert.equal(missing.dlco.hbFactor, 1);
  assert.equal(missing.dlco.adjusted, missing.dlco.raw);
  assert.equal(missing.scenario.hbAvailable, false);
  const anemia = plain(11, 'anemia');
  assert.ok(missing.dlco.adjusted < anemia.dlco.adjusted, 'unadjusted DLCO in anemia is lower');
});

test('plethysmography scenarios keep the volume identities exact', () => {
  for (const id of ['pleth-pant-fast', 'pleth-thermal-drift', 'pleth-incomplete-ic', 'prep-binder', 'body-obesity']) {
    for (const seed of seeds(40)) {
      const archetype = ['obstruction', 'mixed', 'normal'][seed % 3];
      if (!getScenario(id).applies(resolveDescriptor({ seed, archetype }), null)) continue;
      const c = build(seed, archetype, [id]);
      const v = c.volumes;
      assert.ok(Math.abs(v.tlc - v.rv - v.vc) < 1e-9 && Math.abs(v.frc - v.rv - v.erv) < 1e-9 && Math.abs(v.ic - (v.tlc - v.frc)) < 1e-9);
      assert.ok(v.rv > 0 && v.erv > 0 && v.ic > 0 && c.dlco.va <= v.tlc + 1e-9);
    }
  }
  const t = mean(seeds(40).map((seed) => build(seed, 'obstruction', ['pleth-pant-fast']).volumes.tlc / plain(seed, 'obstruction').volumes.tlc));
  assert.ok(t > 1.04, 'fast panting overestimates gas volumes');
});

test('scenario traces for the integrator: DLCO and plethysmography fault ids', () => {
  assert.deepEqual(build(2, 'normal', ['dlco-valsalva']).scenario.traceFaults, { dlco: ['valsalva'] });
  assert.deepEqual(build(2, 'obstruction', ['pleth-pant-fast']).scenario.traceFaults, { pleth: ['pant-too-fast'] });
});

test('every phrasing of every scenario renders with real case data, for both the statement and the comment', () => {
  for (const s of SCENARIOS) {
    let done = 0;
    for (const seed of seeds(400)) {
      if (done >= 2) break;
      const archetype = ARCHETYPES[seed % ARCHETYPES.length];
      if (!s.applies(resolveDescriptor({ seed, archetype, panel: 'full' }), null)) continue;
      const c = build(seed, archetype, [s.id]);
      const sel = selectScenarios({ seed, level: 'light', archetype, panel: 'full', forcedIds: [s.id], descriptor: c.descriptor });
      for (let v = 0; v < s.variants.length; v++) {
        const plan = applyScenarios({ selection: { ...sel, picks: sel.picks.map((p) => ({ ...p, variant: v })) }, descriptor: c.descriptor });
        const out = plan.describe({ report: c.report, pre: c.spirometry.pre, post: c.spirometry.post, volumes: c.volumes, dlco: c.dlco, resolve: resolveReference });
        for (const t of [out.statements[0].text, out.technologistComments[0]]) assert.ok(t.length > 10 && !/[{}]|undefined|NaN/.test(t), `${s.id} variant ${v}: ${t}`);
      }
      done++;
    }
    assert.ok(done >= 1, s.id);
  }
});
