# Narrative model

`src/interpret/narrative.js` composes the final interpretation that a physician would write for a simulated report, from the case, the interpretation key and the comparison of the two spirometry equations. It is rule-based and deterministic given a seed. It is a teaching text generator for an uncalibrated educational tool; it gives no treatment recommendation and no diagnosis. Nothing in this document is a validation claim.

## Interface

```js
composeNarrative({ caseData, interp, cmp, seed, forceVariant? }) -> {
  sections: [{ id, title, text }],
  finalStatement: string,
  findings: [{ id, text }],
  distractors: [{ id, text, flaw }],
}
```

`caseData` is the object returned by `buildCase`, with the optional `scenario` field of `docs/ARCHITECTURE-NEXT.md`. `interp` is one `interpret()` result (the equation the page presents), `cmp` is `compareEquations()` for the same report (may be `null`). `seed` selects phrasing through `createStream(seed, 'narrative')` and nothing else. `forceVariant` is a test hook that picks variant `forceVariant mod n` of every sentence type.

Other exports: `extractFacts(text)`, `applicableFlaws(caseData, interp, cmp)`, `sentenceTypes()`, `caveatCore(text)`, `FLAWS`, `BANNED_PHRASES`, `NARRATIVE_VERSION`.

The composer reads `caseData.report`, `caseData.spirometry`, `caseData.dlco` and `caseData.scenario`. It never reads `descriptor`, `groundTruth`, `truth` or `anchorKey` (a test replaces those with throwing getters). The true height in `scenario.height.trueCm` is never disclosed; only the stated height and its source appear.

## Sections

Sections follow the order of a physician interpretation (S6 and S3 in `docs/research/report-formats.md`). A section is omitted when its test was not done.

| id | content |
|---|---|
| `quality` | FEV1 and FVC grades separately, pre and post; acceptable maneuvers, rejection reasons and repeatability from the maneuver summary; the weaker variable; the effect on confidence |
| `reference` | equation named per index; the −1.645 limit; mixed-reference caution; fallback to an equation derived in another group; height source and reference sex assumptions from the scenario |
| `pattern` | physiology first, then the pattern with "consistent with"; values with units; severity or the statement that it is not graded; indices within 0.25 z of a limit |
| `volumes` | TLC against its limits; hyperinflation; air trapping; low ERV with body mass index; or the statement that volumes were not measured and what that leaves open |
| `dlco` | hemoglobin adjustment and its direction; category; KCO and VA relation; VA/TLC in airflow obstruction; carboxyhemoglobin; the unscored degree of reduction |
| `bronchodilator` | changes, both criteria, why they differ, post-bronchodilator ratio against the lower limit, discordance between FEV1 and FVC |
| `sensitivity` | reclassification between the two equations, severity and bronchodilator differences, borderline indices |
| `limitations` | major scenario caveats, then minor, then those marked "does not change the interpretation", then generic limits of the inputs |

The final statement is three to six sentences: quality; pattern and severity; volumes and diffusing capacity; bronchodilator; equation sensitivity (only when a classification, severity grade or bronchodilator result differs, or an index is borderline); major caveats and no-effect items. It always has at least three sentences because the volumes sentence states what was not measured.

`findings` are short canonical sentences, one fact each (quality, confidence, pattern, severity, borderline indices, volumes needed, hyperinflation, air trapping, low ERV, bronchodilator, diffusing capacity, subtype, hemoglobin adjustment, carboxyhemoglobin, equation change, each caveat). They are not varied by seed.

## Nuance rules and where they are implemented

