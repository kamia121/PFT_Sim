/**
 * Numeric criteria taken from published standards. Each entry carries the source it is meant to
 * reproduce and a verification state: "verified-primary" means compared line by line with the
 * published statement; "secondary-source-agreement" means only summaries of it agree; "unverified"
 * means neither, and the value must not be treated as settled. The 2019 values below were checked
 * against Tables 7 and 10 and the end-of-forced-expiration text of the statement.
 */
export const GENERATOR_VERSION = 5;

export const SPIROMETRY_2019 = {
  source: 'ATS/ERS 2019 spirometry standardization (Graham et al., AJRCCM 2019;200:e70)',
  bevFractionOfFvc: { value: 0.05, verification: 'primary threshold value; equality ambiguous between Table 7 and prose' },
  bevAbsoluteLiters: { value: 0.1, verification: 'primary threshold value; equality ambiguous between Table 7 and prose' },
  plateauLiters: { value: 0.025, verification: 'primary threshold value; equality ambiguous between Table 7 and prose' },
  boundaryConventions: {
    bev: 'Select inclusive ≤ max(0.100 L, 5% FVC); Table 7 prints ≤ while prose prints <. This is a project convention, not unambiguous source agreement.',
    plateau: 'Select inclusive ≤ 0.025 L; Table 7 and prose differ on equality. Other EOFE alternatives can still establish acceptability.',
  },
  fivcDifference: { absoluteL: 0.1, fractionOfFvc: 0.05, verification: 'Graham 2019 Table 7 and maximal inspiration after forced expiration: one-sided FIVC−FVC limit; absence alone does not preclude ordinary acceptability' },
  plateauWindowSeconds: { value: 1, verification: 'verified-primary' },
  longFetSeconds: { value: 15, verification: 'verified-primary' },
  eofeRepeatabilityOfLargestFvc: { value: 0.15, verification: 'verified-primary' },
  repeatabilityLitersAdult: { value: 0.15, verification: 'verified-primary' },
  gradeSpreadLiters: { A: 0.15, B: 0.15, C: 0.2, D: 0.25, verification: 'verified-primary' },
};

export const INTERPRETATION_2022 = {
  source: 'ERS/ATS interpretive strategies technical standard (Stanojevic et al., Eur Respir J 2022;60:2101499)',
  llnZ: { value: -1.645, verification: 'verified-primary: ERS/ATS 2022 Table 1; rounded fifth-percentile convention' },
  bronchodilatorPercentOfPredicted: { value: 10, verification: 'verified-primary: ERS/ATS 2022 Box 1; strict greater than, predicted denominator' },
  severityZ: { mildLower: -2.5, moderateLower: -4.0, verification: 'verified-primary: ERS/ATS 2022 Figure 7; 2024 authors clarification; continuous equality convention documented in SPEC' },
};

/** Read from the corrected journal copy, 2026-10-24. Quality assessments remain explicit inputs. */
export const LUNG_VOLUMES_2023 = {
  source: 'Bhakta et al. ERS/ATS 2023, doi:10.1183/13993003.01519-2022, corrected Tables 3–4 and reporting pp18–19',
  correction: 'Table 3 replaced by doi:10.1183/13993003.51519-2022',
  verification: 'primary corrected Table 3, Table 4 and reporting text read; source rules are not synthetic-signal validation',
  linkedSvc: { olderThanYears: 6, acceptableDeficitL: 0.15, usableDeficitL: 0.25, childAcceptableDeficitL: 0.1, childUsableDeficitL: 0.2, childFvcFraction: 0.1 },
  noFvcAcceptableVcCount: 3,
  frcRepeatability: { preferred: 0.05, qualified: 0.1 },
};

/** Graham et al. 2017 measurement standard, Table 3 / reporting pp21–22, not GLI reference equations. */
export const DLCO_2017 = {
  source: 'ERS/ATS 2017 doi:10.1183/13993003.00016-2016, Table 3 and reporting pp21–22,25; 2018 correction doi:10.1183/13993003.50016-2016',
  viFraction: { preferred: .90, alternative: .85 }, vaAgreement: { absoluteL: .2, fraction: .05 },
  t85MaxS: 4, breathHoldS: [8, 12], sampleCompleteS: 4,
  repeatability: { traditional: 2, si: .67 },
  classical: { washoutL: [.75, 1], reducedWashoutVcL: 2, reducedWashoutL: .5, sampleL: [.5, 1], smallSampleVcL: 1 },
  rgaSampleL: [.085, .5],
  verification: 'Primary Table 3 and reporting text read; interim rows overlap and do not allocate all mixed failures. No session-letter grade or clinical waveform validation is inferred.',
};
