# Whole-body plethysmography and single-breath DLCO: technique, quality rules, graphics

Research note for PFT_Sim (educational, uncalibrated). Compiled 2026-10-20.

## How to read the evidence grades

The primary documents (ERS/ATS 2023 lung volumes statement, ERS/ATS 2017 DLCO standard, 2005 lung volumes standard) could not be opened directly. Every host for WebFetch failed DNS resolution, and PubMed Central holds none of the three. All numbers below therefore come from text excerpts returned by the search tool for the primary pages, from vendor and society summaries of the standards, or from open-access papers read in full through PubMed Central. Each row carries one of these tags.

- **S1**: wording returned from a primary ERS/ATS page or its executive summary (search excerpt). Highest confidence available here, still not a full-text read.
- **S2**: secondary summary of the standard (manufacturer sheet, society slide deck, study guide, application note). Consistent with S1 where both exist.
- **PMC**: statement read in full in an open-access paper.
- **MEM**: from memory, not verified. Do not hard-code without checking.
- **DER**: derived by the author of this note from a textbook equation, with inputs stated. These are design numbers, not published findings.

## 1. Whole-body plethysmography

### 1.1 Physics and the two maneuvers

The subject sits in a sealed, rigid box. Because the box volume is fixed, any change in thoracic gas volume appears as an equal and opposite change in the free gas volume of the box, read as a box pressure change (the "shift volume") [S2: Criee 2011 abstract; Kraemer 2021, PMC]. Two maneuvers use this.

1. **Shutter-closed (occlusion) maneuver, thoracic gas volume (TGV, FRCpleth).** The subject breathes quietly until the end-expiratory level is stable, the shutter closes at end-tidal expiration (FRC), and the subject pants gently against it with cheeks supported and glottis open. With no flow, mouth pressure equals alveolar pressure. The plot is box pressure (or shift volume) on one axis against mouth pressure on the other. Boyle's law gives TGV = (ΔV / ΔPmouth) x (PB - 47 mmHg) [S2: Lung Volume Updates 2023 deck; AARC guideline; PMC7158317 figure legends via search].
2. **Shutter-open maneuver, airway resistance.** The subject pants or breathes at the tidal rate through the open shutter. Box pressure (shift volume) is plotted against airflow, giving the specific resistance loop, sRaw. Raw = sRaw / TGV [S2; PMC Kraemer 2021 eq. text]. The 2023 statement says resistance must not be taken during the same maneuver used for volumes, because the best pant frequencies differ [S2, search summary of Bhakta 2023].

Order used in many laboratories, per Kraemer 2021 [PMC]: (1) at least 8 to 10 quiet tidal cycles with no panting for resistance; (2) at least three shutter closures for FRC; (3) linked IC and slow vital capacity; (4) forced maneuvers. Their inclusion rule was at least five sRaw loops of comparable shape, closed at the zero-flow points, with a closed expiratory limb. FRC acceptance in that paper's laboratory was "within a range of 7%", a laboratory practice that predates the 2023 grading and is not the standard.

### 1.2 Acceptability and grading of FRCpleth

| Item | Value | Tag |
|---|---|---|
| Pant frequency, acceptable | 0.5 to 1.0 Hz (30 to 60 per min) | S1/S2 (2023; 2005 slides agree) |
| Pant frequency, tolerated | above 1.0 up to 1.5 Hz only if spirometry shows no or minimal obstruction | S1 (2023 Table 2 text via search) |
| Pant frequency, flagged | below 0.5 Hz, or above 2 Hz with normal or mildly obstructed spirometry, or above 1.5 Hz with significant obstruction | S2 (Alvarado-Amador 2024 Spanish excerpt, garbled) |
| Why not faster | above 1.5 Hz overestimates FRC, worse with obstruction (mouth pressure underestimates the swing in alveolar pressure); below 0.5 Hz conflicts with the box's controlled leak | S1 |
| Mouth-pressure transducer | flat frequency response; 8 Hz is the minimum for pants slightly above 1 Hz (five times the signal frequency) | S1 |
| Preceding tidal breathing | stable end-expiratory level, more than 3 breaths (usual 3 to 10), then shutter closes at end-tidal expiration | S2 (deck, AARC) |
| Acceptable pant trace | 2 to 3 almost superimposed straight lines on the box-vs-mouth pressure plot, separated only by small thermal drift | S1 |
| Useable (report with caution) | parallel straight lines from thermal drift, unstable end-tidal level, among other weaker features | S1 |
| Repeatability metric | (highest - lowest) / mean of FRC values | S2 |
| Grade A | 3 or more acceptable FRCpleth within 5% | S2 (medigraphic table reproducing 2023) |
| Grade B | 2 acceptable within 5% | S2 |
| Grade C | 2 acceptable within 10% | S2 |
| Grades D, E, U, F | weaker or absent | S2 |
| Pants per FRC trial | a series of pants (3 to 5 technically satisfactory pant maneuvers per FRC determination quoted in one vendor deck) | S2 (single source) |
| Reported FRC | mean of the acceptable FRC values | S2 |
| Volume calibration | 3 L syringe daily, three strokes at flows 0.5 to 12 L/s, error 3% or less; isothermal lung model to verify the plethysmograph | S1/S2 |

