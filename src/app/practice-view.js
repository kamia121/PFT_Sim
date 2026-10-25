/**
 * The case area of the practice page as a pure function of its context, so that the same code runs in the browser and under node
 * (the page-source test in tests/practice-view.test.mjs renders it with no DOM).
 *
 * Order, top to bottom: the equation selector; page 1, the summary sheet with the interpretation box moved into the sheet's
 * `id="sheet-interpretation"` element; the control for page 2; page 2, the details sheet, once opened; after the answers are checked,
 * the reveal. When a sheet module is not in the build, the card view of the earlier practice page stands in for it, with a plain message.
 *
 * Nothing from the key, the technologist's truth or the challenge answers is written into the markup before the answers are checked:
 * the challenge items contribute their title, prompt and option labels only. `visibility` decides what the sheets receive.
 *
 * Interpretation workspace (src/app/workspace.css). On a wide screen the same markup is laid out as a data column beside a sticky
 * answer column; below that width each structured question carries the report values it is read from, and a disclosure hides or
 * shows the tables and curves. The additions carry `data-ws-ui`, generate no box unless a screen rule shows them, and never print.
 * The excerpts are copied from the summary sheet's own cells (text and flag), for a fixed set of rows per question that does not
 * depend on the case's values, its key or the stage; they carry no footnote, no comment and no control.
 */
import { esc } from './format.js';
import { PRACTICE_QUESTIONS, hasData, questionLabel } from './answers.js';
import * as R from './render.js';
import { challengeField, challengeRowField, isMultiItem, isStatementItem } from './collect.js';
import { interpretationFor } from '../report/statement.js';
import { statementHtml } from '../report/html.js';

export const SUMMARY_MISSING = 'Summary sheet not available in this build.';
export const DETAILS_MISSING = 'Details sheet not available in this build.';
export const INTERPRETATION_ID = 'sheet-interpretation';

const EQUATION_OPTIONS = [['GLIglobal', 'GLI Global 2022 (group-neutral)'], ['GLI2012', 'GLI-2012 (selected by the group on the requisition)']];

/** The reference equation selector, above the sheets. */
export function equationSelectorHtml(equation) {
  const opts = EQUATION_OPTIONS.map(([v, l]) => `<label><input type="radio" name="eq" value="${v}" ${equation === v ? 'checked' : ''}> ${l}</label>`).join(' ');
  return `<fieldset class="inline eq-select"><legend class="muted">Reference equation for spirometry</legend>${opts}</fieldset>`;
}

/**
 * Put the interpretation box into the sheet's empty `id="sheet-interpretation"` element. A sheet without that element gets the box after it.
 * @param {string} sheetHtml @param {string} boxHtml
 */
export function injectInterpretation(sheetHtml, boxHtml) {
  const re = new RegExp(`(<([a-zA-Z][\\w-]*)\\b[^>]*\\bid="${INTERPRETATION_ID}"[^>]*>)(\\s*)(</\\2>)`);
  return re.test(sheetHtml) ? sheetHtml.replace(re, (_, open, _tag, _ws, close) => `${open}${boxHtml}${close}`) : `${sheetHtml}${boxHtml}`;
}

function optionHtml({ name, type, value, label, checked, disabled }) {
  return `<label><input type="${type}" name="${esc(name)}" value="${esc(value)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}> ${esc(label)}</label>`;
}

function structuredFieldsets(c, structured, locked, excerpts = {}) {
  return PRACTICE_QUESTIONS.map((q) => {
    const na = !hasData(c, q.id);
    const opts = q.options.map(([v, l]) => optionHtml({ name: q.id, type: 'radio', value: v, label: l, checked: structured[q.id] === v, disabled: locked })).join('');
    return `<fieldset><legend>${esc(questionLabel(c, q))}</legend>${na ? '' : excerpts[q.id] ?? ''}${na ? '<p class="muted">Not performed in this case.</p>' : ''}${opts}</fieldset>`;
  }).join('');
}

/**
 * Rows and columns of the summary sheet shown beside each structured question on a narrow screen. Fixed per question: the same
 * cells for every case that has the test, whatever its values, key or stage.
 */
