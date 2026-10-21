# Archetype parameters: decisions after the literature review (draft for consultation)

Evidence: `docs/research/archetype-literature.md`. Current-generator profile: `tools/archetype-profile.mjs` (percent of the GLI anchor prediction, 300 seeds per cell, White patients, true physiology before measurement variability). This document decides, for each finding, whether the generator should change, and by how much. Teaching simulator only; archetype parameters are proposals for physician review whatever the outcome here.

## Two facts that change how the review's recommendations read

1. The cohorts used other reference equations (ECCS, NHANES III, van der Lee, often unnamed), so their percent predicted are not percent predicted under GLI Global. Computed here for White patients aged 25 to 70 at typical heights: GLI Global predicted FVC is 0.937 and FEV1 0.947 of the GLI-2012 Caucasian value, so a patient who is 100% of a Caucasian equation is about 106% of GLI Global. The review converted cohort values to GLI z with an uncertainty it put at about 0.5 z. A change is therefore made only where the gap exceeds about 0.5 z, and the size of each change is the gap beyond that uncertainty, not the whole gap.
2. The normal-case FVC and FEV1 "bias" (normal cases read FEV1 112% and FVC 110% of GLI Global) is mostly not a generator defect. GLI-2021 predicted VC (the volume anchor, European) is 1.055 times the GLI-2012 Caucasian FVC and 1.125 times GLI Global FVC. The generator builds FVC = VC x (1 - gap) from the European volume anchor, so a normal simulated person sits about 3% above the GLI-2012 Caucasian FVC (about +0.3 z) and about 10% above GLI Global (about +0.8 z), of which 6% is Global being a pooled, lower equation. The review's item 17 (draw FVC first and derive VC) would remove a +0.3 z inconsistency between two published datasets at the cost of restructuring every archetype; it is not adopted. The decomposition is recorded in `SPEC.md`.

## Decisions