Before 2023 the 2005 standard asked for at least three acceptable FRCpleth within 5% [S2: Respir Care 2012 summary]. The 2023 text keeps 5% for plethysmography and 10% for multiple-breath washout and helium dilution [S2]. One source claims the 2023 update relaxed plethysmographic FRC to 10%; see Section 4.

### 1.3 How TLC, RV, ERV, IC and VC are obtained

Maneuvers are linked to the FRC measurement. After the pants, the shutter opens and the subject performs a slow inspiratory capacity (IC) maneuver to TLC, then a slow exhalation to RV (expiratory vital capacity), or the equivalent expiratory-first sequence [S1/S2: "linked IC manoeuvre followed by an EVC"].

- ERV = FRC - RV measured from the linked spirometry: the volume from the tidal end-expiratory level to the point of full exhalation.
- IC = TLC - FRC measured from the linked spirometry.
- 2023 statement: TLC is the mean, over acceptable efforts, of FRC plus linked IC; RV is TLC minus the largest acceptable VC [S2, search summary; one deck says "reported TLC is RV plus the largest acceptable IVC"].
- 2005 standard: RV = reported FRC - mean of acceptable linked ERV; TLC = RV + largest VC [S2 summary].
- Simulator consequence: because the two routes are algebraically equivalent in a noise-free model (FRC, ERV, IC, VC all generated from one volume set), generate TLC = FRC + IC, RV = FRC - ERV, VC = IC + ERV and add per-effort noise to the linked spirometry. Present the 2023 convention.

### 1.4 Artifacts and what they look like

| Artifact | Appearance on the shutter plot (box pressure vs mouth pressure) | Effect on FRC | Tag |
|---|---|---|---|
| Good pant | thin line, 2 to 3 nearly overlapping straight segments; closed, no hysteresis | none | S1 |
| Thermal drift | successive pants shift off one another; parallel, stacked lines or an open slow ramp; body heat and warm exhaled gas warm the cabin until it equilibrates after door closure | acceptable if minimal; "useable" if parallel; unstable results if large | S1/S2 |
| Pant too fast (above 1.5 Hz) | line rotates and may open into a thin ellipse because mouth pressure underestimates alveolar pressure | overestimated, worse with obstruction | S1 |
| Pant too slow (below 0.5 Hz) | drift and box controlled-leak distort the loop | unreliable | S1 |
| Cheek/mouthpiece leak, incomplete occlusion, glottic closure | loop opens or bends, pressures distorted, shallow slope | invalid trial | S2 (low-authority study guide); shape detail MEM |
| Box leak | ever-decaying box pressure; slow baseline slide | affects both volume and resistance loops | MEM |
| Unstable FRC before closure | shutter closed off the usual end-tidal level | wrong lung volume labelled as FRC | S1 ("unstable end-tidal lung volume" in the useable class) |

Pathophysiology of why panting is used: warming and humidifying of inspired gas and cooling of exhaled gas in the box add a thermal volume to the shift volume. Panting keeps tidal volume within the dead space, which minimizes this, and electronic or digital compensation can subtract part of the thermal signal [PMC8223795, Zilianti 2021]. The same review notes that panting is an artificial breathing pattern that changes lung operating conditions, especially in COPD.

### 1.5 Loop shapes for the specific resistance (shutter-open) loop

