# Written-impression grader: supported grammar (frozen before the third evaluation set)

This is a bounded, rule-based reader of short, standard PFT statements. It is not general language understanding and makes no claim to be. Outside the grammar below it abstains (Needs review) and does not guess. The capabilities are frozen at the commit recorded in `EVALUATION.md`; later changes are defect fixes found by new tests, not coverage chasing.

## What it reads

- **Pattern**: obstruction/obstructive/airflow limitation, restriction/restrictive, mixed, nonspecific, PRISm, normal/WNL/within normal limits/no abnormality, a low FEV₁/FVC ratio, a low FVC with a normal ratio, "not interpretable". Short forms (obst, restr, nl, WNL, BDR, TLCO, DLCOc) and the notation `BD+`, `BD-`, `↓`, `↑`.
- **Severity of obstruction**: mild, moderate, severe (and mod, sev); a range is credited only when it is exactly the pair of bands the key accepts; FEV₁ preserved/normal/"not graded". Severity attached to restriction, a mixed pattern or TLC is not graded. Other wording ("moderately severe", GOLD, borderline) abstains.
- **Bronchodilator**: significant or not significant result (the 2022 key), no study performed. A bare "no BD" abstains. A statement under the 2005 rule abstains.
- **Lung volumes**: TLC low or normal (as restriction or no restriction), lung volumes missing or needed as a limit on the pattern. Hyperinflation, air trapping and a high TLC are not scored.
- **Diffusing capacity**: reduced, normal, raised, not performed, for the hemoglobin-adjusted DLCO only. KCO and VA statements are not DLCO statements. A reading tied to COHb abstains with one neutral message.
- **Test quality**: a limitation is expected only when a spirometry grade is D or worse.
- **Spelling**: domain nouns only (obstruction, restriction, bronchodilator, diffusing, ...), by edit distance, only when the repair is unique and the word is long enough; value, negation and hedge words are never repaired, and an unreadable value word near a domain word abstains.

## How certainty and negation are decided

Negation comes from explicit cue words in a bounded scope (no, not, without, absent, excluded, nonobstructive, "no evidence of", "not done"), never from similarity. A double negation abstains. Hedges (possible, probable, likely, may, borderline, cannot exclude, "not purely") and conditions (if, would, needs volumes, pending) are never credited and never held against the trainee. "Suggests", "consistent with" are credited only when they agree with the key.

## What it deliberately abstains on

- Another person's statement ("the report says", "per the tech", "DLCO reported reduced", "said to be"): never the trainee's claim; if the trainee's own reading differs from the attributed one, neither is scored.
- Self-contradiction, self-correction words ("actually", "scratch that", "sorry"), and any text that states and doubts the same pattern.
- A pattern credited together with a hedged claim of a different pattern, or with "volumes needed" when TLC was reported.
- Text in another language, text with no recognizable statement, text over 2000 characters (not graded at all), numbers (FEV₁ as a percent or a z-score is not read).
- Text addressed to the grader ("ignore the rubric"): that clause is ignored and noted, and earns nothing.
- An omission is reported as Not mentioned only when no part of the text was unreadable near that domain; otherwise it is Needs review.

## What the key is

The existing `interpret()` result for the displayed spirometry equation (never the generator's anchor key), with `severityAlso` accepted before the other equation's key. "Performed" comes from the report (a post-bronchodilator study with a missing post FEV₁ was performed and has no 2022 result). No threshold, z-score or reference value is computed by this feature.
