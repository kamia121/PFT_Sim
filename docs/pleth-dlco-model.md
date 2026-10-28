# Plethysmography and single-breath DLCO: model record

This note records every modeling choice in `src/core/pleth.js` and `src/core/dlco-trace.js` and the figure modules (the plethysmography panel `panel-pleth` with its volume bars, the shutter and resistance figures, and the DLCO trace), with the verification state of each constant. Evidence grades refer to `docs/research/pleth-dlco.md`. The model is an uncalibrated teaching model. No value below has been validated against measured tracings, and nothing here is a treatment recommendation.

## 1. Whole-body plethysmography

### 1.1 Physics

At end-expiration the shutter closes and the subject pants against it with the glottis open. With no flow, mouth pressure equals alveolar pressure, and Boyle's law gives the thoracic gas volume

TGV = (dV / dPmouth) x (PB - 47 mmHg)

The box is rigid, so the thoracic volume change dV appears as an equal and opposite change of the free box gas. For an isothermal box of free volume Vbox, dPbox = PB x dV / Vbox. The plotted slope is therefore

dPbox / dPmouth = TGV x PB / ((PB - 47) x Vbox)   [Pa per kPa]

The generator draws each trial from this relation and `frcFromSlope` inverts it. The trial FRC stored in the result is computed from the plotted arrays by least squares, so it carries the thermal and mouth-pressure artifacts that the plot shows. Tests recompute it independently and agree within 1%.

The box signal is plotted with compression positive (the usual inverted display), so shutter lines slope upward and the resistance loop of an expiratory effort lies to the right.

### 1.2 Trials, acceptability and the reported FRC

A session has three to five trials. The technologist stops after the third trial if three acceptable trials agree within 5%, and otherwise continues to five. Each trial has a panting frequency, two pant cycles of mouth and box pressure (65 samples), a thermal drift rate and offset, a closure level, and the artifacts below. Trial-to-trial variation of the volume at closure has a standard deviation of 1.2% (good), 2.2% (fair) and 3.5% (poor technique). These values are unverified.

| Behavior | Model | Status of the trial | Source grade |
|---|---|---|---|
| Panting 0.5 to 1.0 Hz | acceptable frequency | acceptable | S1/S2 |
| Panting above 1.0 up to 1.5 Hz | acceptable only without obstruction (FEV1/FVC z at or above -1.645); with obstruction usable | acceptable or usable | S1 |
| Panting above 1.5 Hz, or below 0.5 Hz | rejected | rejected | S1/S2 |
| Fast panting artifact | mouth pressure underestimates the alveolar swing; FRC inflation 0.2 tanh(x / 0.2) with x = 0.11 (f - 1 Hz)(0.25 + 1.35 u), u the obstruction index; the loop opens by a phase lag of twice the inflation | direction S1; size unverified (5 to 15% illustrative per the research note) | |
| Thermal drift | parallel offset lines (usable) or large drift (rejected); drift 0.25 to 0.7 Pa/s (parallel), 1.2 to 2.2 Pa/s (large), fading over successive trials | usable or rejected | S1/S2; size unverified |
| Unsupported cheeks | mouth pressure damped 8 to 20% and FRC read high by about the same amount | rejected | S2/MEM |
| Leak or incomplete occlusion | loop opens (phase lag 0.25 to 0.5 rad) and bends; slope shallow, FRC read low by roughly 10 to 25% | rejected | low authority; shape MEM, direction as in the research note |
| Unstable end-tidal level | shutter closed 0.22 to 0.5 L above (70%) or below the stable level; the closure volume is not FRC | usable | S1 (usable class); size from scenario PLE-05 (400 mL) |