The axes are shift volume (box pressure, vertical) against airflow (horizontal), with flow in L/s and the loop passing through the origin. sGaw is usually fitted over a line at about +/-0.5 L/s [S2: Respir Res 2015 paper via search]; sRaw tidal fits use a chosen flow range and slope.

| Condition | Loop shape | Source |
|---|---|---|
| Normal | steep, nearly straight, closed loop through the origin; inspiratory and expiratory limbs superimpose | S2 (Criee 2011 summary, indiachest slides) |
| Peripheral/expiratory obstruction | expiratory limb flattens (lower slope) and may bend or "open"; "golf club" with increased expiratory resistance | S2 |
| Mild diffuse obstruction | "cursive S" tilt | S2 (single source) |
| Central or extrathoracic obstruction | sigmoid (S-shaped) loop; raised inspiratory resistance for extrathoracic obstruction | S2 |
| Air trapping, emphysema, ventilatory inhomogeneity | loop opens at zero flow (hysteresis, pendelluft); the expiratory limb fails to close at zero flow, attributed to different emptying time constants and small-airway closure | S2; PMC Kraemer 2021 |
| Restriction | loop steep and narrow (low resistance expressed per small volume); sRaw may look normal or low; no distortion expected unless coexisting disease | MEM, consistent with "steep curve excludes relevant obstruction" [S2] |
| Large lung volume | flatter slope for a given Raw (sRaw = Raw x TGV) | S2 ("in a large lung ... more flat, in a small lung more steep" regarding occlusion curve) |

For the alveolar-pressure-flow loop during spontaneous breathing, rotation is constantly counterclockwise in expiration and variable in inspiration; one loop area was smaller than the other in all groups, and the stated reason (loop-generating factors add in expiration and may cancel in inspiration) implies the expiratory area is the larger (subscripts were lost in the extracted text). In COPD the expiratory loop widens markedly with tidal expiratory flow limitation (area 360% larger; width at peak expiratory alveolar pressure above 1.67 cmH2O discriminated flow limitation with sensitivity 94% and specificity 96%) [PMC8223795]. Use this only for an optional tidal-loop view.

### 1.6 Typical numbers in healthy adults

| Quantity | Value | Tag |
|---|---|---|
| Pant frequency | 0.5 to 1.0 Hz | S1 |
| Tidal breathing in the box, resting | frequency about 20 per min; tidal volume about 0.90 L (higher than usual, attributed to the enclosed box); Ti 1.30 s; Te 1.66 s; VT/Ti 0.69 L/s | PMC (Kraemer 2021, adults, mean +/- SD in paper) |
| sRaw, upper limit, adults over 10 y | 1.2 kPa.s (sReff/sRtot) | S2 (German Atemwegsliga guideline excerpt); 1.0 kPa.s for 10 y or younger |
| sRaw, healthy adult mean | about 6 cmH2O.s (about 0.6 kPa.s with 1 cmH2O = 0.098 kPa) in 517 adults aged 18 to 65 | S2 (Piatti 2012 abstract); conversion DER |
| Raw, healthy median / upper limit of normal | 0.22 / 0.38 kPa/(L/s) | S2 (Respir Res 2015, 157 healthy) |
| sGaw, healthy median / lower limit of normal | 0.85 / 0.63 1/(kPa.s) | S2 (same paper) |
| Consistency check | Raw 0.22 kPa/(L/s) x TGV 3 L = 0.66 kPa.s, close to the 0.6 kPa.s mean above | DER |
| Mouth-pressure swing during shutter pant | about +/-1 kPa (+/-10 cmH2O) is a reasonable teaching value | MEM, unverified |
| Box volume change per swing | DeltaV = TGV x DeltaPmouth / (PB - 47) = 3.0 L x 1 kPa / 95.0 kPa = about 32 mL | DER |
| Box pressure swing | on the order of a few pascals (hundredths of a cmH2O) for a box of several hundred litres; one vendor lists a box pressure range of +/-2 cmH2O | MEM (box volume), S2 (vendor range) |
| Shutter occlusion duration | about 0.3 to 1 s; mouth pressure equilibrates with alveolar pressure within about 20 to 150 ms | S2 (patent text), low authority |

