import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDatasets } from '../src/reference/load.js';
import { createReference } from '../src/reference/gli.js';
import { buildCase } from '../src/core/case.js';
import { interpret } from '../src/interpret/interpret.js';
import { ARCHETYPES, TECHNIQUE_LEVELS, serializeDescriptor, parseDescriptor } from '../src/core/descriptor.js';
import { LEVEL_TARGETS } from '../src/scenarios/apply.js';
import { getScenario, CONTRADICTORY_CAVEATS, compatible } from '../src/scenarios/library.js';

const ds = await loadDatasets();
const { resolveReference } = createReference(ds);
const N = 500;

/** A deterministic spread of descriptors (not a random source: every run builds the same cases). */
function descriptorAt(i, level) {
  const x = Math.imul(i + 1, 2654435761) >>> 0;
  return {
    seed: 1 + (x % 1_000_000),
    archetype: ARCHETYPES[i % ARCHETYPES.length],
    technique: TECHNIQUE_LEVELS[(i >> 2) % 3],
    severity: 1 + (i % 3),
    panel: i % 9 === 4 ? 'spirometry' : 'full',
    scenarioLevel: level,
  };
}

for (const level of ['none', 'light', 'moderate', 'heavy']) {
  test(`level ${level}: ${N} cases obey the exact constraints, carry consistent statements and caveats, and have a deterministic key`, () => {
    const [lo, hi] = LEVEL_TARGETS[level];
    const idsSeen = new Set();
    for (let i = 0; i < N; i++) {
      const input = descriptorAt(i, level);
      const c = buildCase(input, ds);
      const tag = `${level} #${i} ${input.archetype} seed ${input.seed}`;

      // Exact constraints (tests/case.test.mjs, tools/constraint-sweep.mjs).
      const s = c.report.spirometry;
      if (s.fev1 !== null && s.fvc !== null) assert.ok(s.fev1 <= s.fvc + 1e-9, `FEV1 > FVC, ${tag}`);
      if (s.post?.fev1 && s.post?.fvc) assert.ok(s.post.fev1 <= s.post.fvc + 1e-9, `post FEV1 > FVC, ${tag}`);
      for (const m of [...c.spirometry.pre.maneuvers, ...(c.spirometry.post?.maneuvers ?? [])]) assert.ok(m.fev1 <= m.fvc + 1e-9, `maneuver FEV1 > FVC, ${tag}`);
      assert.ok(c.spirometry.pre.maneuvers.length >= 1 && c.spirometry.pre.maneuvers.length <= 8);
      if (c.volumes) {
        const v = c.volumes, d = c.dlco;
        if (Number.isFinite(v.tlc) && Number.isFinite(v.rv)) {
        assert.ok(Math.abs(v.tlc - (v.rv + v.vc)) < 1e-9 && Math.abs(v.frc - (v.rv + v.erv)) < 1e-9 && Math.abs(v.ic - (v.tlc - v.frc)) < 1e-9, tag);
        assert.ok(v.rv > 0 && v.erv > 0 && v.ic > 0 && v.vc > 0, `non-positive volume, ${tag}`);
        } else { assert.equal(v.tlc, null); assert.equal(v.rv, null); }
        if (Number.isFinite(d.raw)) {
        assert.ok(Number.isFinite(d.va) && d.va > 0, `VA remains an independent measurement, ${tag}`);
        assert.ok(Math.abs(d.adjusted - d.kco * d.va) < 1e-9, `DLCO != KCO x VA, ${tag}`);
        assert.ok(Math.abs(d.adjusted - d.raw * d.hbFactor) < 1e-9, `adjusted != raw x factor, ${tag}`);
        } else { assert.equal(d.raw, null); assert.equal(d.adjusted, null); assert.equal(d.va, null); assert.equal(d.kco, null); assert.equal(c.report.dlco, null); }
      } else assert.equal(c.dlco, null);

      // Scenario record.
      const sc = c.scenario;
      assert.equal(sc.level, level);
      assert.ok(sc.ids.length >= lo && sc.ids.length <= hi, `${tag}: ${sc.ids.length} scenarios`);
      assert.deepEqual(sc.statements.map((x) => x.id), sc.ids);
      assert.equal(sc.technologistComments.length, sc.ids.length);
      for (const id of sc.ids) idsSeen.add(id);
      for (const t of [...sc.statements.map((x) => x.text), ...sc.technologistComments, ...sc.caveats.map((x) => x.text), ...sc.decoyCaveats.map((x) => x.text)]) {
        assert.ok(typeof t === 'string' && t.length > 8 && !/[{}]|undefined|NaN|null/.test(t), `${tag}: bad text "${t}"`);
      }
      for (let a = 0; a < sc.ids.length; a++) for (let b = a + 1; b < sc.ids.length; b++) assert.ok(compatible(getScenario(sc.ids[a]), getScenario(sc.ids[b])), `${tag}: ${sc.ids[a]} + ${sc.ids[b]}`);

      // A statement that implies a caveat always has it.
      const have = new Set(sc.caveats.map((x) => x.id));
      for (const id of sc.ids) {
        for (const cv of getScenario(id).caveats) {
          const needs = cv.requires === 'dlco' ? c.dlco : cv.requires === 'volumes' ? c.volumes : cv.requires === 'post' ? c.spirometry.post : cv.requires === 'sexSame' ? (sc.referenceSex.alternative && !sc.referenceSex.alternative.classificationChanges) : true;
          assert.equal(have.has(cv.id), Boolean(needs), `${tag}: ${id} -> ${cv.id}`);
        }
      }
      assert.equal(have.size, sc.caveats.length, 'caveat ids are unique');
      // Every caveat belongs to a present statement, so nothing is asserted without its cause.
      for (const cv of sc.caveats) assert.ok(sc.ids.some((id) => getScenario(id).caveats.some((x) => x.id === cv.id)), `${tag}: orphan caveat ${cv.id}`);
      // No contradictory pair, and decoys never coincide with real caveats.
      for (const [a, b] of CONTRADICTORY_CAVEATS) assert.ok(!(have.has(a) && have.has(b)), `${tag}: ${a} contradicts ${b}`);
      for (const d of sc.decoyCaveats) assert.ok(!have.has(d.id), `${tag}: decoy ${d.id} is a real caveat here`);
      assert.equal(new Set(sc.decoyCaveats.map((x) => x.id)).size, sc.decoyCaveats.length);
      // Contradiction in values: a non-contributory statement never sits with a scenario that makes the same claim false.
      for (const id of sc.noncontributoryIds) assert.ok(sc.caveats.find((x) => getScenario(id).caveats[0].id === x.id));

      // Lab-entered values reach the report; the lungs and the descriptor keep the truth.
      assert.equal(c.report.patient.heightCm, sc.height.statedCm);
      assert.equal(c.report.patient.sex, sc.referenceSex.used);
      assert.equal(sc.height.trueCm, c.descriptor.heightCm);
      assert.equal(sc.referenceSex.birth, c.descriptor.sex);
      assert.ok(c.report.patient.heightCm >= 130 && c.report.patient.heightCm <= 215);
      if (sc.referenceSex.used !== sc.referenceSex.birth) assert.ok(sc.referenceSex.alternative.sex === sc.referenceSex.birth);
      if (sc.coHbPercent !== null) assert.ok(c.dlco && sc.coHbPercent > 1.5 && sc.coHbPercent < 20);
      if (c.dlco?.hbGdl === null) assert.equal(c.dlco.hbFactor, 1);

      // The key is a deterministic function of what the lab entered.
      const again = interpret(c.report, resolveReference, 'GLIglobal', { generatorKey: true });
      assert.equal(JSON.stringify(again.key), JSON.stringify(c.anchorKey.key), tag);
      if (level === 'none') assert.equal('caveatIds' in c.anchorKey.key, false);
      else if (sc.caveats.length) assert.deepEqual(c.anchorKey.key.caveatIds, sc.caveats.map((x) => x.id).sort());
      else assert.equal('caveatIds' in c.anchorKey.key, false);

      // Every 50th case is rebuilt from its serialized descriptor: the whole case, not only the key, is reproduced.
      if (i % 50 === 0) {
        const rebuilt = buildCase(parseDescriptor(serializeDescriptor(c.descriptor)), ds);
        assert.equal(JSON.stringify({ ...rebuilt, spirometry: rebuilt.spirometry.pre.summary }), JSON.stringify({ ...c, spirometry: c.spirometry.pre.summary }), tag);
        assert.deepEqual(rebuilt.scenario, c.scenario);
      }
    }
    if (level !== 'none') assert.ok(idsSeen.size >= 50, `only ${idsSeen.size} distinct scenarios appeared in ${N} cases`);
    if (level === 'heavy') assert.ok(idsSeen.size >= 58, `only ${idsSeen.size} distinct scenarios appeared at the heaviest level`);
  });
}

test('spirometry-only cases never claim a DLCO or volume effect', () => {
  for (let i = 0; i < 200; i++) {
    const c = buildCase({ ...descriptorAt(i, 'heavy'), panel: 'spirometry' }, ds);
    assert.equal(c.scenario.coHbPercent, null);
    assert.equal(c.dlco, null);
    for (const id of c.scenario.ids) assert.ok(!/^(dlco|pleth)-|^env-altitude|^prep-oxygen|^body-anemia|^ref-european|^sub-smoked-hours|^sub-cohb/.test(id), id);
  }
});
