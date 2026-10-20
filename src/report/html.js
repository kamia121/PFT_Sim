/**
 * Renders a report model (model.js) as a lab-style HTML fragment or a self-contained document.
 * Cell text comes from `tableMatrix`, the same function the CSV, TSV and clipboard exports use.
 * Figures arrive as inline SVG strings from the model; nothing here loads an external resource.
 */
import { esc, labelHtml, tableMatrix } from './table.js';

const WIDE_FIELDS = new Set(['Tests performed', 'Reference equations']);
const HALF_FIELDS = new Set(['LLN definition']);
const BEST_KEYS = new Set(['pre', 'post', 'result']);

/** @page rule: margin boxes carry the case code and the page counter (supported by current Chromium). */
export function pageRuleCss(model) {
  const code = String(model.meta.caseCode).replace(/[^A-Z0-9-]/gi, '');
  return `@page{size:letter;margin:.45in .5in .6in}@media print{@page{@bottom-left{content:"SIMULATED REPORT - educational use only. PFT Sim, generator version ${model.meta.generatorVersion}. Case ${code}. Not a patient record.";font:8pt Arial,sans-serif;color:#000}@bottom-right{content:"Page " counter(page) " of " counter(pages);font:8pt Arial,sans-serif;color:#000}}}`;
}

function tableHtml(table, { interactive }, sectionTitle = null) {
  const mx = tableMatrix(table, { unicodeMinus: true });
  const cols = table.columns;
  const cls = (col) => [col.align === 'left' ? 'l' : 'r', BEST_KEYS.has(col.key) ? 'best' : ''].filter(Boolean).join(' ');
  const groupRow = mx.groups ? `<tr class="grp">${mx.groups.map((g) => `<th colspan="${g.span}" scope="colgroup"${g.label ? '' : ' class="empty"'}>${esc(g.label)}</th>`).join('')}</tr>` : '';
  const head = `<tr>${mx.head.map((h, i) => `<th scope="col" class="${cls(cols[i])}">${labelHtml(h)}</th>`).join('')}</tr>`;
  const body = mx.body.map((r, ri) => `<tr>${r.map((text, i) => (i === 0
    ? `<th scope="row" class="l">${labelHtml(text)}</th>`
    : `<td class="${cls(cols[i])}">${labelHtml(text)}</td>`)).join('')}</tr>`).join('');
  const button = interactive ? `<button type="button" class="rpt-copy no-print" data-copy-table="${esc(table.id)}">Copy table</button>` : '';
  // A caption that repeats the section heading is dropped; the copy button then sits on the heading line.
  const dup = sectionTitle !== null && table.caption === sectionTitle;
  return `<div class="rpt-block${dup ? ' nocap' : ''}" data-table="${esc(table.id)}"><div class="rpt-cap">${dup ? '' : `<h3>${labelHtml(table.caption)}</h3>`}${button}</div>`
    + `<table class="rpt-table" id="rpt-${esc(table.id)}"><thead>${groupRow}${head}</thead><tbody>${body}</tbody></table>`
    + `<p class="rpt-fn">${labelHtml(table.footnote)}</p></div>`;
}

const figuresHtml = (pairs, cls = '') => (pairs.length
  ? `<div class="rpt-figs${cls}">${pairs.map(([id, svg]) => `<figure class="rpt-fig rpt-fig-${esc(id)}">${svg}</figure>`).join('')}</div>`
  : '');