export const EXCERPTS = {
  pattern: [['spirometry', ['fvc', 'fev1', 'fev1_fvc'], ['pre', 'lln', 'z']], ['volumes', ['tlc'], ['result', 'lln', 'z']]],
  severity: [['spirometry', ['fev1'], ['pre', 'z', 'pct']], ['volumes', ['tlc'], ['result', 'z']]],
  // The 2022 rule reads the change as a percentage of the predicted value, which is the difference of the two %Pred cells; the sheet's
  // own change column is a percentage of the baseline and is labelled so.
  bronchodilator: [['spirometry', ['fev1', 'fvc'], ['pre', 'pct', 'post', 'postPct', 'change', 'changePct'], { pct: 'Pre %Pred', postPct: 'Post %Pred', changePct: 'Change, % of baseline' }]],
  dlco: [['dlco', ['hb', 'dlco', 'kco', 'va'], ['result', 'lln', 'z']]],
};
const EXCERPT_TITLES = { spirometry: 'Spirometry', volumes: 'Lung volumes', dlco: 'Diffusing capacity' };
const EXCERPT_HEADS = { pre: 'Pre', post: 'Post', lln: 'LLN', z: 'z', pct: '%Pred', postPct: 'Post %Pred', change: 'Change', changePct: '%Chng', result: 'Result' };

/**
 * The cells of a summary sheet, read back from its markup: `{ [table]: { [row]: { label, cells: { [column]: { text, flag } } } } }`.
 * Text and labels are the sheet's own escaped markup, so an excerpt cannot differ from the sheet.
 * @param {string} sheetHtml output of summarySheetHtml
 */
export function sheetCells(sheetHtml) {
  const out = {};
  const row = (t, r) => ((out[t] ??= {})[r] ??= { label: '', cells: {} });
  for (const m of sheetHtml.matchAll(/<th scope="row" class="l" data-t="([\w-]+)" data-r="([\w:-]+)" data-c="index">([\s\S]*?)<\/th>/g)) row(m[1], m[2]).label = m[3];
  for (const m of sheetHtml.matchAll(/<td class="[^"]*" data-t="([\w-]+)" data-r="([\w:-]+)" data-c="(\w+)"(?: data-flag="(\w+)" title="([^"]*)")?>([^<]*)<\/td>/g)) {
    row(m[1], m[2]).cells[m[3]] = { text: m[6], flag: m[4] ?? null, title: m[5] ?? '' };
  }
  return out;
}

