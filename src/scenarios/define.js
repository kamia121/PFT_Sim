/**
 * Helpers for writing scenario catalog entries.
 *
 * @typedef {object} Caveat
 * @property {string} id @property {string} text @property {'major'|'minor'} weight
 * @property {'dlco'|'volumes'|'post'|'sexSame'} [requires] the caveat applies only when the case contains that test (or, for sexSame, when the sex choice changes no label)
 *
 * @typedef {object} Scenario
 * @property {string} id
 * @property {string} category
 * @property {string[]} variants three or more phrasings; templates may use {name} placeholders filled by `vars`
 * @property {(d: object, truth: object|null) => boolean} applies descriptor-level predicate; truth is null before physiology exists
 * @property {object} effects declarative effects; a two-number array [lo, hi] is drawn uniformly (see apply.js)
 * @property {Caveat[]} caveats what a careful interpreter states when this scenario is present
 * @property {{ id: string, text: string }[]} decoyCaveats plausible statements that do not apply when this scenario is present
 * @property {'high'|'medium'|'low'} confidence confidence in the direction of the effect (research catalog)
 * @property {string} source research catalog row and sources
 * @property {string|string[]|null} exclusive scenarios sharing an exclusive group are never combined
 * @property {string[]} incompatible ids that are never combined with this one
 * @property {number|((d: object) => number)} weight relative selection weight
 * @property {string[]} comments technologist report-comment templates (default: the statement itself)
 * @property {string[]} verifiedNumbers numeric tokens that may appear in static text because the cited primary source states them
 * @property {boolean} noncontributory true when the scenario changes no data and its caveat says so
 * @property {(fx: object, c: object) => Record<string, string>} vars placeholder values for the templates
 * @property {string} [deviation] short operator-record phrase for the pre-test notes
 * @property {(fx: object, d: object, u: number[]) => object} [finalize] derives dependent effects from the drawn ones (for example a
 *   bronchodilator shift from the hours since the dose); runs after the ranges are resolved and may use u[15], which no effect range reads
 *
 * A caveat's `requires` is 'dlco', 'volumes' or 'post' (the case contains that test) or 'sexSame' (the classification is the same under both
 * reference sexes). A decoy caveat's `unless: 'sexSame'` drops the decoy when the statement it makes would be true for the case.
 */

/** @param {Partial<Scenario> & { id: string, category: string, variants: string[], caveats: Caveat[], confidence: string, source: string }} o @returns {Scenario} */
export function scenario(o) {
  return {
    applies: () => true,
    effects: {},
    decoyCaveats: [],
    exclusive: null,
    incompatible: [],
    weight: 1,
    comments: [],
    verifiedNumbers: [],
    noncontributory: false,
    vars: () => ({}),
    ...o,
  };
}

export const BMI = (d) => d.weightKg / (d.heightCm / 100) ** 2;
/** Archetypes in which the physiology generator produces a post-bronchodilator truth (and not the discordant study). */
export const BD_ARCHETYPES = ['obstruction', 'mixed', 'normal', 'nonspecific'];
export const OBSTRUCTIVE = ['obstruction', 'mixed', 'bd-discordant'];
export const RESTRICTIVE = ['restriction-parenchymal', 'restriction-extraparenchymal'];
export const hasBdStudy = (d) => d.panel === 'full' && BD_ARCHETYPES.includes(d.archetype);
export const fullPanel = (d) => d.panel === 'full';
export const byArchetype = (map, other = 1) => (d) => map[d.archetype] ?? other;
