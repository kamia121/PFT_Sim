/**
 * Local, rule-based, formative grading of the trainee's written impression. Educational only: it is not a validated assessment, it gives no overall score,
 * and a statement it cannot resolve is reported as needing review instead of being marked right or wrong.
 *
 * Privacy: pure functions of (text, case, key). No network, no storage, no logging, no model, no timers. The text is never kept anywhere but in the
 * snapshot the caller holds in memory.
 */
import { extractClaims } from './extract.js';
import { buildRubric } from './rubric.js';
import { evaluate, DOMAIN_ORDER } from './evaluate.js';
import { MAX_CHARS } from './text.js';

export { MAX_CHARS };

const GROUPS = ['correct', 'missing', 'contradictory', 'review'];

/**
 * @param {{ text: string, caseData: object, interp: object, interpOther?: object|null, equation: string }} arg
 * @returns {{ status: 'blank'|'too-long'|'abstained'|'graded'|'error', items: import('./evaluate.js').Item[], groups: Record<string, import('./evaluate.js').Item[]>, focus: import('./evaluate.js').Item[], notices: string[], equation: string }}
 */
export function gradeWritten({ text, caseData, interp, interpOther = null, equation }) {
  const empty = (status) => ({ status, items: [], groups: Object.fromEntries(GROUPS.map((g) => [g, []])), focus: [], notices: [], equation });
  const src = typeof text === 'string' ? text : '';
  if (!src.trim()) return empty('blank');
  try {
    const rubric = buildRubric({ caseData, interp, interpOther, equation });
    const r = evaluate(extractClaims(src), rubric);
    const groups = Object.fromEntries(GROUPS.map((g) => [g, r.items.filter((i) => i.group === g)]));
    const rank = (i) => DOMAIN_ORDER.indexOf(i.domain);
    const byDomain = (a, b) => rank(a) - rank(b);
    const focus = [...groups.contradictory.sort(byDomain), ...groups.missing.sort(byDomain)].slice(0, 2);
    return { status: r.status, items: r.items, groups, focus, notices: r.notices, equation };
  } catch {
    // never let the grader take the page down: abstain
    return { ...empty('error'), notices: ['The written impression could not be checked.'] };
  }
}

/**
 * The snapshot held by the page after an explicit scored check: the text as checked, the case object it was checked against and the equation. It is
 * valid only while `snapshot.case === currentCase`; it is not recomputed when the theme, figures or page 2 change.
 */
export function snapshotWritten({ text, caseData, interp, interpOther, equation }) {
  return { case: caseData, equation, text: String(text ?? ''), result: gradeWritten({ text, caseData, interp, interpOther, equation }) };
}
