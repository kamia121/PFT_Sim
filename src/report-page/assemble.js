/**
 * Report page assembly: a case, a spirometry equation, a copy (student or instructor) and the two settings that are not part of
 * the case (flags, quality challenge) become the HTML of the printed report. Pure apart from the figure registry, so it runs under
 * Node for tests.
 *
 * Order of the report: the summary sheet (src/sheets/summary.js, one fixed Letter sheet), the details sheet
 * (src/sheets/details.js, flowing), then a blank interpretation block with signature and date lines. The summary module, the
 * technologist's report and the visibility rule are optional modules passed in `sheets` (see modules.js): without the summary
 * module the earlier page 1 stands in, without the technologist's report a report derived from the engine's grades is used,
 * and without the visibility rule a local copy of it applies.
 *
 * The student copy is built from a model without grades and without the key, and nothing from the interpretation engine other
 * than z-scores reaches its markup. What it shows of the technologist's quality statement and of the grades follows the
 * visibility rule at stage 1: with the quality challenge on, neither the quality lines nor the grade columns are in the markup,
 * and no sentence says that they exist. The instructor copy adds an appendix built from a second model. The boundary is one of
 * presentation: the key is computable in the browser from the descriptor in the address.
 */
import { interpret, compareEquations, LLN_Z } from '../interpret/interpret.js';
import { buildReportModel } from '../report/model.js';
import { interpretationFor } from '../report/statement.js';
import { PALETTES } from '../ui/palettes.js';
import { detailsSheet } from '../sheets/details.js';
import { resolveSlot, slotCaseData } from './panels.js';
import { buildPages, buildAppendix, frameDocument } from './pages.js';
import { localVisibility } from './modules.js';
import { fallbackRtReport } from './rt-fallback.js';

export const COPY_LABEL = { student: 'Student copy', instructor: 'Instructor copy' };

/**
 * @param {{ caseData: object, resolve: Function, equation?: 'GLIglobal'|'GLI2012', copy?: 'student'|'instructor', zInline?: Function|null,
 *   palette?: object, flags?: 'lln'|'none', qualityChallenge?: boolean, view?: string,
 *   sheets?: { summarySheetHtml?: Function|null, buildRtReport?: Function|null, visibility?: Function|null } }} args
 * @returns {{ html: string, model: object, fullModel: object|null, title: string, pageCount: number, errors: object[], slots: object,
 *   rt: object, visibility: object, summaryFrom: 'summary'|'fallback' }}
 */
export function assembleReport({ caseData, resolve, equation = 'GLIglobal', copy = 'student', zInline = null, palette = PALETTES.white, flags = 'lln', qualityChallenge = false, stage = 1, view = 'auto', sheets = {} }) {
  const interp = interpret(caseData.report, resolve, equation);
  const errors = [];
  // gradesWithheld null: the model says nothing about quality, not even that it is withheld.
  const model = buildReportModel(caseData, interp, { equation, resolve, palette, figures: false, includeGrades: false, gradesWithheld: null });

  let rt = null;
  if (typeof sheets.buildRtReport === 'function') {
    try { rt = sheets.buildRtReport(caseData); } catch (e) { errors.push({ id: 'rt-report', message: String(e?.message ?? e) }); }
  }
  rt ??= fallbackRtReport(caseData, model);
  const vis = (typeof sheets.visibility === 'function' ? sheets.visibility : localVisibility)({ qualityChallenge, stage });

  const cd = slotCaseData(caseData, interp, equation, resolve);
  const hasInline = typeof zInline === 'function';
  const slots = { spirometry: resolveSlot('spirometry', cd, { palette, hasInline, errors }), zstrip: resolveSlot('zstrip', cd, { palette, hasInline, errors }) };

  let summaryHtml = null;
  if (typeof sheets.summarySheetHtml === 'function') {
    try {
      summaryHtml = sheets.summarySheetHtml(model, { rt, caseData, interp, equation, palette, flags, showQualityLines: vis.showQualityLines });
    } catch (e) { errors.push({ id: 'summary-sheet', message: String(e?.message ?? e) }); }
  }
  const details = detailsSheet(model, { rt, caseData, interp, equation, palette, showGrades: vis.showGradeColumns, view, resolve });
  errors.push(...details.errors);

  const { pages, continued } = buildPages(model, slots, { summaryHtml: summaryHtml || null, detailsHtml: details.html, rt, showQualityLines: vis.showQualityLines, zInline, palette, llnZ: LLN_Z });
  const label = COPY_LABEL[copy];
  let fullModel = null;
  let appendix = null;
  if (copy === 'instructor') {
    const cmp = compareEquations(caseData.report, resolve, 'GLI2012', 'GLIglobal');
    const statement = interpretationFor(caseData, interp, cmp);
    fullModel = buildReportModel(caseData, interp, { equation, resolve, palette, figures: false, includeGrades: true, includeKey: true, interpretationText: statement.text, interpretationNotes: statement.notes, interpretationParts: statement.parts, interpretationSupporting: statement.supporting });
    const d = caseData.descriptor;
    appendix = buildAppendix(fullModel, { generatedAs: `Generated as archetype ${d.archetype}, severity ${d.severity}, technique ${d.technique}, panel ${d.panel}, seed ${d.seed}; spirometry equation ${equation}.` });
  }
  const html = frameDocument(model, pages, { label, appendix, continued });
  return { html, model, fullModel, title: `PFT Sim report ${model.meta.caseCode}, ${label.toLowerCase()}`, pageCount: pages.length + 1 + (appendix ? 1 : 0), errors, slots, rt, visibility: vis, summaryFrom: summaryHtml ? 'summary' : 'fallback' };
}
