/**
 * Exam codes and learner results codes.
 *
 * An exam code is a base64url token over compact JSON. Plain-text topic names never appear in it:
 * the archetype subset is a bitmask over ARCHETYPES and the skill topics are a bitmask over SKILLS.
 * Anyone can decode a code, so it is a convenience for sharing and not a security measure.
 *
 *   { v: code version, g: generator version, n: cases, s: exam seed, a: archetype mask, l: scenario level index,
 *     t: [good, fair, poor] weights, p: [full, spirometry] weights, m: time limit in minutes (0 = none),
 *     h: shuffle seed, e: spirometry equation index, k: skill mask }
 *
 * A results code is the same kind of token over { v, x: exam code, l: learner seed, nm: name, el: seconds, r: responses, c: checksum }.
 */
import { GENERATOR_VERSION } from '../core/standards.js';
import { ARCHETYPES } from '../core/descriptor.js';
import { createStream } from '../core/prng.js';
import { drawDescriptor, examArchetypes } from './mix.js';

export const CODE_VERSION = 1;
export const MAX_CASES = 40;
export const SCENARIO_LEVELS = ['none', 'light', 'moderate', 'heavy'];
export const EQUATIONS = ['GLIglobal', 'GLI2012'];
/** Skills scored in the rubric, in display order. */
export const SKILLS = ['pattern', 'severity', 'quality', 'bronchodilator', 'dlco', 'limitations', 'equation', 'synthesis'];
export const SKILL_LABELS = {
  pattern: 'Pattern', severity: 'Severity', quality: 'Quality grading', bronchodilator: 'Bronchodilator response', dlco: 'Diffusing capacity',
  limitations: 'Limitations', equation: 'Equation sensitivity', synthesis: 'Final interpretation',
};
export const TECHNIQUE_MIXES = {
  good: { label: 'Good technique only', weights: [100, 0, 0] },
  mostly: { label: 'Mostly good (60/30/10)', weights: [60, 30, 10] },
  balanced: { label: 'Balanced', weights: [34, 33, 33] },
  hard: { label: 'Challenging (20/40/40)', weights: [20, 40, 40] },
};
export const PANEL_MIXES = {
  full: { label: 'Spirometry, volumes and DLCO', weights: [100, 0] },
  mixed: { label: 'Mostly full (80/20)', weights: [80, 20] },
  spirometry: { label: 'Spirometry only', weights: [0, 100] },
};
/** Topic presets for the instructor form: a topic is a set of archetypes. */
export const TOPICS = {
  normal: { label: 'Normal and borderline values', archetypes: ['normal'] },
  obstruction: { label: 'Obstruction', archetypes: ['obstruction'] },
  restriction: { label: 'Restriction', archetypes: ['restriction-parenchymal', 'restriction-extraparenchymal'] },
  mixed: { label: 'Mixed and nonspecific patterns', archetypes: ['mixed', 'nonspecific'] },
  diffusion: { label: 'Diffusing capacity, anemia and obesity', archetypes: ['low-dlco', 'anemia', 'obesity-low-erv'] },
  bronchodilator: { label: 'Discordant bronchodilator response', archetypes: ['bd-discordant'] },
};

