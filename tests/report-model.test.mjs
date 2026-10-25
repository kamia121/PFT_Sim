import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCase, } from '../src/core/case.js';
import { interpret } from '../src/interpret/interpret.js';
import { buildReportModel, caseCode, allTables } from '../src/report/model.js';
import { formatCell, tableMatrix } from '../src/report/table.js';
import { FIGURES } from '../src/ui/figures/index.js';
import { ds, resolveReference, makeModel, SAMPLE_INPUTS } from './report-helpers.mjs';

const field = (model, label) => model.header.fields.find((f) => f.label === label)?.value;
const table = (model, id) => allTables(model).find((t) => t.id === id);
const row = (t, id) => t.rows.find((r) => r.id === id);

test('the header carries the ATS 2017 fields', () => {
  const { model, c } = makeModel(SAMPLE_INPUTS[0]);
  for (const label of ['Name', 'ID', 'Sex (used for reference)', 'Age', 'Height', 'Weight', 'BMI', 'Reference group', 'Test date (simulated)', 'Tests performed', 'Reference equations', 'LLN definition']) {
    assert.ok(field(model, label), `missing header field ${label}`);
  }
  assert.equal(field(model, 'Name'), 'Simulated patient');
  assert.equal(field(model, 'ID'), `SIM-${caseCode(c.descriptor.seed)}`);
  assert.equal(field(model, 'Reference group'), c.report.patient.group);
  assert.match(field(model, 'Height'), /\(measured\)$/);
  assert.match(field(model, 'LLN definition'), /1\.645/);
  assert.match(field(model, 'Test date (simulated)'), /^2026-\d\d-\d\d \d\d:\d\d$/);
  assert.equal(model.footer.caseCode, caseCode(c.descriptor.seed));
});

test('the case code and test date are deterministic functions of the seed', () => {
  assert.equal(caseCode(0), '0000000');
  assert.equal(caseCode(4294967295), '1Z141Z3');
  const a = makeModel(SAMPLE_INPUTS[1]).model, b = makeModel(SAMPLE_INPUTS[1]).model;
  assert.deepEqual(a, b);
});

test('spirometry rows have the specified units, and the ratio has no percent predicted', () => {
  const { model } = makeModel(SAMPLE_INPUTS[0]);
  const t = table(model, 'spirometry');
  assert.deepEqual(t.rows.map((r) => r.id), ['fvc', 'fev1', 'fev1_fvc', 'fet', 'pef', 'fef2575']);
  assert.equal(row(t, 'fvc').unit, 'L');
  assert.equal(row(t, 'fev1_fvc').unit, 'ratio');
  assert.equal(row(t, 'fet').unit, 's');
  assert.equal(row(t, 'pef').unit, 'L/s');
  assert.equal(row(t, 'fev1_fvc').pct, null);
  assert.equal(row(t, 'fev1_fvc').dp, 3);
  assert.ok(row(t, 'fvc').lln < row(t, 'fvc').pre || row(t, 'fvc').z < -1.645, 'LLN sits below the measured value unless z is below the limit');
  assert.match(tableMatrix(t).body[0][0], /^FVC \(L\)$/);
  assert.match(tableMatrix(t).body[2][0], /^FEV1\/FVC$/);
});

test('bronchodilator columns exist only when a post set exists, and change equals post minus pre', () => {
  let withPost = 0, withoutPost = 0;
  for (const input of SAMPLE_INPUTS) {
    const { model, c } = makeModel(input);
    const t = table(model, 'spirometry');
    const keys = t.columns.map((x) => x.key);
    if (c.spirometry.post) {
      withPost++;
      for (const k of ['post', 'postZ', 'postPct', 'change', 'changePct', 'changePctPred']) assert.ok(keys.includes(k), `${k} missing`);
      assert.ok(table(model, 'maneuvers-post'));
      assert.ok(!keys.includes('postLln') && t.columns.filter((x) => x.key === 'lln').length === 1, 'LLN is not repeated after the bronchodilator');
      for (const id of ['fvc', 'fev1']) {
        const r = row(t, id);
        // The printed change always equals the difference of the printed values (S1 printed 600 mL for 800 mL).
        assert.equal(Number((r.post - r.pre).toFixed(2)), r.change, `${input.archetype} ${id}`);
        assert.equal(r.changePct, Number(((100 * r.change) / r.pre).toFixed(1)));
        assert.ok(Number.isFinite(r.postZ), 'post z-score computed when a resolver is supplied');
      }
      assert.equal(row(t, 'fev1_fvc').change, null, 'change columns only for FEV1 and FVC');
      assert.match(model.technologistComments.join(' '), /Post-bronchodilator spirometry followed/);
    } else {
      withoutPost++;
      for (const k of ['post', 'change', 'changePct', 'changePctPred']) assert.ok(!keys.includes(k), `${k} present without a post set`);
      assert.equal(table(model, 'maneuvers-post'), undefined);
    }
  }
  assert.ok(withPost >= 1 && withoutPost >= 1, 'samples must cover both cases');
});

