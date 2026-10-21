# Written-impression grader: evaluation record

**Status: experimental, unreliable, not for trainee assessment. Disabled by default (`?written=1` opts in). Not validated, clinically or otherwise.**

All gold labels were written by language models (the author of each phrasing set, and a blind second model for adjudication). No clinician panel took part. Nothing here is a claim of clinical validity or of general language understanding. Raw outputs are kept unedited under `raw/`.

## Sets and what each one is

| Set | File | Items / judgments | Written by | Role | SHA-256 |
|---|---|---|---|---|---|
| 1 | `tests/fixtures/written/heldout.json` | 144 / 720 | a Sonnet agent given only the task text, before any code existed | **Tuned-on** after its first run: development / regression only, not held-out validation | `b507d656…833f` |
| 2 | `tests/fixtures/written/unseen2.json` | 168 / 840 | a separate Sonnet agent, never saw the code | Fresh for one run; **tuned-on afterwards** (development only) | `714f5182…e4c1` |
| 3 | `tests/fixtures/written/unseen3.json` | 175 / 875 | an Opus agent, five writer personas, never saw the code | Fresh; run **once** against the frozen code `157bab46220ccb9627e1e92454cd2865b92295f9`; **not tuned on** | `86a8e5e0…c7e174` |

A judgment is one set item × one of five domains (pattern, severity, bronchodilator, diffusing capacity, quality). Verdict groups are the grader's: correct, contradictory, missing, review (needs review), none (nothing expected and nothing said). Gold labels: correct, wrong, absent, uncertain.

Definitions used below. **False credit**: graded correct where the author's label is not correct. **False contradiction**: graded contradictory where the author's label is not wrong. **False missing** (a false "not mentioned" accusation): graded missing where the author's label is correct or wrong. **Abstention on clear**: graded review where the author's label is correct or wrong. These are measured against the author's labels, which can themselves be wrong; where a blind adjudicator was used it is stated.

## Raw results (nothing re-labelled, nothing dropped)

| Run | False credit | False contradiction | False missing | Credit recall | Contradiction recall | Abstained on clear | Reviewed on uncertain |
|---|---|---|---|---|---|---|---|
| Set 1, first run, before any tuning (`raw/heldout-run1-first-run-before-tuning.txt`) | 10 / 720 | 16 / 720 | 5 / 720 | 178 / 248 | 34 / 41 | 37 / 289 | 34 / 52 |
| Set 1, development, final code | 2 / 720 | 0 / 720 | 0 / 720 | 183 / 248 | 32 / 41 | 53 / 289 | 48 / 52 |
| Set 2, first and only fresh run (`raw/unseen2-run1-first-run.txt`) | 5 / 840 | 10 / 840 | 16 / 840 | 250 / 330 | 34 / 42 | 49 / 372 | 105 / 123 |
| Set 2, development after fixes (contaminated) | 0 / 840 | 0 / 840 | 1 / 840 | 262 / 330 | 33 / 42 | 58 / 372 | 116 / 123 |
| **Set 3, single fresh run** (`raw/unseen3-run1-single-shot.txt`) | **15 / 875** | **3 / 875** | **21 / 875** | 235 / 306 | 37 / 54 | 51 / 360 | 93 / 130 |

Set 3 full confusion matrix (rows: author label; columns: grader group), 875 judgments:

| | correct | contradictory | missing | review | none |
|---|---|---|---|---|---|
| author correct (306) | 235 | 1 | 20 | 44 | 6 |
| author wrong (54) | 1 | 37 | 1 | 7 | 8 |
| author absent (391) | 0 | 0 | 54 | 77 | 254 |
| author uncertain (130) | 14 | 2 | 15 | 93 | 6 |

## Why the feature is not ready

The single fresh run on set 3 produced 15 false credits and 21 false "not mentioned" accusations. A blind Opus adjudication of the disputed items (47 items, 235 judgments, input labels hidden; `raw/adjudication3-*.json`) agreed with the author on 231 of 235 judgments and confirmed 14 of the 15 false credits, all 3 false contradictions and all 21 false "missing". Set 2 behaved the same way on its first run (5 / 10 / 16), and set 1 on its first run (10 / 16 / 5). Every time, a fresh phrasing set found new failures, which is the signature of a grammar that does not generalize. The capabilities were frozen before set 3 (`SUPPORTED.md`) and the failures were not tuned against, as agreed.

Failure categories in the set 3 cases below (hypotheses read off the examples; not yet verified by fixes):

