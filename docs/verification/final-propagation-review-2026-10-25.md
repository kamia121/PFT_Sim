# Final propagation review corrections

Base `c019601`, branch `feature/advanced-case-puzzlers`. Local corrections only; no browser/UI interaction, source/calculator retrieval, push, merge or deployment.

## Supplied inspiration without waveform arrays

`maneuverTrace` now normalizes every supplied observation lacking complete finite matching-length time/volume/flow arrays, regardless of `recorded` status. It preserves the expiratory trace and uses empty inspiratory arrays, without generating an inspiration to match the scalar. A supplied `recorded:false` FIVC remains not assessed, and no numeric FIVC is fabricated in the report. Rendering/HTML/CSV regressions cover recorded true, false and absent flags, plus incomplete, mismatched and nonfinite arrays.

## Shared legacy BDR equality policy

The engine's existing machine-equality allowance is now shared by report threshold comparisons, adaptive precision/qualifiers and the narrative's failed-criterion explanation. Liter-to-milliliter formatting reconciles equality in the original L units before conversion, so changing units does not shrink the engine's tolerance. The 2022 strict predicted-denominator rule is unchanged. This propagates the already documented inclusive 2005 convention; it does not resolve the source's table/prose equality discrepancy or add clinical rounding.

Synthetic fixtures cover 1.0→1.2 L, values within and outside the machine-equality allowance, and the 12% boundary including a 5/3 L baseline. HTML, CSV, precision text and feedback agree with the engine. A discordant-rule narrative fixture checks that a nominally 12% response failing only the 200 mL requirement is described as a volume failure, rather than falsely failing the percent threshold.

## Verification and remaining scope

12 new regression tests; focused suite 21/21 passed. Full suite 828/831, with the same three previously documented baseline identity failures: numerical identity across 2230 cases, 50 level-none byte identities, and explicit level-none identity. Build and whitespace checks passed. Historical baseline fixtures and source-corrected markup were not regenerated for this change.

No physiology, generator version, reference coefficients or scientific source convention changed. The 41-group status remains 20 source-text verified, 8 partial, 8 modeled and 5 coefficient/output blocked; 25 corrected groups overlap those statuses. The exact remaining gap classification is unchanged in remaining-partial-groups-2026-10-25.md. These two propagation defects are corrected coding defects, not scientific uncertainty.

Native print/download and interactive browser QA remain pending under the locked-Mac restriction. No unlock or retry was attempted.
