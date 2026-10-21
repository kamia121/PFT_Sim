/**
 * Deterministic practice-page contexts built with the real sheet, technologist-report and challenge modules, for the markup parity
 * test of the interpretation workspace (tests/workspace.test.mjs) and for tools/practice-markup-hashes.mjs, which recorded the
 * baseline hashes at ec5f6cd (tests/fixtures/practice-markup-baseline.json). The set is a bounded, representative cross of the
 * states that change the markup: four cases (a normal study, an obstruction with a bronchodilator study, a poor-quality study, a
 * spirometry-only study), the quality challenge off and on, both review levels, stages 1 to 3, page 2 closed and open, answers empty
 * and filled, and the flag setting.
 */
import { ds, resolveReference } from '../report-helpers.mjs';
import { buildCase } from '../../src/core/case.js';
import { interpret, compareEquations } from '../../src/interpret/interpret.js';
import { buildReportModel } from '../../src/report/model.js';
import { PAGE_PALETTE } from '../../src/ui/palettes.js';
import { loadOptionalModules } from '../../src/app/modules.js';
import { createStage, showStatement, check, canCheck, openDetails } from '../../src/app/stage.js';
import { emptyResponses } from '../../src/app/collect.js';
import { buildFeedback } from '../../src/app/feedback.js';

export const mods = await loadOptionalModules({
  summary: () => import('../../src/sheets/summary.js'),
  details: () => import('../../src/sheets/details.js'),
  rt: () => import('../../src/core/rt-report.js'),
  challenges: () => import('../../src/challenges/index.js'),
  visibility: () => import('../../src/challenges/visibility.js'),
});

export const MARKUP_CASES = {
  normal: { seed: 5, archetype: 'normal', technique: 'good' },
  obstruction: { seed: 12, archetype: 'obstruction', technique: 'fair' },
  poor: { seed: 8, archetype: 'bd-discordant', technique: 'poor' },
  spiroOnly: { seed: 44, archetype: 'mixed', technique: 'poor', panel: 'spirometry' },
};

/** Answers that check one option of every structured question and write an impression. */
const FILLED = { structured: { pattern: 'obstruction', severity: 'moderate', bronchodilator: 'not-significant', dlco: 'normal' }, challenge: {}, impression: 'Line one.\n\nLine two & <three>.' };

/**
 * The context main.js builds for one state.
 * @param {object} input descriptor-like input
 * @param {{ qualityChallenge?: boolean, review?: 'basic'|'advanced', stage?: 1|2|3, detailsOpen?: boolean, filled?: boolean, flags?: 'lln'|'none' }} o
 */
export function markupCtx(input, { qualityChallenge = false, review = 'basic', stage = 1, detailsOpen = false, filled = false, flags = 'lln' } = {}) {
  const caseData = buildCase(input, ds);
  const equation = 'GLIglobal';
  const interp = interpret(caseData.report, resolveReference, equation);
  const interpOther = interpret(caseData.report, resolveReference, 'GLI2012');
  const cmp = compareEquations(caseData.report, resolveReference, 'GLI2012', 'GLIglobal');
  const rt = mods.buildRtReport(caseData);
  const items = mods.buildChallenges(caseData, { rt, interp, qualityChallenge, review }) ?? [];
  let st = createStage({ qualityChallenge, review });
  if (detailsOpen) st = openDetails(st);
  if (stage >= 2 && qualityChallenge) st = showStatement(st);
  if (stage === 3) st = check(st, { scored: true });
  const vis = mods.visibility({ qualityChallenge, stage: st.stage });
  const model = buildReportModel(caseData, interp, { equation, includeGrades: vis.showGradeColumns, resolve: resolveReference, palette: PAGE_PALETTE });
  const responses = filled ? structuredClone(FILLED) : emptyResponses();
  const feedback = st.stage === 3 ? buildFeedback({ caseData, interp, interpOther, equation, responses, items, scoreChallenge: mods.scoreChallenge, rt, detailsOpened: st.detailsOpened }) : null;
  return {
    caseData, interp, cmp, equation, flags, qualityChallenge, review, stage: st.stage, scored: st.scored, detailsOpen, vis, canCheck: canCheck(st), rt, items, responses, model,
    sheets: { summarySheetHtml: mods.summarySheetHtml, detailsSheetHtml: mods.detailsSheetHtml }, palette: PAGE_PALETTE, figView: {}, showSchematic: false, resolve: resolveReference, feedback,
  };
}

/** Every state of the parity set, keyed by a readable name. */
export function markupStates() {
  const out = [];
  for (const [name, input] of Object.entries(MARKUP_CASES)) {
    for (const [mode, qc, stage] of [['off-s1', false, 1], ['off-s3', false, 3], ['on-s1', true, 1], ['on-s2', true, 2], ['on-s3', true, 3]]) {
      for (const review of ['basic', 'advanced']) {
        for (const detailsOpen of [false, true]) {
          out.push({ key: `${name}|${mode}|${review}|details-${detailsOpen ? 'open' : 'closed'}`, input, opts: { qualityChallenge: qc, review, stage, detailsOpen } });
        }
      }
    }
    out.push({ key: `${name}|on-s1|basic|filled`, input, opts: { qualityChallenge: true, review: 'basic', stage: 1, filled: true } });
    out.push({ key: `${name}|off-s1|basic|flags-none`, input, opts: { flags: 'none' } });
  }
  return out;
}
