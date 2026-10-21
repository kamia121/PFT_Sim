/**
 * Page 1 of the report, the summary sheet (docs/REPORT-FIRST-PLAN.md, "Page 1, the summary sheet"): a Letter page of 816 by
 * 1056 CSS px with the identity block, the three tables (spirometry, lung volumes, diffusing capacity) on the left, four compact
 * curves of the representative maneuver, trial and test on the right, the z-score graphic below them, the technologist comments
 * and the interpretation box. It is a pure function from the report model and the technologist report to an HTML string and runs
 * under Node and in the browser; nothing here touches the DOM at import time.
 *
 * One source for the numbers: every number cell is the text `tableMatrix` gives for the report model's table (the same function
 * that feeds the printed report and the exports), so the sheet and the model cannot differ. The cells carry
 * data-t (table id), data-r (row id) and data-c (column key) so that a test compares them one by one. Two things are not in the
 * model today and are added here from the case, with the model's own rounding (`round` of src/report/table.js): the FEF25-75 row
 * (printed with no reference value) when the model has no row with an id starting "fef". The page-1 tables leave out rows that
 * belong to the details (the hemoglobin adjustment factor, the change as percent of predicted).
 *
 * Flags: with `flags: 'lln'` a value is printed in bold red when its z-score is below the LLN (z < -1.645) and, for the
 * indices that are read on both sides (TLC, RV, RV/TLC, DLCO, KCO), above the ULN. The airway-resistance rows, which have no z-score,
 * are flagged against their teaching limits. `flags: 'none'` prints none. The basis is named in a footnote. The cells also carry
 * data-flag and a title, so the flag does not depend on the color.
 *
 * Quality: the technologist's quality statement and the grades are written only when `showQualityLines` is true (the
 * visibility rule, src/challenges/visibility.js). Nothing of them, not even a grade column or the model's own footnote, is in
 * the markup otherwise.
 *
 * Identity fields that the model does not hold (referring physician, reason for test, SpO2 at rest, smoking when the scenario does
 * not give it) are written here from the new stream `summary-header`, so no existing stream is touched. They are drawn
 * independently of the physiology and are plausible and non-informative; recent smoking from the scenario overrides the draw.
 */
import { tableMatrix, esc, labelHtml, round } from '../report/table.js';
import { statementHtml } from '../report/html.js';
import { LLN_Z, borderlineOf } from '../interpret/interpret.js';
import { createStream } from '../core/prng.js';
import zStrip, { TWO_SIDED } from '../ui/figures/z-strip.js';
import { PALETTES } from '../ui/palettes.js';
import { REPRESENTATIVE_FIGURES } from '../ui/figures/representative.js';

export const SHEET = { width: 816, height: 1056 };
/** Height in px shared out between the curves of the right column (the loop gets the largest share). */
const CURVE_BUDGET = 490;
const CURVE_WEIGHT = { 'rep-flow-volume': 1.6, 'rep-volume-time': 1, 'rep-pleth-loop': 1, 'rep-dlco': 1 };
const CURVE_WIDTH = 336;
const POST_IDS = new Set(['fvc', 'fev1', 'fev1_fvc']);

const byId = (model, id) => model.sections.flatMap((s) => s.tables).find((t) => t.id === id) ?? null;

/* ----------------------------------------------------------------------------------------- simulated header */

const SURNAMES = ['Alder', 'Bennett', 'Castillo', 'Dalton', 'Ellison', 'Foster', 'Greene', 'Hartley', 'Iverson', 'Jansen', 'Keller', 'Lindqvist', 'Marlow', 'Novak', 'Okafor', 'Prescott', 'Quill', 'Rivera', 'Sutter', 'Tanaka'];
const REASONS = ['Shortness of breath, evaluation', 'Cough, evaluation', 'Preoperative assessment', 'Exertional symptoms, evaluation', 'Routine assessment'];

/**
 * Fields that no existing stream and no model field supplies. Drawn from the stream `summary-header`; the draws always happen
 * in the same order, so a value does not depend on which other fields the scenario gave.
 * @param {number} seed @param {number} age @param {number|null} lastSmokingHours
 */
