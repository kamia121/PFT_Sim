import { GENERATOR_VERSION } from './standards.js';
import { createStream } from './prng.js';

/**
 * A case is a pure function of its descriptor. The URL carries the generator version, seed and
 * archetype, plus any field the user overrode; every other field is derived from the seed, so a
 * shared link reproduces the case exactly.
 */

export const ARCHETYPES = ['normal', 'obstruction', 'restriction-parenchymal', 'restriction-extraparenchymal', 'mixed', 'nonspecific', 'low-dlco', 'anemia', 'obesity-low-erv', 'bd-discordant'];
/** Test panels: full adds lung volumes and diffusing capacity to spirometry. */
export const PANELS = ['full', 'spirometry'];
export const TECHNIQUE_LEVELS = ['good', 'fair', 'poor'];
/** Requisition-style labels. Wording is a placeholder pending physician review. */
export const GROUP_LABELS = ['White', 'Black or African American', 'Asian: Northeast', 'Asian: Southeast', 'Other or mixed'];

// Age stops at 80 because the GLI-2021 volume equations end there.
const OVERRIDABLE = {
  age: [18, 80],
  heightCm: [140, 205],
  weightKg: [40, 200],
  hbGdl: [7, 19],
  severity: [1, 3],
};

/**
 * @typedef {object} Descriptor
 * @property {number} v @property {number} seed @property {string} archetype @property {number} severity
 * @property {string} technique @property {number} age @property {'M'|'F'} sex @property {number} heightCm
 * @property {number} weightKg @property {number} hbGdl @property {string} group
 */

/**
 * Demographics from the "demographics" stream. The draws are fixed in number and order, so the
 * archetype changes only how BMI and hemoglobin are used, never the other fields.
 */
export function deriveDemographics(seed, archetype = 'normal') {
  const rng = createStream(seed, 'demographics');
  const sex = rng.chance(0.5) ? 'M' : 'F';
  const age = Math.round(rng.range(18, 80));
  const height = Math.round((sex === 'M' ? 177 + 7 * rng.normal() : 163 + 6.5 * rng.normal()) * 2) / 2;
  const bmiDraw = Math.exp(Math.log(27.5) + 0.2 * rng.normal());
  const hbDraw = Math.round((sex === 'M' ? 14.8 + 1.1 * rng.normal() : 13.3 + 1.0 * rng.normal()) * 10) / 10;
  const group = GROUP_LABELS[rng.int(0, GROUP_LABELS.length - 1)];
  const u1 = rng.uniform(), u2 = rng.uniform();
  const bmi = archetype === 'obesity-low-erv' ? 35 + 15 * u1 : bmiDraw;
  const hb = archetype === 'anemia' ? Math.round((7 + 2 * u2) * 10) / 10 : hbDraw;
  const weight = Math.round(bmi * (height / 100) ** 2);
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
  const base = deriveDemographics(input.seed, input.archetype);
  const merged = { ...base, ...Object.fromEntries(Object.entries(input).filter(([k, v]) => k in base && v !== undefined)) };
  if (merged.sex !== 'M' && merged.sex !== 'F') throw new RangeError('sex must be M or F');
  if (!GROUP_LABELS.includes(merged.group)) throw new RangeError(`unknown group: ${merged.group}`);
  const severity = input.severity ?? 2;
  for (const [key, [lo, hi]] of Object.entries(OVERRIDABLE)) {
    const value = key === 'severity' ? severity : merged[key];
    if (!(value >= lo && value <= hi)) throw new RangeError(`${key} must be between ${lo} and ${hi}`);
  }
  const panel = input.panel ?? 'full';
  if (!PANELS.includes(panel)) throw new RangeError(`unknown panel: ${panel}`);
  return { v: input.v ?? GENERATOR_VERSION, seed: input.seed, archetype: input.archetype, severity, technique, panel, ...merged };
}

const SHORT = { panel: 'p', age: 'ag', sex: 'x', heightCm: 'h', weightKg: 'w', hbGdl: 'b', group: 'g', severity: 'sv', technique: 't' };

/** Query string holding the version, seed, archetype and only the fields that differ from the derived defaults. */
export function serializeDescriptor(d) {
  const base = deriveDemographics(d.seed, d.archetype);
  const p = new URLSearchParams({ v: String(d.v), s: String(d.seed), a: d.archetype });
  if (d.severity !== 2) p.set(SHORT.severity, String(d.severity));
  if (d.technique !== 'good') p.set(SHORT.technique, d.technique);
  if (d.panel !== 'full') p.set(SHORT.panel, d.panel);
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
    panel: p.get(SHORT.panel) ?? undefined,
    age: num(SHORT.age),
    sex: p.get(SHORT.sex) ?? undefined,
    heightCm: num(SHORT.heightCm),
    weightKg: num(SHORT.weightKg),
    hbGdl: num(SHORT.hbGdl),
    group: p.get(SHORT.group) ?? undefined,
  });
}
