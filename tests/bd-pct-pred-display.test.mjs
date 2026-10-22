/**
 * The bronchodilator change as a percent of predicted, the quantity of the ERS/ATS 2022 rule (Table 1 and Box 1: 100 × (post − pre) / predicted
 * value, above 10% in FEV1 or FVC), is the change column of page 1 and of the narrow-screen excerpt, and the first change column of the
 * exports. One source: the model's changePctPred, taken from interp.bd.pctPred with the threshold-aware digits of src/interpret/precision.js,
 * printed by tableMatrix everywhere. The percent of baseline of the 2005 criterion is a secondary, labelled column of the exports only.
 * Display only: interpret.js, the thresholds and the scoring are unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ds, resolveReference, parseCsv } from './report-helpers.mjs';
import { stubRt } from './summary-sheet-helpers.mjs';
import { buildCase } from '../src/core/case.js';
import { interpret } from '../src/interpret/interpret.js';
import { buildReportModel } from '../src/report/model.js';
import { tableMatrix, MINUS } from '../src/report/table.js';
import { toCsv, toCsvWide, toTsv, toClipboardHtml } from '../src/report/export.js';
import { summarySheetHtml } from '../src/sheets/summary.js';
import { sheetCells, excerptsFor } from '../src/app/practice-view.js';
import { renderBronchodilator } from '../src/app/render.js';
import { assembleReport } from '../src/report-page/assemble.js';
import { mods } from './helpers/practice-markup.mjs';
import { PALETTES } from '../src/ui/palettes.js';
import { BD_PCT_PRED_LABEL, BD_PCT_BASE_LABEL, BD_PCT_PRED_NOTE, BD_PCT_BASE_NOTE } from '../src/interpret/precision.js';

const spiro = (model) => model.sections.flatMap((s) => s.tables).find((t) => t.id === 'spirometry');
const build = (input, equation = 'GLIglobal') => {
  const c = buildCase({ technique: 'fair', ...input }, ds);
  const interp = interpret(c.report, resolveReference, equation);
  return { c, interp, equation, model: buildReportModel(c, interp, { resolve: resolveReference, equation }) };
};
const sheetOf = ({ c, interp, equation, model }, extra = {}) => summarySheetHtml(model, { rt: stubRt(c), caseData: c, interp, equation, palette: PALETTES.white, flags: 'lln', showQualityLines: false, ...extra });
/** The printed text of one cell of the spirometry table, as tableMatrix gives it (`unicodeMinus` as on the sheets). */
const cellText = (t, id, key, unicodeMinus = true) => tableMatrix(t, { unicodeMinus }).body[t.rows.findIndex((r) => r.id === id)][t.columns.findIndex((col) => col.key === key)];
/** The model with interp.bd.pctPred replaced: the cell must follow the canonical value, never a recomputation. */
const withPctPred = ({ c, interp, equation }, fev1, fvc) => buildReportModel(c, { ...interp, bd: { ...interp.bd, pctPred: { fev1, fvc } } }, { resolve: resolveReference, equation });

/** Bronchodilator studies from fixed seeds. */
const STUDIES = [];
for (const archetype of ['obstruction', 'mixed', 'bd-discordant', 'normal']) {
  for (let seed = 1; seed <= 40 && STUDIES.filter((s) => s.archetype === archetype).length < 6; seed++) {
    const c = buildCase({ technique: 'fair', seed, archetype }, ds);
    if (c.report.spirometry.post && interpret(c.report, resolveReference, 'GLIglobal').bd) STUDIES.push({ seed, archetype });
  }
}

