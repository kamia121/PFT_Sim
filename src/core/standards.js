/**
 * Numeric criteria taken from published standards. Each entry carries the source it is meant to
 * reproduce and a verification state: "verified-primary" means compared line by line with the
 * published statement; "secondary-source-agreement" means only summaries of it agree; "unverified"
 * means neither, and the value must not be treated as settled. The 2019 values below were checked
 * against Tables 7 and 10 and the end-of-forced-expiration text of the statement.
 */
export const GENERATOR_VERSION = 1;

export const SPIROMETRY_2019 = {
  source: 'ATS/ERS 2019 spirometry standardization (Graham et al., AJRCCM 2019;200:e70)',
  bevFractionOfFvc: { value: 0.05, verification: 'verified-primary' },
  bevAbsoluteLiters: { value: 0.1, verification: 'verified-primary' },
  plateauLiters: { value: 0.025, verification: 'verified-primary' },
  plateauWindowSeconds: { value: 1, verification: 'verified-primary' },
  longFetSeconds: { value: 15, verification: 'verified-primary' },
  eofeRepeatabilityOfLargestFvc: { value: 0.15, verification: 'verified-primary' },
  repeatabilityLitersAdult: { value: 0.15, verification: 'verified-primary' },
  gradeSpreadLiters: { A: 0.15, B: 0.15, C: 0.2, D: 0.25, verification: 'verified-primary' },
};

export const INTERPRETATION_2022 = {
  source: 'ERS/ATS interpretive strategies technical standard (Stanojevic et al., Eur Respir J 2022;60:2101499)',
  llnZ: { value: -1.645, verification: 'secondary-source-agreement' },
  bronchodilatorPercentOfPredicted: { value: 10, verification: 'secondary-source-agreement' },
  severityZ: { mildLower: -2.5, moderateLower: -4.0, verification: 'secondary-source-agreement' },
};
