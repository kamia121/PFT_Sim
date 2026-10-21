/**
 * Learner responses held by the practice page, and how a form control's change updates them. Structured questions and
 * challenge items use distinct field names, so that no challenge id can collide with a question id:
 *   structured question  name = question id          (radio)
 *   challenge item       name = `ch:` + item id        (radio, or checkboxes for an item with several answers)
 *   free-text impression name = `impression`
 * Responses live only in the page.
 */

export const CHALLENGE_PREFIX = 'ch:';
export const IMPRESSION_FIELD = 'impression';

/** @typedef {{ structured: Record<string,string>, challenge: Record<string, string|string[]>, impression: string }} Responses */

/** @returns {Responses} */
export const emptyResponses = () => ({ structured: {}, challenge: {}, impression: '' });

/** Field name of a challenge item's controls. */
export const challengeField = (id) => `${CHALLENGE_PREFIX}${id}`;

/**
 * An item has several answers (one checkbox per option) when it says so, or when its key is a list.
 * The challenge module's typedef does not name this, so all three spellings are accepted.
 * @param {{ multi?: boolean, type?: string, key?: unknown }} item
 */
export const isMultiItem = (item) => item?.multi === true || item?.type === 'multi' || item?.type === 'checkbox' || Array.isArray(item?.key);

/**
 * The item that asks whether the technologist's statement agrees with the maneuvers. It cannot be answered before the statement
 * is shown, so it follows the statement (the quality challenge) or is shown from the start (challenge off).
 * @param {{ id?: string, stage?: number, needsStatement?: boolean }} item
 */
export const isStatementItem = (item) => item?.needsStatement === true || item?.stage === 2 || /consisten|statement/i.test(String(item?.id ?? ''));

/**
 * Apply one control's change to the responses and return new responses.
 * @param {Responses} responses
 * @param {{ name: string, type?: string, value?: string, checkedValues?: string[] }} change checkedValues: the values now checked in the same group, for a checkbox
 * @returns {Responses}
 */
export function applyChange(responses, { name, type = 'radio', value = '', checkedValues = [] }) {
  if (name === IMPRESSION_FIELD) return { ...responses, impression: String(value) };
  if (name.startsWith(CHALLENGE_PREFIX)) {
    const id = name.slice(CHALLENGE_PREFIX.length);
    return { ...responses, challenge: { ...responses.challenge, [id]: type === 'checkbox' ? [...checkedValues] : value } };
  }
  return { ...responses, structured: { ...responses.structured, [name]: value } };
}

/**
 * Responses read from submitted entries, for pages that give the entries of a form (name, value pairs). Several entries with one name
 * are the checked boxes of a group.
 * @param {Iterable<[string, string]>} entries
 * @param {Responses} [base]
 * @returns {Responses}
 */
export function collectEntries(entries, base = emptyResponses()) {
  let out = { ...base, structured: { ...base.structured }, challenge: { ...base.challenge } };
  const groups = new Map();
  for (const [name, value] of entries) {
    if (name.startsWith(CHALLENGE_PREFIX) && groups.has(name)) { groups.get(name).push(value); continue; }
    if (name.startsWith(CHALLENGE_PREFIX)) groups.set(name, [value]);
    else out = applyChange(out, { name, value });
  }
  for (const [name, values] of groups) {
    const id = name.slice(CHALLENGE_PREFIX.length);
    out.challenge[id] = values.length === 1 ? values[0] : values;
  }
  return out;
}

/** The answer to give `scoreChallenge` for an item: the stored value, an array for an item with several answers, or null when untouched. */
export function answerFor(item, responses) {
  const v = responses.challenge[item.id];
  if (v === undefined) return null;
  if (isMultiItem(item)) return Array.isArray(v) ? v : v ? [v] : [];
  return v;
}
