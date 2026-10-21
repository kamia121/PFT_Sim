/**
 * Staged reveal of the practice page as a small state machine with no DOM, so it runs under node.
 *
 * Stage 1: the answers are open. With the quality challenge off the technologist's statement is printed from the start;
 *   with it on, grades, acceptability and the statement are withheld.
 * Stage 2 (quality challenge only): the learner has asked for the technologist's statement, and the test-quality answers
 *   given so far are locked.
 * Stage 3: the answers are checked (or the key is shown without scoring); the key and the feedback follow.
 *
 * What each stage releases is decided by `visibility()` in src/challenges/visibility.js (owned by the challenge module);
 * `fallbackVisibility` here applies the rule of docs/REPORT-FIRST-PLAN.md only while that module is not in the build.
 */

/**
 * @typedef {object} StageState
 * @property {1|2|3} stage
 * @property {boolean} qualityChallenge
 * @property {boolean} scored whether the answers were scored (false when the key was shown without scoring)
 * @property {boolean} detailsOpened page 2 was opened at some time before the answers were checked
 */

/** @param {{ qualityChallenge?: boolean }} [opts] @returns {StageState} */
export function createStage({ qualityChallenge = false } = {}) {
  return { stage: 1, qualityChallenge: Boolean(qualityChallenge), scored: false, detailsOpened: false };
}

/** Release the technologist's statement. Only the quality challenge has this step, and only from stage 1. */
export function showStatement(s) {
  return s.qualityChallenge && s.stage === 1 ? { ...s, stage: 2 } : s;
}

/** Whether the answers may be checked with scoring now: with the quality challenge on, only after the statement was released. */
export function canCheck(s) {
  return s.stage !== 3 && (!s.qualityChallenge || s.stage === 2);
}

/** Check the answers (scored) or show the key without scoring. A refused scored check leaves the state unchanged. */
export function check(s, { scored }) {
  if (s.stage === 3) return s;
  if (scored && !canCheck(s)) return s;
  return { ...s, stage: 3, scored: Boolean(scored) };
}

/** Opening page 2 is recorded only while the answers are open; it is never scored. */
export function openDetails(s) {
  return s.stage === 3 || s.detailsOpened ? s : { ...s, detailsOpened: true };
}

/** Change the quality challenge for the case on the page. Once the answers are checked the setting waits for the next case. */
export function setQualityChallenge(s, qualityChallenge) {
  const q = Boolean(qualityChallenge);
  if (s.stage === 3 || s.qualityChallenge === q) return s;
  return { ...s, qualityChallenge: q, stage: 1 };
}

/** Whether the test-quality answers are locked: after the statement was released and before the final check. */
export function qualityAnswersLocked(s) {
  return s.qualityChallenge && s.stage >= 2;
}

/**
 * The rule of docs/REPORT-FIRST-PLAN.md, used only when src/challenges/visibility.js is not in the build.
 * @param {{ qualityChallenge: boolean, stage: 1|2|3 }} arg
 * @returns {{ showQualityLines: boolean, showGradeColumns: boolean, showStatementInSummary: boolean }}
 */
export function fallbackVisibility({ qualityChallenge, stage }) {
  const lines = stage === 3 || stage === 2 || !qualityChallenge;
  const grades = stage === 3;
  return { showQualityLines: lines, showGradeColumns: grades, showStatementInSummary: lines };
}
