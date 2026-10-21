/**
 * Questions for one case. Everything is generated from the engine key and the case, then shuffled.
 *
 * An item carries a `key` (never rendered before submission) and an `explain` payload. publicItem()
 * returns the part safe to show. Options of the generated items (limitations, final interpretation,
 * equation sensitivity) get opaque ids `o1..on` assigned after a seeded shuffle, so no id reveals
 * whether an option is correct; the categorical items use their semantic ids as the learner page does.
 */
import { QUESTIONS, hasData, scoreAnswers } from '../app/answers.js';
import { createStream } from '../core/prng.js';
import { shuffled, pick } from './shuffle.js';
import { narrativeFor } from './adapters.js';
import { fallbackCaveats, fallbackDistractors, claimsFrom, renderClaims } from './fallbacks.js';
import { analyzeSensitivity, CANDIDATE_LABELS } from './sensitivity.js';
import { SKILLS } from './codes.js';
import { otherEquation } from './prepare.js';
import { hbKnown } from '../app/format.js';

export const ITEM_ORDER = ['pattern', 'severity', 'gradeFev1', 'gradeFvc', 'bronchodilator', 'dlco', 'limitations', 'final', 'sensitivity'];
export const SKILL_OF = {
  pattern: 'pattern', severity: 'severity', gradeFev1: 'quality', gradeFvc: 'quality', bronchodilator: 'bronchodilator', dlco: 'dlco',
  limitations: 'limitations', final: 'synthesis', sensitivity: 'equation',
};
export const ITEM_NAMES = {
  pattern: 'Pattern', severity: 'Severity', gradeFev1: 'FEV₁ grade', gradeFvc: 'FVC grade', bronchodilator: 'Bronchodilator', dlco: 'DLCO',
  limitations: 'Limitations', final: 'Final interpretation', sensitivity: 'Equation sensitivity',
};

const STEMS = {
  pattern: ['Which pattern does this report show?', 'What is the physiological pattern on this report?', 'How should the pattern be classified?'],
  severity: ['What is the severity of airflow obstruction, graded from the FEV₁ z-score?', 'Grade the obstruction by the FEV₁ z-score.'],
  gradeFev1: ['What is the quality grade of the FEV₁?', 'Which grade does the FEV₁ earn from the maneuver set?'],
  gradeFvc: ['What is the quality grade of the FVC?', 'Which grade does the FVC earn from the maneuver set?'],
  bronchodilator: ['Is the bronchodilator response significant under the 2022 rule?', 'Under the 2022 criterion, how is the bronchodilator response classified?'],
  dlco: ['How is the hemoglobin-adjusted diffusing capacity classified?', 'What does the hemoglobin-adjusted DLCO show?'],
  dlcoNoHb: ['No hemoglobin was available, so the DLCO is not adjusted. How is the diffusing capacity classified?', 'How is the unadjusted diffusing capacity classified, given that no hemoglobin was available?'],
  limitations: ['Which statements limit or qualify this interpretation? Select all that apply.'],
  final: ['Which final interpretation is most appropriate?', 'Which summary statement best states the interpretation?'],
  sensitivity: ['Which reference equation or input assumption most affects this result?'],
};

/** Equivalent phrasings of option labels; the key uses the id, so wording is cosmetic. */
const LABELS = {
  pattern: {
    normal: ['Normal', 'Within normal limits'],
    obstruction: ['Obstruction', 'Obstructive ventilatory pattern'],
    restriction: ['Restriction', 'Restrictive ventilatory pattern'],
    mixed: ['Mixed obstruction and restriction', 'Combined obstructive and restrictive pattern'],
  },
  bronchodilator: { significant: ['Significant', 'Significant response'], 'not-significant': ['Not significant', 'No significant response'] },
  dlco: { reduced: ['Reduced', 'Below the lower limit'], raised: ['Raised', 'Above the upper limit'] },
};

const GRADE_ORDER = ['A', 'B', 'C', 'D', 'E'];
const SEVERITY_ORDER = ['fev1-normal', 'mild', 'moderate', 'severe'];
export const NONE_ID = 'none';
export const NONE_LABEL = 'None of these statements applies.';

const lbl = (qid, id, canonical, seed) => {
  const v = LABELS[qid]?.[id];
  return v ? pick(v, seed, `quiz-label-${qid}-${id}`) : canonical;
};