test('the column order and labels: Change (% predicted) first; the percent of baseline only in the exports, labelled as the superseded 2005 quantity', () => {
  assert.ok(STUDIES.length >= 16, `${STUDIES.length} studies`);
  const s = build(STUDIES[0]);
  const t = spiro(s.model);
  const keys = t.columns.map((col) => col.key);
  assert.deepEqual(keys.slice(keys.indexOf('change')), ['change', 'changePctPred', 'changePct']);
  assert.equal(t.columns.find((col) => col.key === 'changePctPred').label, BD_PCT_PRED_LABEL);
  assert.equal(t.columns.find((col) => col.key === 'changePct').label, BD_PCT_BASE_LABEL);
  assert.ok(t.footnote.includes(BD_PCT_PRED_NOTE) && t.footnote.includes(BD_PCT_BASE_NOTE));
  assert.match(BD_PCT_PRED_NOTE, /100 × \(post − pre\) \/ predicted value/);
  assert.match(BD_PCT_PRED_NOTE, /same before and after/);

  const sheet = sheetOf(s);
  // "Change" groups the two change columns, so the column reads Change (% predicted) on one header line; the cell keeps the full name.
  assert.match(sheet, /<th colspan="2" scope="colgroup">Change<\/th><\/tr>/);
  assert.match(sheet, /<th scope="col" class="r" aria-label="Change \(L\)">\(L\)<\/th><th scope="col" class="r" aria-label="Change \(% predicted\)">\(% predicted\)<\/th><\/tr>/);
  assert.doesNotMatch(sheet, /%Chng|of baseline|data-c="changePct"/);
  assert.ok(sheet.includes(BD_PCT_PRED_NOTE), 'page 1 defines the denominator');
  assert.ok(!sheet.includes(BD_PCT_BASE_NOTE), 'page 1 has no note for a column it does not print');
});

