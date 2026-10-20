import test from 'node:test';
import assert from 'node:assert/strict';
import { allTables } from '../src/report/model.js';
import { tableMatrix, formatCell } from '../src/report/table.js';
import { renderReportHtml } from '../src/report/html.js';
import { toCsv, toCsvWide, toTsv, toClipboardHtml, reportFilename, CSV_COLUMNS, longRows } from '../src/report/export.js';
import { makeModel, parseCsv, isNumeric, SAMPLE_INPUTS } from './report-helpers.mjs';

const MINUS = '−';
const norm = (s) => s.replaceAll(MINUS, '-');

/** Numeric cells of a model table as {row, column, text}, in table order. */
function modelNumbers(t) {
  const out = [];
  for (const r of t.rows) for (const col of t.columns) {
    if (col.key === 'index') continue;
    const text = formatCell(r[col.key], col, r);
    if (isNumeric(text)) out.push({ row: r.index, column: col.group ? `${col.group}: ${col.label}` : col.label, text, value: r[col.key] });
  }
  return out;
}

test('CSV long format: columns, and every number equals the model value', () => {
  for (const input of SAMPLE_INPUTS) {
    const { model } = makeModel(input);
    const rows = parseCsv(toCsv(model));
    assert.deepEqual(rows[0], CSV_COLUMNS);
    assert.ok(rows.slice(1).every((r) => r.length === 6), 'six fields on every row');
    for (const t of allTables(model)) {
      const csv = rows.filter((r) => r[1] === t.id && r[3] !== 'footnote');
      const expect = modelNumbers(t);
      // Every numeric model cell appears in the CSV with the same text, the same numeric value and a unit.
      for (const e of expect) {
        const hit = csv.find((r) => r[2] === e.row && r[3] === e.column);
        assert.ok(hit, `${t.id} ${e.row} ${e.column} missing in CSV`);
        assert.equal(hit[4], e.text);
        assert.equal(Number(hit[4]), e.value);
      }
      // And the CSV holds no numeric value the model does not.
      const csvNumeric = csv.filter((r) => isNumeric(r[4]));
      assert.equal(csvNumeric.length, expect.length, `${t.id}: numeric cell count`);
    }
  }
});

test('CSV units come from the column or the row', () => {
  const { model } = makeModel(SAMPLE_INPUTS[0]);
  const rows = parseCsv(toCsv(model));
  const find = (table, rowName, column) => rows.find((r) => r[1] === table && r[2] === rowName && r[3] === column);
  assert.equal(find('spirometry', 'FVC', 'Pre-bronchodilator: Best')[5], 'L');
  assert.equal(find('spirometry', 'FEV1/FVC', 'Pre-bronchodilator: Best')[5], 'ratio');
  assert.equal(find('spirometry', 'FEV1', 'Post-bronchodilator: Change')[5], 'L');
  assert.equal(find('volumes', 'RV/TLC', 'Result')[5], '%');
  assert.equal(find('dlco', 'KCO', 'Result')[5], 'mL/min/mmHg/L');
});

test('TSV, wide CSV, clipboard HTML and the page HTML carry the same numbers as the model', () => {
  for (const input of SAMPLE_INPUTS) {
    const { model } = makeModel(input);
    const page = renderReportHtml(model);
    for (const t of allTables(model)) {
      const expect = modelNumbers(t).map((e) => e.text);

      const tsv = toTsv(t).trimEnd().split('\n').slice(1).flatMap((l) => l.split('\t').slice(1)).filter(isNumeric);
      assert.deepEqual(tsv, expect, `TSV ${t.id}`);

      const wide = parseCsv(toCsvWide(t)).slice(1).flatMap((r) => r.slice(1)).filter(isNumeric);
      assert.deepEqual(wide, expect, `wide CSV ${t.id}`);

      const clip = toClipboardHtml(t);
      const clipCells = [...clip.matchAll(/<td [^>]*>([^<]*)<\/td>/g)].map((m) => m[1]).filter(isNumeric);
      assert.deepEqual(clipCells, expect, `clipboard ${t.id}`);

      const block = page.slice(page.indexOf(`data-table="${t.id}"`));
      const body = block.slice(block.indexOf('<tbody>'), block.indexOf('</tbody>'));
      const htmlCells = [...body.matchAll(/<td [^>]*>(.*?)<\/td>/g)].map((m) => norm(m[1])).filter(isNumeric);
      assert.deepEqual(htmlCells, expect, `page HTML ${t.id}`);
    }
  }
});

