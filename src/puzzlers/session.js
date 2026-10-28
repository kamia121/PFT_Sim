/** Authored progressive cases. No generator or reference calculation is performed here. */
import { CLAIMS } from './sources.js';
const copy = (value) => structuredClone(value);
const forbidden = new Set(['predicted', 'lln', 'uln', 'z', 'pctPred', 'percentPredicted']);
function rejectDerived(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (forbidden.has(key)) throw new TypeError('Do not author numerical reference outputs');
    rejectDerived(item);
  }
}
const freeze = (value) => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

/** Validate authoring mistakes early; questions have one explicit accepted set and no inferred diagnoses. */
export function definePuzzler(input) {
  const c = copy(input);
  rejectDerived(c);
  if (!c.id || !Number.isInteger(c.version) || c.version < 1 || !c.stages?.length) throw new TypeError('Invalid authored case');
  if (!c.title || !c.intro || !c.measurements?.length || !c.sources?.length) throw new TypeError('Missing case content');
  for (const m of c.measurements) if (!m.label || !m.unit || !Number.isFinite(m.value)) throw new TypeError('Measurements require finite values and units');
  const ids = new Set();
  for (const stage of c.stages) {
    if (!stage.reveal || !stage.question?.id) throw new TypeError('Each stage needs a reveal and question');
    const q = stage.question;
    if (ids.has(q.id)) throw new TypeError('Duplicate question');
    ids.add(q.id);
    if (!['metadata', 'uncertainty', 'interpretation'].includes(q.domain)) throw new TypeError('Unknown scoring domain');
    if (!q.claims?.length || q.claims.some((id) => !CLAIMS[id])) throw new TypeError('Question needs known source claims');
    const opts = q.options?.map(([id]) => id) ?? [];
    if (opts.length < 2 || new Set(opts).size !== opts.length || !q.accepted?.length || q.accepted.some((id) => !opts.includes(id)) || !q.why) throw new TypeError('Invalid question key/options');
  }
  return freeze(c);
}

export function startPuzzler(c) {
  return freeze({ caseId: c.id, version: c.version, stage: 0, answers: [] });
}

function assertSession(c, state) {
  if (state.caseId !== c.id || state.version !== c.version || !Number.isInteger(state.stage) || state.stage < 0 || state.stage >= c.stages.length) throw new RangeError('Case/session mismatch');
  if (!Array.isArray(state.answers) || state.answers.length < state.stage || state.answers.length > state.stage + 1) throw new RangeError('Invalid stage history');
  state.answers.forEach((answer, i) => {
    if (!c.stages[i].question.options.some(([id]) => id === answer)) throw new RangeError('Unknown answer in history');
  });
}

/** Learner projection excludes all future disclosures, keys and unreleased explanations. */
export function puzzlerView(c, state) {
  assertSession(c, state);
  const answered = state.answers.length > state.stage;
  const { question } = c.stages[state.stage];
  const { accepted, why, claims, ...publicQuestion } = question;
  const scored = claims.every((id) => CLAIMS[id].state === 'verified-primary');
  const feedback = answered ? { scored, correct: scored ? accepted.includes(state.answers[state.stage]) : null, why, answer: state.answers[state.stage], evidence: claims.map((id) => ({ id, ...CLAIMS[id] })) } : null;
  const complete = answered && state.stage === c.stages.length - 1;
  return freeze(copy({ id: c.id, title: c.title, intro: c.intro, measurements: c.measurements,
    stage: state.stage + 1, stageCount: c.stages.length, reveals: c.stages.slice(0, state.stage + 1).map((s) => s.reveal),
    question: publicQuestion, feedback, complete, sources: answered ? c.sources : [],
    scores: complete ? Object.fromEntries(['metadata', 'uncertainty', 'interpretation'].map((domain) => {
      const all = c.stages.flatMap((s, i) => s.question.domain === domain ? [i] : []);
      const indices = all.filter((i) => c.stages[i].question.claims.every((id) => CLAIMS[id].state === 'verified-primary'));
      return [domain, { correct: indices.filter((i) => c.stages[i].question.accepted.includes(state.answers[i])).length, total: indices.length, unscored: all.length - indices.length }];
    })) : null,
  }));
}

export function answerPuzzler(c, state, answer) {
  assertSession(c, state);
  if (state.answers.length !== state.stage) throw new RangeError('Stage already answered');
  if (!c.stages[state.stage].question.options.some(([id]) => id === answer)) throw new RangeError('Unknown answer');
  return freeze({ ...state, answers: [...state.answers, answer] });
}

export function advancePuzzler(c, state) {
  assertSession(c, state);
  if (state.answers.length !== state.stage + 1 || state.stage === c.stages.length - 1) throw new RangeError('Cannot advance');
  return freeze({ ...state, stage: state.stage + 1 });
}
