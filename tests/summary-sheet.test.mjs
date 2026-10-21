import test from 'node:test';
import assert from 'node:assert/strict';
import { summarySheetHtml, simulatedHeader } from '../src/sheets/summary.js';
import { tableMatrix, round } from '../src/report/table.js';
import { LLN_Z } from '../src/interpret/interpret.js';
import { TWO_SIDED } from '../src/ui/figures/z-strip.js';
import { makeModel, SAMPLE_INPUTS } from './report-helpers.mjs';
import { sheetCase, SHEET_CASES, QUALITY_TOKEN, stubRt } from './summary-sheet-helpers.mjs';

const VOID = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'col', 'source']);

/** Tag-balance check: every opened element is closed in order. */
function assertWellFormed(html) {
  const stack = [];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) assert.equal(stack.pop(), m[1].toLowerCase(), `unexpected </${m[1]}> near ${html.slice(Math.max(0, m.index - 40), m.index + 20)}`);
    else if (m[2]) { const name = m[2].toLowerCase(); if (!VOID.has(name) && !m[4]) stack.push(name); }
  }
  assert.deepEqual(stack, [], 'unclosed elements');
}

const sheet = (name, o = {}, caseOpts = {}) => {
  const k = sheetCase(name, caseOpts);
  const html = summarySheetHtml(k.model, { rt: k.rt, caseData: k.c, interp: k.interp, equation: 'GLIglobal', palette: 'white', flags: 'lln', showQualityLines: false, ...o });
  return { ...k, html };
};