test('page 1, the excerpt, the report page, CSV (long and wide), TSV and the clipboard print the model\'s changePctPred for FEV1 and FVC, under both equations', () => {
  let differ = 0, roundingGap = 0;
  for (const input of STUDIES) {
    const by = {};
    for (const equation of ['GLIglobal', 'GLI2012']) {
      const s = build(input, equation);
      const t = spiro(s.model);
      const cells = sheetCells(sheetOf(s));
      const excerpt = excerptsFor(sheetOf(s, { narrowZ: true })).bronchodilator;
      const page = assembleReport({ caseData: s.c, resolve: resolveReference, equation, palette: PALETTES.white, qualityChallenge: false, stage: 1, sheets: { summarySheetHtml: mods.summarySheetHtml, buildRtReport: mods.buildRtReport, visibility: mods.visibility } }).html;
      const long = parseCsv(toCsv(s.model));
      const wide = toCsvWide(t), tsv = toTsv(t), clip = toClipboardHtml(t);
      for (const id of ['fev1', 'fvc']) {
        const shown = cellText(t, id, 'changePctPred'), ascii = cellText(t, id, 'changePctPred', false);
        const tag = `${input.archetype} ${input.seed} ${equation} ${id}`;
        const v = Number(ascii.replace(/\s*\(.*$/, ''));
        assert.ok(Math.abs(v - s.interp.bd.pctPred[id]) <= 0.05 + 1e-9, `${tag}: ${shown} against ${s.interp.bd.pctPred[id]}`);
        assert.equal(cells.spirometry[id].cells.changePctPred.text, shown, `${tag}: page 1`);
        assert.ok(excerpt.includes(`data-ws-cell="spirometry/${id}/changePctPred">${shown}<`), `${tag}: excerpt`);
        assert.ok(page.includes(`data-r="${id}" data-c="changePctPred">${shown}<`), `${tag}: report page`);
        const row = long.find((r) => r[1] === 'spirometry' && r[2] === t.rows.find((x) => x.id === id).index && r[3] === `Post-bronchodilator: ${BD_PCT_PRED_LABEL}`);
        assert.equal(row?.[4], ascii, `${tag}: CSV long`);
        assert.ok(wide.includes(`,${ascii},`) || wide.includes(`,"${ascii}",`), `${tag}: CSV wide`);
        assert.ok(tsv.includes(`\t${ascii}\t`), `${tag}: TSV`);
        assert.ok(clip.includes(`>${shown.replace(MINUS, '-')}<`) || clip.includes(`>${ascii}<`), `${tag}: clipboard`);
        const r = t.rows.find((x) => x.id === id), derived = r.postPct - r.pct;
        if (Math.abs(derived - s.interp.bd.pctPred[id]) >= 0.5) roundingGap++;
        (by[id] ??= []).push({ text: shown, change: cellText(t, id, 'change') });
      }
      // Rows without a predicted change keep blank cells.
      for (const id of ['fev1_fvc', 'fet', 'pef', 'fef2575']) if (cells.spirometry[id]) assert.equal(cells.spirometry[id].cells.changePctPred?.text ?? '', '', `${input.archetype} ${input.seed} ${equation} ${id}: blank`);
    }
    for (const id of ['fev1', 'fvc']) {
      assert.equal(by[id][0].change, by[id][1].change, 'the change in litres does not depend on the equation');
      if (by[id][0].text !== by[id][1].text) differ++;
    }
  }
  assert.ok(differ > 0, 'the percent of predicted depends on the equation for some studies');
  assert.ok(roundingGap > 0, 'some studies show why the rounded %Pred cells are not subtracted');
});

test('threshold-adjacent, zero and negative values print with the digits that show their side, on page 1 and in the CSV', () => {
  const s = build(STUDIES.find((x) => x.archetype === 'obstruction'));
  const cases = [
    [9.96, '+9.96'], [10.03, '+10.03'], [9.999, '+10.00 (below 10)'], [10.001, '+10.00 (above 10)'], [10, '+10.0'],
    [0, '+0.0'], [-0.04, '+0.0'], [-3.25, '−3.3'], [12.34, '+12.3'], [-12.34, '−12.3'],
  ];
  for (const [x, want] of cases) {
    const model = withPctPred(s, x, x);
    const t = spiro(model);
    for (const id of ['fev1', 'fvc']) {
      assert.equal(cellText(t, id, 'changePctPred'), want, `${x} ${id}`);
      assert.equal(cellText(t, id, 'changePctPred', false), want.replace(MINUS, '-'), `${x} ${id} (CSV text)`);
      assert.equal(sheetCells(sheetOf({ ...s, model })).spirometry[id].cells.changePctPred.text, want, `${x} ${id} on page 1`);
    }
  }
  // The two variables are read separately.
  const t = spiro(withPctPred(s, 10.001, 9.999));
  assert.deepEqual([cellText(t, 'fev1', 'changePctPred'), cellText(t, 'fvc', 'changePctPred')], ['+10.00 (above 10)', '+10.00 (below 10)']);
});

test('an unavailable reference prints a blank cell, never zero; without interp.bd the existing unrounded fallback prints what the canonical value prints', () => {
  const s = build(STUDIES.find((x) => x.archetype === 'mixed'));
  const t0 = spiro(s.model);
  const noRef = buildReportModel(s.c, { ...s.interp, bd: null, measures: { ...s.interp.measures, fev1: { ...s.interp.measures.fev1, available: false } } }, { resolve: resolveReference, equation: s.equation });
  assert.equal(cellText(spiro(noRef), 'fev1', 'changePctPred'), '');
  assert.equal(sheetCells(sheetOf({ ...s, model: noRef })).spirometry.fev1.cells.changePctPred?.text ?? '', '');
  // interp.bd is built only when both FEV1 and FVC have post values and references (interpret.js, unchanged); the model's fallback for a row
  // with its own post value and reference uses the same unrounded inputs, so where both exist they agree to the printed digit.
  const noBd = spiro(buildReportModel(s.c, { ...s.interp, bd: null }, { resolve: resolveReference, equation: s.equation }));
  for (const id of ['fev1', 'fvc']) assert.equal(cellText(noBd, id, 'changePctPred'), cellText(t0, id, 'changePctPred'), id);
});

test('no bronchodilator study: no change column, header or note anywhere; and no category before the answers are checked', () => {
  const none = build({ seed: 44, archetype: 'mixed', panel: 'spirometry' });
  assert.equal(none.c.report.spirometry.post ?? null, null);
  const t = spiro(none.model);
  assert.ok(!t.columns.some((col) => ['change', 'changePct', 'changePctPred'].includes(col.key)));
  assert.ok(!t.footnote.includes(BD_PCT_PRED_NOTE));
  const sheet = sheetOf(none);
  assert.doesNotMatch(sheet, /% predicted\)|changePct/);
  assert.equal(renderBronchodilator(none.c, none.interp, { maneuvers: false }), '');

  for (const input of STUDIES) {
    const s = build(input);
    const sheet = sheetOf(s, { narrowZ: true });
    assert.doesNotMatch(sheet, /significant|responsive|response/i, `${input.archetype} ${input.seed}: page 1 carries no bronchodilator category`);
    assert.doesNotMatch(excerptsFor(sheet).bronchodilator, /significant|responsive|response/i);
  }
});

test('the card view of a build without the sheets orders the columns the same way and names the denominator', () => {
  const s = build(STUDIES[0]);
  const html = renderBronchodilator(s.c, s.interp, { maneuvers: false });
  const heads = [...html.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(heads.slice(-3), ['Change (L)', BD_PCT_PRED_LABEL, BD_PCT_BASE_LABEL]);
  assert.match(html, /100 × \(post − pre\) \/ predicted value/);
  assert.doesNotMatch(html, /significant/i);
});