| # | Finding | Decision | New parameters | Why |
|---|---|---|---|---|
| 1 | Obstruction FEV1 severity | KEEP | none | ECLIPSE and FOOTPRINTS agree; GOLD 1 stays omitted. |
| 2 | Obstruction FVC | CHANGE, moderated | FVC z target mean -0.7 / -1.4 / -2.4, SD 0.7 (truncated), drawn directly (as the nonspecific archetype does); VC = FVC / (1 - gap), RV = TLC - VC follows | Three cohorts read in full (COPDGene, COSYCONET, FOOTPRINTS) put FVC at 75 to 83 %p at FEV1 40 to 50 %p; the generator has 88 %p Global (about 83 on a Caucasian scale), a gap of about 0.5 z at severity 2 and larger at 3. The review's means (-0.6 / -1.6 / -3.2) rest partly on its own arithmetic from ECLIPSE group means and are not adopted for severity 3. |
| 3 | Obstruction TLC and RV | KEEP TLC z; RV becomes derived | TLC z unchanged; RV follows from the FVC target | Derived RV is checked against FOOTPRINTS (129 / 162 %p) and COSYCONET (182 %p) in the profile. |
| 4 | Obstruction DLCO | CHANGE, moderated | airway phenotype DLCO z mean -1.6 / -2.6 / -3.2, emphysema -3.6 / -4.4 / -5.0, SD 0.9 | The cohort gap (about 25 to 36 %p, 1.5 to 2.5 z) exceeds the equation uncertainty. Means sit about 0.4 z above the review's, so that airway-predominant disease keeps a preserved-DLCO end (asthma, chronic bronchitis) as a teaching contrast. Mixed COPD cohorts blur that contrast: the Method page says so. |
| 5 | Phenotype mix 60/40 | LABEL | none | Only a selected CT subset (47.5/52.5) exists. |
| 6 | FVC/VC gap | CHANGE | gap mean 0.04 + 0.02 (severity - 1) (+0.02 for emphysema), SD 0.04, truncated -0.02 to 0.20 | Yuan: gap about 0.06 at FEV1 49%, FVC at least VC in 20 of 97. Current 0.06 / 0.10 / 0.14 is too large and never negative. |
| 7 | BD response, obstruction | CHANGE | replace the 45% bimodal responder rule with a continuous draw: dFEV1 (% of predicted) mean 5.5 / 4.0 / 2.5, SD 5.0 / 4.0 / 3.0 for severity 1 to 3; dFVC mean 4.5 / 3.5 / 2.5, SD 6.0 / 5.0 / 4.0, correlated 0.5 with dFEV1 | SCAPIS (5.2 +- 5.4 FEV1, 4.8 +- 6.1 FVC), NOVELTY (18% to 25% positive), ECLIPSE (response shrinks with GOLD stage). Expected 15% to 25% above 10 %p. The practice mix still contains `bd-discordant` for deliberate discordance. |
| 8 | BD response, normal and nonspecific | CHANGE | dFEV1 mean 3.2, SD 4.2 %p; dFVC mean -0.5, SD 3.1 %p, truncated at -8 and +12 | SCAPIS never-smokers. |
| 9 | Restriction, parenchymal DLCO and KCO | CHANGE | DLCO z mean = TLC z - 1.0, SD 0.7, truncated -6.0 to -1.75 (replaces -1.2 - 0.8 x severity) | Three registries (eurIPFreg, Swedish IPF, SLS II) put DLCO about 20 %p below TLC; KCO then falls out below normal (SLS II DL/VA 61 %p). |
| 10 | Restriction, extraparenchymal | CHANGE | DLCO = DLCO predicted x (0.58 + 0.42 VA/VA predicted) x exp(0.08 e), with KCO capped at 1.45 x predicted | Johnson's relation (abstract) and Hughes and Pride (KCO above 120 %p); the cap reflects Hart (KCO 85 to 130 %p). RV/TLC z +1.5 and ERV z -1.8 are labelled a teaching choice that fits neuromuscular disease only. |
| 11 | Mixed DLCO | CHANGE | DLCO z mean -2.2 - 0.5 x severity, SD 0.8, truncated -6.0 to -1.7 | Sarcoidosis (abstract) and CPFE statement put DLCO about 50 %p and KCO reduced; the raised KCO (118 to 144 %p) goes. RV and RV/TLC: teaching choice. |
| 12 | Nonspecific | KEEP spirometry; small TLC shift | TLC z tn(-1.0, 0.3, -1.35, -0.3) (was -0.8 +- 0.35 in -1.15 to -0.2) | RV 172 %p is forced by identity once TLC is normal and VC low; PRISm CT data show RV near 100 %p. The shift only partly addresses this and the magnitude is labelled a teaching choice. TLC stays clear of the LLN. |
| 13 | Low DLCO | KEEP | none | PAH values agree. |
| 14 | Anemia | KEEP form; LABEL Hb range | none | Cotes form is now verified against the 2017 standard (separate report). |
| 15 | Obesity | CHANGE ERV and link severity to BMI | ERV z bands for the archetype: -2.4 to -1.8 / -3.2 to -2.6 / -3.9 to -3.3 (about 45 / 30 / 22 %p); weight drawn so BMI is 33 to 38 / 38 to 45 / 45 to 55 for severity 1 to 3 | Steier (ERV 0.4 +- 0.4 vs 1.7 L at BMI 47); Jones and Nzekwu. No source supports the floor value of 11 %p. |
| 16 | BD-discordant magnitudes | LABEL | none | Magnitudes have no source; directions (FVC response more common than FEV1 response in COPD) do. |
| 17 | Normal FVC bias | NOT ADOPTED | none | See fact 2. |
| 18 | Loadings, truncation SDs | LABEL | none | No source. |

Practice mix weights stay labelled teaching choices. Nonspecific cases could draw higher BMI (PRISm tracks obesity); not changed.

## Numerical checks to record

`tools/archetype-profile.mjs` before and after: the means by cell against the cohort values above converted to the GLI scale (Global spirometry about 0.94 of Caucasian-based percent predicted); the proportion with BD response above 10% of predicted; the constraint sweep (`tools/constraint-sweep.mjs`) with zero violations; the property test that each archetype yields its expected anchor pattern; the 29 interpretation fixtures; regenerated baseline hashes with the reason; and a statement in `SPEC.md` that all existing case links change meaning.
