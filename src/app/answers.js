/**
 * Structured learner answers, scored against the deterministic key. Answers live only in the page.
 * Borderline results are not marked wrong: when the key differs between GLI Global and GLI-2012,
 * the answer that matches the other equation is accepted and labeled as such.
 */

import { hbKnown } from './format.js';

export const QUESTIONS = [
  { id: 'pattern', label: 'Pattern', options: [
    ['normal', 'Normal'],
    ['obstruction', 'Obstruction'],
    ['obstruction-low-fvc', 'Obstruction with low FVC (volumes needed)'],
    ['restriction', 'Restriction'],
    ['mixed', 'Mixed obstruction and restriction'],
    ['nonspecific', 'Preserved ratio, low FVC or FEV₁, TLC not low (nonspecific)'],
    ['prism', 'Preserved ratio with low FVC or FEV₁, no volumes (PRISm)'],
  ] },
  { id: 'severity', label: 'Ventilatory impairment severity (FEV₁ for obstruction; TLC for restriction)', options: [
    ['mild', 'Mild'], ['moderate', 'Moderate'], ['severe', 'Severe'],
    ['not-graded', 'Not graded for this pattern'], ['na', 'Not applicable (no graded ventilatory impairment)'],
  ] },
  { id: 'gradeFev1', label: 'FEV₁ quality grade', options: ['A', 'B', 'C', 'D', 'E', 'U', 'F'].map((g) => [g, g]) },
  { id: 'gradeFvc', label: 'FVC quality grade', options: ['A', 'B', 'C', 'D', 'E', 'U', 'F'].map((g) => [g, g]) },
  { id: 'bronchodilator', label: 'Bronchodilator response (2022 rule)', options: [
    ['significant', 'Significant'], ['not-significant', 'Not significant'], ['not-done', 'Not performed'],
  ] },
  { id: 'dlco', label: 'Diffusing capacity (hemoglobin-adjusted)', options: [
    ['reduced', 'Reduced'], ['normal', 'Normal'], ['raised', 'Raised'], ['not-done', 'Not performed'],
  ] },
];

/**
 * Questions of the practice page. The two grade questions are not among them: grading belongs to the challenge list
 * (src/challenges), which asks about the maneuvers and the technologist's statement. The quiz still draws on QUESTIONS
 * (src/quiz/items.js) and keeps its own grade items.
 */
export const PRACTICE_QUESTIONS = QUESTIONS.filter((q) => q.id !== 'gradeFev1' && q.id !== 'gradeFvc');

/** Question label for a case: the diffusing capacity question drops "hemoglobin-adjusted" when no hemoglobin was available. */
export function questionLabel(caseData, q) {
  if (q.id === 'dlco' && caseData?.dlco && !hbKnown(caseData.dlco)) return 'Diffusing capacity (no hemoglobin adjustment: hemoglobin not available)';
  // A COHb-adjusted line printed beside the report is supplementary: the question is scored on the hemoglobin-adjusted reference alone.
  if (q.id === 'dlco' && caseData?.scenario?.coHbMeasured === true && caseData.scenario.coHbPercent > 2) return 'Diffusing capacity (scored on the hemoglobin-adjusted reference; the COHb-adjusted line is supplementary)';
  return q.label;
}

/** Whether the case contains the data a question asks about. */
export function hasData(caseData, questionId) {
  if (questionId === 'bronchodilator') return Boolean(caseData.report.spirometry.post);
  if (questionId === 'dlco') return Boolean(caseData.report.dlco);
  return true;
}

const norm = (k, id) => {
  if (id === 'severity') return k.severity ?? (k.pattern === 'mixed' ? 'not-graded' : 'na');
  if (id === 'bronchodilator') return k.bronchodilator ?? 'not-done';
  if (id === 'dlco') return k.dlco ?? 'not-done';
  return k[id] ?? null;
};

/** Name of the convention an answer matches when it matches only the key under the other spirometry equation. */
export const OTHER_EQUATION_LABEL = {
  GLI2012: 'Matches the GLI-2012 key (the earlier, race-specific convention)',
  GLIglobal: 'Matches the GLI Global (2022) key',
};

/**
 * @param {Record<string, string>} answers
 * @param {object} keyA key under the displayed equation
 * @param {object} keyB key under the other equation, for borderline tolerance
 * @param {'GLIglobal'|'GLI2012'} [equationA] the equation of keyA; the default key is GLI Global
 * @param {{ id: string, label: string, options: string[][] }[]} [questions] the questions to score; the default is all of QUESTIONS
 * @returns {{ id: string, label: string, answer: string|null, expected: string, status: 'correct'|'other-equation'|'incorrect'|'unanswered', other: string, otherLabel: string }[]}
 */
export function scoreAnswers(answers, keyA, keyB, equationA = 'GLIglobal', questions = QUESTIONS) {
  const otherLabel = OTHER_EQUATION_LABEL[equationA === 'GLI2012' ? 'GLIglobal' : 'GLI2012'];
  return questions.map((q) => {
    const expected = norm(keyA, q.id);
    const other = norm(keyB, q.id);
    const answer = answers[q.id] ?? null;
    let status;
    if (!answer) status = 'unanswered';
    else if (answer === expected) status = 'correct';
    else if (q.id === 'severity' && (keyA.severityAlso ?? []).includes(answer)) status = 'correct'; // at a cut point of the 2022 scale, to the precision of its rounding: checked before the other equation's key
    else if (answer === other) status = 'other-equation';
    else status = 'incorrect';
    return { id: q.id, label: q.label, answer, expected, status, other, otherLabel, ...(status === 'correct' && answer !== expected ? { note: 'The z-score is at a cut point of the 2022 scale, so the adjacent band is accepted.' } : {}) };
  });
}

export const label = (qid, value) => {
  const q = QUESTIONS.find((x) => x.id === qid);
  return q?.options.find(([v]) => v === value)?.[1] ?? value ?? '—';
};
