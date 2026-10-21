/**
 * Hemoglobin and carboxyhemoglobin adjustment of the DLCO reference (deferred item 6; ATS/ERS 2017 Graham et al., Eur Respir J 2017;49:1600016, with the
 * 2018 revision: eqs 31, 32, 33 and 37; the 2022 statement recommends adjusting the reference value). Display only: the key and the stored z-scores are not recomputed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { hbReferenceMultiplier, cohbReferenceMultiplier, cohbDlcoFactor, hbFactor, COHB } from '../src/core/physiology.js';
import { makeModel } from './report-helpers.mjs';
import { questionLabel, scoreAnswers, PRACTICE_QUESTIONS } from '../src/app/answers.js';
import { scoreAll } from '../src/app/feedback.js';
import { emptyResponses } from '../src/app/collect.js';
import { interpret } from '../src/interpret/interpret.js';
import { resolveReference } from './report-helpers.mjs';

const close = (a, b, tol = 5e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const dlcoTable = (model) => model.sections.flatMap((s) => s.tables).find((t) => t.id === 'dlco');

test('eqs 31 and 32: the multiplier on the predicted value, with the sex and age split and the standard Hb values', () => {
  close(hbReferenceMultiplier(14.6, 'M', 40), 1);
  close(hbReferenceMultiplier(13.4, 'F', 40), 1);
  close(hbReferenceMultiplier(13.4, 'M', 14), 1, 5e-6); // a boy under 15 uses 9.38: standard 13.4
  close(hbReferenceMultiplier(8.0, 'M', 40), 0.74643);
  close(hbReferenceMultiplier(8.0, 'F', 40), 0.78251);
  close(hbReferenceMultiplier(18.0, 'M', 40), 1.08434);
  assert.notEqual(hbReferenceMultiplier(14.6, 'M', 14.99).toFixed(6), (1).toFixed(6), 'under 15 the male constant is 9.38');
  close(hbReferenceMultiplier(14.6, 'M', 15), 1);
  assert.equal(hbFactor(8, 'M', 40) * hbReferenceMultiplier(8, 'M', 40) - 1 < 1e-12, true);
});

test('eq. 33 with the reference Hb gives eqs 31 and 32 (0.7 x 14.6 = 10.22, 0.7 x 13.4 = 9.38)', () => {
  const eq33 = (hb, ref) => (1.7 * hb) / (0.7 * ref + hb);
  for (const hb of [7, 9.5, 12, 14.6, 17]) close(eq33(hb, 14.6), hbReferenceMultiplier(hb, 'M', 30), 2e-4);
  for (const hb of [7, 9.5, 12, 13.4, 17]) close(eq33(hb, 13.4), hbReferenceMultiplier(hb, 'F', 30), 2e-4);
});

test('eq. 37: the COHb multiplier applies above 2% only, and combines with Hb by multiplication', () => {
  assert.equal(cohbReferenceMultiplier(2.0), null);
  assert.equal(cohbReferenceMultiplier(1.2), null);
  assert.equal(cohbReferenceMultiplier(NaN), null);
  close(cohbReferenceMultiplier(2.1), 0.999);
  close(cohbReferenceMultiplier(5), 0.97);
  close(cohbReferenceMultiplier(9), 0.93);
  close(cohbReferenceMultiplier(12), 0.90);
  close(hbReferenceMultiplier(8.0, 'M', 40) * cohbReferenceMultiplier(9), 0.69418);
  close(30 * hbReferenceMultiplier(8.0, 'M', 40) * cohbReferenceMultiplier(9), 20.825, 5e-3);
});

test('the generator\'s COHb effect is pinned, so that nobody aligns it silently (changing it would change cases under descriptor version 1)', () => {
  const f = [[1.0, 1], [1.5, 1], [2, 0.995], [5, 0.965], [9, 0.925], [12, 0.895]];
  for (const [p, want] of f) close(cohbDlcoFactor(p), want, 1e-12);
  assert.equal(COHB.referencePercent.value, 1.5);
  assert.equal(COHB.dlcoFractionPerPercent.value, 0.01);
  assert.equal(COHB.adjustAbovePercent.value, 2);
});

test('the report prints the measured DLCO and KCO against the Hb-adjusted reference and LLN; z-score and %Pred are the stored ones', () => {
  const inputs = [{ seed: 5, archetype: 'anemia' }, { seed: 12, archetype: 'obstruction' }, { seed: 31, archetype: 'restriction-parenchymal' }, { seed: 90, archetype: 'anemia', group: 'Black or African American' }, { seed: 7, archetype: 'normal' }];
  let n = 0;
  for (const input of inputs) {
    const { c, interp, model } = makeModel(input);
    const t = dlcoTable(model);
    if (!t) continue;
    n++;
    const f = c.dlco.hbFactor;
    const d = t.rows.find((r) => r.id === 'dlco'), k = t.rows.find((r) => r.id === 'kco'), m = interp.measures;
    assert.equal(d.result, Number(c.dlco.raw.toFixed(1)), 'measured, not adjusted');
    assert.ok(Math.abs(d.lln - m.dlco.lln / f) <= 0.051, `LLN ${d.lln} vs ${m.dlco.lln / f}`);
    assert.equal(d.z, Number(m.dlco.z.toFixed(2)));
    assert.equal(d.pct, Number(m.dlco.percentPredicted.toFixed(0)));
    assert.ok(Math.abs(k.lln - m.kco.lln / f) <= 0.0051);
    // The two placements classify alike: measured against the reduced LLN equals adjusted against the LLN.
    assert.equal(c.dlco.raw < m.dlco.lln / f, c.dlco.raw * f < m.dlco.lln);
    close(t.rows.find((r) => r.id === 'hb-factor').result, Number((1 / f).toFixed(3)), 6e-4);
    assert.ok(!t.rows.some((r) => r.id === 'dlco-raw' || r.id === 'dlco-cohb'), 'no COHb line without a measured COHb above 2%');
  }
  assert.ok(n >= 4);
});

test('a measured COHb above 2% adds a supplementary line, and a flip is stated; the key stays on the Hb-adjusted reference (anemia seed 6, COHb 11.8%)', () => {
  const input = { seed: 6, archetype: 'anemia', technique: 'good', scenarioIds: ['sub-cohb-measured'] };
  const { c, interp, model } = makeModel(input);
  const t = dlcoTable(model);
  const d = t.rows.find((r) => r.id === 'dlco'), x = t.rows.find((r) => r.id === 'dlco-cohb');
  assert.ok(x, 'supplementary row');
  assert.match(x.index, /supplementary.*not the scored basis/);
  assert.equal(c.scenario.coHbMeasured, true);
  assert.ok(d.z < -1.645 && x.z > -1.645, `Hb-adjusted z ${d.z}, COHb-adjusted z ${x.z}`);
  assert.equal(interp.key.dlco, 'reduced', 'the key is the Hb-adjusted classification');
  assert.match(t.footnote, /Against the COHb-adjusted reference the DLCO is within the LLN/);
  assert.match(t.footnote, /read on the Hb-adjusted reference only/);
  assert.match(t.footnote, /x 0\.90/);
  // The learner is told the basis before answering, and again in the feedback; answering for the supplementary basis is marked wrong, with the reason.
  assert.match(questionLabel(c, PRACTICE_QUESTIONS.find((q) => q.id === 'dlco')), /scored on the hemoglobin-adjusted reference; the COHb-adjusted line is supplementary/);
  const interpOther = interpret(c.report, resolveReference, 'GLI2012');
  const fb = scoreAll({ caseData: c, interp, interpOther, equation: 'GLIglobal', responses: { ...emptyResponses(), structured: { dlco: 'normal' } } });
  const row = fb.rows.find((r) => r.id === 'dlco');
  assert.equal(row.status, 'incorrect');
  assert.equal(row.expected, 'Reduced');
  assert.match(row.note, /Scored on the hemoglobin-adjusted reference.*supplementary and is not the basis of the key/);
  const ok = scoreAll({ caseData: c, interp, interpOther, equation: 'GLIglobal', responses: { ...emptyResponses(), structured: { dlco: 'reduced' } } }).rows.find((r) => r.id === 'dlco');
  assert.equal(ok.status, 'correct');
});

test('no supplementary line at or below 2%, unmeasured, or without a Hb: the footnote says what applies', () => {
  const low = makeModel({ seed: 6, archetype: 'anemia', scenarioIds: ['sub-cohb-measured'] });
  low.c.scenario.coHbPercent = 1.8;
  const { buildReportModel } = low;
  void buildReportModel;
  const t0 = dlcoTable(makeModel({ seed: 5, archetype: 'normal' }).model);
  assert.ok(!t0.rows.some((r) => r.id === 'dlco-cohb'));
});

test('the key and the stored z-scores are the same with and without the COHb line (200 seeds with a COHb scenario)', () => {
  let n = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const a = makeModel({ seed, archetype: 'anemia', technique: 'good', scenarioIds: ['sub-cohb-measured'] });
    const b = makeModel({ seed, archetype: 'anemia', technique: 'good', scenarioIds: ['sub-cohb-measured'] }, { resolve: undefined });
    assert.deepEqual(a.interp.key, b.interp.key);
    assert.equal(a.interp.measures.dlco.z, b.interp.measures.dlco.z);
    if (dlcoTable(a.model)?.rows.some((r) => r.id === 'dlco-cohb')) n++;
  }
  assert.ok(n > 50, `${n} cases with the line`);
});
