/**
 * Page layout of the printed report: Letter pages of 8.5 in by 11 in, assembled from the report model (src/report/model.js)
 * and the figure slots (panels.js). Page 1 holds the identification grid, the spirometry table and its figure slot; page 2
 * the lung volumes (with the airway-resistance rows) and the plethysmography slot; page 3 the diffusing capacity with its slot, the
 * technologist comments, the reference equation note, the interpretation box, signature lines and the disclaimer; page 4 the
 * per-maneuver tables. A case without volumes and DLCO has three pages. The maneuver page also draws every maneuver on its own (the separate view of the spirometry panel). The instructor copy appends a flowing appendix.
 *
 * Sizes: a page is 816 by 1056 CSS px (8.5 by 11 in). Content sits inside margins of 0.42 in (top), 0.5 in (sides) and
 * 0.55 in (bottom, which also holds the footer line), leaving 7.5 in by 10.03 in. Panels are drawn 7 in wide; running text
 * is 9 pt, tables 8.5 pt, footnotes 7.5 pt and the smallest label 7 pt (page.css).
 */
import { esc } from '../report/table.js';
import { headerHtml, tableHtml, refNoteHtml, boxesHtml, endHtml, paragraphs } from '../report/html.js';
import { inlineCell } from './panels.js';

const byId = (model, id) => model.sections.flatMap((s) => s.tables).find((t) => t.id === id) ?? null;
const section = (model, id) => model.sections.find((s) => s.id === id) ?? null;

/** Figure slot markup: one panel, a pair side by side, or a half-width figure. */
export function slotHtml(slot, name) {
  if (!slot) return '';
  const figs = slot.svgs.map((svg, i) => `<figure class="rp-fig" data-figure-id="${esc(slot.ids[i])}">${svg.replace(/^\s*<\?xml[^>]*>\s*/, '')}</figure>`).join('');
  return `<div class="rp-slot ${slot.span}" data-slot="${esc(name)}">${figs}</div>`;
}

/**
 * @param {object} model student-safe model (no grades, no key)
 * @param {{ spirometry: object|null, pleth: object|null, dlco: object|null, zstrip: object|null }} slots resolved figure slots
 * @param {{ zInline: Function|null, palette: object, llnZ: number }} z the inline z-score graphic and its inputs
 * @returns {{ pages: string[] }} inner HTML of each fixed page, in order
 */
export function buildPages(model, slots, { zInline = null, palette, llnZ = -1.645 } = {}) {
  const extra = (measureOf) => (zInline ? {
    label: 'z-score plot',
    cell: (row) => inlineCell(zInline, measureOf(row), row, llnZ, palette),
  } : null);
  const zExtra = extra((row) => row.id);
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
  ].join('');

  let p2vols = '', dlcoSection = '';
  if (vols) {
    p2vols = (`<section class="rpt-sec rp-sec" data-section="volumes"><h2>${esc(vols.title)}</h2><div class="rp-vols${byId(model, 'pleth') ? '' : ' solo'}"><div>${tbl('volumes', vols.title, true)}</div>${byId(model, 'pleth') ? `<div>${tbl('pleth')}</div>` : ''}</div>${slotHtml(slots.pleth, 'pleth')}</section>`);
  }
  if (dlco) {
    const half = slots.dlco?.span === 'half';
    dlcoSection = (`<section class="rpt-sec rp-sec" data-section="dlco"><h2>${esc(dlco.title)}</h2><div class="rp-dlco${half ? ' side' : ''}"><div>${tbl('dlco', dlco.title, true)}</div>${slotHtml(slots.dlco, 'dlco')}</div></section>`);
  }

  const maneuvers = `<section class="rpt-sec rp-sec" data-section="maneuvers"><h2>Forced maneuvers</h2>${tbl('maneuvers-pre')}${tbl('maneuvers-post')}${slotHtml(slots.review, 'review')}</section>`;
  const closing = [boxesHtml(model), refNoteHtml(model), endHtml(model)].join('');
  // With volumes or diffusing capacity the clinical pages come first (spirometry; volumes) are fixed sheets; diffusing capacity, the comments, interpretation box and signature, and the
  // maneuver log, which a reader consults for repeatability, flow on from page 3.
  // Pages 1 and 2 are fixed sheets. Everything after them flows, so that a long list of maneuvers or technologist comments
  // takes another sheet and nothing is shrunk to fit.
  const pages = [p1];
  if (vols) pages.push(p2vols);
  const continued = (dlcoSection ? dlcoSection : '') + closing + maneuvers;
  return { pages, continued };
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
