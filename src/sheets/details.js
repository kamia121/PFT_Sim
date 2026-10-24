/**
 * Details sheet (page 2 of the report): everything the summary leaves out. Every forced maneuver before and after the
 * bronchodilator with its values and fault comments, the spirometry panel (best, overlay or one panel per maneuver), the
 * plethysmography record with every panting trial, the single-breath DLCO test with its validity values and plot, the z-score
 * strip, and the technologist's technical notes. The sheet flows (no fixed height) and is a pure function of the report model,
 * the case and the options, so it runs under Node; nothing here touches the DOM.
 *
 * Quality is shown only when `showGrades` is true: the acceptability of each maneuver for FEV1 and for FVC and the criteria not
 * met, the grade of each set, the status of each trial and the verdict on the DLCO test. When it is false the markup holds no
 * such text at all, not even a note that it is withheld, because a sentence about withheld grades says that there are grades.
 * Fault comments describe what was observed and are always shown. Numbers are the model's: the maneuver and trial tables are
 * built from the model's rows, so the sheet and the summary cannot disagree.
 *
 * Grades come from the engine's own evaluation of the recorded maneuvers (`rt.truth` when the technologist's report is supplied,
 * else the case summary). The technologist's statement (which may overstate or understate) belongs to the summary, not here.
 */
import { esc, labelHtml, round } from '../report/table.js';
import { tableHtml } from '../report/html.js';
import { figureCaseData, trialObservation, qualityNotesFor } from '../report/model.js';
import { FIGURES } from '../ui/figures/index.js';
import { PALETTES } from '../ui/palettes.js';
import { separableCount, viewControls } from '../ui/fig-view.js';

/** Panel width: 7 in at 96 px per inch, as on the printed pages. */
export const PANEL_WIDTH = 672;

const YES = 'yes', NO = 'no';

/** @param {object} model @param {string} id */
const tableOf = (model, id) => model.sections.flatMap((s) => s.tables).find((t) => t.id === id) ?? null;
const fieldOf = (model, label) => model.header.fields.find((f) => f.label === label)?.value ?? '';

const VIEWS = ['best', 'all', 'separate'];

/** Spirometry views: 'auto' separates the maneuvers when eight or fewer are drawn and overlays them otherwise. */
export function spirometryView(view, caseData) {
  if (view === 'best' || view === 'all' || view === 'separate') return view;
  const n = caseData.spirometry.pre.maneuvers.length + (caseData.spirometry.post?.maneuvers.length ?? 0);
  return n <= 8 ? 'separate' : 'all';
}

function figureHtml(id, cd, { palette, view, selected, showQuality, errors, className = '' }) {
  const f = FIGURES[id];
  if (!f) return '';
  try {
    const data = f.dataFor(cd);
    if (data === null || data === undefined) return '';
    const svg = f.render(data, { palette, width: PANEL_WIDTH, showQuality, ...(view ? { view } : {}), ...(selected ? { selected } : {}) });
    if (typeof svg !== 'string' || !svg.trim()) return '';
    return `<figure class="dt-fig ${className}" data-figure-id="${esc(id)}">${svg.replace(/^\s*<\?xml[^>]*>\s*/, '')}</figure>`;
  } catch (e) {
    errors.push({ id, message: String(e?.message ?? e) });
    return '';
  }
}

const gradeLine = (g, label) => `${label}: FEV1 - ${g.fev1}, FVC - ${g.fvc}`;
const joinReasons = (ev) => [...new Set([...ev.fev1.reasons, ...ev.fvc.reasons])].join('; ');

/**
 * Maneuver table for one set: the model's rows plus the ratio and FEF25-75 of each maneuver and, with grades, acceptability.
 * @returns {object} a report table (src/report/table.js)
 */
function maneuverTable(model, caseData, which, { showGrades, grades }) {
  const src = tableOf(model, which === 'pre' ? 'maneuvers-pre' : 'maneuvers-post');
  const set = caseData.spirometry[which];
  if (!src || !set) return null;
  const columns = [
    { key: 'index', label: 'No.', align: 'left' },
    { key: 'fvc', label: 'FVC', unit: 'L', dp: 2 },
    { key: 'fev1', label: 'FEV1', unit: 'L', dp: 2 },
    { key: 'ratio', label: 'FEV1/FVC', dp: 3 },
    { key: 'pef', label: 'PEF', unit: 'L/s', dp: 1 },
    { key: 'fef2575', label: 'FEF25-75', unit: 'L/s', dp: 2 },
    { key: 'fet', label: 'FET', unit: 's', dp: 1 },
    { key: 'bev', label: 'BEV', unit: 'L', dp: 3 },
    ...(showGrades ? [{ key: 'fev1ok', label: 'FEV1 accept.', align: 'left' }, { key: 'fvcok', label: 'FVC accept.', align: 'left' }, { key: 'notmet', label: 'Criteria not met', align: 'left' }] : []),
    { key: 'comment', label: 'Comment', align: 'left' },
  ];
  const rows = src.rows.map((r, i) => {
    const m = set.maneuvers[i], ev = set.summary.evaluations[i];
    return {
      id: `${which}-${r.id}`, index: r.index, fvc: r.fvc, fev1: r.fev1, ratio: round(m.fev1 / m.fvc, 3), pef: r.pef, fef2575: round(m.fef2575, 2), fet: r.fet, bev: r.bev,
      ...(showGrades ? { fev1ok: ev.fev1.acceptable ? YES : NO, fvcok: ev.fvc.acceptable ? YES : NO, notmet: joinReasons(ev) } : {}),
      comment: r.comment,
    };
  });
  const g = grades[which];
  const foot = ['BEV: back-extrapolated volume.', ...(showGrades && g ? [`${gradeLine(g, 'Test quality')}.`, 'Accept.: the maneuver meets the ATS/ERS 2019 criteria for the variable.'] : [])];
  return { id: `d-maneuvers-${which}`, caption: which === 'pre' ? 'Forced maneuvers before bronchodilator' : 'Forced maneuvers after bronchodilator', columns, rows, footnote: foot.join(' ') };
}

