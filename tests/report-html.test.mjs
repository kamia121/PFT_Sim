import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReportHtml, renderReportDocument } from '../src/report/html.js';
import { loadReportCss, reportDocument } from '../src/report/export.js';
import { allTables } from '../src/report/model.js';
import { FIGURES } from '../src/ui/figures/index.js';
import { makeModel, SAMPLE_INPUTS } from './report-helpers.mjs';

const VOID = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'col', 'source']);

/** Tag-balance check: every opened element is closed in order. */
function assertWellFormed(html) {
  const stack = [];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/gi;
  let m, rawTextUntil = null, pos = 0;
  while ((m = re.exec(html))) {
    if (rawTextUntil) { if (m[1]?.toLowerCase() === rawTextUntil) rawTextUntil = null; else continue; }
    if (m[1]) {
      const name = m[1].toLowerCase();
      assert.equal(stack.pop(), name, `unexpected </${name}> near ${html.slice(Math.max(0, m.index - 40), m.index + 20)}`);
    } else if (m[2]) {
      const name = m[2].toLowerCase();
      if (name === 'style' || name === 'script') { stack.push(name); rawTextUntil = name; continue; }
      if (!VOID.has(name) && !m[4]) stack.push(name);
    }
    pos = re.lastIndex;
  }
  assert.deepEqual(stack, [], 'unclosed elements');
  assert.ok(pos > 0);
}

const withoutNamespaces = (s) => s.replaceAll('http://www.w3.org/2000/svg', '').replaceAll('http://www.w3.org/1999/xlink', '');

function stubFigures(fn) {
  const saved = Object.fromEntries(Object.entries(FIGURES).map(([k, v]) => [k, { ...v }]));
  try {
    for (const id of Object.keys(FIGURES)) if (!['flow-volume', 'volume-time', 'z-strip'].includes(id)) FIGURES[id].dataFor = () => null;
    for (const id of ['flow-volume', 'volume-time', 'z-strip']) {
      FIGURES[id].dataFor = () => ({ id });
      FIGURES[id].render = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320" role="img"><title>${id}</title><desc>stub</desc><rect width="640" height="320" fill="#fff"/><path d="M0 0L10 10" stroke="#000"/></svg>`;
    }
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) Object.assign(FIGURES[k], v);
  }
}

test('the fragment is well formed and holds one article with every table', () => {
  for (const input of SAMPLE_INPUTS) {
    const { model } = makeModel(input);
    const html = renderReportHtml(model, { interactive: true });
    assertWellFormed(html);
    assert.equal((html.match(/<article /g) ?? []).length, 1);
    for (const t of allTables(model)) assert.ok(html.includes(`id="rpt-${t.id}"`), t.id);
    assert.equal((html.match(/data-copy-table=/g) ?? []).length, allTables(model).length, 'one copy button per table');
  }
});

test('the static fragment has no copy buttons and no scripts', () => {
  const { model } = makeModel(SAMPLE_INPUTS[0]);
  const html = renderReportHtml(model);
  assert.ok(!html.includes('<button'));
  assert.ok(!html.includes('<script'));
});

test('the layout follows the lab report: header grid, comment and interpretation boxes, footer', () => {
  const { model } = makeModel(SAMPLE_INPUTS[0]);
  const html = renderReportHtml(model);
  for (const cls of ['rpt-head', 'rpt-fields', 'rpt-note', 'rpt-boxes', 'rpt-interp', 'rpt-end', 'rpt-sign']) assert.ok(html.includes(`class="${cls}`) || html.includes(` ${cls}"`) || html.includes(`${cls} `), cls);
  assert.ok(html.includes('Reference equation note'));
  assert.ok(html.includes('Technologist comments'));
  assert.ok(html.includes('Interpretation to be entered by the reader.'));
  assert.ok(html.includes(model.footer.disclaimer));
  assert.ok(html.includes('Simulated interpreting physician (not signed)'));
  assert.ok(!html.includes('Interpreting physician signature'));
  assert.ok(html.includes('class="rpt-watermark"') && html.includes('SIMULATED REPORT - educational use only'));
  assert.ok(html.includes('generator version'));
  assert.ok(html.includes(`counter(page)`), 'page numbers come from the @page rule');
  const withText = renderReportHtml({ ...model, interpretation: 'First paragraph.\n\nSecond <b>paragraph</b>.' });
  assert.ok(withText.includes('<p>First paragraph.</p><p>Second &lt;b&gt;paragraph&lt;/b&gt;.</p>'));
  assert.ok(!withText.includes('to be entered by the reader'));
});

test('tables use header scopes and subscripted FEV1', () => {
  const { model } = makeModel(SAMPLE_INPUTS[0]);
  const html = renderReportHtml(model);
  assert.ok(html.includes('scope="col"') && html.includes('scope="row"') && html.includes('scope="colgroup"'));
  assert.ok(html.includes('FEV<sub>1</sub>'));
});

test('figures embed inline and others are skipped', () => {
  stubFigures(() => {
    const { model } = makeModel(SAMPLE_INPUTS[0], { palette: 'white' });
    const html = renderReportHtml(model);
    assertWellFormed(html);
    assert.equal((html.match(/<svg /g) ?? []).length, 3);
    assert.ok(html.includes('rpt-fig-z-strip'));
  });
  // When no figure has data (for example before a figure module is available), the figure block is omitted.
  const saved = Object.fromEntries(Object.entries(FIGURES).map(([k, v]) => [k, v.dataFor]));
  try {
    for (const f of Object.values(FIGURES)) f.dataFor = () => null;
    const { model } = makeModel(SAMPLE_INPUTS[0]);
    assert.ok(!renderReportHtml(model).includes('rpt-figs'));
  } finally {
    for (const [k, fn] of Object.entries(saved)) FIGURES[k].dataFor = fn;
  }
});

test('the standalone document is self-contained: doctype, inline CSS, no external URLs or scripts', async () => {
  await stubFigures(async () => {
    const { model } = makeModel(SAMPLE_INPUTS[0]);
    const doc = await reportDocument(model);
    assert.ok(doc.startsWith('<!doctype html>'));
    assertWellFormed(doc);
    assert.ok(doc.includes('<style>') && doc.includes('@media print'));
    assert.ok(doc.includes('<meta charset="utf-8">'));
    const body = withoutNamespaces(doc);
    assert.doesNotMatch(body, /https?:\/\//i, 'no external URLs');
    assert.doesNotMatch(body, /<link |<script|@import|url\(/i);
    assert.doesNotMatch(body, /(src|href)=/i);
    assert.ok(doc.includes(`<title>Simulated PFT report ${model.meta.caseCode}</title>`));
    assert.ok(doc.length < 400000);
  });
});

test('report.css has screen and print rules, letter pages and page-break control', async () => {
  const css = await loadReportCss();
  assert.match(css, /@media print/);
  assert.match(css, /break-inside:\s*avoid/);
  const { model } = makeModel(SAMPLE_INPUTS[0]);
  const doc = renderReportDocument(model, { css });
  assert.match(doc, /@page\{size:letter/);
  assert.match(doc, /Page " counter\(page\) " of " counter\(pages\)/);
  assert.doesNotMatch(css, /url\(|@import/);
});

test('the text of the fragment contains no unescaped markup from model strings', () => {
  const { model } = makeModel(SAMPLE_INPUTS[0]);
  model.technologistComments.push('<img src=x onerror=alert(1)>');
  model.header.fields.push({ label: 'Note', value: '"quoted" & <tag>' });
  const html = renderReportHtml(model);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x'));
  assert.ok(html.includes('&quot;quoted&quot; &amp; &lt;tag&gt;'));
});