/** Cells of the sheet: [{ t, r, c, text, flag }]. */
function cells(html) {
  return [...html.matchAll(/<(td|th)[^>]*data-t="([^"]+)" data-r="([^"]+)" data-c="([^"]+)"([^>]*)>([^<]*(?:<sub>[^<]*<\/sub>[^<]*)*)<\/\1>/g)]
    .map((m) => ({ t: m[2], r: m[3], c: m[4], flag: /data-flag="(\w+)"/.exec(m[5])?.[1] ?? null, cls: /class="([^"]*)"/.exec(m[0])?.[1] ?? '', text: m[6].replace(/<\/?sub>/g, '').replace(/&amp;/g, '&') }));
}

test('the sheet is well formed for every case, with and without the quality statement', () => {
  for (const name of Object.keys(SHEET_CASES)) {
    for (const showQualityLines of [false, true]) {
      const { html } = sheet(name, { showQualityLines });
      assertWellFormed(html);
      assert.equal((html.match(/<article /g) ?? []).length, 1, name);
      assert.equal((html.match(/id="sheet-interpretation"/g) ?? []).length, 1, name);
    }
  }
  for (const input of SAMPLE_INPUTS) {
    const { c, interp, model } = makeModel(input);
    assertWellFormed(summarySheetHtml(model, { rt: stubRt(c), caseData: c, interp, equation: 'GLIglobal' }));
  }
});

test('every number cell of the sheet equals the report model cell text', () => {
  for (const name of Object.keys(SHEET_CASES)) {
    const { html, model, c } = sheet(name);
    const got = cells(html).filter((x) => x.c !== 'index');
    assert.ok(got.length > 20, name);
    for (const t of ['spirometry', 'volumes', 'dlco']) {
      const table = model.sections.flatMap((s) => s.tables).find((x) => x.id === t);
      if (!table) { assert.ok(!got.some((x) => x.t === t), `${name}: no ${t} cells without the test`); continue; }
      const mx = tableMatrix(table, { unicodeMinus: true });
      for (const cell of got.filter((x) => x.t === t)) {
        const ri = table.rows.findIndex((r) => r.id === cell.r), ci = table.columns.findIndex((col) => col.key === cell.c);
        if (cell.r === 'fef2575' && ri < 0) {
          // The model has no FEF25-75 row yet: the sheet builds it from the case with the model's rounding.
          const set = cell.c === 'post' ? c.spirometry.post?.summary : c.spirometry.pre.summary;
          if (cell.c === 'pre' || cell.c === 'post') assert.equal(cell.text, round(set.fef2575, 2).toFixed(2), `${name} fef ${cell.c}`);
          else assert.equal(cell.text, '', `${name}: FEF25-75 has no ${cell.c}`);
          continue;
        }
        assert.ok(ri >= 0 && ci >= 0, `${name}: ${t}/${cell.r}/${cell.c} exists in the model`);
        assert.equal(cell.text, mx.body[ri][ci], `${name}: ${t}/${cell.r}/${cell.c}`);
      }
    }
  }
});

test('FEF25-75 is printed without a reference value', () => {
  const { html } = sheet('obstruction');
  const fef = cells(html).filter((x) => x.r === 'fef2575');
  assert.ok(fef.length >= 3);
  for (const c of fef) if (!['index', 'pre', 'post'].includes(c.c)) assert.equal(c.text, '', c.c);
  assert.ok(fef.find((c) => c.c === 'pre').text !== '');
  assert.match(html, /FEF25-75 has no reference value/);
});

test('no quality statement, grade or acceptability text when showQualityLines is false', () => {
  for (const name of Object.keys(SHEET_CASES)) {
    // The model is built with grades so that its own footnote and comments hold them; the sheet must not carry them over.
    const { html, c } = sheet(name, { showQualityLines: false }, { includeGrades: true });
    assert.ok(!html.includes(QUALITY_TOKEN), name);
    assert.ok(!/Test quality/i.test(html), `${name}: test-quality footnote`);
    assert.ok(!/acceptab|usable|grade/i.test(html.replace(/<svg[\s\S]*?<\/svg>/g, '')), `${name}: grade or acceptability wording`);
    const g = c.spirometry.pre.summary.grades;
    assert.ok(!html.includes(`FEV<sub>1</sub> - ${g.fev1}, FVC - ${g.fvc}`), name);
    assert.ok(!/PFT data acceptable/.test(html), name);
    assert.ok(!/Pre: FEV/.test(html), name);
  }
});

test('with showQualityLines the stated grades, not the computed ones, and the statement appear', () => {
  const { html, rt } = sheet('obstruction', { showQualityLines: true });
  assert.ok(html.includes(`${QUALITY_TOKEN} PFT data acceptable and reproducible.`));
  assert.ok(html.includes(`Test quality: Pre: FEV<sub>1</sub> - ${rt.stated.pre.fev1}, FVC - ${rt.stated.pre.fvc}; Post: FEV<sub>1</sub> - ${rt.stated.post.fev1}, FVC - ${rt.stated.post.fvc}.`));
  // Comment box order: interpretation lines, quality lines, closing.
  const box = html.slice(html.indexOf('sheet-comments'));
  const order = [rt.interpretationLines[0], rt.qualityLines[0], rt.closing].map((s) => box.indexOf(s.replace(/&/g, '&amp;')));
  assert.ok(order.every((i) => i >= 0) && order[0] < order[1] && order[1] < order[2], order.join());
  const silent = sheet('obstruction', { rt: { ...rt, stated: { pre: null, post: null, dlco: null, pleth: null }, qualityLines: [] }, showQualityLines: true }).html;
  assert.ok(!/Test quality/.test(silent));
});

test('flags: lln marks values below the LLN and above the ULN of the two-sided indices; none prints none', () => {
  for (const name of Object.keys(SHEET_CASES)) {
    const { html, model, interp } = sheet(name);
    const got = cells(html);
    const flagged = got.filter((x) => x.flag);
    assert.ok(flagged.every((x) => x.cls.includes('flag')), name);
    // The pre-bronchodilator z-scores and values of spirometry follow the interpretation's own comparison with the LLN.
    for (const [id, m] of Object.entries(interp.measures)) {
      if (m.available === false || !Number.isFinite(m.z)) continue;
      const cell = got.find((x) => x.r === id && x.c === 'z' && x.t !== 'key');
      if (!cell) continue;
      const expected = m.z < LLN_Z ? 'low' : TWO_SIDED.has(id) && m.z > -LLN_Z ? 'high' : null;
      assert.equal(cell.flag, expected, `${name}: ${id} z ${m.z}`);
      const value = got.find((x) => x.r === id && (x.c === 'pre' || x.c === 'result'));
      if (value) assert.equal(value.flag, expected, `${name}: ${id} value`);
    }
    // Post-bronchodilator z-scores come from the model's table.
    const sp = model.sections.find((s) => s.id === 'spirometry').tables[0];
    for (const row of sp.rows.filter((r) => Number.isFinite(r.postZ))) assert.equal(got.find((x) => x.r === row.id && x.c === 'postZ').flag, row.postZ < LLN_Z ? 'low' : null, `${name}: post ${row.id}`);
    assert.match(html, /printed in bold red/);
    const none = sheet(name, { flags: 'none' }).html;
    assert.ok(!/data-flag|class="[^"]*\bflag\b/.test(none), `${name}: no flags`);
    assert.match(none, /Values are not flagged/);
    assert.ok(!/bold red/.test(none));
  }
  // The obstruction case has low values, the normal case has none below the limit.
  assert.ok(cells(sheet('obstruction').html).some((x) => x.flag === 'low'));
});

