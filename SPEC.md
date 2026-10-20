# PFT_Sim specification

## Status

Nothing of v0.01 is implemented. The repository holds the theme tokens, the project rules in `CLAUDE.md`, and the research scaffold in `research/` (Python prototype of a thoracic model and a design document with a prompt for Opus). v0.01 is to be built next in Claude Code.

## Purpose

Generate lifelike simulated PFTs with a known ground truth, have learners write interpretations, and break the case down afterward. The distinguishing feature is side-by-side interpretation of identical measured values under different reference equations, with reclassification shown explicitly.

## v0.01 scope

1. Seeded generator. Inputs are seed, age, sex, height, weight, self-reported group (used only to select a comparison equation), and a disease archetype. Spirometry is sampled as z-scores from a multivariate normal whose mean and correlation depend on the archetype, then back-transformed with the inverse LMS, value = M(1 + L·S·z)^(1/L). FEV1/FVC, TLC = VC + RV, DLCO = KCO × VA and VA ≤ TLC are derived so that physiologic constraints hold exactly. Measurement noise, hemoglobin correction for DLCO and a bronchodilator response with its own variance are added.
2. Archetypes. Normal, obstruction, restriction, mixed, PRISm, isolated low DLCO, obesity with low ERV, and discordant post-bronchodilator FEV1 and FVC change.
3. Interpretation module implementing ATS/ERS 2022 logic with LLN at z = -1.645, run under each selected equation.
4. Equation comparison view showing the same values under GLI-2012 by group, GLI Global and NHANES III, with a flag for each classification change.
5. Figures on dark monitor panels. Flow-volume loop with predicted and LLN envelopes and a color-coded flow trace, volume-time curve with the FEV1 mark and extrapolated volume, and a report table.
6. Shareable URL containing seed and archetype.

## Later features

Full simulated PFT report layout. Body plethysmography report with the shutter-closure panel (box pressure against mouth pressure for thoracic gas volume, and the airway resistance loop). Single-breath DLCO tracing showing inspired and expired tracer gas and CO over time, breath-hold interval, and the washout sample. Raw-value export for statistics teaching. Instructor mode with assigned seeds. Learner response capture and scoring, which is the point at which a backend becomes necessary.

## Reference equation work

Port GLI-2012 spirometry, GLI Global, GLI-2017 TLCO and GLI-2021 volumes to JSON. Generate test vectors in R, assert in vitest. The first prototype of the race-neutral comparison needs only spirometry.

## Thoracic model (research track)

`research/thorax_sim.py` is a prior-predictive Monte Carlo of a first-principles thoracic model that predicts group differences from sitting height ratio, chest geometry and physiologic priors without fitting spirometry. It is a separate research track and is not used for reference equations. First run with placeholder priors gave an AFR/EUR FVC ratio median near 0.94 with a 95 percent interval of about 0.81 to 1.09, and NEA and SEA ratios near 1.02, the opposite direction to GLI. All priors are placeholders. See `research/DESIGN_AND_OPUS_PROMPT.md` for the weaknesses and the review prompt.

## Open decisions

Node version and package manager. Whether the demonstration reference used before the GLI port is a smooth approximation or left absent. GLI redistribution terms. Whether the group input is shown to learners at all in the first release.