function categorical(prep, qid, seed) {
  const q = QUESTIONS.find((x) => x.id === qid);
  const scored = scoreAnswers({}, prep.a.key, prep.b.key).find((s) => s.id === qid);
  let options = q.options.map(([id, label]) => ({ id, label: lbl(qid, id, label, seed) }));
  if (qid === 'pattern') options = options.concat([{ id: 'indeterminate', label: 'Not interpretable (no usable maneuver)' }]);
  if (qid === 'bronchodilator' || qid === 'dlco') options = options.filter((o) => o.id !== 'not-done');
  return {
    id: qid, skill: SKILL_OF[qid], type: 'single', ordered: qid === 'severity' || qid === 'gradeFev1' || qid === 'gradeFvc',
    stem: pick(qid === 'dlco' && !hbKnown(prep.caseData.dlco) ? STEMS.dlcoNoHb : STEMS[qid], seed, `quiz-stem-${qid}`), options,
    key: { correct: scored.expected, alt: scored.other !== scored.expected ? scored.other : null, altEquation: otherEquation(prep.equation) },
    explain: { kind: qid },
  };
}

/** Assigns opaque ids to entries after a seeded shuffle; entries with `fixedLast` keep the id NONE_ID and stay last. */
function opaque(entries, seed, name) {
  const fixed = entries.filter((e) => e.fixedLast);
  const rest = shuffled(entries.filter((e) => !e.fixedLast), seed, name);
  return rest.map((e, i) => ({ ...e, id: `o${i + 1}` })).concat(fixed.map((e) => ({ ...e, id: NONE_ID })));
}

/** Scenario caveat ids and the built-in subject each one covers, so a subject is not offered both as a true statement and as a distractor. */
export const SCENARIO_TOPIC = {
  'volumes-dlco-european-only': 'european', 'anemia-dlco-adjusted': 'hemoglobin', 'hb-missing-dlco-unadjusted': 'hemoglobin',
  'early-termination-fvc-low': 'early', 'cough-first-second': 'cough', 'slow-start-bev-fev1-unusable': 'slow', 'variable-effort-grade': 'variable',
  'bd-effort-artifact': 'bd', 'post-bd-set-small': 'bd', 'bd-timing-short': 'bd', 'obesity-low-erv-not-restriction': 'erv', 'dlco-low-vi': 'vi', 'glottic-closure-fvc': 'glottic',
  'saba-baseline-raised': 'medication', 'laba-baseline-raised': 'medication', 'lama-baseline-raised': 'medication', 'on-treatment-context': 'medication',
  'smoking-acute-airflow': 'smoke', 'vaping-acute-airway-irritation': 'smoke',
  'kyphoscoliosis-standing-height': 'height', 'height-estimated-armspan-error': 'height', 'height-estimated-ulna-error': 'height', 'chart-height-too-tall': 'height', 'height-method-stated': 'height', 'armspan-ratio-sources-differ': 'height', 'halfspan-less-precise': 'height', 'height-ulna-measurement': 'height',
  'sex-birth-used-default': 'sex', 'sex-evidence-limited': 'sex', 'sex-identity-used-nondefault': 'sex', 'sex-default-applied': 'sex', 'sex-choice-no-change': 'sex',
};

/** A long scenario caveat is shortened to its first sentence, so the true options are not systematically longer than the distractors. */
export function shortCaveat(text) {
  const t = String(text).trim();
  if (t.length <= 190) return t;
  const first = t.match(/^.*?[.!?](?=\s|$)/)?.[0];
  return first && first.length >= 70 ? first : t;
}

/**
 * The limitations item. The true statements are the scenario caveats and the built-in rules that apply to the case. The distractors are
 * built-in statements that are true in general and are irrelevant here because a stated fact of the case is absent; their length is matched
 * to the true statements, so neither length nor wording separates the two groups. Scenario decoy caveats are not used: they are assertions
 * about this case that are false, and they differ from the true statements in length and in wording.
 */