test('upper-limit flags are for the two-sided indices only', () => {
  const { html } = sheet('obstruction');
  for (const c of cells(html).filter((x) => x.flag === 'high')) assert.ok(TWO_SIDED.has(c.r) || ['sraw', 'raw'].includes(c.r), c.r);
  assert.ok(cells(html).some((x) => x.flag === 'high' && x.r === 'rv'));
});

test('layout: identity block, tables, four curves, z graphic, comment box, interpretation shell', () => {
  const { html, c } = sheet('obstruction');
  for (const cls of ['sheet-head', 'sheet-fields', 'sheet-tables', 'sheet-curves', 'sheet-z', 'sheet-comments', 'sheet-interp', 'sheet-sign']) assert.ok(html.includes(cls), cls);
  for (const label of ['Referred by', 'Reason for test', 'SpO2 at rest', 'Smoking', 'Hemoglobin', 'Ethnicity (requisition)', 'Reference equations', 'Sex (used for reference)', 'Height']) assert.ok(html.includes(`<dt>${label}</dt>`), label);
  for (const id of ['rep-flow-volume', 'rep-volume-time', 'rep-pleth-loop', 'rep-dlco']) assert.ok(html.includes(`data-figure-id="${id}"`), id);
  assert.match(html, /Pre: maneuver \d of \d; post: maneuver \d of \d/);
  assert.match(html, /Plethysmography: trial \d of \d/);
  assert.ok(html.includes('Bands apply to all measures'));
  assert.ok(html.includes('Severity of impairment is not necessarily disease severity.'));
  assert.ok(html.includes('Official interpretation to follow.'));
  assert.ok(/<div id="sheet-interpretation" class="sheet-interp-body"><\/div>/.test(html), 'the interpretation shell is empty');
  assert.ok(html.includes('Simulated interpreting physician (not signed)'));
  assert.ok(!html.includes('url('), 'figures are self-contained');
  assert.equal(c.descriptor.panel, 'full');
});

test('spirometry-only sheet has no volume, DLCO, plethysmography or gas-tracing content', () => {
  const { html } = sheet('spirometryOnly');
  assert.ok(!html.includes('data-t="volumes"') && !html.includes('data-t="dlco"'));
  assert.ok(!html.includes('rep-pleth-loop') && !html.includes('rep-dlco'));
  assert.ok(html.includes('rep-flow-volume') && html.includes('rep-volume-time'));
  assert.ok(!html.includes('<dt>Hemoglobin</dt>'));
  assert.match(html, /sheet-boxes solo/);
  assert.match(html, /Pre: maneuver \d of \d</);
  assert.ok(!/post: maneuver/.test(html));
});

test('the representative maneuver named by rt is the one drawn and captioned', () => {
  const k = sheetCase('obstruction');
  const n = k.c.spirometry.pre.maneuvers.length;
  const want = (k.rt.representative.pre.index + 1) % n;
  const rt = { ...k.rt, representative: { ...k.rt.representative, pre: { ...k.rt.representative.pre, index: want, kind: 'flawed' } } };
  const html = summarySheetHtml(k.model, { rt, caseData: k.c, interp: k.interp, equation: 'GLIglobal' });
  assert.ok(html.includes(`Pre: maneuver ${want + 1} of ${n}`));
  assert.ok(!/flawed|best maneuver/i.test(html), 'the caption does not tell which kind it is');
});

test('the simulated header fields come from their own stream and are reproducible', () => {
  const a = simulatedHeader(12, 40), b = simulatedHeader(12, 40), c = simulatedHeader(13, 40);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.match(a.physician, /^Dr\. [A-Z]\. \w+$/);
  assert.match(a.spo2, /^(96|97|98|99)% on room air$/);
  assert.match(simulatedHeader(5, 50, 3).smoking, /^Current smoker, \d+ pack-years; last smoked 3 h before the test$/);
  // The draw does not depend on the case values other than age (age only bounds the pack-years).
  for (let s = 1; s < 40; s++) assert.match(simulatedHeader(s, 60).smoking, /^(Never smoker|Former smoker, \d+ pack-years, stopped \d+ years? ago|Current smoker, \d+ pack-years)$/);
});

test('the sheet is a pure function of its inputs', () => {
  const a = sheet('mixed').html, b = sheet('mixed').html;
  assert.equal(a, b);
});

test('a fallback equation is shown on the equations line', () => {
  const { c, interp, model } = makeModel(SAMPLE_INPUTS[5]);
  const html = summarySheetHtml(model, { rt: stubRt(c), caseData: c, interp, equation: 'GLIglobal' });
  const fallback = Object.values(interp.measures).some((m) => m.available !== false && m.matched === false);
  assert.equal(/closest available; European-ancestry reference population/.test(html), fallback);
});
