import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportModel, allTables } from '../src/report/model.js';
import { tableMatrix } from '../src/report/table.js';
import { resolveReference, makeModel, SAMPLE_INPUTS } from './report-helpers.mjs';

const table = (model, id) => allTables(model).find((t) => t.id === id);
const row = (t, id) => t.rows.find((r) => r.id === id);

const HEAVY = [
  { seed: 90, archetype: 'mixed', scenarioLevel: 'heavy' },
  { seed: 91, archetype: 'obstruction', scenarioLevel: 'heavy', technique: 'poor' },
  { seed: 33, archetype: 'restriction-parenchymal', technique: 'poor', scenarioLevel: 'heavy' },
];

test('FEF25-75 is printed with no reference, from the set value; every maneuver carries one', () => {
  for (const input of SAMPLE_INPUTS) {
    const { model, c } = makeModel(input);
    const r = row(table(model, 'spirometry'), 'fef2575');
    assert.ok(r, `fef2575 row for ${JSON.stringify(input)}`);
    assert.equal(r.unit, 'L/s');
    assert.equal(r.dp, 2);
    assert.deepEqual([r.lln, r.z, r.pct], [null, null, null], 'no reference value, z-score or percent predicted');
    for (const set of [c.spirometry.pre, c.spirometry.post].filter(Boolean)) for (const m of set.maneuvers) assert.ok(Number.isFinite(m.fef2575) && m.fef2575 > 0);
    // The reported value is the largest among the maneuvers acceptable for FVC (else usable), as the case summary states.
    const pool = (set) => { const ev = set.summary.evaluations; const a = set.maneuvers.filter((_, i) => ev[i].fvc.acceptable); return a.length ? a : set.maneuvers.filter((_, i) => ev[i].fvc.usable); };
    assert.equal(r.pre, Number(Math.max(...pool(c.spirometry.pre).map((m) => m.fef2575)).toFixed(2)));
    if (c.spirometry.post) {
      assert.equal(r.post, Number(Math.max(...pool(c.spirometry.post).map((m) => m.fef2575)).toFixed(2)));
      assert.deepEqual([r.postZ, r.postPct, r.change, r.changePct, r.changePctPred], [null, null, null, null, null]);
    }
  }
  const { model } = makeModel(SAMPLE_INPUTS[0]);
  assert.match(tableMatrix(table(model, 'spirometry')).body[5][0], /^FEF25-75 \(L\/s\)$/);
});

test('identity fields come from their own stream and do not depend on the archetype or the values', () => {
  const a = makeModel({ seed: 7, archetype: 'normal' }), b = makeModel({ seed: 7, archetype: 'obstruction' });
  const id = a.model.identity;
  assert.deepEqual(Object.keys(id).sort(), ['ethnicity', 'laboratory', 'reasonForTest', 'referringPhysician', 'smoking', 'spo2RestPct']);
  assert.match(id.referringPhysician, /^Dr\. [A-Z]\. \S+$/);
  assert.ok(id.reasonForTest.length > 5);
  assert.ok(Number.isInteger(id.spo2RestPct) && id.spo2RestPct >= 93 && id.spo2RestPct <= 100);
  assert.equal(id.ethnicity, a.c.scenario?.group?.selfReported ?? a.c.report.patient.group);
  assert.equal(id.laboratory.name, 'PFT Sim Pulmonary Function Laboratory');
  // Same seed, different archetype: the drawn requisition fields agree.
  assert.equal(b.model.identity.referringPhysician, id.referringPhysician);
  assert.equal(b.model.identity.reasonForTest, id.reasonForTest);
  assert.equal(b.model.identity.spo2RestPct, id.spo2RestPct);
  assert.deepEqual(makeModel({ seed: 7, archetype: 'normal' }).model.identity, id);
  // A recorded last-smoked time makes the patient a current smoker.
  const sm = makeModel({ seed: 12, archetype: 'obstruction' });
  sm.c.scenario = { ...sm.c.scenario, preTest: { lastSmokingHours: 0.5 } };
  assert.match(buildReportModel(sm.c, sm.interp, { resolve: resolveReference }).identity.smoking, /^Current smoker, \d+ pack-years; last smoked 30 min before the test$/);
  // The stream is new: building the model leaves the case itself untouched.
  const before = JSON.stringify(a.c);
  buildReportModel(a.c, a.interp, { resolve: resolveReference });
  assert.equal(JSON.stringify(a.c), before);
});

