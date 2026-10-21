/**
 * Scoring. Each item is worth one point.
 *
 * Single-answer items: an answer equal to the key scores 1; an answer that equals the key under the
 * other spirometry equation also scores 1 and is labeled, as on the learner page (src/app/answers.js).
 * Partial credit is a convention of this tool and not taken from a statement: a severity band or an
 * A-to-E quality grade one step from the key scores 0.5.
 * Multi-select (limitations): chance-corrected. The score is the weighted share of the applicable statements that were selected (a major
 * statement weighing 2, a minor one 1) minus the share of the non-applicable statements that were selected, and not below 0. Selecting
 * every option, or any fraction of the options at random, has an expected value of 0 before the floor, so guessing does not earn credit.
 * "None of these" is an ordinary option that is correct only when no statement applies.
 */
import { SKILLS } from './codes.js';
import { GRADE_ORDER, SEVERITY_ORDER } from './items.js';

export const PARTIAL = 0.5;

const adjacent = (order, x, y) => {
  const i = order.indexOf(x), j = order.indexOf(y);
  return i >= 0 && j >= 0 && Math.abs(i - j) === 1;
};

/**
 * @param {object} item item with key
 * @param {string|string[]|undefined} response
 */
export function scoreItem(item, response) {
  const base = { id: item.id, skill: item.skill, max: 1, response: response ?? null };
  const k = item.key;
  if (item.type === 'multi') {
    const sel = Array.isArray(response) ? [...new Set(response)] : [];
    if (!sel.length) return { ...base, score: 0, status: 'unanswered', expected: k.correct };
    const truth = new Set(k.correct);
    const hit = sel.filter((x) => truth.has(x));
    const false_ = sel.filter((x) => !truth.has(x));
    const total = k.correct.reduce((s, x) => s + (k.weights[x] ?? 1), 0);
    // Weighted share of the applicable statements that were selected, minus the share of the non-applicable ones that were selected.
    const recall = total ? hit.reduce((s, x) => s + (k.weights[x] ?? 1), 0) / total : 0;
    const wrong = k.wrong ?? item.options?.map((o) => o.id).filter((id) => !truth.has(id)) ?? [];
    const universe = wrong.length ? wrong.length : false_.length;
    const falseRate = universe ? Math.min(1, false_.length / universe) : 0;
    const score = Math.max(0, recall - falseRate);
    const rounded = Math.round(score * 1000) / 1000;
    return {
      ...base, score: rounded, status: rounded === 1 ? 'correct' : rounded > 0 ? 'partial' : 'incorrect', expected: k.correct,
      detail: { recall, falseRate, missed: k.correct.filter((x) => !sel.includes(x)), extra: false_ },
    };
  }
  if (response === undefined || response === null || response === '') return { ...base, score: 0, status: 'unanswered', expected: k.correct };
  if (response === k.correct) return { ...base, score: 1, status: 'correct', expected: k.correct };
  // At a cut point of the 2022 scale the adjacent band is accepted in full, before the other equation's key and before partial credit.
  if (Array.isArray(k.also) && k.also.includes(response)) return { ...base, score: 1, status: 'correct', expected: k.correct };
  if (k.alt !== null && k.alt !== undefined && response === k.alt) return { ...base, score: 1, status: 'other-equation', expected: k.correct };
  const order = item.id === 'severity' ? SEVERITY_ORDER : item.id === 'gradeFev1' || item.id === 'gradeFvc' ? GRADE_ORDER : null;
  if (order && (adjacent(order, response, k.correct) || (k.alt && adjacent(order, response, k.alt)))) return { ...base, score: PARTIAL, status: 'partial', expected: k.correct };
  return { ...base, score: 0, status: 'incorrect', expected: k.correct };
}

/** @param {object[]} items @param {Record<string, string|string[]>} responses */
export const scoreCase = (items, responses) => items.map((it) => scoreItem(it, responses?.[it.id]));

/**
 * Totals, by skill and by case.
 * @param {{ items: object[], responses: Record<string, any> }[]} cases
 */
export function summarize(cases) {
  const bySkill = Object.fromEntries(SKILLS.map((s) => [s, { score: 0, max: 0, n: 0 }]));
  const perCase = cases.map(({ items, responses }) => {
    const scores = scoreCase(items, responses);
    let score = 0, max = 0;
    for (const s of scores) {
      score += s.score; max += s.max;
      const b = bySkill[s.skill];
      b.score += s.score; b.max += s.max; b.n += 1;
    }
    return { scores, score, max };
  });
  const total = perCase.reduce((s, c) => s + c.score, 0), max = perCase.reduce((s, c) => s + c.max, 0);
  return { perCase, bySkill, total, max, pct: max ? (100 * total) / max : 0 };
}
