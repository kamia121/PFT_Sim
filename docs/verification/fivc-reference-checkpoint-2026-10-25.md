# Recorded FIVC and missing-reference review checkpoint

Base reviewed commit: `1f48f17`; branch `feature/advanced-case-puzzlers`. Local changes only. No browser/Mac UI interaction, source/calculator retry, push, merge or deployment.

## Source-backed FIVC handling

The actual existing inspiratory implementation was inspected: `src/core/inspiratory.js` creates display-only limbs after acquisition/grading, and figures lazily call it. Those curves do not establish a recorded maximal post-expiratory observation. No observation was manufactured from them.

The 2019 primary standard was reopened at https://pmc.ncbi.nlm.nih.gov/articles/PMC6794117/ (DOI 10.1164/rccm.201908-1590ST), specifically Table 7, its maximal-inspiration footnote, Maximal inspiration after forced expiration and the measured-variable reporting text. The criterion is one-sided: excessive recorded FIVC−FVC removes acceptability of both values, while the criterion is not required for usability. Ordinary absence alone does not preclude acceptability. The separate extrathoracic-obstruction investigation exception is outside this simulator's scope.

`assessPostExpirationFivc` accepts explicit recorded/maximal/post-expiration context and returns pass, fail or not-assessed. Missing, unconfirmed, invalid or display-only data cannot pass or fail that check. Other cough/zero-flow/EOFE failures remain independent. Session summaries retain the largest confirmed recorded FIVC across all maneuvers plus assessment counts, separately pre/post. Reports, CSV and revealed maneuver/quiz details expose the recorded value/check or a not-assessed note. Scalar-only observations never generate a waveform to match the value; plots draw expiration only if inspiratory samples were not supplied.

Default generation remains v5: no new physiology, acquisition distribution, pediatric cohort or instrument QA model was added. Symmetric geometric loop closure is explicitly distinguished from the one-sided acceptability criterion.

## Three independent-review corrections

1. Measured-but-unreferenced DLCO maps to unavailable-for-classification in every supported version v2–v5, including legacy v2/v3 without a session object. It cannot become not-performed, and the answer key remains offered.
2. DLCO feedback distinguishes unavailable reference from pending/unavailable acquisition and from not performed. It preserves measured values and states that repeating an acceptable acquisition does not fix reference applicability. It does not advise unnecessary repetition for that reference gap.
3. A missing or nonfinite FEV1/FVC reference prevents a normal/preserved-ratio pattern. Interpretable FEV1 and FVC measurements, TLC and DLCO remain available independently. Pattern, concise, long and fallback explanations describe missing references rather than falsely asserting that no maneuver was usable.

## Verification

15 new regression tests: six FIVC tests and nine missing-reference tests, including both available:false and nonfinite ratio fixtures across v2–v5. Focused set 54/54 passed; full suite 816/819 with the same three documented baseline identity failures. Build passed. Independent R fixtures check FIVC absolute/fractional limits, decimal equality, just-above values, one-sided comparison and largest observation.

HTML/CSV/finite-SVG content tests cover missing and recorded measurements. Source-corrected markup was intentionally refreshed; historical generator baseline fixtures remain unchanged. No native or interactive UI QA is claimed while the Mac is locked.

The remaining eight partial groups are classified individually in remaining-partial-groups-2026-10-25.md and in rule-audit-status.json. Current counts remain 20 verified source-text / 8 partial / 8 modeled / 5 coefficient-output blocked, with 25 corrected groups on the overlapping axis. No coefficient, official-output or clinical-waveform validation claim is added.