Ranges that depend on the effort: obstruction lowers the usable pant frequency (above 1.5 Hz inflates FRC), so generate the "fast pant" artifact with an FRC inflation that scales with obstruction severity. The size of the inflation is not published in the excerpts reviewed; choose a bounded teaching value (for example 5 to 15%) and label it as illustrative.

## 2. Single-breath DLCO (ERS/ATS 2017, Graham et al.)

### 2.1 Acceptability, repeatability and procedure

| Item | Requirement | Tag |
|---|---|---|
| Inspired volume VI | 90% or more of the largest VC in the same session; alternatively 85% or more with VA within 200 mL or 5% (whichever is greater) of the largest VA from other acceptable maneuvers | S1 (executive summary Table 3 text) |
| Inspiration speed | 85% of VI inspired in under 4.0 s; longer times are noted on the report | S1 |
| Breath-hold (calculated) | 10 +/- 2 s (8 to 12 s); the 2005 window was 9 to 11 s | S1; S2 for 2005 |
| Alveolar sample collection | completed within 4 s of the start of exhalation | S1 |
| Rapid gas analyzer (RGA) virtual sample | starts only after dead-space washout is complete; washout point found by an objective algorithm on the tracer curve or by Fowler dead space | S1 |
| Classical (discrete sample) washout volume | 0.75 to 1.0 L BTPS; may fall to 0.50 L if VC is under 2.00 L | S1 |
| Classical sample volume | 0.5 to 1 L; under 0.5 L allowed if VC is under 1 L and dead-space clearance is confirmed | S1 |
| Apparatus dead space | VDequip under 200 mL for adults including filter and mouthpiece; smaller for children and VC under 2 L | S1 |
| Faults | no evidence of Mueller or Valsalva during the hold; no leak | S1 |
| Gas analyzer drift | CO drift 10 ppm or less over 30 s; tracer drift 0.5% of full scale or less over 30 s | S1 |
| Wait between tests | at least 4 min for classical systems; for RGA systems end-exhaled tracer must be 2% or less of the test-gas tracer concentration; longer for obstructed subjects | S2 (MGC poster and sell sheet) |
| Number of tests | up to 5 attempts to obtain at least 2 acceptable and repeatable tests | S2 (clinical-trial protocols; not seen in the standard text) |
| Repeatability | two acceptable DLCO values within 2 mL/min/mmHg (0.67 mmol/min/kPa) of each other; report the mean of the acceptable, repeatable tests | S1/S2 |
| Plot axis | plot CO and tracer concentrations against expired volume, not time, for visual confirmation | S1 (excerpt) |
| Hb reference | 14.6 g/dL (9 mmol/L) for men and boys 15 y or older; 13.4 g/dL (8.26 mmol/L) for women and children under 15 | S2 (ndd application note quoting the standard) |
| Hb adjustment | DLCO,adj = DLCO measured x (10.22 + Hb) / (1.7 Hb) for the male reference; (9.38 + Hb) / (1.7 Hb) for the female and child reference. Equivalent: predicted DLCO x 1.7 Hb / (10.22 + Hb) | S2 (ndd note, trial protocols) |
| COHb | back-pressure estimated from COHb and subtracted from the initial and final alveolar CO pressures; empiric alternative: reduce predicted DLCO by 1% for each percentage point of COHb above 2% | S2 (excerpt of eq. 36 and 37; equations themselves not seen) |
| Altitude/PIO2 | adjust only for supplemental oxygen or altitude PIO2; DLCO rises about 0.31 to 0.35% per mmHg fall in PAO2 or PIO2 relative to 150 (PIO2 = 0.21 x (PB - 47)) in the 1999 AARC form; the 2017 equation not seen | S2 (AARC 1999 guideline); 2017 wording unverified |

### 2.2 Test gas and calculations

