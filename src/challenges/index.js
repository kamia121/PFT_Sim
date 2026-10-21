/**
 * Quality challenges: pure descriptions of questions about the technologist's report and the maneuvers behind it.
 * A challenge carries no state and no markup. The practice page renders `options`, collects answers and scores them
 * with `scoreChallenge`; the key does not depend on the technologist's statement (the statement is the thing asked about).
 *
 * Contract: docs/REPORT-FIRST-PLAN.md ("Challenges").
 */

export { visibility } from './visibility.js';

/**
 * @typedef {object} ChallengeRow one answer row of a per-maneuver item
 * @property {string} id for the acceptability items `fev1:<i>` or `fvc:<i>` with i the 0-based maneuver index; for the
 *   loop item `pre` or `post`; for the bronchodilator item `response` or `interpretable`
 * @property {string} label text for the row ("Maneuver 3, FEV₁")
 */

/**
 * @typedef {object} Challenge
 * @property {string} id one of acceptableManeuversPre, acceptableManeuversPost, gradePreFev1, gradePreFvc, gradePostFev1,
 *   gradePostFvc, representativeLoopOk, bdInterpretable, rtConsistent, dlcoAcceptable, plethAcceptable
 * @property {string} title
 * @property {string} prompt
 * @property {[string, string][]} options [value, label]; for a row item the same options apply to every row, except where a row carries its own `rowOptions`
 * @property {string|Record<string, string>} key the option value; for a row item a map from row id to option value
 * @property {string} why explanation shown after the answers are checked (formal register, no treatment advice)
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
 * @param {{ rt: import('../core/rt-report.js').RtReport, interp: object, qualityChallenge: boolean, interpOther?: object }} context
 *   `interp` is the interpretation under the displayed equation; `interpOther` (optional) the one under the other equation
 * @returns {Challenge[]}
 */
export function buildChallenges(caseData, context) {
  void caseData; void context;
  throw new Error('buildChallenges: not implemented yet; develop against tests/helpers/rt-stub.mjs');
}

/**
 * @param {Challenge} item
 * @param {string|Record<string, string>|null|undefined} answer an option value, or for a row item a map from row id to option value
 * @returns {ChallengeResult}
 */
export function scoreChallenge(item, answer) {
  void item; void answer;
  throw new Error('scoreChallenge: not implemented yet; develop against tests/helpers/rt-stub.mjs');
}