Replicate agreement. The note records a conflict between 5% and 10% for plethysmographic FRC. This model uses 5% for grades A and B and 10% for grade C, because the grading table in the secondary source that reproduces the 2023 statement uses 5% for the two highest grades and reserves 10% for C, and the 2023 text excerpts give 5% for body plethysmography and 10% only for washout and helium dilution. The spread is (highest - lowest) / mean of the acceptable values. The reported FRC is the mean of the acceptable trials. If none is acceptable it is the mean of the usable trials, and if none is usable the mean of all trials, with a flag. Grades: A three or more acceptable within 5%; B two within 5%; C two within 10%. The letters D (one acceptable trial), E (two or more acceptable, spread above 10%), U (no acceptable trial, some usable) and F (nothing usable) are placeholders because the source gives no criteria for them.

Linked maneuvers. ERV and IC are taken from the case volumes and TLC = FRC + IC, RV = FRC - ERV, VC = IC + ERV are returned in `suggestedVolumes` for the integrator, so the identities of the case hold exactly with the replicate mean.

### 1.3 Airway resistance (shutter open)

This section was rewritten in the report-page redesign. Earlier versions built the loop from half-sine breaths and recomputed sRaw from it; the new loop is a different construction, so sRaw, Raw and sGaw changed (the before and after numbers are in 1.5). The reported FRC, every trial FRC, TLC, RV, VC, ERV, IC and every other value of the case are bit-identical (1.6).

**Breathing mode and the phase variable.** The record is quiet tidal breathing, not panting: five breaths of mean tidal volume 0.85 L (reduced by 12% x u), inspiratory time 1.3 s and expiratory time 1.65 s (lengthened by 25% x u), after Kraemer 2021 (PMC, adults in the box; secondary). The mode is stated in the data (`raw.breathingMode`) and on the figures. Every breath is one cycle of a single phase theta, 0 at end-expiration and pi at end-inspiration:

V(t) = (VT(t) / 2) (1 - cos theta),  d theta / dt = w0 (1 + eps sin theta) (1 + mu(t))

with eps = sin((pi/2)(Te - Ti)/(Te + Ti)) so that the half of the cycle with theta below pi lasts Ti and the other half Te, w0 = 2 pi / ((Ti + Te) sqrt(1 - eps^2)), and mu(t) and the relative change of VT(t) slow sums of two sinusoids (breath-to-breath variation of 5%, 10% or 18% for good, fair and poor technique; the sinusoid periods are 7 to 19 s). Flow, with expiration positive, is minus dV/dt. It is smooth through every reversal because nothing switches at zero flow: the earlier construction used half-sine breaths with different durations (a derivative jump at every zero crossing), a `tau dv/dt` term that jumped with it, and `|v|` and `v > 0` switches. Samples are 0.04 s apart (about 375 per record); the last step of the record lands exactly on the fifth end-expiration.

**Alveolar pressure of the noise-free loop** (kPa, per unit scale S):

p = S [ g(v) - h (1 - a sin theta) cos theta ],  g(v) = v + (kI (1 - w(v)) + kE w(v)) v^3,  w(v) = (1 + tanh(v / 0.08 L/s)) / 2

g is flow-dependent resistance (odd and smooth); the expiratory cubic term is blended in by tanh(v / eps) with eps = 0.08 L/s, so the two limbs join without a switch. The opening of the loop is the quadrature term h cos theta: it is zero at peak flow, largest at the zero-flow points, symmetric about the fit line, and has zero correlation with flow over a cycle, so it adds no slope. Its amplitude is larger in expiration than in inspiration by the smooth factor (1 - a sin theta), a = 0.35, which equals 1 at the two zero-flow points. The sign makes the loop run counterclockwise in expiration (flow up, shift to the right), the direction reported for the alveolar pressure-flow loop (PMC8223795, read in full; the sentence that fixes it lost its subscripts in extraction, so the direction is graded secondary).

**Morphologies.** Each has a source note graded as in the research note (verified: read in the primary standard; secondary: from a society or study summary; MEM: from memory). None is verified, because the primary standards could not be opened. The numerical parameters of every morphology are unverified teaching values.