const toBytes = (s) => new TextEncoder().encode(s);
export function b64urlEncode(text) {
  const bytes = toBytes(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(token) {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new RangeError('malformed code');
  const padded = token.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (token.length % 4)) % 4);
  const bin = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary');
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Pulls a token out of a pasted code or link (the x parameter of a quiz link). */
export function extractToken(input) {
  const text = String(input ?? '').trim();
  if (!text) throw new RangeError('no code given');
  if (/^[A-Za-z0-9_-]+$/.test(text)) return text;
  try {
    const u = new URL(text, 'https://example.invalid/');
    const t = u.searchParams.get('x');
    if (t && /^[A-Za-z0-9_-]+$/.test(t)) return t;
  } catch { /* fall through */ }
  const m = text.match(/[?&]x=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  throw new RangeError('malformed code');
}

export const maskOf = (all, selected) => all.reduce((m, x, i) => (selected.includes(x) ? m | (1 << i) : m), 0);
export const fromMask = (all, mask) => all.filter((_, i) => mask & (1 << i));

const isUint32 = (x) => Number.isInteger(x) && x >= 0 && x <= 0xffffffff;
const isWeights = (w, len) => Array.isArray(w) && w.length === len && w.every((x) => Number.isInteger(x) && x >= 0 && x <= 100) && w.some((x) => x > 0);

/**
 * @typedef {object} ExamDef
 * @property {number} n @property {number} seed @property {string[]} archetypes @property {string} scenario
 * @property {number[]} technique @property {number[]} panel @property {number} timeLimit minutes, 0 for none
 * @property {number} shuffleSeed @property {'GLIglobal'|'GLI2012'} equation @property {string[]} skills
 */

/** @param {ExamDef} e */
export function validateExam(e) {
  if (!Number.isInteger(e.n) || e.n < 1 || e.n > MAX_CASES) throw new RangeError(`the number of cases must be between 1 and ${MAX_CASES}`);
  if (!isUint32(e.seed)) throw new RangeError('exam seed must be an unsigned 32-bit integer');
  if (!isUint32(e.shuffleSeed)) throw new RangeError('shuffle seed must be an unsigned 32-bit integer');
  if (!Array.isArray(e.archetypes) || !e.archetypes.length || !e.archetypes.every((a) => ARCHETYPES.includes(a))) throw new RangeError('select at least one topic');
  if (!SCENARIO_LEVELS.includes(e.scenario)) throw new RangeError('unknown scenario level');
  if (!isWeights(e.technique, 3)) throw new RangeError('invalid technique mix');
  if (!isWeights(e.panel, 2)) throw new RangeError('invalid panel mix');
  if (!Number.isInteger(e.timeLimit) || e.timeLimit < 0 || e.timeLimit > 300) throw new RangeError('time limit must be 0 to 300 minutes');
  if (!EQUATIONS.includes(e.equation)) throw new RangeError('unknown equation');
  if (!Array.isArray(e.skills) || !e.skills.length || !e.skills.every((s) => SKILLS.includes(s))) throw new RangeError('select at least one skill');
  return e;
}

/** @param {ExamDef} e @returns {string} */
export function encodeExam(e) {
  validateExam(e);
  const wire = {
    v: CODE_VERSION, g: GENERATOR_VERSION, n: e.n, s: e.seed, a: maskOf(ARCHETYPES, e.archetypes), l: SCENARIO_LEVELS.indexOf(e.scenario),
    t: e.technique, p: e.panel, m: e.timeLimit, h: e.shuffleSeed, e: EQUATIONS.indexOf(e.equation), k: maskOf(SKILLS, e.skills),
  };
  return b64urlEncode(JSON.stringify(wire));
}

/** @param {string} tokenOrLink @returns {ExamDef} */
export function decodeExam(tokenOrLink) {
  const token = extractToken(tokenOrLink);
  let w;
  try { w = JSON.parse(b64urlDecode(token)); } catch { throw new RangeError('this is not an exam code'); }
  if (!w || typeof w !== 'object' || w.v !== CODE_VERSION) throw new RangeError('this exam code was made by a different version of the quiz');
  if (w.g !== GENERATOR_VERSION) throw new RangeError(`this exam was made with generator version ${w.g}, which this build cannot reproduce`);
  const e = {
    n: w.n, seed: w.s, archetypes: fromMask(ARCHETYPES, w.a), scenario: SCENARIO_LEVELS[w.l], technique: w.t, panel: w.p,
    timeLimit: w.m, shuffleSeed: w.h, equation: EQUATIONS[w.e], skills: fromMask(SKILLS, w.k),
  };
  return validateExam(e);
}

/**
 * Descriptors of every case in an exam, a pure function of the exam definition.
 * @param {ExamDef} exam
 */
export function examDescriptors(exam) {
  const u = createStream(exam.seed, 'quiz-exam-draw');
  const archetypes = examArchetypes(exam.n, exam.archetypes, exam.seed, () => u.uniform());
  return archetypes.map((forceArchetype, i) => {
    const rng = createStream(exam.seed, `quiz-exam-case-${i}`);
    return drawDescriptor(() => rng.uniform(), { archetypes: exam.archetypes, technique: exam.technique, panel: exam.panel, scenario: exam.scenario, forceArchetype });
  });
}

/** FNV-1a checksum used to catch truncated or mistyped results codes. */
export function checksum(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/**
 * @typedef {object} Results
 * @property {string} exam exam code @property {number} learnerSeed @property {string} name
 * @property {number} elapsed seconds @property {Record<string, string|string[]>[]} responses one object per case in exam order, keyed by item id
 */
/** @param {Results} r */
export function encodeResults(r) {
  const body = { v: CODE_VERSION, x: r.exam, l: r.learnerSeed >>> 0, nm: String(r.name ?? '').slice(0, 60), el: Math.max(0, Math.round(r.elapsed ?? 0)), r: r.responses };
  const json = JSON.stringify(body);
  return b64urlEncode(JSON.stringify({ ...body, c: checksum(json) }));
}

/** @param {string} token @returns {Results} */
export function decodeResults(token) {
  const t = extractTokenLoose(token);
  let w;
  try { w = JSON.parse(b64urlDecode(t)); } catch { throw new RangeError('this is not a results code'); }
  if (!w || w.v !== CODE_VERSION || typeof w.x !== 'string' || !Array.isArray(w.r)) throw new RangeError('this is not a results code');
  const { c, ...body } = w;
  if (c !== checksum(JSON.stringify(body))) throw new RangeError('the results code is damaged or incomplete');
  return { exam: w.x, learnerSeed: w.l >>> 0, name: String(w.nm ?? ''), elapsed: Number(w.el) || 0, responses: w.r };
}
const extractTokenLoose = (s) => {
  const text = String(s ?? '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new RangeError('malformed results code');
  return text;
};

/** Splits pasted text holding any number of results codes. */
export const splitCodes = (text) => String(text ?? '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
