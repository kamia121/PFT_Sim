/**
 * Numeric criteria taken from published standards. Each entry carries the source it is meant to
 * reproduce and a verification state. A value marked "unverified" has not been compared with the
 * primary document by the project physician and must not be treated as settled.
 */
export const GENERATOR_VERSION = 1;

export const SPIROMETRY_2019 = {
  source: 'ATS/ERS 2019 spirometry standardization (Graham et al., AJRCCM 2019;200:e70)',
  bevFractionOfFvc: { value: 0.05, verification: 'secondary-source-agreement' },
  bevAbsoluteLiters: { value: 0.1, verification: 'secondary-source-agreement' },
  plateauLiters: { value: 0.025, verification: 'secondary-source-agreement' },
  plateauWindowSeconds: { value: 1, verification: 'secondary-source-agreement' },
  longFetSeconds: { value: 15, verification: 'unverified' },
  repeatabilityLitersAdult: { value: 0.15, verification: 'secondary-source-agreement' },
  gradeSpreadLiters: { A: 0.15, B: 0.15, C: 0.2, D: 0.25, verification: 'unverified' },
};

export const INTERPRETATION_2022 = {
  source: 'ERS/ATS interpretive strategies technical standard (Stanojevic et al., Eur Respir J 2022;60:2101499)',
  llnZ: { value: -1.645, verification: 'secondary-source-agreement' },
  bronchodilatorPercentOfPredicted: { value: 10, verification: 'secondary-source-agreement' },
  severityZ: { mildLower: -2.5, moderateLower: -4.0, verification: 'secondary-source-agreement' },
};
