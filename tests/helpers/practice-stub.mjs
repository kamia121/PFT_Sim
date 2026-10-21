/**
 * Stand-ins for the modules that other threads write (src/core/rt-report.js, src/challenges/*, src/sheets/*), shaped by
 * docs/REPORT-FIRST-PLAN.md, so that the practice page can be tested before they merge. They are test doubles, not the model:
 * the honesty types, phrases and challenge keys here are crude. Every key, explanation and true-grade string carries a marker
 * (KEY:, WHY:, TRUTH:) so that a page-source test can look for it.
 */
import { visibility as planVisibility } from './practice-visibility.mjs';

export const visibility = planVisibility;

const ORDER = ['A', 'B', 'C', 'D', 'E', 'U', 'F'];

/** @returns {import('../../src/app/modules.js').OptionalModules['buildRtReport']} */
export function buildRtReport(caseData) {
  const pre = caseData.spirometry.pre, post = caseData.spirometry.post;
  const g = pre.summary.grades;
  const optimistic = caseData.descriptor.technique === 'poor';
  const stated = { pre: optimistic ? { fev1: 'A', fvc: 'A' } : { fev1: g.fev1, fvc: g.fvc }, post: post ? { fev1: post.summary.grades.fev1, fvc: post.summary.grades.fvc } : null, dlco: null, pleth: null };
  const flawed = pre.summary.evaluations.some((e) => !e.fev1.acceptable || !e.fvc.acceptable);
  return {
    version: 1,
    honesty: optimistic ? 'optimistic' : 'accurate',
    interpretationLines: (caseData.scenario?.statements ?? []).map((s) => s.text),
    qualityLines: [`Test quality: Pre: FEV1 - ${stated.pre.fev1}, FVC - ${stated.pre.fvc}.`, 'PFT data acceptable and reproducible.'],
    closing: 'Official interpretation to follow.',
    stated,
    truth: { pre: { fev1: g.fev1, fvc: g.fvc }, post: post ? { fev1: post.summary.grades.fev1, fvc: post.summary.grades.fvc } : null, dlco: null, pleth: null },
    representative: { pre: { index: 0, kind: 'best', faults: [] }, post: null, pleth: null, dlco: null },
    needsDetails: flawed,
    detailsReasons: flawed ? ['a maneuver with a fault that changes the grade (TRUTH: details)'] : [],
  };
}

const rank = (g) => ORDER.indexOf(g);

/** @returns {import('../../src/app/modules.js').OptionalModules['buildChallenges']} */
export function buildChallenges(caseData, { rt, qualityChallenge }) {
  const set = caseData.spirometry.pre;
  const accept = set.summary.evaluations.map((e, i) => (e.fev1.acceptable ? String(i + 1) : null)).filter(Boolean);
  const items = [
    { id: 'accept-fev1-pre', title: 'Acceptable maneuvers for the FEV₁, before bronchodilator', prompt: 'Mark each maneuver that meets the acceptability criteria for the FEV₁.', options: set.maneuvers.map((_, i) => [String(i + 1), `Maneuver ${i + 1}`]), key: accept, why: `WHY: accept ${accept.join(',')}`, needsDetails: true },
    { id: 'grade-fev1-pre', title: 'FEV₁ grade, before bronchodilator', prompt: 'Which grade do the maneuvers earn?', options: ORDER.map((x) => [x, x]), key: rt.truth.pre.fev1, why: `WHY: grade ${rt.truth.pre.fev1}`, needsDetails: true },
  ];
  const s = rt.stated.pre, t = rt.truth.pre;
  const d = rank(s.fev1) - rank(t.fev1);
  items.push({ id: 'statement-consistent', title: 'Is the technologist’s statement consistent with the maneuvers?', prompt: 'Compare the printed statement with the maneuvers on page 2.', options: [['consistent', 'Consistent'], ['overstated', 'Overstates the quality'], ['understated', 'Understates the quality'], ['not-stated', 'No statement']], key: d === 0 ? 'consistent' : d < 0 ? 'overstated' : 'understated', why: `WHY: stated ${s.fev1}, earned ${t.fev1}`, needsDetails: true });
  return qualityChallenge ? items : items.slice(2);
}

/** @returns {import('../../src/app/modules.js').OptionalModules['scoreChallenge']} */
export function scoreChallenge(item, answer) {
  if (answer === null || answer === undefined) return { status: 'unanswered', note: '' };
  if (Array.isArray(item.key)) {
    const a = new Set(answer), k = new Set(item.key);
    const ok = a.size === k.size && [...k].every((x) => a.has(x));
    return { status: ok ? 'correct' : 'wrong', note: ok ? 'Every maneuver marked correctly.' : `NOTE: key ${item.key.join(',')}` };
  }
  return answer === item.key ? { status: 'correct', note: '' } : { status: 'wrong', note: `NOTE: key ${item.key}` };
}

/** Minimal sheets: the model's tables as text, the empty interpretation element, and the quality lines when released. */
export function summarySheetHtml(model, { rt, showQualityLines }) {
  const lines = rt ? [...rt.interpretationLines, ...(showQualityLines ? rt.qualityLines : []), rt.closing] : [];
  return `<article class="stub-sheet" data-sheet="summary"><h2>Summary (stub)</h2><p>${model.meta.caseCode}</p><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul><div id="sheet-interpretation"></div></article>`;
}

export function detailsSheetHtml(model, { caseData, showGrades }) {
  const rows = caseData.spirometry.pre.maneuvers.map((m, i) => `<tr><td>${i + 1}</td><td>${m.fev1.toFixed(2)}</td>${showGrades ? `<td>${caseData.spirometry.pre.summary.evaluations[i].fev1.acceptable ? 'acceptable' : 'not acceptable'}</td>` : ''}</tr>`).join('');
  return `<article class="stub-sheet" data-sheet="details"><h2>Details (stub)</h2><table>${rows}</table>${showGrades ? `<p>Grade ${caseData.spirometry.pre.summary.grades.fev1}</p>` : ''}</article>`;
}