- Test gas: 0.3% CO, a tracer, 21% O2, balance nitrogen. Tracer is 10% helium, or 0.3% methane (RGA systems), occasionally neon [S2; PMC2235885 used 0.3% CH4, 0.3% CO, 21% O2, balance N2].
- VA = (FI,tracer / FA,tracer) x (VI - VD), with VD the sum of apparatus and anatomic dead space and FA,tracer the tracer fraction in the alveolar sample [PMC2235885]. In a mass-balance "total-breath" version, VA and TLC come from the whole exhaled tracer curve (the RGA or total-breath method named in 2017). It gives higher VA, TLC and DLCO than the conventional sample in COPD (mean DLCO +0.47 mmol/min/kPa, TLC +0.50 L) with KCO unchanged [PMC10936061, Zurich 2024].
- Dead space for the mass-balance method in that study: 2.2 mL/kg for BMI under 30, height (m) / 189.4 for BMI of 30 or more [PMC10936061]. This is a study choice, not the Fowler measurement the standard requires.
- DLCO = [VA,STPD / (t x (PB - 47))] x ln(FA,CO,0 / FA,CO,t), t as breath-hold time in minutes (Krogh form) [MEM, standard physiology]. FA,CO,0 = FI,CO x (FA,tracer / FI,tracer).
- Breath-hold time: the standard prescribes a specific start and end point (Jones-Meade style: start at 30% of inspiration, end at the midpoint of the sample) [MEM; search excerpts confirmed only that AARC 1999 asks for Jones-Meade]. The simulator can use "30% of VI to mid-sample" and label it as such.
- KCO = DLCO / VA.

### 2.3 Shape of the traces

Axes: time on the horizontal axis (or expired volume for the exhalation plot), gas fractions on the vertical axis. In a time plot the lung volume is usually drawn as a separate or overlaid trace.

1. **Pre-test tidal breathing and full exhalation to RV.** Tracer and CO fractions are zero (or the small end-exhaled residual).
2. **Inspiration.** Rapid, steady inhalation of test gas from RV to TLC. FI,CO about 0.3% and FI,tracer at test-gas level appear at the mouth as a step at the start of inspiration, with a short delay for the apparatus; sampled concentrations at the mouth fall to near the alveolar mixture by the end of inspiration because the last inspired gas is dead-space gas. Time normally under 4 s for 85% of VI.
3. **Breath-hold at TLC.** Mouth gas is not sampled; lung volume trace is flat, no pressure deflection. Concentrations inside the lung change (CO falls by uptake; the tracer stays constant by dilution only). The hold is 10 +/- 2 s.
4. **Exhalation.** The sampled gas first shows dead-space gas (high, near the test-gas composition), then a fast fall (phase II) to the alveolar plateau at lower concentrations. Dead-space washout ends at the knee. The knee of the CH4 and CO curves after the hold usually marks the start of a sample of 500 to 1000 mL [PMC2235885 Figure 1 legend]. Plotted against expired volume, healthy alveolar curves are nearly flat; in COPD the plateau slopes (CH4 and CO tracings steeper during emptying because of increased time constants) [PMC2235885].
5. **Washout and sample marks.** Draw a shaded washout zone (about 0.75 to 1.0 L, or 0.5 L if VC under 2 L, or a Fowler/algorithm-defined point for RGA systems) followed by a shaded sample window (0.5 to 1 L, finished within 4 s of the start of expiration).

Healthy-subject measures in a study of 30 non-smoking adults aged about 65 with RGA: washout (dead space) 563 +/- 134 mL (range 150 to 750 mL), sample 561 +/- 195 mL (range 240 to 920 mL), in 3 of 30 the inspiratory time exceeded 4 s and in 9 of 30 the hold was out of range [PMC2235885]. Typical VA in that group 5.10 +/- 1.33 L, DLCO 95% predicted, VA 93% predicted [PMC2235885 Table 1].

### 2.4 Technical faults, as the simulator should show them