- Hedging or attribution worded in ways the cue lists do not contain ("Tech comment: … Lab interpretation: severe obstruction", "Software flagged … reported as …", "Reported as … ; agree", "on reflection I'd call it moderate", "Could be … if the ratio is truly below the LLN", "appears significant though I would confirm", "Some BD response, possibly significant", "Not obviously BD responsive … okay I think").
- Statements that list values or describe spirometry without committing to a pattern ("FEV1 28%, ratio 0.41, … grade D"; "Spirometry shows a reduced FVC and FEV1 with a normal ratio").
- Double negation read as a contradiction instead of abstaining ("No evidence against severe obstruction", "Ratio not not low", "isn't insignificant") and a "?" prefix not read as a hedge ("↓FVC → ?restriction").
- Notation and wording not covered: "+BD", "BD (-)", "BD -", "OVD", "OVD + RVD", "v severe", "No reversible", "the bronchodilator test is positive", "the DLCO is in normal", "Diffusion is increase", "Pattern no specific", "WNL spiro, TLC, DLCO", and long clinical prose around a statement.

## Set 3 failures, exact inputs

Author = the phrasing set's author. Blind adjudicator = the second model that saw only the scenario facts. Grader = this code at `157bab4`. Scenarios T1 to T7 (the facts given to the author and to the adjudicator): T1 moderate obstruction, BD significant, DLCO reduced; T2 severe obstruction, BD not significant, DLCO normal, quality limited; T3 PRISm (no TLC), no BD, DLCO normal; T4 mixed, BD not significant, DLCO reduced; T5 all normal, no BD; T6 obstruction with FEV₁ preserved, BD significant, DLCO normal; T7 nonspecific, no BD, DLCO raised.

### FALSE CREDIT  (15)

| ID | Case | Domain | Author | Blind adjudicator | Grader | Exact input |
|---|---|---|---|---|---|---|
| V024 | T1 | bd | uncertain | uncertain | correct | "Could be consistent with moderate obstruction if the ratio is truly below the LLN; BD response appears significant though I would confirm with a repeat; DLCO reduced." |
| V031 | T2 | bd | uncertain | uncertain | correct | "Severe? Could be moderate given the poor efforts - hard to say. Not obviously BD responsive. DLCO okay I think." |
| V031 | T2 | dlco | uncertain | uncertain | correct | "Severe? Could be moderate given the poor efforts - hard to say. Not obviously BD responsive. DLCO okay I think." |
| V042 | T2 | quality | uncertain | uncertain | correct | "FEV1 28%, ratio 0.41, post BD +4%, DLCO 92%, grade D" |
| V048 | T2 | pattern | uncertain | uncertain | correct | "Tech comment: efforts graded D, results should be interpreted with caution. Lab interpretation: severe obstruction, no significant BD response, normal DLCO." |
| V048 | T2 | severity | uncertain | uncertain | correct | "Tech comment: efforts graded D, results should be interpreted with caution. Lab interpretation: severe obstruction, no significant BD response, normal DLCO." |
| V048 | T2 | bd | uncertain | uncertain | correct | "Tech comment: efforts graded D, results should be interpreted with caution. Lab interpretation: severe obstruction, no significant BD response, normal DLCO." |
| V048 | T2 | dlco | uncertain | uncertain | correct | "Tech comment: efforts graded D, results should be interpreted with caution. Lab interpretation: severe obstruction, no significant BD response, normal DLCO." |
| V050 | T2 | severity | wrong | wrong | correct | "Severe obstruction... on reflection I'd call it moderate, since effort was poor and FEV1 is likely underestimated. No BD response. DLCO nl." |
| V071 | T3 | pattern | uncertain | uncertain | correct | "Spirometry shows a reduced FVC and FEV1 with a normal ratio." |
| V092 | T4 | bd | uncertain | correct | correct | "Reported as mixed defect; agree, both obstruction and restriction are present. BD response not significant as flagged. DLCO reduced." |
| V131 | T6 | bd | uncertain | uncertain | correct | "Software flagged ratio < LLN; reported as obstruction with significant BD response. I'd call it mild." |
| V132 | T6 | bd | uncertain | uncertain | correct | "Ratio is a bit low, maybe obstruction? FEV1 is fine. Some BD response, possibly significant." |
| V157 | T7 | dlco | uncertain | uncertain | correct | "Maybe restriction, maybe nonspecific - TLC is normal, so probably nonspecific? DLCO seems high, could be obesity or polycythemia." |
| V173 | T7 | dlco | uncertain | uncertain | correct | "Tech says FVC submaximal effort possible. Reported as nonspecific pattern with high DLCO." |

### FALSE CONTRADICTION  (3)

| ID | Case | Domain | Author | Blind adjudicator | Grader | Exact input |
|---|---|---|---|---|---|---|
| V044 | T2 | pattern | uncertain | uncertain | contradictory | "No evidence against severe obstruction. BD response is not absent." |
| V051 | T3 | pattern | correct | correct | contradictory | "nl ratio, ↓FVC → ?restriction, need lung vols. no BD. DLCO nl." |
| V144 | T6 | pattern | uncertain | uncertain | contradictory | "Ratio not not low. FEV1 not reduced. BD response isn't insignificant." |

### FALSE MISSING  (21)