test('post-bronchodilator percent of predicted change matches the interpretation engine to rounding', () => {
  for (const input of SAMPLE_INPUTS) {
    const { model, c, interp } = makeModel(input);
    if (!c.spirometry.post) continue;
    const r = row(table(model, 'spirometry'), 'fev1');
    assert.ok(Math.abs(r.changePctPred - interp.bd.pctPred.fev1) < 0.35, `${r.changePctPred} vs ${interp.bd.pctPred.fev1}`);
  }
});

test('quality grades are separate for FEV1 and FVC, pre and post, and are withheld on request', () => {
  for (const input of SAMPLE_INPUTS) {
    const { model, c } = makeModel(input);
    const pre = c.spirometry.pre.summary.grades;
    const foot = table(model, 'spirometry').footnote;
    assert.ok(foot.includes(`Pre: FEV1 - ${pre.fev1}, FVC - ${pre.fvc}`), foot);
    if (c.spirometry.post) {
      const po = c.spirometry.post.summary.grades;
      assert.ok(foot.includes(`Post: FEV1 - ${po.fev1}, FVC - ${po.fvc}`), foot);
    } else assert.ok(!foot.includes('Post:'));
    assert.ok(foot.includes('Reference values: GLI Global 2022'));
    const hidden = makeModel(input, { includeGrades: false }).model;
    assert.ok(!/FEV1 - [A-F]/.test(JSON.stringify(hidden)), 'no grade letters when withheld');
    assert.ok(!table(hidden, 'maneuvers-pre').columns.some((x) => x.key === 'acceptable'));
    assert.ok(!hidden.technologistComments.some((x) => /repeatab/.test(x)), 'grade-derived comments withheld');
  }
});

test('technologist comments derive from the recorded faults', () => {
  const { model, c } = makeModel({ seed: 12, archetype: 'obstruction' });
  const faults = new Set(c.spirometry.pre.maneuvers.flatMap((m) => m.faults));
  assert.ok(faults.size > 0, 'sample has faults');
  const text = model.technologistComments.join('\n');
  if (faults.has('cough')) assert.match(text, /cough in the first second/);
  if (faults.has('slow-start')) assert.match(text, /hesitant start/);
  assert.match(text, /ATS\/ERS repeatability criteria|differ by more than 0\.150 L|fewer than three/);
});

test('scenario comments, height source and reference sex flow into the report and the reference equation note', () => {
  const base = buildCase({ seed: 12, archetype: 'obstruction' }, ds);
  const c = { ...base, scenario: {
    technologistComments: ['No medications in the past 24 h.'],
    smokingStatus: 'Ex-smoker',
    height: { statedCm: base.report.patient.heightCm, trueCm: base.report.patient.heightCm + 6, source: 'arm-span', note: 'secret true height' },
    referenceSex: { used: base.report.patient.sex, birth: base.report.patient.sex === 'M' ? 'F' : 'M', note: '' },
    coHbPercent: 5.2, coHbMeasured: true,
  } };
  const interp = interpret(c.report, resolveReference, 'GLIglobal');
  const model = buildReportModel(c, interp, { resolve: resolveReference });
  assert.equal(model.technologistComments[0], 'No medications in the past 24 h.');
  assert.equal(field(model, 'Smoking status'), 'Ex-smoker');
  assert.match(field(model, 'Height'), /estimated from arm span/);
  assert.ok(field(model, 'Sex assigned at birth'));
  const note = model.referenceNote.join(' ');
  assert.match(note, /Height was estimated from arm span/);
  assert.match(note, /sex assigned at birth/);
  assert.match(table(model, 'dlco').footnote, /COHb 5\.2%/);
  assert.ok(!JSON.stringify(model).includes('secret true height'), 'true height is never printed');
  assert.ok(!JSON.stringify(model).includes(`${base.report.patient.heightCm + 6} cm`), 'the true height value is never printed');
});