1. Patterns are stated as "consistent with"; no disease names occur in correct text (`BANNED_PHRASES`).
2. Confidence scales with the worst of the FEV1 and FVC grades, pre and post: A or B adequate; C reduced confidence; D, E, U or F qualified (the statement says so and every classification is qualified). The C tier is a choice of this module; the D, E, U and F rule is the project rule.
3. Severity words (mild, moderate, severe) are used only for obstruction patterns, where the engine scores severity from the FEV1 z-score. For every other abnormal pattern the text says severity is not graded. The degree of DLCO reduction is not scored either, and is said to be unscored.
4. An index within 0.25 z of a limit carries "borderline" next to its z-score. A borderline value below a limit is "marginally below", a defining borderline measure turns the pattern noun into "borderline airflow obstruction" or "borderline restriction", and a borderline DLCO is "only marginally reduced". The words clearly, markedly and definitely are never used.
5. A bronchodilator section, sentence or tag appears only when the case has a post-bronchodilator study.
6. Restriction is named only with a measured TLC. Without it the text says restriction is not established; preserved ratio with a low FVC or FEV1 is named preserved ratio impaired spirometry (PRISm) and lung volumes are said to be needed; a low ratio with a low FVC is obstruction with volumes needed to separate air trapping from coexisting restriction.
7. The 2022 and the earlier bronchodilator criterion are both reported, and when they disagree the reason is computed from the change in percent of predicted, percent of baseline and millilitres.
8. A change of classification between GLI-2012 and GLI Global is reported at the measurement level, with both z-scores, and the pattern under each equation (S3 requires equation changes to be flagged).
9. Major caveats come first and are quoted from the scenario; caveats whose text says "does not change the interpretation" are stated as such. Decoy caveats are never used.

## Phrasing variation

Every sentence type has at least three variants (`sentenceTypes()`; a test enforces the minimum). A variant is chosen with one `rng.int` draw per sentence from `createStream(seed, 'narrative')`, so a fixed seed reproduces the text, and the stream is separate from every case stream. Variants of a type carry identical facts. Each fact class has a marker that every variant of the type contains ("consistent with" plus the pattern noun, "of moderate severity", "adequate", "reduced confidence", "qualified", "significant by the 2022 criterion", "adjusted for hemoglobin", "depends on the reference equation", and so on). `extractFacts(text)` recovers the facts as sorted tokens (`pattern:obstruction`, `severity:moderate`, `grades:AB`, `bd:2022:significant`, `dlco:reduced`, `borderline:FEV1/FVC ratio`, `equation:differs:FVC`, and others), and a test asserts that all variants of the final statement, every section and every distractor yield identical tokens. A change to a template that drops a marker fails that test.

## Distractors

A distractor is the final statement rebuilt by the same code from altered claims, so it matches the correct statement in style and differs in the one stated error (it is not a template with a flaw pasted on). Distractors for every applicable flaw are generated; there are at least five per case.

