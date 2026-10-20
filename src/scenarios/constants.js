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
  // Bronchodilator taken before the test. The baseline moves toward the post-bronchodilator values by peak x (1 - hours / window), so a
  // more recent dose never has the smaller effect. Windows are the ATS/ERS 2019 Table 8 withholding times (as quoted in the catalog
  // caveats); the linear decay and the peak range are simulator choices.
  bronchodilatorWashout: { windowHours: { saba: 6, laba: 24, lama: 48 }, peakShift: [0.75, 0.95], minimumRemaining: 0.05, verification: 'unverified', source: 'windows from ATS/ERS 2019 Table 8 (S1); linear decay and peak are simulation choices' },
  // Altitude. Barometric pressure from an isothermal-atmosphere approximation; inspired O2 fraction 0.2093; the slope relays a slide
  // (scenarios.md Unverified: DLCO, altitude) and is not checked against the 2017 standard.
  altitude: { scaleHeightM: 8434, seaLevelMmHg: 760, fio2: 0.2093, dlcoFractionPerMmHgPao2: 0.0035, verification: 'unverified', source: 'scenarios.md Unverified: DLCO (altitude); slope from slides, barometric formula is an approximation' },
  // Everything else: acute-effect and fault magnitudes are simulator choices; directions come from scenarios.md.
  acuteEffectSizes: { verification: 'unverified', source: 'directions from scenarios.md; magnitudes are simulator choices' },
};

/**
 * Baseline shift toward the post-bronchodilator values for a dose taken `hours` before the test.
 * Monotone non-increasing in hours; `peak` is the shift at the moment of the dose.
 * @param {'saba'|'laba'|'lama'} kind @param {number} hours @param {number} peak
 */
export function bronchodilatorBaselineShift(kind, hours, peak) {
  const w = SCENARIO_CONSTANTS.bronchodilatorWashout;
  const remaining = Math.max(w.minimumRemaining, 1 - hours / w.windowHours[kind]);
  return Math.round(peak * remaining * 1e4) / 1e4;
}

/**
 * Multiplier on the measured DLCO from the lower alveolar oxygen tension at the laboratory elevation (less competition between O2 and CO
 * for hemoglobin). Independent of how long the patient has lived at that elevation. Unverified; labeled as such wherever it is used.
 * @param {number} elevationM
 */
export function altitudeDlcoMultiplier(elevationM) {
  const a = SCENARIO_CONSTANTS.altitude;
  const pb = a.seaLevelMmHg * Math.exp(-elevationM / a.scaleHeightM);
  const dPao2 = a.fio2 * (a.seaLevelMmHg - pb);
  return Math.round((1 + a.dlcoFractionPerMmHgPao2 * dPao2) * 1e4) / 1e4;
}