test('equation names appear per index, and fallbacks are stated', () => {
  const g = makeModel({ seed: 90, archetype: 'normal', group: 'Black or African American' }, { equation: 'GLIglobal' }).model;
  assert.match(field(g, 'Reference equations'), /Spirometry: GLI Global 2022/);
  assert.match(field(g, 'Reference equations'), /Lung volumes: GLI-2021 volumes/);
  assert.match(field(g, 'Reference equations'), /DLCO: GLI-2017 TLCO/);
  assert.match(g.referenceNote[0], /group-neutral/);
  assert.match(table(g, 'volumes').footnote, /reference population of European ancestry/);
  assert.match(g.referenceNote.join(' '), /European-ancestry-derived reference populations/);
  const o = makeModel({ seed: 90, archetype: 'normal', group: 'Black or African American' }, { equation: 'GLI2012' }).model;
  assert.match(field(o, 'Reference equations'), /Spirometry: GLI-2012/);
  assert.match(o.referenceNote[0], /GLI-2012 equation for the requisition group "Black or African American"/);
  assert.match(table(o, 'spirometry').footnote, /GLI-2012 \(equation for "Black or African American"\)/);
  const w = makeModel({ seed: 5, archetype: 'normal', group: 'White' }).model;
  assert.match(w.referenceNote.join(' '), /European-ancestry-derived reference populations/);
  assert.ok(!/European/.test(table(w, 'volumes').footnote));
  assert.throws(() => { const { c, interp } = makeModel(SAMPLE_INPUTS[0]); buildReportModel(c, interp, { equation: 'GLI2012' }); }, RangeError);
});

test('lung volume and DLCO tables carry the specified rows and respect the panel', () => {
  const { model } = makeModel(SAMPLE_INPUTS[0]);
  assert.deepEqual(table(model, 'volumes').rows.map((r) => r.id), ['tlc', 'vc', 'ic', 'frc', 'erv', 'rv', 'rv_tlc', 'sraw', 'sgaw', 'raw']);
  assert.equal(row(table(model, 'volumes'), 'rv_tlc').unit, '%');
  assert.deepEqual(table(model, 'dlco').rows.map((r) => r.id), ['hb', 'hb-factor', 'dlco', 'va', 'kco', 'vc-comparator', 'mean-vi', 'vi-vc']);
  assert.match(table(model, 'dlco').footnote, /ATS\/ERS 2017, eqs 31 and 32/);
  const s = makeModel({ seed: 44, archetype: 'mixed', panel: 'spirometry' }).model;
  assert.equal(table(s, 'volumes'), undefined);
  assert.equal(table(s, 'dlco'), undefined);
  assert.doesNotMatch(field(s, 'Tests performed'), /DLCO|volumes/);
});

test('a plethysmography replicate table appears only when caseData.pleth exists', () => {
  const real = buildCase({ seed: 12, archetype: 'obstruction' }, ds);
  const base = { ...real, pleth: null };
  const interp = interpret(base.report, resolveReference, 'GLIglobal');
  assert.equal(table(buildReportModel(base, interp, { resolve: resolveReference }), 'pleth'), undefined);
  // A case from buildCase carries real replicates; the table lists them and the footnote mean is the reported FRC.
  const rt = table(buildReportModel(real, interp, { resolve: resolveReference }), 'pleth');
  assert.equal(rt.rows.length, real.pleth.replicateTable.length);
  assert.match(rt.footnote, new RegExp(`Mean FRCpleth ${real.pleth.reportedFrcL.toFixed(2).replace('.', '\\.')} L`));
  const c = { ...base, pleth: { grade: 'A', replicates: [{ frc: 3.1, pantHz: 0.8, acceptable: true }, { frc: 3.2, pantHz: 0.9, acceptable: true }, { frc: 3.0, pantHz: 1.0, acceptable: true }] } };
  const t = table(buildReportModel(c, interp, { resolve: resolveReference }), 'pleth');
  assert.equal(t.rows.length, 3);
  assert.equal(t.rows[1].frc, 3.2);
  assert.match(t.footnote, /Mean FRCpleth 3\.10 L/);
  assert.match(t.footnote, /FRC-only simulator rubric A/);
});

