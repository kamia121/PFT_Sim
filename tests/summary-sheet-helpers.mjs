/**
 * Local stand-in for the technologist report (RtReport, docs/REPORT-FIRST-PLAN.md) until the RT thread's stub lands, and the
 * cases the summary sheet is tested and photographed on. The quality strings carry unmistakable tokens so that a test can assert
 * their absence from the markup.
 */
import { makeModel } from './report-helpers.mjs';

export const QUALITY_TOKEN = 'QSTATEMENT-TOKEN';

/** @param {object} c case @param {{ kind?: 'best'|'flawed', preIndex?: number, postIndex?: number }} [o] */
export function stubRt(c, { kind = 'best', preIndex = null, postIndex = null } = {}) {
  const pre = c.spirometry.pre, post = c.spirometry.post;
  const bestOf = (set) => set.maneuvers.reduce((bi, m, i, a) => (m.fvc + m.fev1 > a[bi].fvc + a[bi].fev1 ? i : bi), 0);
  const flawedOf = (set) => { const i = set.maneuvers.findIndex((m) => m.faults.length); return i < 0 ? bestOf(set) : i; };
  const pick = (set, forced) => forced ?? (kind === 'flawed' ? flawedOf(set) : bestOf(set));
  const pi = pick(pre, preIndex), qi = post ? pick(post, postIndex) : null;
  return {
    version: 1,
    honesty: 'accurate',
    interpretationLines: ['Albuterol 400 mcg by metered-dose inhaler with spacer; post-bronchodilator testing after 15 minutes.', 'Effort was good and consistent.'],
    qualityLines: [`${QUALITY_TOKEN} PFT data acceptable and reproducible.`, `${QUALITY_TOKEN} Grades A for FEV1 and FVC.`],
    closing: 'Official interpretation to follow.',
    stated: { pre: { fev1: 'A', fvc: 'B' }, post: post ? { fev1: 'B', fvc: 'A' } : null, dlco: c.dlcoTrace ? 'acceptable' : null, pleth: c.pleth ? 'acceptable' : null },
    truth: null,
    representative: {
      pre: { index: pi, kind, faults: pre.maneuvers[pi].faults },
      post: post ? { index: qi, kind, faults: post.maneuvers[qi].faults } : null,
      pleth: c.pleth ? { trial: Math.min(1, c.pleth.trials.length - 1) } : null,
      dlco: c.dlcoTrace ? { test: 0 } : null,
    },
    needsDetails: false,
    detailsReasons: [],
  };
}

/** Six cases of the acceptance list: normal, obstruction with a bronchodilator study, restriction, mixed, poor technique, spirometry only. */
export const SHEET_CASES = {
  normal: { seed: 5, archetype: 'normal' },
  obstruction: { seed: 12, archetype: 'obstruction' },
  restriction: { seed: 31, archetype: 'restriction-parenchymal' },
  mixed: { seed: 44, archetype: 'mixed' },
  poor: { seed: 8, archetype: 'bd-discordant', technique: 'poor' },
  spirometryOnly: { seed: 44, archetype: 'mixed', panel: 'spirometry' },
};

/** @returns {{ c: object, interp: object, model: object, rt: object }} */
export function sheetCase(name, { equation = 'GLIglobal', kind = 'best', includeGrades = false } = {}) {
  const { c, interp, model } = makeModel(SHEET_CASES[name], { equation, includeGrades });
  return { c, interp, model, rt: stubRt(c, { kind }) };
}
