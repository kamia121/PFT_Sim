/** Claim-level source status. A verified rule does not imply validated numerical outputs. */
export const CLAIMS = Object.freeze(Object.fromEntries(Object.entries({
  'reference.scope': { state: 'verified-primary', citation: 'Quanjer2012; Hall2021; Bowerman2023; ATS2023', locator: 'Original equation scope; ATS2023 Key Conclusions and Recommendations', reader: 'Parent primary-source research worker; ATS2023 additionally opened by local Codex', date: '2026-10-24' },
  'reference.measurements': { state: 'verified-primary', citation: 'ATS2023', locator: 'Key Conclusions and Recommendations; reference-equation implementation implications', reader: 'Parent primary-source research worker; local Codex', date: '2026-10-24' },
  'reference.inputs': { state: 'verified-primary', citation: 'Graham2019', locator: 'Patient Details', reader: 'Parent primary-source research worker', date: '2026-10-24' },
  'reference.transgender-uncertainty': { state: 'verified-primary', citation: 'Stanojevic2022', locator: 'Comparison of Measured Values to a Healthy Population', reader: 'Parent primary-source research worker; precise finding supplied in handoff', date: '2026-10-24' },
  'severity.obstruction-normal-fev1': { state: 'under-review', citation: 'doi:10.1183/13993003.00055-2024', locator: 'Authors clarification, full wording pending', reader: 'Primary-source research handoff; local fetch returned 403', date: '2026-10-24' },
  'severity.restriction-tlc': { state: 'under-review', citation: 'doi:10.1183/13993003.00055-2024', locator: 'Authors clarification', reader: 'Pending direct review', date: '2026-10-24' },
  'severity.diffusion-dlco': { state: 'under-review', citation: 'doi:10.1183/13993003.00055-2024', locator: 'Authors clarification', reader: 'Pending direct review', date: '2026-10-24' },
}).map(([id, value]) => [id, Object.freeze(value)])));