test('the technologist comments split into those that bear on interpretation and technical notes, with the flat list unchanged', () => {
  for (const input of [...SAMPLE_INPUTS, ...HEAVY]) {
    for (const includeGrades of [true, false]) {
      const { model, c } = makeModel(input, { includeGrades });
      const flat = model.technologistComments;
      const parts = [...model.interpretationComments, ...model.technicalNotes, ...model.qualityNotes];
      // Every flat comment is in exactly one list; the technical list may add trial and test notes.
      for (const t of flat) assert.equal(parts.filter((x) => x === t).length, 1, `"${t}" is in one list`);
      assert.equal(parts.length - flat.length, model.technicalNotes.filter((x) => /^(Plethysmography trial|Single-breath test)/.test(x)).length);
      if (!includeGrades) assert.deepEqual(model.qualityNotes, []);
      else assert.ok(model.qualityNotes.every((x) => /repeatab|FVC reported equal|fewer than three|differ by more/.test(x)));
      // The bronchodilator line bears on interpretation; fault comments of the maneuvers are technical.
      if (c.spirometry.post) assert.ok(model.interpretationComments.some((x) => /Post-bronchodilator spirometry followed/.test(x)));
      assert.ok(!model.technicalNotes.some((x) => /Post-bronchodilator spirometry followed/.test(x)));
      const faulty = c.spirometry.pre.maneuvers.some((m) => m.faults.length);
      assert.equal(model.technicalNotes.some((x) => /^Pre-bronchodilator: /.test(x)), faulty);
    }
  }
});

test('scenario comments are split by the category of their statement; an unknown category bears on interpretation', () => {
  const c2 = makeModel({ seed: 12, archetype: 'obstruction' });
  c2.c.scenario = {
    ...c2.c.scenario,
    statements: [{ category: 'Medication' }, { category: 'Cough' }, { category: 'Smoking' }, { category: 'Anemia' }, { category: 'Effort' }, { category: 'New category' }, { category: 'Plethysmography' }],
    technologistComments: ['Salbutamol 2 h ago.', 'Coughed on blow 2.', 'Smoked 30 min ago.', 'Hemoglobin not available.', 'Fair effort.', 'Unlisted.', 'Drift on the loops.'],
  };
  const m = buildReportModel(c2.c, c2.interp, { resolve: resolveReference, includeGrades: false });
  assert.deepEqual(m.interpretationComments.slice(0, 5), ['Salbutamol 2 h ago.', 'Smoked 30 min ago.', 'Hemoglobin not available.', 'Fair effort.', 'Unlisted.']);
  assert.deepEqual(m.technicalNotes.slice(0, 2), ['Coughed on blow 2.', 'Drift on the loops.']);
  assert.deepEqual(m.technologistComments.slice(0, 7), c2.c.scenario.technologistComments, 'flat list keeps the scenario order');
  // A scenario whose comments and statements disagree in length does not throw.
  c2.c.scenario = { ...c2.c.scenario, statements: [] };
  assert.doesNotThrow(() => buildReportModel(c2.c, c2.interp, { resolve: resolveReference }));
});

test('trial and test notes describe observations only and carry no size of a bias', () => {
  let found = 0;
  for (const input of [{ seed: 8, archetype: 'bd-discordant', technique: 'poor' }, ...HEAVY, { seed: 12, archetype: 'obstruction' }]) {
    for (let seed = input.seed; seed < input.seed + 6; seed++) {
      const { model } = makeModel({ ...input, seed }, { includeGrades: false });
      for (const t of model.technicalNotes) {
        if (/^(Plethysmography trial|Single-breath test)/.test(t)) found++;
        assert.doesNotMatch(t, /read (high|low)|about \d+%|bias|underestimat|overestimat|\bgrade\b|acceptab|rejected|would be/i, t);
      }
    }
  }
  assert.ok(found > 0, 'the sample holds at least one trial or test fault');
});

test('gradesWithheld null leaves every sentence about quality out of the model', () => {
  const { model } = makeModel(SAMPLE_INPUTS[0], { includeGrades: false, gradesWithheld: null });
  assert.doesNotMatch(JSON.stringify(allTables(model).map((t) => t.footnote)), /quality|Acceptab|withheld|grades/i);
  const dflt = makeModel(SAMPLE_INPUTS[0], { includeGrades: false });
  assert.match(table(dflt.model, 'spirometry').footnote, /Test quality: grades are shown after the answers are checked/);
});
