import { GENERATOR_VERSION } from './standards.js';
import { createStream } from './prng.js';

/**
 * A case is a pure function of its descriptor. The URL carries the generator version, seed and
 * archetype, plus any field the user overrode; every other field is derived from the seed, so a
 * shared link reproduces the case exactly.
 */

export const ARCHETYPES = ['normal', 'obstruction', 'restriction', 'mixed', 'prism', 'low-dlco', 'obesity-low-erv', 'discordant-bd'];
export const TECHNIQUE_LEVELS = ['good', 'fair', 'poor'];
/** Requisition-style labels. Wording is a placeholder pending physician review. */
export const GROUP_LABELS = ['White', 'Black or African American', 'Asian: Northeast', 'Asian: Southeast', 'Other or mixed'];

const OVERRIDABLE = {
  age: [18, 85],
  heightCm: [140, 205],
  weightKg: [40, 200],
  hbGdl: [7, 19],
  severity: [1, 4],
};

/**
 * @typedef {object} Descriptor
 * @property {number} v @property {number} seed @property {string} archetype @property {number} severity
 * @property {string} technique @property {number} age @property {'M'|'F'} sex @property {number} heightCm
 * @property {number} weightKg @property {number} hbGdl @property {string} group
 */

/** Demographics from the "demographics" stream. Independent of physiology by construction. */
export function deriveDemographics(seed) {
  const rng = createStream(seed, 'demographics');
  const sex = rng.chance(0.5) ? 'M' : 'F';
  const age = Math.round(rng.range(18, 85));
  const height = Math.round((sex === 'M' ? 177 + 7 * rng.normal() : 163 + 6.5 * rng.normal()) * 2) / 2;
  const bmi = Math.exp(Math.log(27.5) + 0.2 * rng.normal());
  const weight = Math.round(bmi * (height / 100) ** 2);
  const hb = Math.round((sex === 'M' ? 14.8 + 1.1 * rng.normal() : 13.3 + 1.0 * rng.normal()) * 10) / 10;
  const group = GROUP_LABELS[rng.int(0, GROUP_LABELS.length - 1)];
  return {
    age,
    sex,
    heightCm: Math.min(Math.max(height, 140), 205),
    weightKg: Math.min(Math.max(weight, 40), 200),
    hbGdl: Math.min(Math.max(hb, 7), 19),
    group,
  };
}

/** @param {Partial<Descriptor> & { seed: number, archetype: string }} input @returns {Descriptor} */
export function resolveDescriptor(input) {
  if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
  if (!ARCHETYPES.includes(input.archetype)) throw new RangeError(`unknown archetype: ${input.archetype}`);
  const technique = input.technique ?? 'good';
  if (!TECHNIQUE_LEVELS.includes(technique)) throw new RangeError(`unknown technique: ${technique}`);
  const base = deriveDemographics(input.seed);
  const merged = { ...base, ...Object.fromEntries(Object.entries(input).filter(([k, v]) => k in base && v !== undefined)) };
  if (merged.sex !== 'M' && merged.sex !== 'F') throw new RangeError('sex must be M or F');
  if (!GROUP_LABELS.includes(merged.group)) throw new RangeError(`unknown group: ${merged.group}`);
  const severity = input.severity ?? 2;
  for (const [key, [lo, hi]] of Object.entries(OVERRIDABLE)) {
    const value = key === 'severity' ? severity : merged[key];
    if (!(value >= lo && value <= hi)) throw new RangeError(`${key} must be between ${lo} and ${hi}`);
  }
  return { v: input.v ?? GENERATOR_VERSION, seed: input.seed, archetype: input.archetype, severity, technique, ...merged };
}

const SHORT = { age: 'ag', sex: 'x', heightCm: 'h', weightKg: 'w', hbGdl: 'b', group: 'g', severity: 'sv', technique: 't' };

/** Query string holding the version, seed, archetype and only the fields that differ from the derived defaults. */
export function serializeDescriptor(d) {
  const base = deriveDemographics(d.seed);
  const p = new URLSearchParams({ v: String(d.v), s: String(d.seed), a: d.archetype });
  if (d.severity !== 2) p.set(SHORT.severity, String(d.severity));
  if (d.technique !== 'good') p.set(SHORT.technique, d.technique);
  for (const key of Object.keys(base)) if (d[key] !== base[key]) p.set(SHORT[key], String(d[key]));
  return p.toString();
}

/** @param {string} query @returns {Descriptor} */
export function parseDescriptor(query) {
  const p = new URLSearchParams(query);
  if (!p.has('s') || !p.has('a')) throw new RangeError('a case link needs a seed (s) and an archetype (a)');
  const v = Number(p.get('v'));
  if (v !== GENERATOR_VERSION) throw new RangeError(`this link was made with generator version ${p.get('v')}, which this build cannot reproduce`);
  const num = (k) => (p.has(k) ? Number(p.get(k)) : undefined);
  return resolveDescriptor({
    v,
    seed: Number(p.get('s')),
    archetype: p.get('a') ?? '',
    severity: num(SHORT.severity),
    technique: p.get(SHORT.technique) ?? undefined,
    age: num(SHORT.age),
    sex: p.get(SHORT.sex) ?? undefined,
    heightCm: num(SHORT.heightCm),
    weightKg: num(SHORT.weightKg),
    hbGdl: num(SHORT.hbGdl),
    group: p.get(SHORT.group) ?? undefined,
  });
}
