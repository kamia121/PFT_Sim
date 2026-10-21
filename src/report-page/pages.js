/**
 * Page layout of the printed report: Letter pages of 8.5 in by 11 in, assembled from the report model (src/report/model.js).
 * Page 1 is the summary sheet (src/sheets/summary.js), one fixed sheet. When that module is not available the earlier page 1 is
 * used in its place (identification grid, spirometry table and panel, then a sheet of the volume and DLCO tables). Page 2 is the
 * details sheet (src/sheets/details.js), which flows, followed by the blank interpretation block with the signature and date
 * lines. The instructor copy appends a flowing appendix.
 *
 * Sizes: a fixed page is 816 by 1056 CSS px (8.5 by 11 in). Content sits inside margins of 0.42 in (top), 0.5 in (sides) and
 * 0.55 in (bottom, which also holds the footer line), leaving 7.5 in by 10.03 in. Panels are drawn 7 in wide; running text
 * is 9 pt, tables 8.5 pt, footnotes 7.5 pt and the smallest label 7 pt (page.css).
 */
import { esc } from '../report/table.js';
import { headerHtml, tableHtml, refNoteHtml, endHtml, paragraphs } from '../report/html.js';
import { inlineCell } from './panels.js';

const byId = (model, id) => model.sections.flatMap((s) => s.tables).find((t) => t.id === id) ?? null;
const section = (model, id) => model.sections.find((s) => s.id === id) ?? null;

/** Figure slot markup: one panel, a pair side by side, or a half-width figure. */
export function slotHtml(slot, name) {
  if (!slot) return '';
  const figs = slot.svgs.map((svg, i) => `<figure class="rp-fig" data-figure-id="${esc(slot.ids[i])}">${svg.replace(/^\s*<\?xml[^>]*>\s*/, '')}</figure>`).join('');
  return `<div class="rp-slot ${slot.span}" data-slot="${esc(name)}">${figs}</div>`;
}

/** Comment lines as a list, or '' when there are none. */
const listHtml = (lines) => (lines.length ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '');

/**
 * Technologist comment box of the fallback summary: the comments that bear on interpretation, the quality statement when the
 * visibility rule allows it, and the closing line.
 * @param {{ interpretationLines: string[], qualityLines: string[], closing: string }} rt
 */
export function commentBoxHtml(rt, { showQualityLines }) {
  const lines = [...rt.interpretationLines, ...(showQualityLines ? rt.qualityLines : [])];
  return `<div class="rpt-boxes rp-one"><section class="rpt-box"><h2>Technologist comments</h2>${listHtml(lines)}${rt.closing ? `<p class="rp-closing">${esc(rt.closing)}</p>` : ''}</section></div>`;
}

/**
 * Page 1 when src/sheets/summary.js is not available: the identification grid, the spirometry table with the panel, the
 * reference note and the technologist comments, then a second sheet with the volume and diffusing-capacity tables. The
 * plethysmography and DLCO panels are on the details sheet in every case.
 * @param {object} model student-safe model (no grades, no key)
 * @param {{ spirometry: object|null, zstrip: object|null }} slots resolved figure slots
 * @param {{ zInline: Function|null, palette: object, llnZ: number, rt: object, showQualityLines: boolean }} z
 * @returns {string[]} inner HTML of each fixed page
 */