const figurePairs = (section) => section.figures.map((svg, i) => [section.figureIds?.[i] ?? i, svg]);
const notesHtml = (section) => (section.notes.length ? `<ul class="rpt-notes">${section.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '');

function sectionHtml(section, opts, afterFigures = '') {
  const [first, ...rest] = section.tables;
  const restHtml = rest.map((t) => tableHtml(t, opts)).join('');
  return `<section class="rpt-sec" data-section="${esc(section.id)}"><h2>${esc(section.title)}</h2>${first ? tableHtml(first, opts, section.title) : ''}${figuresHtml(figurePairs(section))}${afterFigures}${rest.length > 1 ? `<div class="rpt-pair">${restHtml}</div>` : restHtml}${notesHtml(section)}</section>`;
}

/** Lung volumes and DLCO tables side by side, with their figures in one row beneath. */
function pairSectionHtml(a, b, opts) {
  const col = (sec) => `<div class="rpt-col" data-section="${esc(sec.id)}"><h2>${esc(sec.title)}</h2>${sec.tables.map((t, i) => tableHtml(t, opts, i === 0 ? sec.title : null)).join('')}${notesHtml(sec)}</div>`;
  const figs = [...figurePairs(a), ...figurePairs(b)];
  return `<section class="rpt-sec rpt-secpair"><div class="rpt-pair">${col(a)}${col(b)}</div>${figuresHtml(figs, ` n${figs.length}`)}</section>`;
}

const paragraphs = (text) => String(text).split(/\n{2,}/).map((p) => `<p>${esc(p.trim())}</p>`).join('');

/**
 * @param {object} model from buildReportModel
 * @param {{ interactive?: boolean }} [opts] interactive adds a "Copy table" button to each table
 * @returns {string} an HTML fragment (one <article>)
 */
export function renderReportHtml(model, { interactive = false } = {}) {
  const f = model.header.fields;
  const fields = f.map((x) => `<div class="${WIDE_FIELDS.has(x.label) ? 'wide' : HALF_FIELDS.has(x.label) ? 'half' : ''}"><dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd></div>`).join('');
  const head = `<header class="rpt-head"><div class="rpt-lab"><div><strong>PFT Sim Pulmonary Function Laboratory</strong><span>Simulated laboratory. Educational use only.</span></div>`
    + `<div class="rpt-ttl">Pulmonary Function Report<span class="rpt-code">Case ${esc(model.meta.caseCode)}</span></div></div><dl class="rpt-fields">${fields}</dl></header>`;
  // Lung volumes and DLCO sit side by side, as on a one-page laboratory printout.
  // The reference equation note follows the spirometry table and figures, so equation statements sit with the numbers.
  const refNote = `<section class="rpt-note"><h2>Reference equation note</h2>${model.referenceNote.map((l) => `<p>${esc(l)}</p>`).join('')}</section>`;
  const secs = model.sections;
  const parts = [];
  for (let i = 0; i < secs.length; i++) {
    if (secs[i].id === 'volumes' && secs[i + 1]?.id === 'dlco') { parts.push({ html: pairSectionHtml(secs[i], secs[i + 1], { interactive }) }); i++; }
    else parts.push({ html: sectionHtml(secs[i], { interactive }, secs[i].id === 'spirometry' ? refNote : '') });
  }
  const sections = parts.map((p) => p.html).join('');
  const comments = model.technologistComments.length ? `<ul>${model.technologistComments.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p class="rpt-none">No comments recorded.</p>';
  const interp = model.interpretation ? paragraphs(model.interpretation) : '<p class="rpt-none">Interpretation to be entered by the reader.</p>';
  // Verification notes sit apart from the interpretation, so that the statement a physician would write stays free of remarks about the simulation.
  const simNotes = model.interpretation && model.interpretationNotes?.length
    ? `<div class="rpt-simnotes"><h3>Notes on this simulation</h3><ul>${model.interpretationNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : '';
  const boxes = `<div class="rpt-boxes"><section class="rpt-box"><h2>Technologist comments</h2>${comments}</section><section class="rpt-box rpt-interp"><h2>Interpretation</h2>${interp}${simNotes}</section></div>`;
  const foot = model.footer;
  const footer = `<footer class="rpt-end"><div class="rpt-sign"><div><span class="rpt-line"></span>${esc(foot.signatureLabel)}</div><div><span class="rpt-line short"></span>${esc(foot.dateLabel)}</div></div>`
    + `<p class="rpt-disc">${esc(foot.disclaimer)} <span class="rpt-gen">${esc(foot.generator)}. Case ${esc(foot.caseCode)}.</span></p></footer>`;
  const watermark = `<div class="rpt-watermark" aria-hidden="true">${esc(model.meta.marker ?? 'SIMULATED REPORT - educational use only')}</div>`;
  return `<article class="pft-report" aria-label="Simulated pulmonary function report, case ${esc(model.meta.caseCode)}"><style>${pageRuleCss(model)}</style>${watermark}${head}${sections}${boxes}${footer}</article>`;
}

/**
 * A complete HTML document with inline CSS and SVG, for saving and for "Save as PDF".
 * @param {object} model
 * @param {{ css: string }} opts the text of report.css
 */
export function renderReportDocument(model, { css }) {
  const title = `Simulated PFT report ${model.meta.caseCode}`;
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head><body class="rpt-standalone">${renderReportHtml(model, { interactive: false })}</body></html>\n`;
}
