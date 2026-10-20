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
const SEVERITY_ORDER = ['mild', 'moderate', 'severe'];
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
    id: qid, skill: SKILL_OF[qid], type: 'single', ordered: qid === 'severity' || qid === 'gradeFev1' || qid === 'gradeFvc', stem: pick(STEMS[qid], seed, `quiz-stem-${qid}`), options,
    key: { correct: scored.expected, alt: scored.other !== scored.expected ? scored.other : null },
    explain: { kind: qid },
  };
}

/** Assigns opaque ids to entries after a seeded shuffle; entries with `fixedLast` keep the id NONE_ID and stay last. */
function opaque(entries, seed, name) {
  const fixed = entries.filter((e) => e.fixedLast);
  const rest = shuffled(entries.filter((e) => !e.fixedLast), seed, name);
  return rest.map((e, i) => ({ ...e, id: `o${i + 1}` })).concat(fixed.map((e) => ({ ...e, id: NONE_ID })));
}

function limitationsItem(prep, seed) {
  const sc = prep.caseData.scenario;
  const fb = fallbackCaveats(prep);
  const scenarioTrue = Array.isArray(sc?.caveats) ? sc.caveats.filter((x) => x && x.text) : [];
  const scenarioDecoys = Array.isArray(sc?.decoyCaveats) ? sc.decoyCaveats.filter((x) => x && x.text) : [];
  const weight = (x) => (x.weight === 'major' ? 2 : 1);
  const truths = [...scenarioTrue, ...fb.caveats].sort((p, q) => weight(q) - weight(p)).slice(0, 5);
  const trueTexts = new Set(truths.map((t) => t.text));
  const decoyPool = [...scenarioDecoys, ...fb.decoyCaveats].filter((d) => !trueTexts.has(d.text));
  const want = Math.max(3, 6 - truths.length);
  const decoys = shuffled(decoyPool, seed, 'quiz-decoy-pick').slice(0, want);
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
    key: { correct: opts.filter((o) => o.truth).map((o) => o.id), weights },
    explain: { kind: 'limitations', options: opts.map((o) => ({ id: o.id, text: o.text, truth: o.truth, weight: o.weight ?? null, why: o.why ?? null })) },
  };
}

function finalItem(prep, ctx, seed) {
  const c = prep.caseData;
  const variant = createStream(seed, 'quiz-narr-variant').int(0, 1);
  const narr = narrativeFor(ctx.adapters, { caseData: c, interp: prep.a, cmp: prep.cmp, seed: c.descriptor.seed });
  let correct, pool, source;
  if (narr) { correct = narr.finalStatement; pool = narr.distractors.map((d) => ({ text: d.text, flaw: d.flaw ?? 'This statement contains a flaw.' })); source = 'narrative'; }
  else { correct = renderClaims(claimsFrom(prep), variant); pool = []; source = 'fallback'; }
  const fbPool = fallbackDistractors(prep, variant).map((d) => ({ text: d.text, flaw: d.flaw }));
  // The narrative module's distractors come first; the built-in ones top the set up to three.
  const seen = new Set([correct]);
  const picked = [];
  for (const d of [...shuffled(pool, seed, 'quiz-distractor-pick'), ...shuffled(fbPool, seed, 'quiz-distractor-pick-fb')]) {
    if (picked.length >= 3) break;
    if (seen.has(d.text)) continue;
    seen.add(d.text);
    picked.push(d);
  }
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