/** The excerpt of one structured question, or '' when the sheet holds none of its rows. */
export function excerptHtml(questionId, cells) {
  const blocks = (EXCERPTS[questionId] ?? []).map(([t, rows, cols, heads = {}]) => {
    const present = rows.filter((r) => cells[t]?.[r]);
    const keep = cols.filter((k) => present.some((r) => cells[t][r].cells[k]?.text));
    if (!present.length || !keep.length) return '';
    // Without a bronchodilator study the sheet's one value column is the best value, not a pre-bronchodilator one.
    const label = (k) => heads[k] ?? (k === 'pre' && !Object.values(cells[t]).some((x) => x.cells.post?.text) ? 'Best' : EXCERPT_HEADS[k]);
    const head = `<tr><th scope="col"><span class="visually-hidden">Index</span></th>${keep.map((k) => `<th scope="col">${label(k)}</th>`).join('')}</tr>`;
    const body = present.map((r) => `<tr><th scope="row">${cells[t][r].label}</th>${keep.map((k) => {
      const cell = cells[t][r].cells[k];
      return `<td data-ws-cell="${esc(`${t}/${r}/${k}`)}"${cell?.flag ? ` class="flag" title="${cell.title}"` : ''}>${cell?.text ?? ''}</td>`;
    }).join('')}</tr>`).join('');
    return `<table class="ws-ctx-table"><caption>${EXCERPT_TITLES[t]}</caption><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }).join('');
  return blocks ? `<div class="ws-ctx scroll" data-ws-ui>${blocks}</div>` : '';
}

/** Excerpts of every structured question from the summary sheet markup; empty without the sheet. */
export function excerptsFor(sheetHtml) {
  if (!sheetHtml) return {};
  const cells = sheetCells(sheetHtml);
  return Object.fromEntries(PRACTICE_QUESTIONS.map((q) => [q.id, excerptHtml(q.id, cells)]));
}

/**
 * Screen controls of the workspace. Wide screens: two view buttons choose the report page shown in the data column beside the
 * answers (page 1, the summary; page 2, the detailed report, which the first choice opens as the page-2 control does). Narrow
 * screens: a disclosure hides or shows the report's tables and curves. Neither redraws the form, and neither changes what prints.
 * @param {'summary'|'details'} [view] @param {'open'|'collapsed'} [chart]
 */
export function workspaceBarHtml(view = 'summary', chart = 'open') {
  const tab = (v, label) => `<button type="button" class="ws-view" data-ws-view="${v}" aria-pressed="${view === v}" aria-controls="${v === 'details' ? 'details-slot' : 'summary-slot'}">${label}</button>`;
  return `<div class="ws-bar no-print" data-ws-ui><div class="ws-views" role="group" aria-label="Report page beside the answers">${tab('summary', 'Page 1: summary')}${tab('details', 'Page 2: detailed maneuvers')}</div>`
    + `<button type="button" class="secondary" id="ws-chart-toggle" aria-expanded="${chart !== 'collapsed'}" aria-controls="summary-slot">Report tables and curves</button></div>`;
}

/** One row of a row item: its own labelled radio group, with the item's options or the row's own list. */
function rowFieldsetHtml(item, row, held, locked) {
  const name = challengeRowField(item.id, row.id);
  const options = item.rowOptions?.[row.id] ?? item.options ?? [];
  const opts = options.map(([v, l]) => optionHtml({ name, type: 'radio', value: v, label: l, checked: held?.[row.id] === v, disabled: locked })).join('');
  return `<fieldset class="row-q${options.length > 2 ? ' many' : ''}" data-row="${esc(row.id)}"><legend>${esc(row.label)}</legend><div class="opts">${opts}</div></fieldset>`;
}

/** Fieldset of one challenge item. Title, prompt and option labels only: the key and the explanation are never written here. */
export function itemFieldsetHtml(item, responses, locked) {
  if (Array.isArray(item.rows)) {
    const stored = responses.challenge[item.id];
    const held = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    const pid = `p-${item.id}`;
    return `<fieldset data-item="${esc(item.id)}" class="row-item"${item.prompt ? ` aria-describedby="${esc(pid)}"` : ''}><legend>${esc(item.title)}</legend>${item.prompt ? `<p class="prompt" id="${esc(pid)}">${esc(item.prompt)}</p>` : ''}<div class="rows">${item.rows.map((r) => rowFieldsetHtml(item, r, held, locked)).join('')}</div></fieldset>`;
  }
  const multi = isMultiItem(item);
  const name = challengeField(item.id);
  const stored = responses.challenge[item.id];
  const chosen = new Set(Array.isArray(stored) ? stored : stored ? [stored] : []);
  const opts = (item.options ?? []).map(([v, l]) => optionHtml({ name, type: multi ? 'checkbox' : 'radio', value: v, label: l, checked: chosen.has(v), disabled: locked })).join('');
  const pid = `p-${item.id}`;
  return `<fieldset data-item="${esc(item.id)}"${item.prompt ? ` aria-describedby="${esc(pid)}"` : ''}><legend>${esc(item.title)}</legend>${item.prompt ? `<p class="prompt" id="${esc(pid)}">${esc(item.prompt)}</p>` : ''}${multi ? '<p class="muted">Select every one that applies.</p>' : ''}<div class="opts${multi ? ' opts-multi' : ''}">${opts}</div></fieldset>`;
}

const paragraphs = (text) => String(text).split(/\n{2,}/).map((p) => `<p>${esc(p.trim())}</p>`).join('');

/** After the checked answers: the learner's impression beside the composed statement, with the prompt to compare. */
function comparisonHtml(ctx) {
  const { caseData, interp, cmp, responses } = ctx;
  const stmt = interpretationFor(caseData, interp, cmp);
  const mine = responses.impression.trim();
  const support = stmt.supporting ? `<details class="supporting"><summary>Supporting explanation</summary>${paragraphs(stmt.supporting)}</details>` : '';
  const notes = stmt.notes?.length ? `<details><summary>Notes on this simulation</summary><ul class="notes">${stmt.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>` : '';
  return `<div class="impression-compare" aria-labelledby="h-compare"><h3 id="h-compare">Compare the interpretation</h3>
    <p class="muted">Read the composed statement against your own wording: the pattern, its severity, the bronchodilator result, the diffusing capacity, and the limits that the quality of the tests places on them.</p>
    <div class="compare-grid"><div><h4>Your impression</h4>${mine ? paragraphs(mine) : '<p class="muted">No impression was written.</p>'}</div><div><h4>Composed summary</h4>${statementHtml(stmt.parts, stmt.text)}${support}${notes}</div></div>
    <p class="signature"><span>Interpreting physician (simulation; unsigned)</span></p></div>`;
}

/**
 * Which review level the quality items are at, and, for the advanced level with the challenge off, that the answers are printed on page 2.
 * Static text: it depends on the two settings and never on the case, so it cannot carry the key.
 */
function reviewNoteHtml(review, qualityChallenge) {
  const off = qualityChallenge ? '' : ' This case is running without the quality challenge: the grades and the technologist’s statement are already shown.';
  if (review === 'basic') return `<p class="muted" id="review-note">Study-level review: one judgement about the whole study. Maneuver-level questions are in the advanced review (Quality review in the toolbar).${off}</p>`;
  if (review === 'advanced') {
    return `<p class="muted" id="review-note">Advanced review: maneuver-level questions.${qualityChallenge ? '' : ' The quality challenge is off, so the grades and the acceptability of each maneuver are already printed on page 2 and the statement is on page 1; these questions then check how the report is read, not an independent judgement. Turn the quality challenge on to withhold them.'}</p>`;
  }
  return '';
}

/**
 * The interpretation box: structured questions, challenge items, the optional impression, and the actions.
 * @param {object} ctx see renderPractice
 */
export function interpretationBoxHtml(ctx) {
  const { caseData, responses, items = [], stage, qualityChallenge, vis, canCheck, review, excerpts = {} } = ctx;
  const locked = stage === 3;
  const qualityLocked = qualityChallenge && stage >= 2;
  const first = items.filter((i) => !isStatementItem(i));
  const statementItems = vis.showQualityLines ? items.filter(isStatementItem) : [];
  const parts = [`<section class="interp-box" aria-labelledby="h-answers"><h2 id="h-answers">Interpretation</h2>
  <p class="muted">Answers are scored against the key for the selected spirometry equation; a classification that the other equation gives is accepted for values near a limit. Nothing is saved or sent.</p>
  <form id="answer-form" autocomplete="off"><div class="answers">${structuredFieldsets(caseData, responses.structured, locked, excerpts)}</div>`];

  if (items.length) {
    parts.push(`<h3 id="h-quality-items">Test quality${statementItems.length ? ' and the technologist’s statement' : ''}</h3>`);
    parts.push(reviewNoteHtml(review, qualityChallenge));
    if (qualityChallenge && stage === 1) {
      parts.push(review === 'basic'
        ? '<p class="muted">The technologist’s statement and the grades are withheld. Page 2 lists the maneuvers and tests behind the study. Showing the statement before the check locks the study-level answer.</p>'
        : '<p class="muted">The technologist’s statement is withheld. Judge the tests from the maneuvers on page 2, then ask for the statement; the answers in this section are then fixed.</p>');
    }
    if (first.length) parts.push(`<div class="answers">${first.map((i) => itemFieldsetHtml(i, responses, locked || qualityLocked)).join('')}</div>`);
    if (qualityChallenge && stage === 1) {
      parts.push(`<div class="stage-block"><button type="button" class="secondary" id="show-statement">${review === 'basic' ? 'Show the technologist’s statement and lock the study answer' : 'Show the technologist’s statement'}</button></div>`);
    }
    if (qualityChallenge && stage === 2) {
      parts.push(`<p class="note" id="statement-note" role="status" tabindex="-1">${review === 'basic'
        ? 'The technologist’s statement is in the comment box on page 1. The study-level answer is locked; the other answers remain open.'
        : 'The technologist’s statement now appears in the comment box on page 1. The test quality answers above are fixed.'}</p>`);
    }
    if (statementItems.length) parts.push(`<div class="answers">${statementItems.map((i) => itemFieldsetHtml(i, responses, locked)).join('')}</div>`);
  }

  if (locked) parts.push(comparisonHtml(ctx));
  else parts.push(`<div class="impression"><label for="impression"><strong>Your impression</strong> <span class="muted">(optional; not scored)</span></label><textarea id="impression" name="impression" rows="4">${esc(responses.impression)}</textarea></div>`);

  parts.push('</form>');
  const hint = !locked && !canCheck ? `<span class="muted" id="check-hint">Show the technologist’s statement${items.some(isStatementItem) ? ' and answer the last question' : ''} before checking.</span>` : '';
  parts.push(`<div class="toolbar"><button type="button" class="primary" id="check-answers" ${locked || !canCheck ? 'disabled' : ''}${hint ? ' aria-describedby="check-hint"' : ''}>Check answers</button><button type="button" class="secondary" id="show-key" ${locked ? 'disabled' : ''}>Show the key without scoring</button>${hint}</div></section>`);
  return parts.join('');
}

/** Comment box of the card view: the lines that bear on interpretation, then the quality lines when the rule releases them. */
function commentsBoxHtml(ctx) {
  const { rt, vis, caseData } = ctx;
  const lines = rt ? [...rt.interpretationLines, ...(vis.showQualityLines ? rt.qualityLines : []), rt.closing] : (caseData.scenario?.statements ?? []).map((t) => t.text);
  if (!lines.length) return '';
  return `<section class="card" aria-labelledby="h-comments"><h2 id="h-comments">Technologist comments</h2><ul class="notes">${lines.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>`;
}

/** Page 1 when the summary sheet module is missing: the earlier cards without the maneuvers and curves, then the comment box. */
function summaryFallbackHtml(ctx) {
  const { caseData: c, interp: a, flags } = ctx;
  const spiro = `<section class="card" aria-labelledby="h-spiro"><h2 id="h-spiro">Spirometry</h2>${R.renderReport(a, ['fev1', 'fvc', 'fev1_fvc'], 'Reported spirometry', 'spiro-table', { flags })}</section>`;
  return `<section class="card sheet-missing" role="note"><p>${SUMMARY_MISSING}</p></section>${R.renderPatient(c)}${spiro}${R.renderBronchodilator(c, a, { maneuvers: false })}${R.renderVolumes(c, a, { flags })}${R.renderDlco(c, a, { flags })}${commentsBoxHtml(ctx)}<div id="${INTERPRETATION_ID}"></div>`;
}

/** Page 2 when the details sheet module is missing: the maneuver tables and the figure cards of the earlier page. */
function detailsFallbackHtml(ctx) {
  const { caseData: c, interp: a, vis } = ctx;
  const revealed = vis.showGradeColumns;
  const pre = R.renderManeuvers(c.spirometry.pre, 'Pre-bronchodilator forced maneuvers', { revealed, id: 'pre-maneuvers' });
  const post = c.spirometry.post ? R.renderManeuvers(c.spirometry.post, 'Post-bronchodilator forced maneuvers', { revealed, id: 'post-maneuvers' }) : '';
  const figs = R.renderFigures(c, a, { revealed, showSchematic: ctx.showSchematic, figView: ctx.figView, resolve: ctx.resolve });
  return `<section class="card sheet-missing" role="note"><p>${DETAILS_MISSING}</p></section><section class="card"><h2>Maneuvers</h2>${pre}${post}</section><div id="figs">${figs}</div>`;
}

/** Page 2 itself: the details sheet with its screen controls, or the card view when the module is missing. */
export function detailsBodyHtml(ctx) {
  return ctx.sheets.detailsSheetHtml && ctx.model
    ? ctx.sheets.detailsSheetHtml(ctx.model, { rt: ctx.rt, caseData: ctx.caseData, interp: ctx.interp, equation: ctx.equation, palette: ctx.palette, showGrades: ctx.vis.showGradeColumns, views: ctx.figView, controls: true, resolve: ctx.resolve })
    : detailsFallbackHtml(ctx);
}

/** The control for page 2 and, once opened, the sheet. */
export function detailsAreaHtml(ctx) {
  const { detailsOpen } = ctx;
  const body = detailsOpen ? detailsBodyHtml(ctx) : '';
  return `<div class="details-bar"><button type="button" class="secondary" id="toggle-details" aria-expanded="${detailsOpen ? 'true' : 'false'}" aria-controls="details-slot">Page 2: detailed report</button><span class="muted">Every maneuver, trial and test with its technologist comments.</span></div><div id="details-slot" class="sheet-wrap" ${detailsOpen ? '' : 'hidden'}>${body}</div>`;
}

/**
 * @typedef {object} PracticeContext
 * @property {object} caseData result of buildCase
 * @property {object} interp interpretation under the displayed equation
 * @property {object} cmp result of compareEquations (GLI-2012 against GLI Global)
 * @property {'GLIglobal'|'GLI2012'} equation
 * @property {'lln'|'none'} flags
 * @property {boolean} qualityChallenge
 * @property {'basic'|'advanced'} [review] quality review level; absent in callers that predate it, which then show no level note
 * @property {1|2|3} stage
 * @property {boolean} scored
 * @property {boolean} detailsOpen
 * @property {{ showQualityLines: boolean, showGradeColumns: boolean, showStatementInSummary: boolean }} vis
 * @property {boolean} canCheck
 * @property {object|null} rt RtReport, or null when the module is not in the build
 * @property {object[]} items challenge items
 * @property {import('./collect.js').Responses} responses
 * @property {object|null} model report model built with includeGrades = vis.showGradeColumns (needed by the sheets only)
 * @property {{ summarySheetHtml: Function|null, detailsSheetHtml: Function|null }} sheets
 * @property {object} palette palette object handed to the sheets
 * @property {object} figView figure view state of the page-2 panels
 * @property {boolean} showSchematic
 * @property {Function|null} resolve
 * @property {object|null} feedback result of buildFeedback; read at stage 3 only
 * @property {'summary'|'details'} [wsView] report page beside the answers on a wide screen (screen only)
 * @property {'open'|'collapsed'} [wsChart] narrow-screen disclosure of the report's tables and curves (screen only)
 */

/**
 * The whole case area.
 * @param {PracticeContext} ctx
 * @returns {string}
 */
export function renderPractice(ctx) {
  const sheet = ctx.sheets.summarySheetHtml && ctx.model
    ? ctx.sheets.summarySheetHtml(ctx.model, { rt: ctx.rt, caseData: ctx.caseData, interp: ctx.interp, equation: ctx.equation, palette: ctx.palette, flags: ctx.flags, showQualityLines: ctx.vis.showQualityLines, narrowZ: true })
    : null;
  const box = interpretationBoxHtml({ ...ctx, excerpts: excerptsFor(sheet) });
  const summary = sheet ?? summaryFallbackHtml(ctx);
  const reveal = ctx.stage === 3 ? R.renderReveal(ctx.caseData, ctx.interp, ctx.cmp, [], ctx.scored, ctx.feedback) : '';
  return `${equationSelectorHtml(ctx.equation)}${sheet ? workspaceBarHtml(ctx.wsView, ctx.wsChart) : ''}<div id="summary-slot" class="sheet-wrap sheet-live">${injectInterpretation(summary, box)}</div>${detailsAreaHtml(ctx)}${reveal}`;
}