export function fallbackSummaryPages(model, slots, { zInline = null, palette, llnZ = -1.645, rt, showQualityLines }) {
  const zExtra = zInline ? { label: 'z-score plot', cell: (row) => inlineCell(zInline, row.id, row, llnZ, palette) } : null;
  const tbl = (id, title = null, withZ = false) => {
    const t = byId(model, id);
    return t ? tableHtml(t, {}, title, withZ ? zExtra : null) : '';
  };
  const spiro = section(model, 'spirometry');
  const vols = section(model, 'volumes');
  const dlco = section(model, 'dlco');
  const p1 = [
    headerHtml(model),
    `<section class="rpt-sec rp-sec" data-section="spirometry"><h2>${esc(spiro.title)}</h2>${tbl('spirometry', spiro.title, true)}${slotHtml(slots.spirometry, 'spirometry')}${slotHtml(slots.zstrip, 'zstrip')}</section>`,
    refNoteHtml(model),
    commentBoxHtml(rt, { showQualityLines }),
  ].join('');
  const pages = [p1];
  if (vols || dlco) {
    const volumes = vols ? `<section class="rpt-sec rp-sec" data-section="volumes"><h2>${esc(vols.title)}</h2>${tbl('volumes', vols.title, true)}</section>` : '';
    const diffusion = dlco ? `<section class="rpt-sec rp-sec" data-section="dlco"><h2>${esc(dlco.title)}</h2>${tbl('dlco', dlco.title, true)}</section>` : '';
    pages.push(volumes + diffusion);
  }
  return pages;
}

/**
 * The blank interpretation box with the signature and date lines and the simulation disclaimer. Nothing is written in the box:
 * the reader's interpretation is written on paper or entered on the practice page.
 */
export function interpretationBlockHtml(model) {
  return `<section class="rpt-sec rp-interp" data-section="interpretation"><h2>Interpretation</h2><div class="rpt-box rp-blank" role="group" aria-label="Interpretation, left blank for the reader"></div>${endHtml(model)}</section>`;
}

/**
 * @param {object} model student-safe model (no grades, no key)
 * @param {{ spirometry: object|null, zstrip: object|null }} slots figure slots of the fallback summary
 * @param {{ summaryHtml?: string|null, detailsHtml: string, rt: object, showQualityLines: boolean, zInline?: Function|null, palette: object, llnZ?: number }} o
 *   `summaryHtml` is the output of summarySheetHtml; without it the fallback summary is built
 * @returns {{ pages: string[], continued: string }} the fixed pages, and the flowing page that holds the details and the interpretation block
 */
export function buildPages(model, slots, { summaryHtml = null, detailsHtml, rt, showQualityLines, zInline = null, palette, llnZ = -1.645 }) {
  const pages = summaryHtml ? [summaryHtml] : fallbackSummaryPages(model, slots, { zInline, palette, llnZ, rt, showQualityLines });
  return { pages, continued: detailsHtml + interpretationBlockHtml(model) };
}


/**
 * Instructor appendix: quality grades, per-maneuver acceptability, the interpretation statement, the notes on the simulation and
 * the answer key. It is built from a second model made with grades and the key, and is never part of the student copy.
 * @param {object} full model built with includeGrades, includeKey and the interpretation
 * @param {{ generatedAs: string, zInline?: Function|null }} info
 */
