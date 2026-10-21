/**
 * What the learner may see when. One rule, one function (docs/REPORT-FIRST-PLAN.md, "What is visible when"); no other module
 * decides. Grade words are never redacted: a redaction mark would show that the statement held grades.
 *
 * Stage 1: the answers are open and nothing has been requested. Stage 2: with the quality challenge on, the learner has
 * graded the test and asked for the technologist's statement. Stage 3: the answers are checked (the key).
 */

/**
 * @typedef {object} Visibility
 * @property {boolean} showQualityLines the technologist's quality statement in the comment box
 * @property {boolean} showGradeColumns acceptability and grade columns of the detailed page
 * @property {boolean} showStatementInSummary the stated grades in the footnote under the spirometry table of the summary page
 */

/**
 * @param {{ qualityChallenge: boolean, stage: 1|2|3 }} args
 * @returns {Visibility}
 */
export function visibility({ qualityChallenge, stage }) {
  if (stage !== 1 && stage !== 2 && stage !== 3) throw new RangeError('stage must be 1, 2 or 3');
  if (!qualityChallenge || stage === 3) return { showQualityLines: true, showGradeColumns: true, showStatementInSummary: true };
  // Quality challenge on, answers still open: the statement is released at stage 2, the grade columns only with the key.
  return { showQualityLines: stage === 2, showGradeColumns: false, showStatementInSummary: stage === 2 };
}
