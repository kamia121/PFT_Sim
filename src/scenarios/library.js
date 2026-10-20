/**
 * Catalog of encounter scenarios for the simulated laboratory. Each entry is data: intake or
 * technologist phrasings (three or more, so no statement can be memorized), a descriptor-level
 * applicability predicate, declarative effects, the caveats a careful interpreter should state,
 * plausible decoy caveats that do not apply, and the confidence and source of the research row it
 * encodes (docs/research/scenarios.md). Effect sizes are simulator choices and are unverified; see
 * docs/scenarios-model.md.
 *
 * This module imports no case or descriptor code, so the descriptor codec may validate scenario ids
 * against it.
 */
import { PREP_SCENARIOS } from './catalog-prep.js';
import { REFERENCE_SCENARIOS } from './catalog-reference.js';
import { QUALITY_SCENARIOS } from './catalog-quality.js';

/** @type {import('./define.js').Scenario[]} */
export const SCENARIOS = [...PREP_SCENARIOS, ...REFERENCE_SCENARIOS, ...QUALITY_SCENARIOS];

export const SCENARIO_IDS = SCENARIOS.map((s) => s.id);
const BY_ID = new Map(SCENARIOS.map((s) => [s.id, s]));

/** @param {string} id */
export const getScenario = (id) => BY_ID.get(id);
export const isScenarioId = (id) => BY_ID.has(id);

const groupsOf = (s) => (s.exclusive === null ? [] : Array.isArray(s.exclusive) ? s.exclusive : [s.exclusive]);

/** Two scenarios are compatible when they share no exclusive group and neither names the other as incompatible. */
export function compatible(a, b) {
  if (a.id === b.id) return false;
  if (a.incompatible.includes(b.id) || b.incompatible.includes(a.id)) return false;
  const ga = groupsOf(a);
  return !groupsOf(b).some((g) => ga.includes(g));
}

/**
 * Caveat ids that cannot both be asserted for one case. The scenario pairs that produce them are
 * excluded by `exclusive`, and a test checks that no generated case holds both.
 */
export const CONTRADICTORY_CAVEATS = [
  ['sex-birth-used-default', 'sex-identity-used-nondefault'],
  ['sex-birth-used-default', 'sex-default-applied'],
  ['sex-identity-used-nondefault', 'sex-default-applied'],
  ['dentures-ok-no-change', 'dentures-poor-fit-leak'],
  ['dentures-ok-no-change', 'leak-unacceptable'],
  ['dentures-ok-no-change', 'mouthpiece-obstruction'],
  ['anemia-dlco-adjusted', 'hb-missing-dlco-unadjusted'],
];

/** Numeric tokens that may appear in any static scenario text: standard years. */
export const ALWAYS_ALLOWED_NUMBERS = ['2017', '2019', '2022', '2023'];