function limitationsItem(prep, seed) {
  const sc = prep.caseData.scenario;
  const fb = fallbackCaveats(prep);
  const scenarioTrue = Array.isArray(sc?.caveats) ? sc.caveats.filter((x) => x && x.text).map((x) => ({ ...x, text: shortCaveat(x.text), topic: SCENARIO_TOPIC[x.id] ?? x.id })) : [];
  const weight = (x) => (x.weight === 'major' ? 2 : 1);
  const scenarioTopics = new Set(scenarioTrue.map((x) => x.topic));
  const truths = [...scenarioTrue, ...fb.caveats.filter((x) => !scenarioTopics.has(x.topic))].sort((p, q) => weight(q) - weight(p)).slice(0, 5);
  const liveTopics = new Set([...truths.map((t) => t.topic), ...scenarioTopics]);
  const trueTexts = new Set(truths.map((t) => t.text));
  const pool = fb.decoyCaveats.filter((d) => !liveTopics.has(d.topic) && !trueTexts.has(d.text));
  const target = truths.length ? truths.reduce((t, x) => t + x.text.length, 0) / truths.length : 170;
  const want = Math.max(3, 6 - truths.length);
  const nearest = shuffled(pool, seed, 'quiz-decoy-pick').sort((p, q) => Math.abs(p.text.length - target) - Math.abs(q.text.length - target)).slice(0, want * 2);
  const decoys = shuffled(nearest, seed, 'quiz-decoy-select').slice(0, want);
  const entries = [
    ...truths.map((t) => ({ sem: t.id, text: t.text, truth: true, weight: weight(t) })),
    ...decoys.map((d) => ({ sem: d.id, text: d.text, truth: false, why: d.why ?? null })),
    { sem: NONE_ID, text: NONE_LABEL, truth: truths.length === 0, weight: 1, fixedLast: true },
  ];
  const opts = opaque(entries, seed, 'quiz-optid-limitations');
  const weights = {};
  for (const o of opts) if (o.truth) weights[o.id] = o.weight;
  return {
    id: 'limitations', skill: 'limitations', type: 'multi', stem: STEMS.limitations[0],
    options: opts.map((o) => ({ id: o.id, label: o.text, fixedLast: Boolean(o.fixedLast) })),
    key: { correct: opts.filter((o) => o.truth).map((o) => o.id), weights, wrong: opts.filter((o) => !o.truth).map((o) => o.id) },
    explain: { kind: 'limitations', options: opts.map((o) => ({ id: o.id, text: o.text, truth: o.truth, weight: o.weight ?? null, why: o.why ?? null })) },
  };
}

/** What each narrative flaw means, in words a learner reads after answering. */
export const FLAW_TEXT = {
  'wrong-severity': 'States a severity band that the FEV₁ z-score does not support.',
  'wrong-pattern': 'Asserts a pattern that the values do not show.',
  'restriction-without-tlc': 'Asserts restriction or mixed disease without a measured TLC, which defines restriction.',
  'ignores-quality': 'Calls the session adequate although a quality grade is D or poorer.',
  'ignores-equation-change': 'States that the classification is the same under both reference equations although it changes between them.',
  'wrong-bronchodilator-rule': 'Reports the result of the earlier criterion under the 2022 criterion although the two criteria disagree.',
  'reads-percent-predicted-as-normal-range': 'Classifies by percent of predicted against a fixed 80% line instead of the lower limit of normal.',
  'dlco-unadjusted-for-hb': 'Classifies the DLCO without the hemoglobin adjustment.',
  'over-diagnoses': 'Names or excludes a disease, which lung function alone cannot establish.',
};

/**
 * Three distractors whose length is close to the correct statement's, one per kind of error where possible. A rank is drawn at random
 * (0 to 3 distractors longer than the correct statement), so the correct statement is the longest, the shortest or in between with equal
 * probability when the candidates allow it, and neither "the longest" nor "the one in the middle" is a rule. Within each side the nearest
 * length bands are used and the choice inside a band is random.
 */
export function pickDistractors(correct, candidates, seed, n = 3) {
  const band = Math.max(8, 0.05 * correct.length);
  const seen = new Set([correct]);
  const uniq = shuffled(candidates, seed, 'quiz-distractor-pick').filter((d) => (seen.has(d.text) ? false : (seen.add(d.text), true)));
  const near = (d) => Math.floor(Math.abs(d.text.length - correct.length) / band);
  const longer = uniq.filter((d) => d.text.length > correct.length), shorter = uniq.filter((d) => d.text.length <= correct.length);
  const order = (list) => list.map((d, i) => ({ d, i })).sort((x, y) => near(x.d) - near(y.d) || x.i - y.i).map((x) => x.d);
  const rank = createStream(seed >>> 0, 'quiz-final-length-rank').int(0, n);
  const picked = [], kinds = new Set();
  const take = (list, count, distinct) => {
    for (const d of list) { if (count <= 0) break; if (picked.includes(d) || (distinct && kinds.has(d.kind))) continue; picked.push(d); kinds.add(d.kind); count--; }
    return count;
  };
  const L = order(longer), S = order(shorter);
  let needL = take(L, rank, true), needS = take(S, n - rank, true);
  needL = take(L, needL, false); needS = take(S, needS, false);
  take(order(uniq), n - picked.length, false);
  return picked;
}