| Morphology | Chosen for | kI, kE (per (L/s)^2) | h (fraction of 0.55 L/s) | Shape source | Grade |
|---|---|---|---|---|---|
| Closed, near-linear | FEV1/FVC z at or above -1.645 and TLC not low | 0.12, 0.12 | 0.015 | steep, nearly straight, closed loop through the origin; limbs superimpose (research note 1.5; Criee 2011 summary, society slides) | secondary |
| Golf club (expiratory flow limitation) | FEV1/FVC z below -1.645 (every obstructive archetype, mixed, bd-discordant) | 0.12, 0.6 + 2.2 u | 0.06 + 0.35 u | inspiratory limb near linear, expiratory limb flattens or bends, loop opens at zero flow with air trapping (research note 1.5; Kraemer 2021) | secondary; size of bend and opening unverified |
| Steep, closed (restriction) | FEV1/FVC z at or above -1.645 and latent TLC z below -1.645 | 0.05, 0.05 | 0.01 | a steep curve excludes relevant obstruction, sRaw may look normal or low (research note 1.5) | MEM (inference from the steep-curve statement) |
| Sigmoid | only when `buildPleth` is called with `morphology: 'sigmoid'`; no archetype is a central or extrathoracic obstruction | 1.4, 1.0 | 0.05 | sigmoid loop for central or extrathoracic obstruction, raised inspiratory resistance (research note 1.5) | secondary |

The restriction morphology differs from the closed one only in having less flow dependence and no opening; its steepness on the figure comes from sRaw = Raw x TGV, since a small lung has a small sRaw and the size exponent (below) raises Raw by less than it lowers TGV. A mixed case is drawn as golf club, because obstruction dominates the loop shape.

**Calibration and noise.** The scale S is set so that the least-squares slope of p on v over |v| of at most 0.5 L/s equals the physiological Raw of the case (`modelRawKpaSL`, mapping below), so the noise-free fit reproduces the target exactly whatever the morphology. The noise is a smooth first-order low-pass (correlation time about 0.3 s, so the polylines have no hair) with standard deviation tech.rawNoise x Raw (equivalent to 0.02, 0.035 and 0.055 L/s of flow for good, fair and poor technique), and it is made orthogonal to [1, v] inside the fit window by subtracting its own least-squares fit. A fitted slope is linear in the data, so adding such noise does not move it: sRaw recomputed from the stored arrays equals Raw x true TGV to the rounding of the arrays (tests: within 1%; observed 0.4% or less over 2,230 cases, all of it rounding of `pbox` to 4 decimals).

**Estimator.** sRaw is the least-squares slope of the box signal on flow within |flow| of 0.5 L/s, converted by sRaw = slope x (PB - 47) Vbox / PB. The name is carried in `raw.estimator` and printed beside sRaw on the figure and the report, because vendors report sRtot (the line between the points of maximal shift) or sReff, and these diverge when the loop is open. `raw.alternativeEstimates.sRtotKpaS` gives the line between the points of maximal shift, averaged over breaths, and `raw.tangentSlopePaPerLs` the local slope within 0.15 L/s of zero flow; in a golf-club loop the tangent is 64% to 103% of the fit (median about 83%, 180 cases), because the fit spans the bend. Raw = sRaw divided by the reported FRC (the mean of the acceptable trials), stated in `raw.rawBasis`; sGaw = 1 / sRaw. The x axis of the figures is the shift volume in mL, pbox x Vbox / PB (1 Pa is 5.9 mL in the 600 L box), positive when alveolar gas is compressed.

Mapping from the case physiology (unverified teaching model, unchanged). With z the FEV1/FVC z-score of the true lung and m(z) = ln(1 + exp(-1.4 (z + 1))) / 1.4, a softplus that is near zero for z above about +1 and approaches -z - 1 for strongly negative z:

Raw = 0.20 kPa.s/L x (3 L / TGV)^0.35 x f_phenotype x exp(0.36 m(z)) x exp(0.08 N(0,1))

