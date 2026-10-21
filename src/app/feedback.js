/**
 * Feedback after the answers are checked, assembled from the structured questions (scoreAnswers), the challenge items
 * (scoreChallenge), the technologist's report (its truth, what it stated, and whether the details change an answer).
 * Pure functions of their arguments, so they run under node. The text is plain; render.js escapes it.
 *
 * Opening page 2 is never scored. The details line says what page 2 held for this case, and says so whether or not the page was opened.
 */
import { scoreAnswers, PRACTICE_QUESTIONS, questionLabel, label as answerLabel, OTHER_EQUATION_LABEL } from './answers.js';
import { GRADE_TEXT } from './explain.js';
import { answerFor, isMultiItem } from './collect.js';

/** @typedef {'correct'|'other-equation'|'incorrect'|'unanswered'} RowStatus */
/**
 * @typedef {object} FeedbackRow
 * @property {'structured'|'challenge'} kind
 * @property {string} id
 * @property {string} label
 * @property {string|null} answer the learner's answer in words, null when unanswered
 * @property {string} expected the key in words
 * @property {string|null} other the key under the other equation, when it differs
 * @property {RowStatus} status
 * @property {string} note short note (challenge items)
 * @property {string} why explanation of the key (challenge items that were not answered correctly)
 */

const STATUS_FROM_CHALLENGE = { correct: 'correct', wrong: 'incorrect', 'other-equation': 'other-equation', unanswered: 'unanswered' };

const optionLabel = (item, value) => item.options?.find(([v]) => v === value)?.[1] ?? String(value);
const listLabels = (item, values) => (values.length ? values.map((v) => optionLabel(item, v)).join('; ') : 'None selected');

/** The learner's answer and the key of a challenge item in words. */
function itemTexts(item, answer) {
  if (isMultiItem(item)) {
    const key = Array.isArray(item.key) ? item.key : [];
    return { answer: answer === null ? null : listLabels(item, answer), expected: listLabels(item, key) };
  }
  return { answer: answer === null || answer === '' ? null : optionLabel(item, answer), expected: item.key === null || item.key === undefined ? '—' : optionLabel(item, item.key) };
}

/**
 * @param {object} arg
 * @param {object} arg.caseData
 * @param {object} arg.interp interpretation under the displayed equation
 * @param {object} arg.interpOther interpretation under the other equation
 * @param {'GLIglobal'|'GLI2012'} arg.equation
 * @param {import('./collect.js').Responses} arg.responses
 * @param {object[]} [arg.items] challenge items
 * @param {Function|null} [arg.scoreChallenge]
 * @returns {{ rows: FeedbackRow[], matched: number, total: number }}
 */
export function scoreAll({ caseData, interp, interpOther, equation, responses, items = [], scoreChallenge = null }) {
  /** @type {FeedbackRow[]} */
  const rows = scoreAnswers(responses.structured, interp.key, interpOther.key, equation, PRACTICE_QUESTIONS).map((s) => ({
    kind: 'structured',
    id: s.id,
    label: questionLabel(caseData, PRACTICE_QUESTIONS.find((q) => q.id === s.id)),
    answer: s.answer ? answerLabel(s.id, s.answer) : null,
    expected: answerLabel(s.id, s.expected),
    other: s.other !== s.expected ? answerLabel(s.id, s.other) : null,
    status: s.status,
    note: s.status === 'other-equation' ? s.otherLabel : '',
    why: '',
  }));
  if (scoreChallenge) {
    for (const item of items) {
      const answer = answerFor(item, responses);
      let result;
      try { result = scoreChallenge(item, answer); } catch { result = { status: 'unanswered', note: '' }; }
      const status = /** @type {RowStatus} */ (STATUS_FROM_CHALLENGE[result?.status] ?? 'unanswered');
      const t = itemTexts(item, answer);
      rows.push({
        kind: 'challenge',
        id: item.id,
        label: item.title,
        answer: t.answer,
        expected: t.expected,
        other: null,
        status,
        note: status === 'other-equation' ? (result.note || OTHER_EQUATION_LABEL[equation === 'GLI2012' ? 'GLIglobal' : 'GLI2012']) : String(result?.note ?? ''),
        why: status === 'correct' ? '' : String(item.why ?? ''),
      });
    }
  }
  return { rows, matched: rows.filter((r) => r.status === 'correct' || r.status === 'other-equation').length, total: rows.length };
}

const HONESTY_NOTE = {
  accurate: '',
  software: 'The printed grades follow what software can detect (back-extrapolated volume, plateau, expiratory time and spread between maneuvers). A cough, glottic closure, a leak or variable effort can pass those checks, so a printed grade can sit over a flawed curve.',
  generic: 'The statement was general and named no grade, so it commits to nothing that the maneuvers could contradict.',
  optimistic: 'The statement described the test as better than the maneuvers earn.',
  pessimistic: 'The statement described the effort as poorer than the maneuvers earn.',
  stale: 'The statement carried text forward that does not describe this session.',
  silent: 'No quality statement was printed.',
};