export function buildAppendix(full, { generatedAs }) {
  const quality = (full.quality ?? []).map((q) => `<div class="rp-q"><h3>${esc(q.test)}</h3><ul>${q.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`).join('');
  // The student pages carry tables with the same ids, so the appendix copies take their own.
  const tables = ['maneuvers-pre', 'maneuvers-post', 'pleth'].map((id) => { const t = byId(full, id); return t ? tableHtml({ ...t, id: `apx-${t.id}` }, {}) : ''; }).join('');
  const key = byId(full, 'key');
  const statement = full.interpretation ? paragraphs(full.interpretation) : '<p class="rpt-none">No statement was composed for this case.</p>';
  const notes = full.interpretationNotes?.length ? `<ul>${full.interpretationNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '<p class="rpt-none">No verification notes.</p>';
  return `<header class="rp-apx-head"><h1>Instructor appendix</h1><p>Case ${esc(full.meta.caseCode)}. Grades, the interpretation statement, verification notes and the answer key. This appendix is not part of the student copy.</p><p class="rp-gen">${esc(generatedAs)}</p></header>`
    + `<section class="rpt-sec rp-apx" data-section="quality"><h2>Test quality grades</h2><div class="rp-qgrid">${quality}</div></section>`
    + `<section class="rpt-sec rp-apx" data-section="acceptability"><h2>Acceptability by maneuver and trial</h2>${tables}</section>`
    + `<section class="rpt-sec rp-apx" data-section="statement"><h2>Interpretation statement</h2><div class="rpt-box rp-stmt">${statement}</div></section>`
    + `<section class="rpt-sec rp-apx" data-section="notes"><h2>Notes on this simulation</h2><div class="rpt-box rp-stmt">${notes}</div></section>`
    + (key ? `<section class="rpt-sec rp-apx" data-section="key"><h2>Answer key</h2>${tableHtml({ ...key, id: 'apx-key', footnote: 'Computed from the reported values under the spirometry equation named in the report.' }, {})}</section>` : '');
}

/** Footer line of a fixed page. */
export const footHtml = (model, { n, label }) => `<div class="rp-foot"><span>${esc(model.meta.marker)}. PFT Sim, generator version ${esc(model.meta.generatorVersion)}. Case ${esc(model.meta.caseCode)}. Not a patient record. ${esc(label)}.</span><span>Page ${n}</span></div>`;

/**
 * Wrap the page bodies in their frames.
 * @param {object} model
 * @param {string[]} pages inner HTML of the fixed pages
 * @param {{ label: string, appendix?: string|null }} opts
 */
export function frameDocument(model, pages, { label, appendix = null, continued = '' }) {
  const mark = `<div class="rp-markwrap" aria-hidden="true"><div class="rp-mark">${esc(model.meta.marker)}</div></div>`;
  const fixed = pages.map((body, i) => `<div class="rp-box" data-page-box="${i + 1}"><article class="pft-report rp-page" data-page="${i + 1}" aria-label="Report page ${i + 1} of ${pages.length}, case ${esc(model.meta.caseCode)}">${mark}<div class="rp-content">${body}</div>${footHtml(model, { n: i + 1, label })}</article></div>`);
  const cont = continued
    ? `<div class="rp-box flow cont" data-page-box="continued"><article class="pft-report rp-page rp-flow" data-page="continued" aria-label="Report, continued, case ${esc(model.meta.caseCode)}">${mark}<div class="rp-content">${continued}</div><div class="rp-foot"><span>${esc(model.meta.marker)}. PFT Sim, generator version ${esc(model.meta.generatorVersion)}. Case ${esc(model.meta.caseCode)}. Not a patient record. ${esc(label)}.</span></div></article></div>`
    : '';
  const apx = appendix
    ? `<div class="rp-box flow" data-page-box="appendix"><article class="pft-report rp-page rp-flow" data-page="appendix" aria-label="Instructor appendix, case ${esc(model.meta.caseCode)}">${mark}<div class="rp-content">${appendix}</div><div class="rp-foot"><span>${esc(model.meta.marker)}. Case ${esc(model.meta.caseCode)}. Instructor appendix: contains the answer key.</span></div></article></div>`
    : '';
  const code = String(model.meta.caseCode).replace(/[^A-Z0-9-]/gi, '');
  // Named page for the appendix: it flows over several sheets, so it takes real page margins and its own margin-box footer.
  const css = `@page{size:8.5in 11in;margin:0}@page apx{size:8.5in 11in;margin:.5in .5in .6in}@page cont{size:8.5in 11in;margin:.5in .5in .6in}@media print{@page cont{@bottom-left{content:"SIMULATED REPORT - educational use only. PFT Sim, generator version ${model.meta.generatorVersion}. Case ${code}. Not a patient record. ${label}.";font:7.5pt Arial,sans-serif;color:#000}@bottom-right{content:"Page " counter(page);font:7.5pt Arial,sans-serif;color:#000}}@page apx{@bottom-left{content:"SIMULATED REPORT - educational use only. Case ${code}. Instructor appendix.";font:7.5pt Arial,sans-serif;color:#000}@bottom-right{content:"Page " counter(page);font:7.5pt Arial,sans-serif;color:#000}}}`;
  return `<style>${css}</style><div class="rp-doc" data-copy="${appendix ? 'instructor' : 'student'}">${fixed.join('')}${cont}${apx}</div>`;
}