with f_phenotype 1.15 (airway), 0.85 (emphysema-like) and 1 otherwise, and the loop index u = min(m(z) / 3.5, 1). The median 0.20 and the adult sRaw upper limit 1.2 kPa.s are secondary-source values (Respir Res 2015 abstract; German guideline excerpt). The size exponent 0.35, the phenotype factors and 0.36 are unverified. The N(0,1) draw is the first draw of the existing `pleth-raw` stream, as before, so the target Raw of every case is unchanged; every other draw of the loop comes from the new stream `pleth-resistance`. The generator overrides FEV1/FVC for obstruction archetypes, so when the caller does not supply `ratioZ` the true z is approximated as min(-1.8, -0.81 + 0.83 z_FEV1 target), a regression on GLI Global z in 120 generated obstruction cases (maximum error about 1 z unit). After the change healthy and restrictive cases give sRaw of about 0.4 to 0.9 kPa.s (5th to 95th percentile over 1,540 generated cases) and obstructive cases 0.75 to 3.1 kPa.s (660 cases).

### 1.4 Volume-time record of the maneuver

`pleth.timeline` holds one record per trial for the figure's panel A. Everything in it is display only: it is drawn from the new streams `pleth-timeline-<trial>` and from values that already exist, and nothing in the case depends on it. Volume is absolute thoracic gas volume in liters. Segments, in order:

1. Quiet breathing, five breaths from the same phase generator (VT 0.85 L x (1 - 0.12 u) x (1 + 4% N(0,1)), Ti and Te varied by 6%). The end-expiratory level after each breath is the trial's closure level plus the trial's `eelDeviationL` minus the last one, so the levels end at the closure level. With a stable level they scatter by about 25 mL; with `eelShift` (scenario PLE-05 or the random unstable-level fault) they drift from the stable level toward the closure level, and the record shows the offset (`levels.closureOffsetL`, 0.22 to 0.5 L plus scatter).
2. Shutter closed, for as long as the pants recorded for the trial (two cycles). The pneumotach volume is flat at the closure level, which is the trial FRC computed from the plotted arrays (`PlethTrial.frcL`). The pants are not drawn on the volume trace. They are on a separate mouth-pressure lane that embeds the trial's own `t`, `pm` and `pbox` arrays (the same array objects, not resampled), drawn on an expanded time scale.
3. Shutter open: one quiet breath of 0.9 VT that returns to the stable end-expiratory level.
4. Slow expiration to RV, a smootherstep from the stable level to the reported RV (reported FRC minus ERV), of duration clamp(2.2 + 1.5 ERV, 3, 6) s.
5. Slow inspiration to TLC, a smootherstep from RV to the reported TLC (reported FRC plus IC), of duration clamp(2.5 + 0.6 VC, 4, 7) s.

The axis is therefore anchored at the reported mean: RV and TLC at the ends of the record are the reported values, the reference lines drawn at RV, FRC and TLC are the reported values, and ERV and IC are read from the reported FRC. Only the closure level is the trial's own. Durations, VT, the 0.9 factor and the smoothing functions are unverified teaching values; the sequence (quiet breaths, closures, linked slow maneuvers) follows research note 1.1 and 1.3 (secondary).

### 1.5 Before and after: sRaw, Raw and sGaw

The resistance values are recomputed from the new loop, so they differ from the earlier version. The target physiology is unchanged. Samples (seed, archetype, technique, severity; first-version value, then new value; the reported FRC is identical):

