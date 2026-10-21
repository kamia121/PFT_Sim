import { GENERATOR_VERSION } from './standards.js';
import { createStream } from './prng.js';
import { isScenarioId } from '../scenarios/library.js';

/**
 * A case is a pure function of its descriptor. The URL carries the generator version, seed and
 * archetype, plus any field the user overrode; every other field is derived from the seed, so a
 * shared link reproduces the case exactly.
 */

export const ARCHETYPES = ['normal', 'obstruction', 'restriction-parenchymal', 'restriction-extraparenchymal', 'mixed', 'nonspecific', 'low-dlco', 'anemia', 'obesity-low-erv', 'bd-discordant'];
/** Test panels: full adds lung volumes and diffusing capacity to spirometry. */
export const PANELS = ['full', 'spirometry'];
export const TECHNIQUE_LEVELS = ['good', 'fair', 'poor'];
/**
 * Scenario levels: none (a plain case, byte-identical to cases made before the scenario layer), then 1, 2, and 3 or 4
 * encounter scenarios (src/scenarios). The keys `sc` (level) and `si` (comma-separated explicit scenario ids) are
 * optional additions to the link: the generator version stays 1 because a link without them reproduces exactly the
 * case it always did. Explicit ids are always applied, and the level is the target for the total count.
 */
export const SCENARIO_LEVELS = ['none', 'light', 'moderate', 'heavy'];
/** Requisition-style labels. Wording is a placeholder pending physician review. */
export const GROUP_LABELS = ['White', 'Black or African American', 'Asian: Northeast', 'Asian: Southeast', 'Other or mixed'];

// Random draws stay at 18 to 80. An explicit age may go to 95, the upper limit of the GLI spirometry tables; above 80 (volumes) and
// 85 (TLCO) the reference values for the last available age are used and the report says so.
const OBESITY_BMI = { 1: [35, 40], 2: [40, 46], 3: [46, 55] };
const OVERRIDABLE = {
  age: [18, 95],
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
 * @property {'light'|'moderate'|'heavy'} [scenarioLevel] present only when scenarios are requested
 * @property {string[]} [scenarioIds] present only when scenarios are forced by id (sorted)
 */

/**
 * Demographics from the "demographics" stream. The draws are fixed in number and order, so the
 * archetype changes only how BMI and hemoglobin are used, never the other fields.
 */
export function deriveDemographics(seed, archetype = 'normal', severity = 2) {
  const rng = createStream(seed, 'demographics');
  const sex = rng.chance(0.5) ? 'M' : 'F';
  const age = Math.round(rng.range(18, 80));
  const height = Math.round((sex === 'M' ? 177 + 7 * rng.normal() : 163 + 6.5 * rng.normal()) * 2) / 2;
  const bmiDraw = Math.exp(Math.log(27.5) + 0.2 * rng.normal());
  const hbDraw = Math.round((sex === 'M' ? 14.8 + 1.1 * rng.normal() : 13.3 + 1.0 * rng.normal()) * 10) / 10;
  const group = GROUP_LABELS[rng.int(0, GROUP_LABELS.length - 1)];
  const u1 = rng.uniform(), u2 = rng.uniform();
  // The obesity archetype takes its BMI from the severity: 35 to 40, 40 to 46 and 46 to 55 kg/m2 (a teaching choice; expiratory reserve volume falls with BMI).
  const [bmiLo, bmiHi] = OBESITY_BMI[Math.min(Math.max(Math.round(severity), 1), 3)];
  const bmi = archetype === 'obesity-low-erv' ? bmiLo + (bmiHi - bmiLo) * u1 : bmiDraw;
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
  const base = deriveDemographics(input.seed, input.archetype, input.severity ?? 2);
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
  const ids = [...new Set(input.scenarioIds ?? [])].sort();
  for (const id of ids) if (!isScenarioId(id)) throw new RangeError(`unknown scenario: ${id}`);
  const scenarioLevel = input.scenarioLevel ?? (ids.length ? 'light' : 'none');
  if (!SCENARIO_LEVELS.includes(scenarioLevel)) throw new RangeError(`unknown scenario level: ${scenarioLevel}`);
  if (scenarioLevel === 'none' && ids.length) throw new RangeError('explicit scenario ids need a scenario level other than none');
  // The scenario keys are present only when set, so a plain descriptor is unchanged.
  const scenario = { ...(scenarioLevel !== 'none' ? { scenarioLevel } : {}), ...(ids.length ? { scenarioIds: ids } : {}) };
  return { v: input.v ?? GENERATOR_VERSION, seed: input.seed, archetype: input.archetype, severity, technique, panel, ...merged, ...scenario };
}

const SHORT = { panel: 'p', age: 'ag', sex: 'x', heightCm: 'h', weightKg: 'w', hbGdl: 'b', group: 'g', severity: 'sv', technique: 't', scenarioLevel: 'sc', scenarioIds: 'si' };

/** Query string holding the version, seed, archetype and only the fields that differ from the derived defaults. */
export function serializeDescriptor(d) {
  const base = deriveDemographics(d.seed, d.archetype, d.severity);
  const p = new URLSearchParams({ v: String(d.v), s: String(d.seed), a: d.archetype });
  if (d.severity !== 2) p.set(SHORT.severity, String(d.severity));
  if (d.technique !== 'good') p.set(SHORT.technique, d.technique);
  if (d.panel !== 'full') p.set(SHORT.panel, d.panel);
  for (const key of Object.keys(base)) if (d[key] !== base[key]) p.set(SHORT[key], String(d[key]));
  if (d.scenarioLevel && d.scenarioLevel !== 'none') p.set(SHORT.scenarioLevel, d.scenarioLevel);
  if (d.scenarioIds?.length) p.set(SHORT.scenarioIds, d.scenarioIds.join(','));
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
    scenarioLevel: p.get(SHORT.scenarioLevel) ?? undefined,
    scenarioIds: p.has(SHORT.scenarioIds) ? p.get(SHORT.scenarioIds).split(',').filter(Boolean) : undefined,
  });
}
