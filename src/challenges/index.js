/**
 * Quality challenges: pure descriptions of questions about the technologist's report and the maneuvers behind it.
 * A challenge carries no state and no markup. The practice page renders `options`, collects answers and scores them
 * with `scoreChallenge`; the key does not depend on the technologist's statement (the statement is the thing asked about).
 *
 * Contract: docs/REPORT-FIRST-PLAN.md ("Challenges").
 */

import { buildChallengeList } from './items.js';

export { visibility } from './visibility.js';
export { scoreChallenge } from './score.js';
export { studyJudgement } from './items.js';

/**
 * @typedef {object} ChallengeRow one answer row of a per-maneuver item
 * @property {string} id for the acceptability items `fev1:<i>` or `fvc:<i>` with i the 0-based maneuver index; for the
 *   loop item `pre` or `post`; for the bronchodilator item `response` or `interpretable`
 * @property {string} label text for the row ("Maneuver 3, FEV₁")
 */

/**
 * @typedef {object} Challenge
 * @property {string} id one of studyInterpretable (basic review), acceptableManeuversPre, acceptableManeuversPost, gradePreFev1, gradePreFvc, gradePostFev1,
 *   gradePostFvc, representativeLoopOk, bdInterpretable, rtConsistent, dlcoAcceptable, plethAcceptable
 * @property {string} title
 * @property {string} prompt
 * @property {[string, string][]} options [value, label]; for a row item the same options apply to every row, except where a row carries its own `rowOptions`
 * @property {string|Record<string, string>} key the option value; for a row item a map from row id to option value
 * @property {string} why explanation shown after the answers are checked (formal register, no treatment advice)
 * @property {boolean} [alwaysExplain] keep model limitations visible for correct answers and unscored key reveals
 * @property {boolean} needsDetails true when the summary page alone does not settle the answer
 * @property {1|2} stage the stage of `visibility` at which the item is asked: 1 from the start, 2 after the statement has
 *   been requested (only rtConsistent, and only with the quality challenge on)
 * @property {ChallengeRow[]} [rows] present for a row item
 * @property {Record<string, [string, string][]>} [rowOptions] per-row option lists when they differ from `options`
 * @property {string[]|Record<string, string[]>} [alsoCorrect] further option values scored as correct (the loop item accepts every fault on the displayed maneuver's list)
 * @property {string|Record<string, string>} [otherKey] the key under the other spirometry equation, where the item depends on the equation
 */

/**
 * @typedef {object} ChallengeResult
 * @property {'correct'|'wrong'|'other-equation'|'unanswered'} status
 * @property {string} note one or two sentences, formal register
 * @property {{ correct: number, total: number, fraction: number, wrong: string[], wrongManeuvers: number[] }} [perItem] row items only;
 *   `wrong` are row ids (unanswered rows count as wrong), `wrongManeuvers` the 1-based maneuver numbers of the wrong acceptability rows
 */

/**
 * @param {object} caseData a case from buildCase
 * @param {{ rt: import('../core/rt-report.js').RtReport, interp?: object, qualityChallenge?: boolean, interpOther?: object, review?: 'basic'|'advanced' }} context
 *   `review` 'basic' returns the single study-level item `studyInterpretable`; 'advanced' (the default of this function, so the earlier callers are unchanged) the per-maneuver list
 *   `interp` is the interpretation under the displayed equation (without it the bronchodilator item is omitted); `interpOther`
 *   (optional) the one under the other equation, which lets the bronchodilator item return 'other-equation'
 * @returns {Challenge[]} items for which the case holds data, in presentation order
 */
export function buildChallenges(caseData, context) {
  return buildChallengeList(caseData, context);
}