| Case | sRaw, kPa.s | Raw, kPa.s/L | sGaw, 1/(kPa.s) | Reported FRC, L |
|---|---|---|---|---|
| 1 normal, fair, 2 | 0.546 to 0.527 | 0.226 to 0.218 | 1.831 to 1.897 | 2.4158 (same) |
| 1 obstruction, poor, 2 | 2.642 to 1.662 | 0.851 to 0.535 | 0.379 to 0.602 | 3.1041 (same) |
| 1 restriction-parenchymal, good, 2 | 0.454 to 0.437 | 0.245 to 0.236 | 2.205 to 2.288 | 1.8503 (same) |
| 1 mixed, poor, 2 | 1.586 to 1.040 | 0.760 to 0.498 | 0.631 to 0.961 | 2.0874 (same) |
| 1 bd-discordant, fair, 2 | 2.126 to 1.458 | 0.650 to 0.446 | 0.470 to 0.686 | 3.2715 (same) |
| 1 obesity-low-erv, good, 2 | 0.314 to 0.302 | 0.288 to 0.277 | 3.184 to 3.315 | 1.0901 (same) |
| 2 normal, poor, 3 | 0.643 to 0.592 | 0.262 to 0.242 | 1.555 to 1.688 | 2.4535 (same) |
| 2 obstruction, good, 3 | 6.189 to 3.330 | 1.364 to 0.734 | 0.162 to 0.300 | 4.5379 (same) |
| 2 mixed, good, 3 | 1.648 to 1.028 | 1.004 to 0.626 | 0.607 to 0.973 | 1.6407 (same) |
| 2 bd-discordant, poor, 3 | 5.363 to 2.942 | 1.285 to 0.705 | 0.187 to 0.340 | 4.1732 (same) |

Over 2,200 generated cases (220 seeds x 10 archetypes), by loop morphology, median sRaw before and after and the median of the per-case ratio (new over old) with its 5th to 95th percentile:

| Morphology | n | median sRaw before, kPa.s | after | ratio | 5th to 95th percentile of the ratio |
|---|---|---|---|---|---|
| closed | 1,100 | 0.64 | 0.62 | 0.96 | 0.90 to 0.98 |
| restriction | 440 | 0.50 | 0.48 | 0.96 | 0.93 to 0.99 |
| golf club | 660 | 2.25 | 1.53 | 0.65 | 0.54 to 0.82 |

The earlier fit slope over the window included the extra expiratory factor (1 + 0.5 u), the flow-dependent term and the phase-lag term of the half-sine construction, which inflated sRaw in obstruction by about 1.2 to 1.9 times the target; the new loop reproduces the target. The number of cases that carry the `sraw-above-upper-limit` flag (sRaw above 1.2 kPa.s, secondary) falls from 583 to 430 of the 2,200. This is a change of numbers and flags, not of volumes.

### 1.6 Numerical identity of everything else

`tests/pleth.test.mjs` hashes, for 2,230 cases (220 seeds for each of the ten archetypes with technique and severity cycling, plus 30 scenario cases with forced thermal drift and fast panting), the whole case with the plethysmography fields that do not depend on the resistance loop (every trial with its `t`, `pm`, `pbox`, `frcL`, status, faults and reasons; the replicate table; the true and reported FRC; the FRC basis, repeatability and grade; the suggested volumes; the case report, volumes, truth, spirometry, DLCO and DLCO trace). The expected hashes in `tests/fixtures/pleth-identity-hashes.json` were computed with the generator before the change; the test passes, so the reported FRC (trial and mean), TLC, RV, VC, ERV, IC and all other case values are bit-identical. Only `pleth.raw`, `pleth.timeline` and the `sraw-above-upper-limit` flag are excluded from that hash. No existing random stream is drawn from beyond what it was (the only existing stream the new code touches is `pleth-raw`, one draw, as before), and the test that lists the stream names requires every name to start with `pleth-`.

In `tools/baseline-hashes.mjs` terms, 43 of the 50 baseline hashes change (every case with a full panel; the 7 spirometry-only cases do not). The only fields that change are inside `pleth`: `raw.flow`, `raw.pbox`, `raw.breath` (new length), `raw.fitSlopePaPerLs`, `raw.sRawKpaS`, `raw.sRawCmH2OS`, `raw.sGawPerKpaS`, `raw.rawKpaSL`, `raw.rawCmH2OSL`, `raw.shape` (opening, sIndex and, in 13 cases, the descriptor), the `sraw-above-upper-limit` entry of `pleth.flags` (added or removed in 12 cases), and the added fields `raw.t`, `raw.shiftMl`, `raw.volumeL`, `raw.tangentSlopePaPerLs`, `raw.morphology`, `raw.estimator`, `raw.breathingMode`, `raw.rawBasis`, `raw.alternativeEstimates` and `pleth.timeline`. Nothing in `report`, `volumes`, `truth`, `spirometry`, `dlco` or `dlcoTrace` changes.