| Fault | What the trace shows | Effect on DLCO / VA | Tag |
|---|---|---|---|
| Incomplete inhalation (VI/VC under 0.90, or under 0.85) | smaller inspiratory volume step; VA smaller; tracer and CO fractions otherwise normal | VA and DLCO fall; KCO rises | S1 (acceptance rule); effect direction MEM |
| Slow inspiration (85% of VI not reached by 4 s) | long, shallow inspiratory ramp | breath-hold start ambiguous; DLCO distorted; flagged, not necessarily rejected | S1 |
| Breath-hold too short or too long | hold flat but out of 8 to 12 s | formula-corrected for time but tracer mixing and the sample point shift; flagged | S1 |
| Valsalva during hold | volume flat, with a positive airway-pressure deflection during the hold if a pressure channel exists (MEM; not shown on the volume or gas traces alone) | DLCO lower than true (reduced pulmonary capillary blood volume); fall in pulmonary capillary flow during strain documented for the Valsalva maneuver at rest (2.58 to 1.62 L/min/m2) [JCI 1966 excerpt] | S1 (rule); S2 (physiologic basis); direction for DLCO MEM |
| Mueller during hold | negative airway pressure; lung volume rises slightly | DLCO higher than true (increased capillary blood volume) | S1 (rule); direction MEM; the JCI study found no change in capillary flow with Mueller |
| Leak (inspiratory or expiratory) | volume loss during hold; unexpected steps, volume not returning to RV | VA misestimated; tracer or CO misreads; test unacceptable | S1/S2 (UTMB/PFT reading document: not exhaling to RV may mean a leak) |
| Early exhalation or premature release | hold shorter than planned; exhaled volume begins before the breath-hold finishes | measured hold short; alveolar sample may include dead-space gas if the washout is cut | MEM |
| Sample taken before dead-space is cleared | sample window begins inside phase II | alveolar CO too high; DLCO underestimated | S1 |
| Sample taken after the plateau | sample window late | DLCO overestimated | S1 |
| Incomplete washout between tests | non-zero baseline tracer or CO at start of test | VA and DLCO bias | S1 (2% rule for RGA) |

### 2.5 Typical numbers in healthy adults

| Quantity | Value | Tag |
|---|---|---|
| VI / largest VC | at least 0.90 required; healthy subjects who perform well reach about 0.95 to 1.0 | S1 (rule); typical range MEM |
| Inspiratory time (85% of VI) | under 4.0 s; 2 to 3 s is a reasonable teaching value | S1 (limit); typical MEM |
| Breath-hold | 10 +/- 2 s | S1 |
| Washout volume | 0.5 to 1.0 L; observed 0.56 L mean in older healthy adults | S1; PMC |
| Alveolar sample | 0.5 to 1.0 L; observed 0.56 L mean | S1; PMC |
| VA in healthy adults | about 5 L (5.1 L in a mixed-sex group aged 65) and about 93 to 100% of predicted TLC-based VA | PMC |
| FI,CO / FI,tracer | 0.3% CO; 0.3% CH4 or 10% He | S2/PMC |
| DLCO | roughly 20 to 35 mL/min/mmHg (7 to 12 mmol/min/kPa) in adults, age/sex/height dependent | MEM; use GLI-2017 TLCO equations already in the repository |
| Alveolar CO decay during the hold | final alveolar CO is the initial value times exp(-DLCO x t x (PB-47)/(VA,STPD x 60)); for VA 6 L BTPS, t = 10 s, PB 760 mmHg the factor is 0.79 at DLCO 10, 0.55 at DLCO 25, 0.43 at DLCO 35 mL/min/mmHg | DER |

## 3. Design implications for the simulator

1. Generate both tracings from the case's physiologic state. Plethysmography: TGV, sRaw (or Raw x TGV), pant frequency and artifact type. DLCO: VA, DLCO, VI/VC, hold time, washout and sample volumes, and fault type.
2. Make the shutter plot a straight line whose slope is proportional to TGV, with noise, drift and hysteresis as separate parameters. Reproduce the three tags: good (closed, single line), minimal drift (nearly overlapping lines, acceptable), parallel drift (stacked lines, useable), fast pant (rotated, opened), leak (bent or opened).
3. Make the Raw loop from a resistance, an optional expiratory flow-dependent term (flattening), a hysteresis term (opening at zero flow) and a central-obstruction term (sigmoid).
4. Apply the 2023 FRC grade rule (A: 3 within 5%, B: 2 within 5%, C: 2 within 10%), the pant-frequency check (0.5 to 1.0 Hz, to 1.5 Hz if non-obstructed), and linked-VC sequence.
5. Apply the 2017 DLCO acceptability rules (VI at least 90% of largest VC, or 85% with the VA concordance rule; 85% of VI in under 4 s; hold 8 to 12 s; sample finished within 4 s; no Valsalva, Mueller, leak) and repeatability of 2 mL/min/mmHg absolute. Use Hb, COHb and altitude adjustments with the numeric forms in Section 2.1 and label which are verified.
6. Display units: mL/min/mmHg and mmol/min/kPa (conversion factor 3 for 2 mL/min/mmHg = 0.67 mmol/min/kPa).

