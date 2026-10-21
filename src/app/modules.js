/**
 * Optional modules of the report-first page. The summary and details sheets (src/sheets), the technologist's report
 * (src/core/rt-report.js) and the challenge list (src/challenges) are written by other threads and may be missing from a build.
 * Each is imported dynamically; a missing module leaves its function null, and the page degrades:
 *   no summary or details sheet  -> the card view of the practice page stands in, with a plain message
 *   no technologist's report     -> no challenge items, no quality section, no case-specific details line
 *   no visibility module         -> the rule of docs/REPORT-FIRST-PLAN.md in src/app/stage.js
 */

/**
 * @typedef {object} OptionalModules
 * @property {Function|null} summarySheetHtml (model, { rt, caseData, interp, equation, palette, flags, showQualityLines }) => string
 * @property {Function|null} interpretationSectionHtml (model) => string; not required of the summary module, null when it lacks it
 * @property {Function|null} detailsSheetHtml (model, { rt, caseData, interp, equation, palette, showGrades, view }) => string
 * @property {Function|null} buildRtReport (caseData) => RtReport
 * @property {Function|null} buildChallenges (caseData, { rt, interp, qualityChallenge }) => item[]
 * @property {Function|null} scoreChallenge (item, answer) => { status, note }
 * @property {Function|null} visibility ({ qualityChallenge, stage }) => { showQualityLines, showGradeColumns, showStatementInSummary }
 * @property {string[]} missing names of the modules that could not be imported
 */

/** Functions that are taken from a module when it has them and are not required of it. */
const EXTRA = { summary: ['interpretationSectionHtml'] };

const WANTED = {
  summary: ['summarySheetHtml'],
  details: ['detailsSheetHtml'],
  rt: ['buildRtReport'],
  challenges: ['buildChallenges', 'scoreChallenge'],
  visibility: ['visibility'],
};

/**
 * @param {Record<'summary'|'details'|'rt'|'challenges'|'visibility', () => Promise<object>>} importers one dynamic import per module; the caller owns the literal specifiers
 * @returns {Promise<OptionalModules>}
 */
export async function loadOptionalModules(importers) {
  /** @type {any} */
  const out = { missing: [] };
  for (const names of [...Object.values(WANTED), ...Object.values(EXTRA)]) for (const n of names) out[n] = null;
  await Promise.all(Object.entries(WANTED).map(async ([key, names]) => {
    try {
      const mod = await importers[key]();
      if (!names.every((n) => typeof mod?.[n] === 'function')) throw new TypeError(`${key} module lacks ${names.join(', ')}`);
      for (const n of names) out[n] = mod[n];
      for (const n of EXTRA[key] ?? []) if (typeof mod[n] === 'function') out[n] = mod[n];
    } catch {
      out.missing.push(key);
    }
  }));
  out.missing.sort();
  return out;
}