const sub = (s) => s.replace(/FEV1/g, 'FEV₁');

/** Maneuvers that failed a criterion, from the evaluation stored on the case. */
function maneuverFailures(set, label) {
  const out = [];
  set.summary.evaluations.forEach((ev, i) => {
    for (const [k, name] of [['fev1', 'FEV₁'], ['fvc', 'FVC']]) {
      if (!ev[k].acceptable && ev[k].reasons?.length) out.push(`${label}, maneuver ${i + 1}, ${name}: ${ev[k].reasons.join('; ')}.`);
    }
  });
  return out;
}

function gradeLines(truthSet, set, label) {
  const lines = [`${label}: FEV₁ grade ${truthSet.fev1}, FVC grade ${truthSet.fvc}.`];
  for (const g of [...new Set([truthSet.fev1, truthSet.fvc])]) if (GRADE_TEXT[g]) lines.push(`Grade ${g} requires: ${GRADE_TEXT[g]}`);
  if (set) lines.push(...maneuverFailures(set, label));
  return lines;
}

/**
 * The quality section: the true grades with the criteria that failed, against what the technologist stated.
 * @param {object|null} rt RtReport
 * @param {object} caseData
 * @returns {{ lines: string[] }|null} null when there is no technologist's report
 */
export function qualityFeedback(rt, caseData) {
  if (!rt?.truth) return null;
  const t = rt.truth, st = rt.stated ?? {};
  const lines = [];
  lines.push(...gradeLines(t.pre, caseData.spirometry.pre, 'Before bronchodilator'));
  if (t.post && caseData.spirometry.post) lines.push(...gradeLines(t.post, caseData.spirometry.post, 'After bronchodilator'));
  const word = (b) => (b ? 'acceptable' : 'not acceptable');
  if (t.pleth) lines.push(`Plethysmography: ${word(t.pleth.acceptable)}${t.pleth.reasons?.length ? ` (${t.pleth.reasons.join('; ')})` : ''}.`);
  if (t.dlco) lines.push(`Diffusing capacity: ${word(t.dlco.acceptable)}${t.dlco.reasons?.length ? ` (${t.dlco.reasons.join('; ')})` : ''}.`);

  const stated = [];
  for (const [k, label, truthSet] of [['pre', 'Before bronchodilator', t.pre], ['post', 'After bronchodilator', t.post]]) {
    const s = st[k];
    if (!s || !truthSet) continue;
    stated.push(`${label}: FEV₁ grade ${s.fev1}, FVC grade ${s.fvc}`);
  }
  if (st.pleth) stated.push(`Plethysmography: ${st.pleth.replace('-', ' ')}`);
  if (st.dlco) stated.push(`Diffusing capacity: ${st.dlco.replace('-', ' ')}`);
  lines.push(stated.length ? `Stated by the technologist: ${stated.join('; ')}.` : (rt.qualityLines?.length ? 'The technologist’s statement named no grade.' : 'The technologist printed no quality statement.'));
  if (HONESTY_NOTE[rt.honesty]) lines.push(HONESTY_NOTE[rt.honesty]);
  return { lines: lines.map(sub) };
}

/**
 * The case-specific line about page 2. It states what the detailed report held for this case, whether or not the learner opened it.
 * @param {object|null} rt
 * @param {boolean} detailsOpened page 2 was opened before the answers were checked
 * @returns {string|null}
 */
export function detailsLine(rt, detailsOpened) {
  if (!rt || typeof rt.needsDetails !== 'boolean') return null;
  if (!rt.needsDetails) return 'Here the detailed report changes none of the answers above. The grade of any test rests on the maneuvers that page 2 lists, whether or not they alter the answers for a given case.';
  const reasons = (rt.detailsReasons ?? []).map((r) => String(r).replace(/[.\s]+$/, ''));
  const held = reasons.length ? reasons.join('; ') : 'findings that bear on the answers';
  return detailsOpened
    ? `Here the details held ${held}.`
    : `Here the details, which were not opened before the answers were checked, held ${held}.`;
}

/**
 * Everything the feedback section shows.
 * @returns {{ rows: FeedbackRow[], matched: number, total: number, quality: { lines: string[] }|null, detailsLine: string|null }}
 */
export function buildFeedback(args) {
  const s = scoreAll(args);
  return { ...s, quality: qualityFeedback(args.rt ?? null, args.caseData), detailsLine: detailsLine(args.rt ?? null, Boolean(args.detailsOpened)) };
}

/** Tally update for the session counter: items answered correctly (or matching the other equation) out of all items. */
export function addToTally(tally, feedback) {
  return { answered: tally.answered + 1, items: tally.items + feedback.total, matched: tally.matched + feedback.matched };
}