test('the model never carries the key or the ground truth', () => {
  for (const input of SAMPLE_INPUTS) {
    for (const includeGrades of [true, false]) {
      const { model, c, interp } = makeModel(input, { includeGrades });
      const json = JSON.stringify(model);
      // 'normal' is also the word in "lower limit of normal", so the archetype is checked as a quoted token too.
      assert.ok(!json.includes(`"${c.descriptor.archetype}"`) && (c.descriptor.archetype === 'normal' || !json.includes(c.descriptor.archetype)), `archetype ${c.descriptor.archetype} leaked`);
      for (const word of ['groundTruth', 'anchorKey', 'phenotype', 'bdVariant', 'severityTarget', 'rulesAgree', 'qualityLimited', interp.patternLabel]) assert.ok(!json.includes(word), `${word} leaked`);
      assert.equal(model.interpretation, null);
      assert.equal(model.sections.some((s) => s.id === 'key'), false);
      assert.ok(!/"?pattern"?\s*:/.test(json));
    }
  }
  const { c, interp } = makeModel(SAMPLE_INPUTS[0]);
  const withKey = buildReportModel(c, interp, { includeKey: true, resolve: resolveReference });
  assert.ok(withKey.sections.some((s) => s.id === 'key'));
});

test('the interpretation text is null unless supplied', () => {
  const { c, interp } = makeModel(SAMPLE_INPUTS[0]);
  assert.equal(buildReportModel(c, interp).interpretation, null);
  assert.equal(buildReportModel(c, interp, { interpretationText: 'Supplied text.' }).interpretation, 'Supplied text.');
});

test('figures come from the registry, skipping null and empty results, with the requested palette', () => {
  const { c, interp } = makeModel(SAMPLE_INPUTS[0]);
  const saved = { fv: { ...FIGURES['panel-spirometry'] }, vt: { ...FIGURES['panel-pleth'] }, dl: { ...FIGURES['panel-dlco'] } };
  const seen = [];
  try {
    FIGURES['panel-spirometry'].dataFor = () => ({ ok: 1 });
    FIGURES['panel-spirometry'].render = (data, opts) => { seen.push(opts.palette.id); return '<svg xmlns="http://www.w3.org/2000/svg"><title>fv</title></svg>'; };
    FIGURES['panel-pleth'].dataFor = () => ({ ok: 1 });
    FIGURES['panel-pleth'].render = () => '';
    FIGURES['panel-dlco'].dataFor = () => { throw new Error('boom'); };
    const model = buildReportModel(c, interp, { resolve: resolveReference, palette: 'dark' });
    assert.deepEqual(model.sections[0].figureIds, ['panel-spirometry', 'z-strip']);
    assert.deepEqual(seen, ['dark']);
    assert.equal(model.meta.figureErrors.length, 1);
    assert.equal(model.meta.figureErrors[0].id, 'panel-dlco');
    assert.equal(buildReportModel(c, interp, { figures: false }).sections[0].figures.length, 0);
    assert.deepEqual(buildReportModel(c, interp, { resolve: resolveReference }).meta.figureErrors.map((e) => e.id), ['panel-dlco']);
    assert.deepEqual(seen.slice(1), ['white']);
  } finally {
    Object.assign(FIGURES['panel-spirometry'], saved.fv);
    Object.assign(FIGURES['panel-pleth'], saved.vt);
    Object.assign(FIGURES['panel-dlco'], saved.dl);
  }
});

test('formatCell rounds, signs and never prints negative zero', () => {
  assert.equal(formatCell(-0.004, { dp: 2 }), '0.00');
  assert.equal(formatCell(-1.2, { dp: 2 }), '-1.20');
  assert.equal(formatCell(0.4, { dp: 2, signed: true }), '+0.40');
  assert.equal(formatCell(-0.4, { dp: 2, signed: true }, {}, { unicodeMinus: true }), '\u22120.40');
  assert.equal(formatCell(3.14159, { rowDp: true }, { dp: 3 }), '3.142');
  assert.equal(formatCell(null, { dp: 2 }), '');
});

test('every sample builds for every archetype without figure errors from the model itself', () => {
  for (const archetype of ['normal', 'obstruction', 'restriction-parenchymal', 'restriction-extraparenchymal', 'mixed', 'nonspecific', 'low-dlco', 'anemia', 'obesity-low-erv', 'bd-discordant']) {
    for (const seed of [1, 2, 3]) {
      const { model } = makeModel({ seed, archetype });
      assert.ok(allTables(model).length >= 3);
      for (const t of allTables(model)) for (const r of t.rows) for (const col of t.columns) {
        const v = r[col.key];
        assert.ok(v === null || v === undefined || typeof v === 'string' || Number.isFinite(v), `${t.id}.${col.key}`);
      }
    }
  }
});
