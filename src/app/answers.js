/**
 * Structured learner answers, scored against the deterministic key. Answers live only in the page.
 * Borderline results are not marked wrong: when the key differs between GLI Global and GLI-2012,
 * the answer that matches the other equation is accepted and labeled as such.
 */

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
  { id: 'severity', label: 'Severity of obstruction (FEV₁ z-score)', options: [
    ['mild', 'Mild'], ['moderate', 'Moderate'], ['severe', 'Severe'], ['na', 'Not applicable (no obstruction)'],
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

/** Whether the case contains the data a question asks about. */
export function hasData(caseData, questionId) {
  if (questionId === 'bronchodilator') return Boolean(caseData.report.spirometry.post);
  if (questionId === 'dlco') return Boolean(caseData.report.dlco);
  return true;
}

const norm = (k, id) => {
  if (id === 'severity') return k.severity ?? 'na';
  if (id === 'bronchodilator') return k.bronchodilator ?? 'not-done';
  if (id === 'dlco') return k.dlco ?? 'not-done';
  return k[id] ?? null;
};

/**
 * @param {Record<string, string>} answers
 * @param {object} keyA key under the displayed equation
 * @param {object} keyB key under the other equation, for borderline tolerance
 * @returns {{ id: string, label: string, answer: string|null, expected: string, status: 'correct'|'other-equation'|'incorrect'|'unanswered', other: string }[]}
 */
export function scoreAnswers(answers, keyA, keyB) {
  return QUESTIONS.map((q) => {
    const expected = norm(keyA, q.id);
    const other = norm(keyB, q.id);
    const answer = answers[q.id] ?? null;
    let status;
    if (!answer) status = 'unanswered';
    else if (answer === expected) status = 'correct';
    else if (answer === other) status = 'other-equation';
    else status = 'incorrect';
    return { id: q.id, label: q.label, answer, expected, status, other };
  });
}

export const label = (qid, value) => {
  const q = QUESTIONS.find((x) => x.id === qid);
  return q?.options.find(([v]) => v === value)?.[1] ?? value ?? '—';
};