| ID | Case | Domain | Author | Blind adjudicator | Grader | Exact input |
|---|---|---|---|---|---|---|
| V001 | T1 | bd | correct | correct | missing | "FEV1/FVC ↓, FEV1 62% (mod), FVC nl. TLC nl. +BD resp. DLCOc ↓." |
| V002 | T1 | dlco | correct | correct | missing | "Moderate airflow obstruction with a significant bronchodilator response. Lung volumes are normal. Diffusing capacity, corrected for hemoglobin, is reduced." |
| V018 | T1 | bd | correct | correct | missing | "Efforts poor, interpret with caution. Moderate obstruction, +BD, low DLCO." |
| V020 | T1 | bd | correct | correct | missing | "Moderate obstruction, the bronchodilator test is positive, the DLCO is in normal." |
| V023 | T1 | severity | correct | correct | missing | "Mixed obstr/restr, mod, BD neg, DLCO ↓" |
| V032 | T2 | pattern | correct | correct | missing | "v severe OVD. BD (-). DLCO WNL. quality D." |
| V032 | T2 | severity | correct | uncertain | missing | "v severe OVD. BD (-). DLCO WNL. quality D." |
| V032 | T2 | quality | correct | correct | missing | "v severe OVD. BD (-). DLCO WNL. quality D." |
| V049 | T2 | pattern | correct | correct | missing | "OVD sev, BD neg, DLCO nl" |
| V049 | T2 | severity | correct | correct | missing | "OVD sev, BD neg, DLCO nl" |
| V080 | T4 | pattern | wrong | wrong | missing | "Restriction with reduced DLCO; no BD response." |
| V083 | T4 | bd | correct | correct | missing | "mixed defect, severe obstr component. BD -, DLCO ↓" |
| V090 | T4 | bd | correct | correct | missing | "Mixed pattern. Diffusion capacity normal. No reversible." |
| V094 | T4 | pattern | correct | correct | missing | "OVD + RVD. DLCO ↓. BD (-)" |
| V101 | T5 | dlco | correct | correct | missing | "WNL spiro, TLC, DLCO. no BD done." |
| V102 | T5 | pattern | correct | correct | missing | "Spirometry, lung volumes and diffusing capacity are within normal limits. A bronchodilator study was not performed." |
| V126 | T6 | bd | correct | correct | missing | "↓ratio w/ nl FEV1 → obstr, FEV1 preserved. +BD. DLCO nl." |
| V133 | T6 | bd | correct | correct | missing | "obstr (FEV1 nl), BD +, DLCO WNL" |
| V142 | T6 | bd | correct | correct | missing | "Patient is a 34 yo teacher with episodic wheeze since childhood, worse in spring and with cold air, and she notes that symptoms flare when the classroom is cleaned with a particular spray. She had two courses of oral steroids last year, uses her rescue inhaler about three times a week, and wakes at night roughly once a week. Her mother and brother have hay fever, she has a cat at home, and she is planning to move to a new apartment in the fall that she hopes will have fewer carpets. She jogs on weekends but stops at about two miles because of chest tightness. PFT: obstruction, reversible." |
| V143 | T6 | bd | correct | correct | missing | "mod obstr, +BD" |
| V174 | T7 | pattern | correct | correct | missing | "Pattern no specific, lung volume normal. Diffusion is increase. Not done the bronchodilatator." |

## Adjudication history (all kept)

1. Set 1: 28 disputed items plus 13 undisputed controls (41 items, 205 judgments) were adjudicated blind (`raw/adjudication1-*.json`). Author and adjudicator agreed on 198 of 205 judgments. Of the six remaining false credits at that time, the adjudicator sided against the grader on four (H005, H017, H027, H068), and the grader was changed to abstain on them; it agreed with the grader on two (H034, H094), which remain in the regression test as the two known "false credits" with the adjudicator's agreement noted.
2. Set 2: the five first-run false credits were attribution failures (`raw/unseen2-attribution-false-credits.json`). The first-run extractor's spans for them cannot be reproduced because no snapshot of that code was committed; the file holds the raw first-run lines and the current extractor's spans, labelled as such.
3. Set 3: adjudicated blind as above. It was not tuned on.
4. The hedge, attribution and double-negation rules were changed after set 1 and set 2 were seen. Set 1 and set 2 are therefore development sets. Only set 3 was unseen when run, and it failed.

## Known limitations of the evidence

- Labels come from language models, so label errors are possible in both directions. Disagreements are reported, not resolved by the author of the code.
- Domain definitions in the sets fold the "lung volumes needed" limitation into the pattern label, so the volumes item is not separately scored.
- Hyperinflation, air trapping and high TLC are not scored.
- Spans: every quote is a slice of the original text (`tests/written-extract.test.mjs`), but earlier-run spans are not reproducible (above).
- Nothing here measures effect on learners, usability, or fairness across writing styles or first languages. Non-English text abstains.