/** Plethysmography trials: the model's FRC, frequency and difference from the mean, with the observation of each trial. */
function plethTable(model, caseData, { showGrades, truth }) {
  const src = tableOf(model, 'pleth');
  const trials = caseData.pleth?.trials;
  if (!src || !trials?.length) return null;
  const columns = [
    { key: 'index', label: 'Trial', align: 'left' },
    { key: 'frc', label: 'FRCpleth', unit: 'L', dp: 2 },
    { key: 'hz', label: 'Pant frequency', unit: 'Hz', dp: 2 },
    ...(caseData.pleth?.session ? [{ key: 'ic', label: 'Linked IC', unit: 'L', dp: 3 }, { key: 'svc', label: 'Linked SVC', unit: 'L', dp: 3 }, ...(showGrades ? [{ key: 'retained', label: 'FRC retained', align: 'left' }, { key: 'linkedStatus', label: 'Linked quality', align: 'left' }, { key: 'linkedReason', label: 'Link qualification', align: 'left', detail: true }] : [])] : []),
    { key: 'dev', label: 'Difference from mean', unit: '%', dp: 1, signed: true, detail: Boolean(caseData.pleth?.session) },
    ...(showGrades ? [{ key: 'status', label: 'Status', align: 'left' }, ...(trials.some((t) => t.reasons?.length) ? [{ key: 'notmet', label: 'Reason', align: 'left', detail: Boolean(caseData.pleth?.session) }] : [])] : []),
    { key: 'comment', label: 'Comment', align: 'left', detail: Boolean(caseData.pleth?.session) },
  ];
  const rows = src.rows.map((r, i) => ({
    id: r.id, index: r.index, frc: r.frc, hz: r.hz, dev: r.dev, ic: r.ic, svc: r.svc, retained: r.retained, linkedStatus: r.linkedStatus, linkedReason: r.linkedReason,
    ...(showGrades ? { status: trials[i]?.status ?? '', notmet: (trials[i]?.reasons ?? []).join('; ') } : {}),
    comment: trialObservation(trials[i]),
  }));
  // The model's footnote ends with the grade when it was built with grades; the grade is added back only when it is to be shown.
  const base = src.footnote.replace(/;\s*(?:FRC-only simulator rubric|Overall lung-volume grade|grade) [A-FU]\b/, '').replace(/\.\s*$/, '');
  const verdict = showGrades ? [`; ${caseData.pleth.session ? 'Overall lung-volume grade' : 'FRC-only simulator rubric'} ${caseData.pleth.grade ?? 'unassigned'}`, truth.pleth ? (truth.pleth.acceptable ? ', acceptable' : ', not acceptable') : ''].join('') : '';
  return { id: 'd-pleth', caption: 'Plethysmography: panting trials', columns, rows, footnote: `${base}${verdict}.` };
}

/** Grades and verdicts the engine computed, from the technologist's report when it is supplied. */
function truthOf(caseData, rt) {
  const sets = (which) => caseData.spirometry[which]?.summary.grades ?? null;
  return {
    pre: rt?.truth?.pre ?? sets('pre'),
    post: rt?.truth?.post ?? sets('post'),
    dlco: rt?.truth?.dlco ?? null,
    pleth: rt?.truth?.pleth ?? null,
  };
}

/**
 * Build the sheet.
 * @param {object} model report model (buildReportModel); may or may not hold grades
 * @param {{ rt?: object|null, caseData: object, interp: object, equation?: string, palette?: object|string, showGrades?: boolean,
 *   view?: 'auto'|'best'|'all'|'separate', selected?: number[], views?: Record<string, { view?: string, selected?: number[] }>|null,
 *   controls?: boolean, resolve?: Function|null }} opts
 *   `rt` is the technologist's report (src/core/rt-report.js). `view` and `selected` are the default for the printed report.
 *   `views` is the state of each panel that can separate its maneuvers or trials, keyed by figure id ('panel-spirometry',
 *   'panel-pleth'), and overrides `view` and `selected` for that panel; an object given as `view` is read as `views`. `controls`
 *   adds the screen-only switch and numbered chips of each such panel. `resolve` is the reference resolver (src/reference/gli.js):
 *   the z-score graphic needs it for the post-bronchodilator z-scores.
 * @returns {{ html: string, errors: { id: string, message: string }[] }}
 */