### 1.7 Figures

`panel-pleth` (`src/ui/figures/panel-pleth.js`) is one svg with sub-plots A (volume-time record with the mouth-pressure lane), B (occlusion loops: mouth pressure against shift volume in mL, trials overlaid, trial table beside the plot, no trial labels on the plot), C (resistance loop: flow against shift volume on the same x axis, the fit line, a short tick for the sRaw upper limit, the estimator named) and D (stacked RV, ERV and IC bars from `volumeBars`, measured beside predicted, the TLC lower to upper limit range and the RV upper limit on the predicted bar, no bar for a lower limit). The sign convention (compression positive) is on the x axis of C and in the caption of B. Views: `best` overlays the selected trials (default all) in the series color with the best trial emphasized, because acceptance is judged by the overlap of the lines and a single line cannot show it; `all` uses distinct palette tints; `separate` draws one small panel per trial with its number, FRC and frequency, and, only with `showQuality`, its status and reasons. The best trial is the acceptable one (else usable, else any) nearest the reported FRC; panel A shows the best trial, or the first selected trial in `all` and `separate`. Quality words and status colors appear only with `showQuality`. Text is 9.5 to 12 px at the default width of 672 px (7 in), so 7 to 9 pt; colors are the palette's; series color encodes the quantity and dash style the relation (measured solid, predicted dashed, limits dotted). The standalone `pleth-shutter` and `pleth-raw` figures keep their registry interface and use the same data; they lost the trial numbers written over the traces, the kinks (from the data) and, for the resistance figure, the dotted upper-limit line across the plot.

Summary sheet (2026-10-22). The compact plethysmography figure of the summary sheet (`rep-pleth-loop`) is the open-shutter specific airway-resistance loop, titled "Specific airway-resistance loop, shutter open": `raw.flow` (L/s, expiration up) against `raw.shiftMl` (mL, positive with alveolar compression), every stored sample, with the least-squares line of this section's estimator over the recorded flow range. It was previously the shutter-closed trial, under a title that called it a shift loop. The caption names the shutter-closed trial with its TGV and the reported FRC; the full shutter-closed plot stays in panel B of `panel-pleth`. No value changes. Details and limitations are in `docs/trace-texture-model.md`, section 4.

## 2. Single-breath DLCO

### 2.1 Equations (barometric pressure 760 mmHg unless the case supplies another)

VA(BTPS) = (FI,tr / FA,tr) x (VI - VD)
VA(STPD) = VA(BTPS) x 1000 x (PB - 47)/760 x 273/310   [mL]
FA,CO,0 = FI,CO x FA,tr / FI,tr
DLCO = VA(STPD) / (t x (PB - 47)) x ln(FA,CO,0 / FA,CO,t)   [mL/min/mmHg, t in min]
KCO = DLCO / VA

FA,tr and FA,CO,t are the means of the plotted tracer and CO traces over the alveolar sample window on the expired-volume grid (0.01 L). PB cancels in DLCO (the STPD conversion contains PB - 47) and is carried for completeness. Test gas: 0.30% CO, 0.30% CH4 tracer, 21% O2, balance N2 (rapid gas analyzer; secondary source). The breath-hold time is the Jones-Meade form, from the instant 30% of VI has been inspired to the midpoint of the alveolar sample; the form is not confirmed for the 2017 standard.

### 2.2 How the trace is built

The test is built forward from the case. Given the case VA and DLCO, the inspired volume VI = r x VC (r from 0.93 to 1.0), the dead space VD (2.2 mL/kg anatomic, bounded 0.12 to 0.30 L, plus 0.10 L apparatus), and the breath-hold time, the alveolar tracer fraction follows from dilution, FA,tr = FI,tr (VI - VD) / VA, and the alveolar CO from the Krogh decay over the hold. The expiration is drawn against expired volume: inspired-gas composition through the dead space, a phase II transition (normal CDF, width 0.07 to 0.13 L, narrower in small lungs), then a plateau that slopes downward with obstruction (1 to 8% per liter). Amplitudes are solved so that the window mean equals the target, noise (0.4%) is made zero-mean inside the window, and VA and DLCO are then recomputed from the arrays. In a fault-free test these equal the case values within 0.02% (400 generated cases); the test suite requires 1%.

