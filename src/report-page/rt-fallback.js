/**
 * Stand-in for the technologist's report (src/core/rt-report.js, `buildRtReport(caseData)`, typedef RtReport in
 * docs/REPORT-FIRST-PLAN.md) for use until that module exists. It is an accurate report: the statement repeats the engine's own
 * grades, the representative maneuver is the one the spirometry panel draws as best, and nothing is dishonest or stale. It is
 * pure and uses no random stream. The page prefers the real module whenever it loads (see modules.js).
 */
import { spirometryGradeLine } from '../report/model.js';
import { bestIndex } from '../ui/figures/traces.js';

/**
 * @param {object} caseData result of buildCase
 * @param {{ interpretationComments?: string[] }} [model] a report model; its comments that bear on interpretation become the interpretation lines
 * @returns {object} an RtReport
 */
export function fallbackRtReport(caseData, model = {}) {
  const { pre, post } = caseData.spirometry;
  const grades = (set) => (set ? { fev1: set.summary.grades.fev1, fvc: set.summary.grades.fvc } : null);
  const session = caseData.dlcoTrace?.session;
  const dl = session ? { acceptable: session.status === 'repeatable', invalid: [], failed: session.status === 'repeatable' ? [] : session.warnings } : caseData.dlcoTrace?.grade ?? null;
  const pl = caseData.pleth ?? null;
  const verdict = (ok) => (ok ? 'acceptable' : 'not-acceptable');
  const reps = (set) => (set ? { index: bestIndex(set), kind: 'best', faults: set.maneuvers[bestIndex(set)].faults.slice() } : null);
  return {
    version: 1,
    honesty: 'accurate',
    interpretationLines: [...(model.interpretationComments ?? [])],
    qualityLines: [spirometryGradeLine(caseData)],
    closing: 'Official interpretation to follow.',
    stated: { pre: grades(pre), post: grades(post), dlco: dl ? verdict(dl.acceptable) : null, pleth: pl ? verdict(pl.grade === 'A' || pl.grade === 'B') : null },
    truth: {
      pre: grades(pre), post: grades(post),
      dlco: dl ? { acceptable: dl.acceptable, reasons: [...dl.invalid, ...dl.failed] } : null,
      pleth: pl ? { acceptable: pl.grade === 'A' || pl.grade === 'B', reasons: [] } : null,
    },
    representative: { pre: reps(pre), post: reps(post), pleth: pl?.trials?.length ? { trial: 0 } : null, dlco: caseData.dlcoTrace ? { test: caseData.dlcoTrace.tests ? Math.max(0, caseData.dlcoTrace.tests.findIndex((t) => t.selected)) : 0 } : null },
    needsDetails: false,
    detailsReasons: [],
    stub: true,
  };
}
