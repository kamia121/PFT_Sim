/**
 * Effect sizes and conversion constants used by the scenario layer. None of the sizes below was
 * checked against a primary source: the research catalog (docs/research/scenarios.md) gives
 * directions of effect and a few conversion factors relayed by search summaries, and its
 * "Unverified or conflicting" section is binding. Every entry carries its verification state, and
 * no page text presents a size as a finding. docs/scenarios-model.md lists them all.
 */

/** @typedef {'unverified'|'secondary'|'verified-primary'} Verification */

export const SCENARIO_CONSTANTS = {
  // Height estimation. Divisors relayed by a search summary of the ERS SpirXpert page; a Polish review cites 1.06.
  armSpanDivisor: { M: 1.03, F: 1.01, singleAlternative: 1.06, verification: 'unverified', source: 'scenarios.md SPEC-01 and Height estimation' },
  armSpanMeanRatio: { M: 1.03, F: 1.01, verification: 'unverified', source: 'simulation assumption: population means equal the sex-specific divisors' },
  armSpanIndividualSd: { value: 0.02, verification: 'unverified', source: 'simulation assumption; the ERJ 2011 summary gives ranges, not a standard deviation' },
  halfSpanIndividualSd: { value: 0.03, verification: 'unverified', source: 'simulation assumption: doubling a half-span adds error (scenarios.md SPEC-03)' },
  ulnaToHeightRatio: { value: 0.158, verification: 'unverified', source: 'simulation assumption: no verified adult ulna table was obtained' },
  ulnaIndividualSd: { value: 0.025, verification: 'unverified', source: 'simulation assumption' },
  standingHeightLossKyphoscoliosis: { range: [0.04, 0.1], verification: 'unverified', source: 'simulation assumption' },
  chartHeightOverstatementCm: { range: [2, 5], verification: 'unverified', source: 'simulation assumption (scenarios.md SPEC-05 gives direction only)' },
  // Carboxyhemoglobin. The rule of about 1% DLCO per 1% COHb is quoted in the research document as not verified.
  coHbReferencePercent: { value: 1.5, verification: 'unverified', source: 'midpoint of the 1 to 2 percent endogenous level said to be included in the reference data (search summary)' },
  coHbDlcoFractionPerPercent: { value: 0.01, verification: 'unverified', source: 'scenarios.md Unverified: DLCO' },
  // Everything else: acute-effect and fault magnitudes are simulator choices; directions come from scenarios.md.
  acuteEffectSizes: { verification: 'unverified', source: 'directions from scenarios.md; magnitudes are simulator choices' },
};