If the tracer cannot dilute below (VI - VD) for the case VC (VA below (VI - VD)/0.97), VA is raised, `adjustments` says so, and DLCO is still reproduced. Faults that change the physics change the recomputed values, which are returned in `values` and `adjusted` with `reproducesCase` false.

| Fault | Trace | Effect on printed numbers | Numeric effect status |
|---|---|---|---|
| Low VI/VC (0.72 to 0.88; scenario DLC-01 0.74 to 0.80 when forced alone; when the encounter layer forces it, `scenario.viOverVc` supplies the VI/VC stated in the intake text, 0.70 to 0.86) | smaller volume step | VA falls by the volume deficit; DLCO falls as (VA ratio)^0.5, so KCO rises | direction S1/MEM; exponent unverified |
| Slow inspiration (7 to 9 s; 85% of VI after 4 s) | long ramp | none | visual and grading (noted) |
| Short hold (5 to 7.4 s) or long hold (12.8 to 16 s) | hold of that length | none, because the Krogh equation corrects for time | visual and grading; the note says tracer mixing and sample position shift, which this model does not apply |
| Leak | measured volume falls 0.25 to 0.55 L during the hold | none | visual and grading only; direction is not predictable in the sources |
| Valsalva | mouth pressure +14 to +24 cmH2O, flat volume | DLCO falls 10 to 25% | pressure channel visual; magnitude unverified (direction MEM) |
| Mueller | mouth pressure -14 to -24 cmH2O, volume rises 0.08 to 0.15 L | DLCO rises 10 to 25% | pressure channel visual; magnitude unverified (direction MEM) |
| Early sample | window starts about 0.1 L before the dead-space transition ends | dead-space gas raises tracer and CO in the sample; VA and DLCO fall | emerges from the arrays |

Technique sets the chance of faults: none with good technique, 30% of tests with fair, 75% with poor (a second fault in 30% of poor tests). Scenario ids DLC-01 to DLC-06 force low VI, slow inspiration, long hold (about 15 s), Valsalva, Mueller and leak. Plethysmography scenario ids PLE-01 to PLE-05 force thermal drift, fast panting (2.2 to 2.8 Hz), unsupported cheeks, shutter leak and an unstable end-tidal level.

### 2.3 Grade and rejection flag

The acceptability list is the one in section 2.1 of the research note. The letters are this simulator's grouping, not a published scheme (unverified): A all criteria met; B the only deviation is a slow inspiration, noted on the report; C one acceptability criterion failed (VI/VC from 0.85 to under 0.90 without a concordant VA, breath-hold outside 8 to 12 s, sample not finished within 4 s of the start of exhalation, washout or sample volume outside range); D invalid (leak, Valsalva, Mueller, VI/VC under 0.85, sample inside the dead-space transition). `wouldBeRejected` is true for C and D. The standard allows a sample under 0.5 L only for VC under 1 L; the simulator extends this to 1.1 L so that very small lungs remain gradable. The repeatability rule (two tests within 2 mL/min/mmHg) is not applied, because one test is simulated.

## 3. Constants and verification

Verified against the primary documents: none. The primary standards could not be opened (research note, section 4).