export function simulatedHeader(seed, age, lastSmokingHours = null) {
  const rng = createStream(seed, 'summary-header');
  const initial = String.fromCharCode(65 + rng.int(0, 25));
  const surname = SURNAMES[rng.int(0, SURNAMES.length - 1)];
  const reason = REASONS[rng.int(0, REASONS.length - 1)];
  const spo2 = rng.int(96, 99);
  const u = rng.uniform();
  const cap = Math.max(3, Math.round((age - 16) * 1.2));
  const packs = rng.int(2, Math.min(45, cap));
  const quit = rng.int(1, Math.max(1, Math.min(30, age - 20)));
  let smoking;
  if (Number.isFinite(lastSmokingHours)) smoking = `Current smoker, ${packs} pack-years; last smoked ${lastSmokingHours} h before the test`;
  else if (u < 0.5) smoking = 'Never smoker';
  else if (u < 0.8) smoking = `Former smoker, ${packs} pack-years, stopped ${quit} year${quit === 1 ? '' : 's'} ago`;
  else smoking = `Current smoker, ${packs} pack-years`;
  return { physician: `Dr. ${initial}. ${surname}`, reason, spo2: `${spo2}% on room air`, smoking };
}

/* --------------------------------------------------------------------------------------------- table rows */

/** FEF25-75 row, built from the case with the model's rounding; no reference value, so no LLN, z-score or percent predicted. */
function fefRow(caseData, hasPost) {
  const pre = caseData.spirometry.pre.summary.fef2575;
  const row = { id: 'fef2575', index: 'FEF25-75', unit: 'L/s', dp: 2, pre: round(pre, 2), lln: null, z: null, pct: null };
  if (hasPost) {
    Object.assign(row, { post: round(caseData.spirometry.post?.summary.fef2575 ?? null, 2), postZ: null, postPct: null, change: null, changePct: null, changePctPred: null });
  }
  return row;
}

/** The spirometry table with a FEF25-75 row after PEF, taken from the model when it has one. */
function spirometryTable(model, caseData) {
  const t = byId(model, 'spirometry');
  if (!t || t.rows.some((r) => String(r.id).startsWith('fef'))) return t;
  const hasPost = t.columns.some((c) => c.key === 'post');
  const rows = [...t.rows];
  const i = rows.findIndex((r) => r.id === 'pef');
  rows.splice(i < 0 ? rows.length : i + 1, 0, fefRow(caseData, hasPost));
  return { ...t, rows };
}

const HEADS = { index: '', pre: 'Best', lln: 'LLN', uln: 'ULN', z: 'z', pct: '%Pred', post: 'Best', postZ: 'z', postPct: '%Pred', change: 'Change', changePct: '%Chng', result: 'Result' };

const COLS = {
  spirometry: ['index', 'pre', 'lln', 'z', 'pct', 'post', 'postZ', 'postPct', 'change', 'changePct'],
  volumes: ['index', 'result', 'lln', 'uln', 'z', 'pct'],
  dlco: ['index', 'result', 'lln', 'z', 'pct'],
};
const SKIP_ROWS = new Set(['hb-factor']);

/**
 * Flag of one cell: 'low', 'high' or null. A value is flagged by its z-score; a row without one by its limits.
 * @param {object} row @param {'pre'|'post'} which
 */
function flagOf(row, which) {
  const z = which === 'post' ? row.postZ : row.z;
  if (Number.isFinite(z)) {
    if (z < LLN_Z) return 'low';
    if (TWO_SIDED.has(row.id) && z > -LLN_Z) return 'high';
    return null;
  }
  const v = which === 'post' ? row.post : row.result ?? row.pre;
  if (!Number.isFinite(v)) return null;
  if (Number.isFinite(row.uln) && v > row.uln) return 'high';
  if (Number.isFinite(row.lln) && v < row.lln) return 'low';
  return null;
}
const CELL_WHICH = { pre: 'pre', z: 'pre', result: 'pre', post: 'post', postZ: 'post' };
const FLAG_WORD = { low: 'below the LLN', high: 'above the ULN' };

