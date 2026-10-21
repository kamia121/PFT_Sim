import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { summarySheetHtml } from '../src/sheets/summary.js';
import { sheetCase, SHEET_CASES } from './summary-sheet-helpers.mjs';

// The pixel checks are in benchmarks/mobile-layout-smoke.mjs (Chromium, Firefox, WebKit). These tests pin the markup contract they rely on.
const name = Object.keys(SHEET_CASES)[0];
const html = (o = {}) => {
  const k = sheetCase(name);
  return summarySheetHtml(k.model, { rt: k.rt, caseData: k.c, interp: k.interp, equation: 'GLIglobal', palette: 'white', flags: 'lln', showQualityLines: false, ...o });
};

test('the stacked z-score graphic and the focusable table regions are emitted only for the practice page', () => {
  const fixed = html();
  assert.doesNotMatch(fixed, /z-strip-ats-narrow|role="region"|tabindex=/, 'the fixed sheets (report page, Lab report, print) carry neither');
  const live = html({ narrowZ: true });
  assert.equal((live.match(/data-figure-id="z-strip-ats-narrow"/g) ?? []).length, 1);
  assert.equal((live.match(/data-figure-id="z-strip-ats"/g) ?? []).length, 1, 'the 744 px graphic is kept');
  assert.ok((live.match(/role="region" tabindex="0" aria-label="[^"]+ table; scrolls sideways/g) ?? []).length >= 1, 'each table block is a labelled, focusable scroll region');
});

test('the report page box does not share a class with the comment box', () => {
  const pages = fs.readFileSync(new URL('../src/report-page/pages.js', import.meta.url), 'utf8');
  assert.doesNotMatch(pages, /class="rp-box sheet-box"/, 'sheet-box styles the comment box (border, padding) and would also frame the page box');
  assert.match(pages, /rp-box rp-sheet-box/);
});

test('phone reflow is screen-only and the list indent scales with the text', () => {
  const css = fs.readFileSync(new URL('../src/sheets/sheets.css', import.meta.url), 'utf8');
  assert.match(css, /@media screen and \(max-width: 700px\)\s*\{[^@]*--sheet-s: 1/);
  assert.match(css, /\.sheet-box ul \{[^}]*padding-left: 1\.4em/);
  assert.match(fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8'), /text-size-adjust:100%/);
});
