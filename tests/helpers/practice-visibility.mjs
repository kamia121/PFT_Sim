/**
 * The visibility rule as the plan states it, written separately from src/app/stage.js (the page's own fallback) so that a test can
 * check that the two agree. The real rule is owned by src/challenges/visibility.js.
 */
export function visibility({ qualityChallenge, stage }) {
  if (stage >= 3) return { showQualityLines: true, showGradeColumns: true, showStatementInSummary: true };
  if (!qualityChallenge) return { showQualityLines: true, showGradeColumns: false, showStatementInSummary: true };
  if (stage === 2) return { showQualityLines: true, showGradeColumns: false, showStatementInSummary: true };
  return { showQualityLines: false, showGradeColumns: false, showStatementInSummary: false };
}
