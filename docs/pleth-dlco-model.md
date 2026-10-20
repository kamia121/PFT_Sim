# Plethysmography and single-breath DLCO: model record

This note records every modeling choice in `src/core/pleth.js` and `src/core/dlco-trace.js` and the three figure modules, with the verification state of each constant. Evidence grades refer to `docs/research/pleth-dlco.md`. The model is an uncalibrated teaching model. No value below has been validated against measured tracings, and nothing here is a treatment recommendation.

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

Five tidal breaths (inspiration 1.3 s, expiration 1.65 s lengthened with obstruction, tidal volume about 0.85 L, after Kraemer 2021, PMC) are drawn with half-sine flows. Alveolar pressure is

Palv = Raw x [ v (1 + kq |v|) x (1 + 0.5 u if v > 0) + tau dv/dt ]

with Raw from the mapping below, `kq` = 0.05 + 1.0 u (flow dependence, producing the S shape), `tau` = 0.012 + 0.16 u s (phase lag, producing opening at zero flow), and the expiratory limb steeper by 0.5 u. Box pressure is Palv x (TGV PB) / ((PB - 47) Vbox) plus noise. All of these loop parameters are unverified; the shapes follow the descriptions in section 1.5 of the research note (normal: steep, closed; obstruction: open and S-shaped; expiratory limb flattened).

sRaw is the least-squares slope of the plotted box pressure on flow within |flow| of 0.5 L/s, converted by sRaw = slope x (PB - 47) Vbox / PB. Raw = sRaw / reported FRC and sGaw = 1 / sRaw. The plot has flow on the vertical axis (expiration upward) and box pressure on the horizontal axis, so a high resistance is a flat, open loop.

Mapping from the case physiology (unverified teaching model). With z the FEV1/FVC z-score of the true lung and m(z) = ln(1 + exp(-1.4 (z + 1))) / 1.4, a softplus that is near zero for z above about +1 and approaches -z - 1 for strongly negative z:

Raw = 0.20 kPa.s/L x (3 L / TGV)^0.35 x f_phenotype x exp(0.36 m(z)) x exp(0.08 N(0,1))

with f_phenotype 1.15 (airway), 0.85 (emphysema-like) and 1 otherwise, and the loop indices u = min(m(z) / 3.5, 1). The median 0.20 and the adult sRaw upper limit 1.2 kPa.s are secondary-source values (Respir Res 2015 abstract; German guideline excerpt). The size exponent 0.35, the phenotype factors and 0.36 are unverified. The generator overrides FEV1/FVC for obstruction archetypes, so when the caller does not supply `ratioZ` the true z is approximated as min(-1.8, -0.81 + 0.83 z_FEV1 target), a regression on GLI Global z in 120 generated obstruction cases (maximum error about 1 z unit). Healthy cases give sRaw of about 0.4 to 0.7 kPa.s and severe obstruction 2 to 7 kPa.s.

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
| Low VI/VC (0.72 to 0.88; scenario DLC-01 0.74 to 0.80) | smaller volume step | VA falls by the volume deficit; DLCO falls as (VA ratio)^0.5, so KCO rises | direction S1/MEM; exponent unverified |
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
| Raw size exponent, phenotype factors, mapping slope 0.36, loop parameters kq, tau, expiratory factor | section 1.3 | unverified |
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
- The airway resistance maneuver does not model pendelluft or flow limitation explicitly; opening and S shape come from the phase-lag and flow-dependent terms.
- Only one DLCO test is simulated; DLCO replicates and their 2 mL/min/mmHg rule are not generated. Hemoglobin, COHb and altitude adjustments are applied by the case, not by the trace.
- Leak and Valsalva or Mueller pressure channels are stored in the data (`time.pressureCmH2O`) and graded, but the figure draws them only through the grade text when `showQuality` is true.
- The FRC from the tracing is the volume at closure with a stable level; the case generator's independent FRC noise (3%) is replaced by the replicate mean only when the integrator wires `suggestedVolumes` into the case.