test('page HTML uses a true minus sign where the text exports use a hyphen', () => {
  const { model } = makeModel(SAMPLE_INPUTS[0]);
  const page = renderReportHtml(model);
  assert.ok(page.includes(`>${MINUS}`), 'negative z-scores use U+2212 on the page');
  assert.ok(!toCsv(model).includes(MINUS.repeat(2)));
  const { body } = tableMatrix(allTables(model)[0]);
  assert.ok(body.flat().every((c) => !c.includes(MINUS)), 'text matrices use ASCII hyphen-minus');
});

test('the clipboard table is clean: inline styles only, no classes or scripts, caption and footnote kept', () => {
  const { model } = makeModel(SAMPLE_INPUTS[0]);
  const t = allTables(model)[0];
  const html = toClipboardHtml(t);
  assert.ok(html.startsWith('<table'));
  assert.ok(html.endsWith('</table>'));
  assert.doesNotMatch(html, /class=|<script|<svg|<button/);
  assert.ok(html.includes('<caption'));
  assert.ok(html.includes('Reference values: GLI Global 2022'));
  assert.equal((html.match(/<table/g) ?? []).length, 1);
  assert.match(html, /colspan="4"[^>]*>Pre-bronchodilator/, 'group header spans the pre-bronchodilator columns');
});

test('CSV escaping keeps commas, quotes and line breaks inside one field', () => {
  const { model } = makeModel(SAMPLE_INPUTS[1]);
  model.technologistComments.push('Patient said "ready", then coughed.\nSecond line.');
  const rows = parseCsv(toCsv(model));
  const hit = rows.find((r) => r[0] === 'comments' && r[1] === 'technologist' && r[4].includes('"ready"'));
  assert.equal(hit[4], 'Patient said "ready", then coughed.\nSecond line.');
  assert.ok(rows.every((r) => r.length === 6));
});

test('long rows include the header, comments, reference note, footnotes and the case code', () => {
  const { model } = makeModel(SAMPLE_INPUTS[0]);
  const rows = longRows(model);
  assert.ok(rows.some((r) => r[0] === 'header' && r[2] === 'ID' && r[4] === model.meta.caseCode));
  assert.ok(rows.some((r) => r[3] === 'footnote' && r[1] === 'spirometry'));
  assert.ok(rows.some((r) => r[1] === 'reference-equation-note'));
  assert.ok(rows.some((r) => r[0] === 'footer' && r[2] === 'case code' && r[4] === model.meta.caseCode));
});

test('wide CSV of the whole report lists each table caption and footnote', () => {
  const { model } = makeModel(SAMPLE_INPUTS[0]);
  const text = toCsv(model, { layout: 'wide' });
  const parsed = parseCsv(text);
  for (const t of allTables(model)) { assert.ok(parsed.some((r) => r.length === 1 && r[0] === t.caption), t.caption); assert.ok(parsed.some((r) => r.length === 1 && r[0] === t.footnote), t.id); }
  assert.ok(text.startsWith('Case code,'));
});

test('file names include the case code', () => {
  const { model } = makeModel(SAMPLE_INPUTS[0]);
  const code = model.meta.caseCode.toLowerCase();
  assert.equal(reportFilename(model, 'csv'), `pft-report-${code}.csv`);
  assert.equal(reportFilename(model, 'csv', 'wide'), `pft-report-${code}-wide.csv`);
  assert.equal(reportFilename(model, 'html'), `pft-report-${code}.html`);
});
