/**
 * Optional modules of the report page, loaded dynamically so that the page works whichever of them exist:
 *   summarySheetHtml  src/sheets/summary.js        the one-page summary sheet (page 1)
 *   buildRtReport     src/core/rt-report.js        the technologist's quality report
 *   visibility        src/challenges/visibility.js what is shown at each stage of the quality challenge
 * A module that is missing, fails to load or lacks the export leaves its entry null; assemble.js then falls back to the earlier
 * page 1, to a report derived from the engine's grades, and to the local copy of the visibility rule below.
 */

/** @typedef {{ summarySheetHtml: Function|null, buildRtReport: Function|null, visibility: Function|null }} SheetModules */

async function pick(load, name) {
  try {
    const m = await load();
    return typeof m?.[name] === 'function' ? m[name] : null;
  } catch {
    return null;
  }
}

/** @returns {Promise<SheetModules>} */
export async function loadSheetModules() {
  const [summarySheetHtml, buildRtReport, visibility] = await Promise.all([
    pick(() => import('../sheets/summary.js'), 'summarySheetHtml'),
    pick(() => import('../core/rt-report.js'), 'buildRtReport'),
    pick(() => import('../challenges/visibility.js'), 'visibility'),
  ]);
  return { summarySheetHtml, buildRtReport, visibility };
}

/**
 * Local copy of the visibility rule of docs/REPORT-FIRST-PLAN.md ("What is visible when"), used until src/challenges/visibility.js
 * exists. Stage 1 is every mode while the answers are open: with the quality challenge off the technologist's quality lines and
 * the grade columns are shown from the start; with it on, both are withheld and nothing marks that they exist. Later stages
 * release them (stage 2 the statement, stage 3 everything).
 * @param {{ qualityChallenge: boolean, stage: 1|2|3 }} args
 * @returns {{ showQualityLines: boolean, showGradeColumns: boolean, showStatementInSummary: boolean }}
 */
export function localVisibility({ qualityChallenge, stage }) {
  const open = !qualityChallenge || stage >= 3;
  const statement = !qualityChallenge || stage >= 2;
  return { showQualityLines: statement, showGradeColumns: open, showStatementInSummary: statement };
}