/**
 * One table as markup. Cell text is tableMatrix text (Unicode minus); the row label carries its unit.
 * @returns {string}
 */
function sheetTable(table, id, { flags }) {
  const keep = COLS[id].filter((k) => table.columns.some((c) => c.key === k));
  const colIdx = keep.map((k) => table.columns.findIndex((c) => c.key === k));
  const mx = tableMatrix(table, { unicodeMinus: true });
  // Group header over the kept columns.
  const groups = [];
  for (const i of colIdx) {
    const label = table.columns[i].group ?? '';
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.span += 1; else groups.push({ label, span: 1 });
  }
  const groupRow = groups.some((g) => g.label) ? `<tr class="grp">${groups.map((g) => `<th colspan="${g.span}" scope="colgroup"${g.label ? '' : ' class="empty"'}>${esc(g.label.replace('-bronchodilator', ''))}</th>`).join('')}</tr>` : '';
  const head = `<tr>${keep.map((k, j) => `<th scope="col" class="${j === 0 ? 'l' : 'r'}">${esc(HEADS[k] ?? table.columns[colIdx[j]].label)}</th>`).join('')}</tr>`;
  const body = table.rows.map((row, ri) => {
    if (SKIP_ROWS.has(row.id)) return '';
    const cells = keep.map((k, j) => {
      const text = mx.body[ri][colIdx[j]];
      if (j === 0) return `<th scope="row" class="l" data-t="${esc(id)}" data-r="${esc(row.id)}" data-c="index">${labelHtml(text)}</th>`;
      const which = CELL_WHICH[k];
      const f = flags === 'lln' && which && text !== '' ? flagOf(row, which) : null;
      const cls = ['r', k === 'pre' || k === 'post' || k === 'result' ? 'best' : '', f ? 'flag' : ''].filter(Boolean).join(' ');
      return `<td class="${cls}" data-t="${esc(id)}" data-r="${esc(row.id)}" data-c="${esc(k)}"${f ? ` data-flag="${f}" title="${FLAG_WORD[f]}"` : ''}>${esc(text)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table class="sheet-table" id="sheet-${esc(id)}"><thead>${groupRow}${head}</thead><tbody>${body}</tbody></table>`;
}

/* ----------------------------------------------------------------------------------------------- footnotes */

/** Sentences of a model footnote up to (not including) the one that starts with `stop`. */
const before = (text, stop) => { const i = text.indexOf(stop); return (i < 0 ? text : text.slice(0, i)).trim(); };

function spirometryFootnote(table, { flags, rt, showQualityLines, hasVolumes }) {
  const parts = [before(before(table.footnote, ' Test quality:'), ' Change, % of predicted,')];
  if (flags === 'lln') parts.push(`Values below the LLN (z < ${String(LLN_Z).replace('-', '−')}) are printed in bold red${hasVolumes ? '; so are TLC, RV, RV/TLC, DLCO and KCO above the ULN (z > +1.645)' : ''}.`);
  else parts.push('Values are not flagged.');
  parts.push('FEF25-75 has no reference value.');
  const st = rt?.stated;
  if (showQualityLines && st?.pre) {
    const one = (s) => `FEV1 - ${s.fev1}, FVC - ${s.fvc}`;
    parts.push(`Test quality: Pre: ${one(st.pre)}${st.post ? `; Post: ${one(st.post)}` : ''}.`);
  }
  return parts.join(' ');
}

function volumesFootnote(table) {
  const cut = before(table.footnote, ' Airway resistance:');
  return table.rows.some((r) => ['sraw', 'sgaw', 'raw'].includes(r.id)) ? `${cut} Airway-resistance limits are teaching values from secondary sources.` : cut;
}

function dlcoFootnote(table) {
  const sentences = table.footnote.split(/(?<=\.) (?=[A-Z])/);
  const keep = sentences.filter((s) => /^Reference values:|^LLN, z-score and %Pred/.test(s)).map((s) => s.replace(/\s*\(Cotes formula[^)]*\)/, ''));
  const fn = keep.join(' ');
  return fn || table.footnote;
}

/* -------------------------------------------------------------------------------------------------- header */

function equationLine(model, interp) {
  const H = Object.fromEntries(model.header.fields.map((f) => [f.label, f.value]));
  const segs = String(H['Reference equations'] ?? '').split('; ').filter(Boolean);
  const measureOf = { Spirometry: 'fvc', 'Lung volumes': 'tlc', DLCO: 'dlco' };
  return segs.map((s) => {
    const [label] = s.split(': ');
    const m = interp?.measures?.[measureOf[label]];
    return m && m.available !== false && m.matched === false ? `${s} (closest available; European-ancestry reference population)` : s;
  }).join('; ');
}

function identity(model, caseData, interp) {
  const H = Object.fromEntries(model.header.fields.map((f) => [f.label, f.value]));
  const seed = caseData.descriptor.seed;
  const sim = simulatedHeader(seed, caseData.report.patient.age, caseData.scenario?.preTest?.lastSmokingHours ?? null);
  const sexBirth = H['Sex assigned at birth'];
  const fields = [
    ['Name', H.Name],
    ['ID', H.ID],
    ['Sex (used for reference)', sexBirth ? `${H['Sex (used for reference)']}; assigned at birth: ${sexBirth}` : H['Sex (used for reference)'], sexBirth || /default/.test(H['Sex (used for reference)'] ?? '') ? 2 : 1],
    ['Age', H.Age],
    ['Date of test (simulated)', H['Test date (simulated)'], 1],
    ['Height', H.Height, 2],
    ['Weight; BMI', `${H.Weight}; ${H.BMI}`, 2],
    ['Ethnicity (requisition)', H['Reference group'], 2],
    ['Smoking', H['Smoking status'] ?? sim.smoking, 2],
    ['Referred by', sim.physician],
    ['SpO2 at rest', sim.spo2],
    ['Reason for test', sim.reason, H.Hemoglobin ? 2 : 3],
    ...(H.Hemoglobin ? [['Hemoglobin', H.Hemoglobin]] : []),
    ['Reference equations', equationLine(model, interp), 6],
  ];
  const cells = fields.map(([label, value, span = 1]) => `<div${span > 1 ? ` class="s${span}"` : ''}><dt>${esc(label)}</dt><dd>${esc(value ?? '')}</dd></div>`).join('');
  return `<header class="sheet-head"><div class="sheet-lab"><div><strong>PFT Sim Pulmonary Function Laboratory</strong><span>Simulated laboratory. Educational use only.</span></div>`
    + `<div class="sheet-ttl">Pulmonary Function Report<span>Case ${esc(model.meta.caseCode)}</span></div></div><dl class="sheet-fields">${cells}</dl></header>`;
}

/* ---------------------------------------------------------------------------------------------- z graphic */

/** Data of the z-score graphic: pre z-scores from the interpretation, post z-scores from the model's table (one rounding). */
function zData(model, interp, caseData) {
  const data = zStrip.dataFor({ interp, report: caseData.report });
  if (!data) return null;
  const sp = byId(model, 'spirometry');
  if (sp?.columns.some((c) => c.key === 'postZ')) {
    for (const r of data.rows) {
      if (!POST_IDS.has(r.id)) continue;
      const z = sp.rows.find((x) => x.id === r.id)?.postZ;
      if (Number.isFinite(z)) r.post = { z, below: z < LLN_Z, borderline: borderlineOf(z) };
    }
    data.hasPost = data.rows.some((r) => r.post);
  }
  return data;
}

/* ------------------------------------------------------------------------------------------------- curves */

function curves(caseData, rt, palette) {
  const avail = REPRESENTATIVE_FIGURES.map((f) => ({ f, data: f.dataFor(caseData, rt) })).filter((x) => x.data);
  const total = avail.reduce((s, x) => s + CURVE_WEIGHT[x.f.id], 0) || 1;
  const budget = avail.length <= 2 ? CURVE_BUDGET * 0.72 : CURVE_BUDGET;
  return avail.map(({ f, data }) => {
    const height = Math.round((budget * CURVE_WEIGHT[f.id]) / total);
    const svg = f.render(data, { palette, width: CURVE_WIDTH, height });
    return `<figure class="sheet-fig" data-figure-id="${esc(f.id)}">${svg}</figure>`;
  }).join('');
}

/* ---------------------------------------------------------------------------------------------- interpretation */

/** Line in the sheet's interpretation box once the statement has been released: the box holds about a hundred pixels, a statement runs to a paragraph. */
export const INTERPRETATION_POINTER = 'The interpretation statement follows the detailed report.';

const interpParagraphs = (text) => String(text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');

/**
 * The interpretation statement as a section that flows after the summary sheet, for the sheet assembly of the Lab report view. The
 * model carries the statement only after the key has been released and the statement asked for, so before that this is the empty
 * string. The statement is the model's text, escaped; the notes on the simulation follow it under their own heading.
 * @param {object} model report model
 * @returns {string}
 */
export function interpretationSectionHtml(model) {
  if (!model?.interpretation) return '';
  const notes = model.interpretationNotes?.length ? `<div class="sheet-simnotes"><h3>Notes on this simulation</h3><ul>${model.interpretationNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : '';
  const foot = model.footer;
  return `<section class="rpt-sec dt-sec sheet-interp-full" data-section="interpretation-statement"><h2>Interpretation</h2><div class="sheet-statement">${statementHtml(model.interpretationParts, model.interpretation)}</div>${notes}`
    + `<div class="sheet-sign"><div><span class="sheet-line"></span>${esc(foot.signatureLabel)}</div><div class="short"><span class="sheet-line"></span>${esc(foot.dateLabel)}</div></div></section>`;
}

/* ---------------------------------------------------------------------------------------------- the sheet */

/**
 * @param {object} model report model (buildReportModel); build it with includeGrades false, though the sheet does not read grades
 * @param {{ rt?: object|null, caseData: object, interp: object, equation?: string, palette?: string|object,
 *   flags?: 'lln'|'none', showQualityLines?: boolean }} o
 *   rt is an RtReport (docs/REPORT-FIRST-PLAN.md); without it the comment box is empty and the best maneuvers are drawn.
 * @returns {string} an HTML fragment: one <article class="sheet sheet-summary"> in its frame
 */
export function summarySheetHtml(model, { rt = null, caseData, interp, equation, palette = 'white', flags = 'lln', showQualityLines = false } = {}) {
  const pal = typeof palette === 'string' ? (PALETTES[palette] ?? PALETTES.white) : palette;
  const sp = spirometryTable(model, caseData);
  const vols = byId(model, 'volumes'), dl = byId(model, 'dlco');
  const fl = flags === 'none' ? 'none' : 'lln';
  const block = (title, table, id, foot) => `<section class="sheet-block" data-block="${id}"><h2>${esc(title)}</h2>${sheetTable(table, id, { flags: fl })}<p class="sheet-fn">${labelHtml(foot)}</p></section>`;
  const tables = [
    sp ? block('Spirometry', sp, 'spirometry', spirometryFootnote(sp, { flags: fl, rt, showQualityLines, hasVolumes: Boolean(vols || dl) })) : '',
    vols ? block('Lung volumes', vols, 'volumes', volumesFootnote(vols)) : '',
    dl ? block('Diffusing capacity', dl, 'dlco', dlcoFootnote(dl)) : '',
  ].join('');
  const zd = zData(model, interp, caseData);
  const zsvg = zd ? zStrip.render(zd, { palette: pal, style: 'ats', width: 744 }) : '';
  const comments = [...(rt?.interpretationLines ?? []), ...(showQualityLines ? rt?.qualityLines ?? [] : []), ...(rt?.closing ? [rt.closing] : [])];
  const commentsHtml = comments.length ? `<ul>${comments.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p class="sheet-none">No comments recorded.</p>';
  const commentsBox = `<section class="sheet-box sheet-comments"><h2>Technologist comments</h2>${commentsHtml}</section>`;
  // A spirometry-only sheet has room under its one table: the comments sit there and the interpretation box takes the full width.
  const solo = !vols && !dl;
  const foot = model.footer;
  return `<div class="sheet-frame"><article class="sheet sheet-summary" data-page="1" aria-label="Summary sheet, case ${esc(model.meta.caseCode)}">`
    + `<div class="sheet-mark" aria-hidden="true">${esc(model.meta.marker)}</div>`
    + `<div class="sheet-content">${identity(model, caseData, interp)}`
    + `<div class="sheet-main"><div class="sheet-tables">${tables}${solo ? commentsBox : ''}</div><div class="sheet-curves">${curves(caseData, rt, pal)}</div></div>`
    + (zsvg ? `<figure class="sheet-z" data-figure-id="z-strip-ats">${zsvg}</figure>` : '')
    + (model.referenceNote?.length ? `<p class="sheet-refnote">${model.referenceNote.map((l) => esc(l)).join(' ')}</p>` : '')
    + `<div class="sheet-boxes${solo ? ' solo' : ''}">${solo ? '' : commentsBox}`
    + `<section class="sheet-box sheet-interp"><h2>Interpretation</h2><div id="sheet-interpretation" class="sheet-interp-body">${model.interpretation ? `<p class="sheet-interp-ref">${INTERPRETATION_POINTER}</p>` : ''}</div>`
    + `<div class="sheet-sign"><div><span class="sheet-line"></span>${esc(foot.signatureLabel)}</div><div class="short"><span class="sheet-line"></span>${esc(foot.dateLabel)}</div></div></section></div>`
    + `</div><div class="sheet-foot"><span>${esc(model.meta.marker)}. PFT Sim, generator version ${esc(model.meta.generatorVersion)}. Case ${esc(model.meta.caseCode)}. Not a patient record.</span><span>Page 1</span></div>`
    + `</article></div>`;
}

/**
 * Browser helper: set --sheet-s on `root` (and every .sheet-frame inside it reads it) so that the fixed 816 px sheet scales to the
 * width of its container. Call it on load and on resize. It touches the DOM only when called.
 * @param {HTMLElement} root @param {number} [maxScale]
 */
export function fitSheetScale(root, maxScale = 1.25) {
  const avail = root.clientWidth || root.parentElement?.clientWidth || SHEET.width;
  const s = Math.max(0.2, Math.min(maxScale, avail / SHEET.width));
  root.style.setProperty('--sheet-s', String(Math.floor(s * 1000) / 1000));
  return s;
}

/** Smallest zoom of the summary content (about 7.1 pt for the 7.5 pt comments); what does not fit at this size moves to a continuation section. */
export const FIT_FLOOR = 0.95;

/** Sheets whose comments or reference note were moved, so that a second fit starts from the original markup. */
const MOVED = new WeakMap();

function restoreMoved(sheet) {
  const m = MOVED.get(sheet);
  if (!m) return;
  m.pointer?.remove();
  for (const li of m.items) m.list.append(li);
  if (m.refnote) { m.refnote.node.textContent = m.refnote.text; }
  m.section.remove();
  MOVED.delete(sheet);
}

/**
 * Browser helper for the fixed summary sheets (the Lab report view and the report page; never the live sheet of the practice page,
 * which grows). The sheet is laid out at 816 by 1056 px, and a long reference note, a post-bronchodilator column or a long comment
 * list can make its content taller than the space between the sheet's margins, which would put the last comment under the footer.
 * Two steps, in order. (1) The content is zoomed down, never below `floor`, which keeps the type legible; the offsets and the size of
 * its box are given in the zoomed units, so that the box still spans the margins. The step is skipped where CSS zoom is not supported.
 * (2) What still does not fit at the floor is moved, not shrunk: trailing comments first, then the reference note, go to a labelled
 * continuation section placed after the sheet's frame (a flowing page with margins when printed), and the sheet keeps a pointer line.
 * The result is written to data-fit (the zoom), data-moved (the number of items moved) and data-overflow (px left over, 0 when it fits).
 * @param {ParentNode} root @param {number} [floor]
 * @returns {{ scale: number, overflowPx: number, moved: number }[]}
 */
export function fitSheetContent(root, floor = FIT_FLOOR) {
  const out = [];
  const zoomOk = typeof CSS === 'undefined' || !CSS.supports || CSS.supports('zoom', '1');
  for (const sheet of root.querySelectorAll('.sheet-summary')) {
    const c = sheet.querySelector('.sheet-content');
    if (!c || sheet.closest('.sheet-live')) continue;
    restoreMoved(sheet);
    sheet.querySelector('.sheet-boxes')?.style.removeProperty('min-height');
    for (const p of ['zoom', 'transform', 'transform-origin', 'left', 'top', 'width', 'height', 'right', 'bottom']) c.style.removeProperty(p);
    const cs = getComputedStyle(c);
    const left = parseFloat(cs.left), top = parseFloat(cs.top);
    const w = c.clientWidth, h = c.clientHeight;
    let k = 1;
    const over = () => c.scrollHeight - c.clientHeight;
    const apply = (z) => {
      c.style.zoom = String(z);
      c.style.left = `${left / z}px`;
      c.style.top = `${top / z}px`;
      c.style.width = `${w / z}px`;
      c.style.height = `${h / z}px`;
    };
    if (over() > 0 && zoomOk) {
      // The first zoom comes from the overflow measured before the box is released from its insets (released, it would size itself to its content).
      k = Math.max(floor, Math.floor((1000 * h) / (h + over())) / 1000);
      c.style.right = 'auto';
      c.style.bottom = 'auto';
      for (let i = 0; i < 40; i++) {
        apply(k);
        if (over() <= 0 || k <= floor) break;
        k = Math.max(floor, Math.round((k - 0.005) * 1000) / 1000);
      }
    }
    let movedCount = 0;
    if (over() > 0) {
      if (zoomOk && k === 1) { c.style.right = 'auto'; c.style.bottom = 'auto'; apply(k); }
      movedCount = moveExcess(sheet, c, over, zoomOk ? apply : null, k);
    }
    const rest = Math.max(0, Math.round(over() * k));
    sheet.dataset.fit = String(k);
    sheet.dataset.moved = String(movedCount);
    sheet.dataset.overflow = String(rest);
    out.push({ scale: k, overflowPx: rest, moved: movedCount });
  }
  return out;
}

/** Step 2 of fitSheetContent. Returns how many items were moved. */
function moveExcess(sheet, c, over) {
  const list = c.querySelector('.sheet-comments ul');
  const refnote = c.querySelector('.sheet-refnote');
  const doc = sheet.ownerDocument;
  const items = [];
  const section = doc.createElement('section');
  section.className = 'sheet-continuation';
  section.setAttribute('aria-label', 'Continuation of the summary sheet');
  const state = { list, items, section, pointer: null, refnote: null };
  let moved = 0;
  if (list) {
    const pointer = doc.createElement('li');
    pointer.className = 'sheet-cont-ref';
    pointer.textContent = 'Comments continue on the next sheet.';
    list.append(pointer);
    state.pointer = pointer;
    const lis = () => [...list.querySelectorAll('li:not(.sheet-cont-ref)')];
    while (over() > 0 && lis().length > 1) {
      const li = lis().pop();
      items.unshift(li);
      li.remove();
      moved += 1;
    }
    if (!moved) { pointer.remove(); state.pointer = null; }
  }
  if (over() > 0 && refnote) {
    state.refnote = { node: refnote, text: refnote.textContent };
    refnote.textContent = 'The note on the reference values continues on the next sheet.';
    moved += 1;
  }
  // Last, the interpretation box may be shorter than its usual hundred pixels: it is the learner's writing space, not content.
  const boxes = c.querySelector('.sheet-boxes');
  if (over() > 0 && boxes) boxes.style.minHeight = '72px';
  if (!moved) return 0;
  const head = (t) => { const h = doc.createElement('h2'); h.textContent = t; return h; };
  if (items.length) {
    section.append(head('Technologist comments (continued)'));
    const ul = doc.createElement('ul');
    for (const li of items) ul.append(li);
    section.append(ul);
  }
  if (state.refnote) {
    section.append(head('Reference equation note'));
    const p = doc.createElement('p');
    p.textContent = state.refnote.text;
    section.append(p);
  }
  const frame = sheet.closest('.rp-box') ?? sheet.closest('.sheet-frame');
  frame.after(section);
  MOVED.set(sheet, state);
  return moved;
}