function finalItem(prep, ctx, seed) {
  const c = prep.caseData;
  const variant = createStream(seed, 'quiz-narr-variant').int(0, 1);
  // The scenario limitations are asked in the limitations item, so the final statements leave them out.
  const narr = narrativeFor(ctx.adapters, { caseData: c, interp: prep.a, cmp: prep.cmp, seed: c.descriptor.seed, finalCaveats: false });
  let correct, pool, source;
  if (narr) { correct = narr.finalStatement; pool = narr.distractors.map((d) => ({ text: d.text, flaw: FLAW_TEXT[d.flaw] ?? d.flaw ?? 'This statement contains a flaw.', kind: d.flaw ?? d.id })); source = 'narrative'; }
  else { correct = renderClaims(claimsFrom(prep), variant); pool = []; source = 'fallback'; }
  const fbPool = fallbackDistractors(prep, variant).map((d) => ({ text: d.text, flaw: d.flaw, kind: d.id }));
  const picked = pickDistractors(correct, [...pool, ...fbPool], seed);
  const entries = [{ text: correct, truth: true, flaw: null }, ...picked.map((d) => ({ text: d.text, truth: false, flaw: d.flaw }))];
  const opts = opaque(entries, seed, 'quiz-optid-final');
  return {
    id: 'final', skill: 'synthesis', type: 'single', stem: pick(STEMS.final, seed, 'quiz-stem-final'),
    options: opts.map((o) => ({ id: o.id, label: o.text })),
    key: { correct: opts.find((o) => o.truth).id, alt: null },
    explain: { kind: 'final', source, options: opts.map((o) => ({ id: o.id, text: o.text, truth: o.truth, flaw: o.flaw })) },
  };
}

function sensitivityItem(prep, ctx, seed) {
  const an = analyzeSensitivity(prep, ctx);
  if (!an.eligible) return null;
  const others = shuffled(an.distractors, seed, 'quiz-sens-pick').slice(0, 3);
  const entries = [an.correct, ...others].map((id) => ({ sem: id, text: CANDIDATE_LABELS[id], truth: id === an.correct }));
  const opts = opaque(entries, seed, 'quiz-optid-sensitivity');
  return {
    id: 'sensitivity', skill: 'equation', type: 'single', stem: STEMS.sensitivity[0],
    options: opts.map((o) => ({ id: o.id, label: o.text })),
    key: { correct: opts.find((o) => o.truth).id, alt: null },
    explain: { kind: 'sensitivity', correctSem: an.correct, candidates: an.candidates, options: opts.map((o) => ({ id: o.id, sem: o.sem, text: o.text, truth: o.truth })) },
  };
}

/**
 * @param {ReturnType<import('./prepare.js').prepareCase>} prep
 * @param {import('./prepare.js').QuizContext} ctx
 * @returns {object[]} items in ITEM_ORDER, restricted to the skills in ctx.skills
 */
export function buildItems(prep, ctx) {
  const skills = ctx.skills ?? SKILLS;
  const c = prep.caseData;
  const seed = c.descriptor.seed;
  const out = [];
  const want = (id) => skills.includes(SKILL_OF[id]);
  if (want('pattern')) out.push(categorical(prep, 'pattern', seed));
  // Severity is scored only for obstructive patterns; the engine leaves it unscored for mixed disease, so that item is omitted.
  if (want('severity') && !['mixed', 'indeterminate'].includes(prep.a.pattern)) out.push(categorical(prep, 'severity', seed));
  if (want('gradeFev1')) out.push(categorical(prep, 'gradeFev1', seed));
  if (want('gradeFvc')) out.push(categorical(prep, 'gradeFvc', seed));
  if (want('bronchodilator') && hasData(c, 'bronchodilator')) out.push(categorical(prep, 'bronchodilator', seed));
  if (want('dlco') && hasData(c, 'dlco')) out.push(categorical(prep, 'dlco', seed));
  if (want('limitations')) out.push(limitationsItem(prep, seed));
  if (want('final')) out.push(finalItem(prep, ctx, seed));
  if (want('sensitivity')) { const s = sensitivityItem(prep, ctx, seed); if (s) out.push(s); }
  return out;
}

/** The part of an item that may be rendered before submission: no key, no explanation payload. */
export const publicItem = ({ id, skill, type, stem, options, ordered }) => ({ id, skill, type, stem, ordered: Boolean(ordered), options: options.map(({ id: oid, label, fixedLast }) => ({ id: oid, label, fixedLast: Boolean(fixedLast) })) });

/** Options in display order for one learner (or for the printed sheet, with learner seed 0). */
export function displayOptions(item, orderSeed, caseIndex) {
  if (item.ordered) return item.options.slice(); // ordinal scales keep their natural order; the letter or band is the content
  const movable = item.options.filter((o) => !o.fixedLast);
  const fixed = item.options.filter((o) => o.fixedLast);
  return shuffled(movable, orderSeed, `quiz-shuffle-${caseIndex}-${item.id}`).concat(fixed);
}

export { GRADE_ORDER, SEVERITY_ORDER };