## 4. Unverified or conflicting

- **Primary text not read.** All 2017 DLCO and 2023 lung-volume numbers rest on search excerpts and secondary summaries. Before hard-coding thresholds, a human should read Table 2 of Bhakta 2023 and Table 3 of Graham 2017 against this note.
- **Inspired volume 85% versus 90%.** One search summary stated the 2005 standard lowered the requirement from 90% to 85% of the largest VC, and another presented 85% as the 2017 rule. Later excerpts quoting the 2017 table give 90% as the main requirement, with 85% allowed only if VA is within 200 mL or 5% of another acceptable maneuver. This note uses the latter. Resolve against the full text.
- **FRC repeatability 5% versus 10%.** A secondary source says the 2023 update relaxed FRC to 10%. Other excerpts of the 2023 text give 5% for body plethysmography and 10% for multiple-breath washout and helium dilution, and the grading table uses 5% for grades A and B with 10% reserved for grade C. This note uses the latter.
- **RV from FRC - ERV versus TLC - VC.** Summaries differ on which route the 2023 statement uses; the route with linked IC is described in several excerpts. Not important when volumes are generated consistently.
- **Pant frequency.** Excerpts agree on 0.5 to 1.0 Hz. An MGC sell sheet allows up to 1.5 Hz without obstruction, matching 2023 Table 2. A Spanish-language excerpt gives flag limits of 2 Hz (normal or mild) and 1.5 Hz (significant obstruction) in garbled form. The earlier teaching figure of 1.0 to 1.5 Hz is not supported as the target.
- **Maximum DLCO tests and the 4-minute wait.** Seen in trial protocols and manufacturer sheets citing ATS/ERS, not in the standard text. The 4-minute wait and the 2% tracer rule appear on an MGC poster.
- **DLCO repeatability.** The 2017 criterion is an absolute 2 mL/min/mmHg. An older ATS rule (10% or 3 mL/min/mmHg of the mean) appears in some summaries and should not be applied.
- **Hb equations.** Taken from an ndd application note and trial protocols that cite the standard. The COHb equations 36 and 37 and the altitude/PIO2 equation of 2017 were not seen. The AARC 1999 altitude form is shown only as a historical placeholder.
- **Valsalva and Mueller direction on DLCO.** The standard rejects both, but no source here quantified the effect on DLCO. The directions (Valsalva lowers, Mueller raises) are from memory; the retrieved physiological study found a fall in pulmonary capillary flow with Valsalva and no change with Mueller.
- **Breath-hold start and end definition.** The Jones-Meade form is not confirmed for 2017.
- **Mouth-pressure and box-pressure magnitudes.** No source gave a typical mouth-pressure swing during panting. The +/-1 kPa value, the box volume, and the percent FRC inflation for fast panting are illustrative and must be labelled as such. Box pressure swings are derived, not measured.
- **Loop shapes for restriction and artifacts.** Descriptions of leak and glottic closure loops, and the "steep narrow" restrictive loop, are from memory or a low-authority study guide.
- **Normal sRaw limit.** The 1.2 kPa.s limit comes from a German society excerpt via search; Piatti's mean converts to about 0.6 kPa.s. The Raw/sGaw medians and limits come from one Respir Res 2015 abstract.

## Sources

Opened in full through PubMed Central:

- Kraemer R, Smith HJ, Matthys H. Normative reference equations of airway dynamics assessed by whole-body plethysmography during spontaneous breathing. Physiol Rep 2021. PMC8436055. https://doi.org/10.14814/phy2.15027
- Zilianti C, Santus P, Pecchiari M, D'Angelo E, Radovanovic D. Diagnostic insights from plethysmographic alveolar pressure assessed during spontaneous breathing in COPD patients. Diagnostics 2021. PMC8223795. https://doi.org/10.3390/diagnostics11060918
- Assessment of the alveolar volume when sampling exhaled gas at different expired volumes in the single breath diffusion test. BMC Pulm Med 2007. PMC2235885. https://doi.org/10.1186/1471-2466-7-18
- The total-breath method yields higher values of DLCO and TLC than the conventional method. BMC Pulm Med 2024. PMC10936061. https://doi.org/10.1186/s12890-024-02932-y