| flaw | applicable when | claim | check |
|---|---|---|---|
| `wrong-severity` | always (two grades, never the key's) | a severity word different from the key, or a grade where the key has none | the extracted severity differs from `key.severity` |
| `restriction-without-tlc` | no TLC and the pattern is PRISm or obstruction with low FVC | restriction (or mixed disease) asserted, volumes not requested | no TLC measure; pattern token restriction or mixed; key pattern is neither |
| `ignores-quality` | a grade of D, E, U or F, pre or post | the session is called adequate | quality token adequate, not qualified |
| `omits-major-caveat` | at least one major caveat | the caveat sentence is dropped | no major caveat text present |
| `ignores-equation-change` | a classification, severity or bronchodilator difference between the equations | the result is called unchanged by the choice of equation | `equation:robust` while the comparison differs |
| `wrong-bronchodilator-rule` | the two criteria disagree | the earlier criterion is reported as the result | no 2022 token; earlier result differs from `key.bronchodilator` |
| `reads-percent-predicted-as-normal-range` | an index at 80% of predicted or more but below the lower limit, or below 80% but within limits | the 80% convention classifies it | claimed status differs from the engine label |
| `dlco-unadjusted-for-hb` | the unadjusted DLCO falls in a different category from the adjusted value | the unadjusted category is stated | unadjusted category differs from `key.dlco`, no adjustment stated |
| `over-diagnoses` | always (three diagnoses) | a disease is diagnosed or excluded from the physiology alone | diagnosis token present, absent from the correct text |

`tests/narrative.test.mjs` checks each of these conditions on the extracted facts of every distractor in 600 generated cases, and that the flaws produced equal `applicableFlaws()`. Distractor order is fixed (by flaw); a page that shows them with the correct statement should shuffle them itself.

## Use as training data

Each composed case gives a structured input (the key, the measures and their z-scores, the comparison, the scenario) paired with several correct texts that differ by seed, canonical `findings` as labels, and labelled wrong statements with a machine-checkable flaw. The wording is a small controlled grammar, so a model trained only on it would reproduce these templates. If a model is trained later, hold out whole sentence types for evaluation, keep `NARRATIVE_VERSION` in the data, and treat the checks in the tests (facts consistent with the key, banned phrases absent, severity only where scored) as an acceptance filter on model output.

## What is unverified

The 2022 ERS/ATS statement has not been read in primary text by this project (see `SPEC.md` and `src/core/standards.js`). The following rules are therefore the engine's conventions, carried into the text unchanged, and the text says "not graded" or "unverified" where it relies on them:

- The severity cut points at z = −2.5 and −4.0 and the treatment of the boundary values, and the decision to grade severity only for obstruction.
- The bronchodilator criterion of more than 10% of predicted, whether the boundary is inclusive, and the earlier criterion of at least 12% and 200 mL over baseline.
- The borderline band of 0.25 z (the project default).
- The definitions of hyperinflation (TLC above the upper limit) and air trapping (RV or RV/TLC above the upper limit), marked "definition unverified" in the engine.
- The 2022 pattern names used here (obstruction, restriction, mixed, nonspecific, PRISm) were taken from a secondary summary in `docs/research/report-formats.md`; dysanapsis and simple versus complex restriction are not produced.
- The KCO and VA readings (six subtypes) come from the teaching text in `src/app/explain.js` and general physiology, not from the 2017 ERS/ATS diffusing capacity standard, which has not been read. The statement that VA falls relative to TLC in airflow obstruction is stated qualitatively, without a threshold.
- Carboxyhemoglobin is stated qualitatively. No numeric correction is applied or quoted.

Choices that belong to this module and have no source: hemoglobin adjustment is called material when the factor differs from 1 by 0.05 or more; the quality tier C is "reduced confidence"; the body mass index of 30 kg/m² that separates the two low-ERV comments; the generic limitation sentences. The phrasing has not been reviewed by a clinician.

## Known limitations

- The grammar is small, and a learner can learn the templates. A distractor and the correct statement come from the same builder, so style does not separate them, but the sentences that carry a flaw ("The diagnosis is …", the percent-predicted clause, the unchanged-by-equation sentence) recur across cases and mark a distractor.
- The composer states what the key says. It does not read prior studies, symptoms or clinical history, and says so.
- Quality uses grades and the maneuver summary only. Leaks, obstructed mouthpieces and zero-flow errors are not modeled by the generator, so they cannot appear.
- The quality qualification covers post-bronchodilator grades as well as baseline grades, which is broader than `interp.qualityLimited` (baseline only).
- `extractFacts` is regex based and tied to the marker phrases. Free-text caveats from the scenario module are quoted as given, with a leading capital lowered; caveat text that contains the marker phrases of another fact class (for example "adequate" or "reduced confidence") would be read as that fact by `extractFacts`, though not by the composer.
- The scenario module is not on the branch where this was written. Tests use synthesized scenario objects that follow the contract in `docs/ARCHITECTURE-NEXT.md` (`caveats`, `decoyCaveats`, `height`, `referenceSex`, `coHbPercent`). Caveats are recognized as having no effect on the interpretation only by the phrase "does not change the interpretation" in their text.
- The project instruction to consult the Claude Opus 5.5 model on the plan before coding interpretation changes was not carried out in this thread, because no tool for reaching that model was available. The design should be reviewed against that instruction before integration, and any recommendations recorded here.
