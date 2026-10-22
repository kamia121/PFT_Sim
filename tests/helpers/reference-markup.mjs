/**
 * Markup of the outputs that the interpretation workspace must leave byte-identical: the fixed summary sheet (Lab report view and
 * report page), the live summary sheet with its practice-page extras, the details sheet, the Lab report fallback document and the
 * assembled report page, for the sample cases. Hashed at the reference commit by tools/practice-markup-hashes.mjs.
 */
import { ds, resolveReference, SAMPLE_INPUTS } from '../report-helpers.mjs';
import { buildCase } from '../../src/core/case.js';
import { interpret } from '../../src/interpret/interpret.js';
import { buildReportModel } from '../../src/report/model.js';
import { renderReportHtml } from '../../src/report/html.js';
import { assembleReport } from '../../src/report-page/assemble.js';
import { PAGE_PALETTE, PALETTES } from '../../src/ui/palettes.js';
import { mods } from './practice-markup.mjs';

/** @returns {Record<string, string>} */
export function referenceMarkup() {
  const out = {};
  for (const input of SAMPLE_INPUTS) {
    const name = `${input.archetype}-${input.seed}`;
    const caseData = buildCase({ technique: 'fair', ...input }, ds);
    const interp = interpret(caseData.report, resolveReference, 'GLIglobal');
    const rt = mods.buildRtReport(caseData);
    for (const grades of [false, true]) {
      const model = buildReportModel(caseData, interp, { equation: 'GLIglobal', includeGrades: grades, resolve: resolveReference, palette: PALETTES.white });
      for (const showQualityLines of [false, true]) {
        const o = { rt, caseData, interp, equation: 'GLIglobal', palette: PAGE_PALETTE, flags: 'lln', showQualityLines };
        out[`summary|${name}|grades-${grades}|lines-${showQualityLines}`] = mods.summarySheetHtml(model, o);
        out[`summary-flags-none|${name}|grades-${grades}|lines-${showQualityLines}`] = mods.summarySheetHtml(model, { ...o, flags: 'none' });
      }
      out[`details|${name}|grades-${grades}`] = mods.detailsSheetHtml(model, { rt, caseData, interp, equation: 'GLIglobal', palette: PAGE_PALETTE, showGrades: grades, views: {}, controls: true, resolve: resolveReference });
      out[`lab-fallback|${name}|grades-${grades}`] = renderReportHtml(model, { interactive: true, settings: {} });
    }
    for (const [qualityChallenge, stage] of [[false, 1], [true, 1], [true, 2], [true, 3]]) {
      out[`report-page|${name}|qc-${qualityChallenge}|stage-${stage}`] = assembleReport({ caseData, resolve: resolveReference, equation: 'GLIglobal', palette: PALETTES.white, qualityChallenge, stage, sheets: { summarySheetHtml: mods.summarySheetHtml, buildRtReport: mods.buildRtReport, visibility: mods.visibility } }).html;
    }
  }
  return out;
}
