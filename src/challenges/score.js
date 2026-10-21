/**
 * Scoring of a challenge item against its key. Pure; the page holds the answers.
 */

const labelOf = (item, value, rowId) => {
  const opts = (rowId && item.rowOptions?.[rowId]) || item.options;
  return opts.find(([v]) => v === value)?.[1] ?? String(value);
};

function scoreRows(item, answer) {
  const given = answer && typeof answer === 'object' ? answer : {};
  const rows = item.rows.map((r) => {
    const a = given[r.id] ?? null;
    const right = a !== null && (a === item.key[r.id] || (item.alsoCorrect?.[r.id] ?? []).includes(a));
    const other = !right && a !== null && item.otherKey !== undefined && a === item.otherKey[r.id];
    return { row: r, answered: a !== null, right, other };
  });
  const answered = rows.filter((r) => r.answered).length;
  const total = rows.length;
  const wrongRows = rows.filter((r) => !r.right && !r.other);
  const correct = total - wrongRows.length;
  const wrong = wrongRows.map((r) => r.row.id);
  // Acceptability rows are `<variable>:<0-based maneuver index>`.
  const wrongManeuvers = [...new Set(wrong.map((id) => id.split(':')).filter(([, i]) => i !== undefined && /^\d+$/.test(i)).map(([, i]) => Number(i) + 1))].sort((a, b) => a - b);
  const perItem = { correct, total, fraction: total ? correct / total : 0, wrong, wrongManeuvers };
  if (answered === 0) return { status: 'unanswered', note: 'No answer was given.', perItem };
  if (!wrong.length) {
    const usedOther = rows.some((r) => r.other);
    return { status: usedOther ? 'other-equation' : 'correct', note: usedOther ? 'Every answer matches the key under one of the two spirometry equations.' : `All ${total} answers match the key.`, perItem };
  }
  const named = wrongRows.map((r) => r.row.label).join('; ');
  const unanswered = total - answered;
  return { status: 'wrong', note: `${correct} of ${total} answers match the key. Not matching${unanswered ? ` or not answered` : ''}: ${named}.`, perItem };
}

/**
 * @param {import('./index.js').Challenge} item
 * @param {string|Record<string, string>|null|undefined} answer
 * @returns {import('./index.js').ChallengeResult}
 */
export function scoreChallenge(item, answer) {
  if (item.rows) return scoreRows(item, answer);
  const a = typeof answer === 'string' && answer ? answer : null;
  if (a === null) return { status: 'unanswered', note: 'No answer was given.' };
  if (a === item.key || (item.alsoCorrect ?? []).includes(a)) return { status: 'correct', note: 'The answer matches the key.' };
  if (item.otherKey !== undefined && a === item.otherKey) return { status: 'other-equation', note: 'The answer matches the key under the other spirometry equation.' };
  return { status: 'wrong', note: `The key is “${labelOf(item, item.key)}”.` };
}