Primary standards (metadata verified in PubMed; text seen only as search excerpts):

- Bhakta NR, et al. ERS/ATS technical statement: standardisation of the measurement of lung volumes, 2023 update. Eur Respir J 2023;62:2201519. https://doi.org/10.1183/13993003.01519-2022 ; https://publications.ersnet.org/content/erj/62/4/2201519
- Graham BL, et al. 2017 ERS/ATS standards for single-breath carbon monoxide uptake in the lung. Eur Respir J 2017;49:1600016. https://doi.org/10.1183/13993003.00016-2016 ; https://publications.ersnet.org/content/erj/49/1/1600016
- Graham BL, et al. Executive summary. Eur Respir J 2017;49:16E0016. https://doi.org/10.1183/13993003.E0016-2016 ; https://publications.ersnet.org/content/erj/49/1/16e0016
- Wanger J, et al. Standardisation of the measurement of lung volumes. Eur Respir J 2005;26:511-522. https://doi.org/10.1183/09031936.05.00035005 ; https://publications.ersnet.org/content/erj/26/3/511

Secondary or vendor documents seen as search results:

- Alvarado-Amador et al. Whole-body plethysmography: updated recommendations. Neumol Cir Torax 2024;83(2):153-165. https://www.medigraphic.com/pdfs/neumo/nt-2024/nti242f.pdf
- Lung Volume Updates 2023 (slide deck). https://respiratoryassociates.com/wp-content/uploads/2026/05/Lung-Volume-Updates-2023.pdf
- Vitalograph / Mottram. ERS/ATS Technical Standard Lung Volumes 2023 Update. https://vitalograph.com/wp-content/uploads/2023/10/ERS-ATS-Technical-Standard-Lung-Volumes-2023-Update_-Prof-Carl-Mottram.pdf
- AARC. Lung volume 2023 standard slides. https://s3.amazonaws.com/client-aarc/DIS_UPLOAD/2023_ERS_ATS_Lung_Volume_Technical_Standard_Update_2311272105406.pdf
- AARC body plethysmography guideline. https://www.aarc.org/wp-content/uploads/2014/08/05.01.507.pdf
- AARC 1999 DLCO guideline. https://www.aarc.org/wp-content/uploads/2014/08/05.99.539.pdf
- Respir Care 2012 summary of ATS/ERS lung volume statement. https://rc.rcjournal.com/content/respcare/57/7/1076.full-text.print
- MGC Diagnostics ATS/ERS guidelines poster. https://mgcdiagnostics.com/images/uploads/documents/ATS_ERS_Guidelines_poster_006006-001.pdf
- MGC Diagnostics ATS/ERS sell sheet. https://mgcdiagnostics.com/images/uploads/documents/ATSGuidelines_SellSheet_060137-001rE.pdf
- ndd Medical. Adjustment of DLCO measurements (application note). https://cdn.nddmed.com/downloads/application-notes/appnote-dlcoadjustment-v03r-2.pdf
- UTMB policy summarizing DLCO grading. https://www.utmb.edu/policies_and_procedures/40929138
- Criee CP, et al. Body plethysmography: its principles and clinical use. Respir Med 2011;105:959-971. https://pubmed.ncbi.nlm.nih.gov/21356587/ (abstract only)
- Piatti G, et al. Normal sRaw in healthy adults. https://iris.unipv.it/handle/11571/571155 (abstract)
- Respir Res 2015, Raw/sGaw reference values. https://respiratory-research.biomedcentral.com/track/pdf/10.1186/s12931-015-0252-0 (abstract excerpt)
- German Atemwegsliga, Bodyplethysmographie. https://www.atemwegsliga.de/files/eigene-dateien/Lungenfunktion/2024-Vorlagen/2-Bodyplethysmographie.pdf
- German Atemwegsliga, Diffusionskapazitaet. https://www.atemwegsliga.de/files/eigene-dateien/Lungenfunktion/2024-Vorlagen/3-Diffusionskapazit%C3%A4t.pdf
- Pulmonary capillary flow during Valsalva and Mueller maneuvers. J Clin Invest. https://www.jci.org/articles/view/106337 (abstract excerpt)
- Body plethysmography i: standardisation and quality criteria. An Pediatr 2015. https://www.analesdepediatria.org/en-titulo-articulo-S2341287915001271
