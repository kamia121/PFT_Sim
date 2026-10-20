/**
 * Report page assembly: a case, a spirometry equation and a copy (student or instructor) become the HTML of the printed
 * pages. Pure apart from the figure registry, so it runs under Node for tests.
 *
 * The student copy is built from a model without grades and without the key, and nothing from the interpretation engine
 * other than z-scores reaches its markup. The instructor copy adds an appendix built from a second model. The boundary is one
 * of presentation: the key is computable in the browser from the descriptor in the address.
 */
import { interpret, compareEquations, LLN_Z } from '../interpret/interpret.js';
import { buildReportModel } from '../report/model.js';
import { interpretationFor } from '../report/statement.js';
import { PALETTES } from '../ui/palettes.js';
import { resolveSlot, slotCaseData } from './panels.js';
import { buildPages, buildAppendix, frameDocument } from './pages.js';

export const COPY_LABEL = { student: 'Student copy', instructor: 'Instructor copy' };

/**
 * @param {{ caseData: object, resolve: Function, equation?: 'GLIglobal'|'GLI2012', copy?: 'student'|'instructor', zInline?: Function|null, palette?: object }} args
 * @returns {{ html: string, model: object, fullModel: object|null, title: string, pageCount: number, errors: object[], slots: object }}
 */
export function assembleReport({ caseData, resolve, equation = 'GLIglobal', copy = 'student', zInline = null, palette = PALETTES.white }) {
  const interp = interpret(caseData.report, resolve, equation);
  const errors = [];
  const model = buildReportModel(caseData, interp, { equation, resolve, palette, figures: false, includeGrades: false, gradesWithheld: 'withheld from this copy' });

  const cd = slotCaseData(caseData, interp, equation, resolve);
  const hasInline = typeof zInline === 'function';
  const slots = Object.fromEntries(['spirometry', 'pleth', 'dlco', 'zstrip'].map((name) => {
    const present = name === 'spirometry' || (name === 'pleth' && caseData.volumes) || (name === 'dlco' && caseData.dlco) || name === 'zstrip';
    return [name, present ? resolveSlot(name, cd, { palette, hasInline, errors }) : null];
  }));

  const { pages } = buildPages(model, slots, { zInline, palette, llnZ: LLN_Z });
  const label = COPY_LABEL[copy];
  let fullModel = null;
  let appendix = null;
  if (copy === 'instructor') {
    const cmp = compareEquations(caseData.report, resolve, 'GLI2012', 'GLIglobal');
    const statement = interpretationFor(caseData, interp, cmp);
    fullModel = buildReportModel(caseData, interp, { equation, resolve, palette, figures: false, includeGrades: true, includeKey: true, interpretationText: statement.text, interpretationNotes: statement.notes });
    const d = caseData.descriptor;
    appendix = buildAppendix(fullModel, { generatedAs: `Generated as archetype ${d.archetype}, severity ${d.severity}, technique ${d.technique}, panel ${d.panel}, seed ${d.seed}; spirometry equation ${equation}.` });
  }
  const html = frameDocument(model, pages, { label, appendix });
  return { html, model, fullModel, title: `PFT Sim report ${model.meta.caseCode}, ${label.toLowerCase()}`, pageCount: pages.length, errors, slots };
}
