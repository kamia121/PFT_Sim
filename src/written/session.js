/**
 * The page-state rules of the written-impression check, with no DOM so they run under node.
 *
 *  - Grading happens only for an explicit scored check: `scored === true` and the check actually reached stage 3. "Show the key without scoring"
 *    also reaches stage 3 and never grades; neither does any re-render, theme change, figure change or page 2 toggle.
 *  - The snapshot holds the text as checked, the case object and the equation. It is shown only while it belongs to the case on the page and the
 *    page is at a scored stage 3; a new case replaces the case object and so retires it without any reset hook.
 *  - It is never recomputed: an equation change after the check leaves it as it was and the view labels it.
 */
import { snapshotWritten } from './index.js';

/**
 * @param {{ scored: boolean, stage: number, text: string, caseData: object, interp: object, interpOther?: object|null, equation: string }} arg
 * @returns {ReturnType<typeof snapshotWritten>|null} null unless this is an explicit scored check at stage 3 with a non-blank text
 */
export function takeSnapshot({ scored, stage, text, caseData, interp, interpOther = null, equation }) {
  if (scored !== true || stage !== 3) return null;
  if (typeof text !== 'string' || !text.trim()) return null;
  return snapshotWritten({ text, caseData, interp, interpOther, equation });
}

/**
 * @param {ReturnType<typeof snapshotWritten>|null} snapshot
 * @param {{ caseData: object, stage: { stage: number, scored: boolean } }} page
 */
export function visibleSnapshot(snapshot, { caseData, stage }) {
  if (!snapshot || snapshot.case !== caseData) return null;
  return stage.stage === 3 && stage.scored === true ? snapshot : null;
}