export function detailsSheet(model, { rt = null, caseData, interp, equation, palette = PALETTES.white, showGrades = false, view = 'auto', selected, views = null, controls = false, resolve = null } = {}) {
  const errors = [];
  if (view && typeof view === 'object') { views = views ?? view; view = 'auto'; }
  const pal = palette && typeof palette === 'object' ? palette : PALETTES[palette] ?? PALETTES.white;
  const eq = equation ?? model.meta.equation;
  const cd = figureCaseData(caseData, interp, eq, resolve);
  const truth = truthOf(caseData, rt);
  const grades = { pre: showGrades ? truth.pre : null, post: showGrades ? truth.post : null };
  const draw = (id, opts) => figureHtml(id, cd, { palette: pal, showQuality: showGrades, errors, ...opts });
  const tbl = (t) => (t ? tableHtml(t, {}, null) : '');
  const section = (id, title, body) => (body.trim() ? `<section class="rpt-sec dt-sec" data-section="${id}"><h2>${esc(title)}</h2>${body}</section>` : '');

  const lab = model.identity?.laboratory?.name ?? 'PFT Sim Pulmonary Function Laboratory';
  const head = `<header class="dt-head"><div class="dt-lab"><strong>${esc(lab)}</strong><span>Pulmonary Function Report: detailed report</span></div>`
    + `<dl class="dt-id"><div><dt>Name</dt><dd>${esc(fieldOf(model, 'Name'))}</dd></div><div><dt>ID</dt><dd>${esc(fieldOf(model, 'ID'))}</dd></div><div><dt>Case</dt><dd>${esc(model.meta.caseCode)}</dd></div><div><dt>Test date</dt><dd>${esc(fieldOf(model, 'Test date (simulated)'))}</dd></div></dl></header>`;

  // A panel's own state, when the page holds one, takes the place of the sheet-wide default.
  const panelView = (id, n, fallback, defaultSelected) => {
    const v = views?.[id] ?? {};
    const chosen = VIEWS.includes(v.view) ? v.view : fallback;
    const sel = Array.isArray(v.selected) ? v.selected.filter((k) => Number.isInteger(k) && k >= 1 && k <= n) : (defaultSelected ?? Array.from({ length: n }, (_, i) => i + 1));
    return { view: chosen, selected: sel };
  };
  const nSpiro = separableCount('panel-spirometry', caseData), nPleth = separableCount('panel-pleth', caseData);
  const sp = panelView('panel-spirometry', nSpiro, spirometryView(view, caseData), Array.isArray(selected) ? selected : undefined);
  const spControls = controls && nSpiro > 1 ? viewControls('panel-spirometry', nSpiro, sp) : '';
  const spiro = section('d-spirometry', 'Forced maneuvers',
    `${tbl(maneuverTable(model, caseData, 'pre', { showGrades, grades }))}${tbl(maneuverTable(model, caseData, 'post', { showGrades, grades }))}${spControls}${draw('panel-spirometry', { view: sp.view, selected: sp.selected })}`);

  const pl = panelView('panel-pleth', nPleth, view === 'best' ? 'best' : view === 'separate' ? 'separate' : 'all');
  const plControls = controls && nPleth > 1 ? viewControls('panel-pleth', nPleth, pl) : '';
  const pleth = caseData.pleth ? section('d-pleth', 'Plethysmography',
    `${plControls}${draw('panel-pleth', { view: pl.view, selected: pl.selected })}${tbl(plethTable(model, caseData, { showGrades, truth }))}`) : '';

  const dlco = caseData.dlco && caseData.dlcoTrace ? section('d-dlco', 'Diffusing capacity',
    draw('panel-dlco', { view: 'best' })) : '';

  const z = section('d-zscores', 'Z-scores', draw('z-strip', {}));

  const notes = [...(model.technicalNotes ?? []), ...(showGrades ? (model.qualityNotes?.length ? model.qualityNotes : qualityNotesFor(caseData)) : [])];
  const notesSec = notes.length ? `<section class="rpt-sec dt-sec dt-notes" data-section="d-notes"><h2>Technical notes</h2><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>` : '';

  const html = `<section class="dt-sheet" data-sheet="details">${head}${spiro}${pleth}${dlco}${z}${notesSec}</section>`;
  return { html, errors };
}

/**
 * The details sheet as an HTML string.
 * @param {object} model report model
 * @param {Parameters<typeof detailsSheet>[1]} opts
 * @returns {string}
 */
export const detailsSheetHtml = (model, opts) => detailsSheet(model, opts).html;