| Constant | Value | State |
|---|---|---|
| Barometric pressure, water vapor pressure | 760 mmHg, 47 mmHg | convention, secondary |
| Pant frequency limits | 0.5 to 1.0 Hz; 1.5 Hz tolerated without obstruction | secondary |
| FRC repeatability | 5% (A, B), 10% (C) | secondary, conflicting; choice explained in 1.2 |
| FRC grades D, E, U, F | as defined in 1.2 | unverified |
| Box free volume | 600 L | unverified |
| Mouth pressure amplitude | 0.85 to 1.15 kPa | unverified (research note: +/-1 kPa) |
| Fast-panting inflation cap | 0.2 | unverified |
| Trial scatter, technique fault probabilities, drift magnitudes, trial counts | section 1.2 | unverified |
| Median Raw, sRaw upper limit | 0.20 kPa.s/L, 1.2 kPa.s | secondary |
| Raw size exponent, phenotype factors, mapping slope 0.36 | section 1.3 | unverified |
| Tidal breathing before the resistance record: VT 0.85 L, Ti 1.3 s, Te 1.65 s, 5 breaths | section 1.3 | secondary (Kraemer 2021, PMC); the 12% and 25% obstruction adjustments unverified |
| Loop morphology shapes (closed, golf club, restriction, sigmoid) | section 1.3 | secondary for closed, golf club and sigmoid; MEM for restriction |
| Loop morphology parameters kI, kE, opening h, expiratory asymmetry 0.35, flow blend 0.08 L/s, reference flow 0.55 L/s, noise smoothing | section 1.3 | unverified |
| Direction of loop rotation (counterclockwise in expiration) | section 1.3 | secondary (PMC8223795) |
| sRaw estimator (least-squares slope within 0.5 L/s) | section 1.3 | secondary (research note 1.5); vendors differ (sRtot, sReff) |
| Timeline durations, quiet-breath VT variation, open-shutter breath 0.9 VT, smootherstep maneuvers | section 1.4 | unverified |
| z of FEV1/FVC for obstruction archetypes | regression | unverified approximation |
| VI/VC at least 0.90 (0.85 with VA agreement); 85% of VI in under 4 s; hold 8 to 12 s; sample within 4 s; washout 0.75 to 1.0 L; sample 0.5 to 1.0 L | as listed | secondary (S1 excerpts) |
| Test gas 0.30% CO and 0.30% CH4 | | secondary |
| Anatomic dead space 2.2 mL/kg | | secondary (one study's choice) |
| Apparatus dead space | 0.10 L (limit under 0.2 L) | unverified |
| Phase II width, plateau slope, noise, exhalation time constants, VI/VC and breath-hold distributions | section 2.2 | unverified |
| Low-VI DLCO exponent 0.5 | | unverified |
| Valsalva and Mueller DLCO change, pressure flag 8 cmH2O | | unverified |
| Grade letters A to D | section 2.3 | unverified |
| Jones-Meade breath-hold definition | | unverified for 2017 |

Each constant is also exposed in `PLETH_MODEL` and `DLCO_MODEL` with its verification tag, and the results list the unverified names in `unverified`.

## 4. Limitations

- The pant trace has two cycles per trial at 32 samples per cycle; real shutter closures last 0.3 to 1 s, and the mouth-pressure transducer response is not modeled.
- No thermal compensation, box leak or box-temperature model beyond the drift terms.
- The airway resistance loop does not model pendelluft or the frequency-dependent phase lag; the opening of the loop is a quadrature term of assigned size and the golf-club bend is a cubic flow dependence, both unverified. The frequency-dependent phase-lag model is deferred.
- The volume-time record is a schematic of the maneuver: the quiet breaths, the single open-shutter breath and the two slow maneuvers have assumed durations and smooth shapes, and the recorded pants are shown only on the mouth-pressure lane (the shift volume of the pants, about 30 mL, is not added to the flat pneumotach volume).
- Only one DLCO test is simulated; DLCO replicates and their 2 mL/min/mmHg rule are not generated. Hemoglobin, COHb and altitude adjustments are applied by the case, not by the trace.
- Leak and Valsalva or Mueller pressure channels are stored in the data (`time.pressureCmH2O`) and graded, but the figure draws them only through the grade text when `showQuality` is true.
- The FRC from the tracing is the volume at closure with a stable level; the case generator's independent FRC noise (3%) is replaced by the replicate mean only when the integrator wires `suggestedVolumes` into the case.
