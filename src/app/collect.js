/**
 * Learner responses held by the practice page, and how a form control's change updates them. Structured questions and
 * challenge items use distinct field names, so that no challenge id can collide with a question id:
 *   structured question  name = question id          (radio)
 *   challenge item       name = `ch:` + item id        (radio, or checkboxes for an item with several answers)
 *   row of a row item    name = `ch:` + item id + `#` + row id  (radio; the item's answer is a map from row id to option value)
 *   free-text impression name = `impression`
 * Responses live only in the page.
 */

export const CHALLENGE_PREFIX = 'ch:';
export const IMPRESSION_FIELD = 'impression';
/** Separates the item id from the row id in the name of a row control (item ids hold no `#`; row ids such as `fev1:0` hold a colon). */
export const ROW_SEPARATOR = '#';

/** @typedef {{ structured: Record<string,string>, challenge: Record<string, string|string[]>, impression: string }} Responses */

/** @returns {Responses} */
export const emptyResponses = () => ({ structured: {}, challenge: {}, impression: '' });

/** Field name of a challenge item's controls. */
export const challengeField = (id) => `${CHALLENGE_PREFIX}${id}`;

/** Field name of one row's controls in a row item (per maneuver, per set, per question of a pair). */
export const challengeRowField = (id, rowId) => `${CHALLENGE_PREFIX}${id}${ROW_SEPARATOR}${rowId}`;

/** @param {string} name @returns {{ id: string, rowId: string|null }} the item id and, for a row control, the row id of a challenge field name */
function splitChallengeName(name) {
  const rest = name.slice(CHALLENGE_PREFIX.length);
  const i = rest.indexOf(ROW_SEPARATOR);
  return i < 0 ? { id: rest, rowId: null } : { id: rest.slice(0, i), rowId: rest.slice(i + 1) };
}

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
    const { id, rowId } = splitChallengeName(name);
    if (rowId !== null) {
      // A row control changes its own row only; the other rows of the item keep their answers.
      const held = responses.challenge[id];
      const map = held && typeof held === 'object' && !Array.isArray(held) ? held : {};
      return { ...responses, challenge: { ...responses.challenge, [id]: { ...map, [rowId]: value } } };
    }
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
    if (name.startsWith(CHALLENGE_PREFIX) && splitChallengeName(name).rowId !== null) { out = applyChange(out, { name, value }); continue; }
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

/** The answer to give `scoreChallenge` for an item: the stored value, an array for an item with several answers, a map from row id to value for a row item, or null when untouched. */
export function answerFor(item, responses) {
  const v = responses.challenge[item.id];
  if (v === undefined) return null;
  if (Array.isArray(item.rows)) return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  if (isMultiItem(item)) return Array.isArray(v) ? v : v ? [v] : [];
  return v;
}
