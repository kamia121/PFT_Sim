# Consultation record: written-interpretation grader

Required by CLAUDE.md for substantive learner-interaction changes. The consultation was a real call to the Claude Opus 5.5 model (`claude-opus-5-5`, the model identified itself as such), run with high reasoning effort as a read-only reviewer on 2026-10-21, before any grading code was written. The reviewer read the design brief and the real source files and also ran a read-only sweep of the generator. The brief included the hazards from an independent Codex design review, so the reviewer saw both.

## What Opus reported (condensed from its reply; wording shortened, content kept)

Serious flaws, ranked by the reviewer:

1. Structured scoring already maps a null `key.bronchodilator` to "not-done" while `hasData` is true whenever a post study exists. In 27 of 1080 poor-technique scenario cases the post study exists with post FEV1 null, so the structured row marks "Not performed" correct for a study that was performed. A three-state free-text design would disagree with the structured row on the same page.
2. Other-equation credit was designed for bronchodilator only. `scoreAnswers` applies the other equation's key to every question, and pattern flips are central to the app (15 of 720 swept cases change pattern between GLI-2012 and GLI Global).
3. A "k of n" line penalizes short answers ("Moderate obstruction." on a case with bronchodilator and DLCO data would read 1 of 3). Drop the number.
4. The brief misdescribed `main.js`: `practiceContext()` builds feedback at stage 3 whether or not the check was scored, and is re-run on every figure view or chip change. Gate on `state.stage.scored`, snapshot, and wrap in try/catch because nothing guards `render()`.
5. Typo tolerance can flip polarity within the brief's own edit-distance limits (increased/decreased, significant/insignificant, reversible/irreversible; "normal" inside "abnormal").
6. "Normal spirometry" is not a synonym for a normal pattern: restriction can have normal spirometry.
7. Quote offsets drift after normalization.
8. The quality element reads only the pre-bronchodilator FEV1/FVC grade flag; other quality claims should be needs review.

Would not ship: a numeric score; fuzzy matching on value words; detecting the 2005 rule from numbers in the text; changes to the tally or `announce` count; free-text bronchodilator grading before the structured not-done defect is fixed.

## Decisions (accepted critically, not wholesale)

| Reviewer recommendation | Decision | Reason |
|---|---|---|
| No numeric score; show omissions as "not mentioned" | Accepted | Matches the owner's rule and the short-answer rule. |
| Gate on the scored check; snapshot (text, case, equation); try/catch; no regrade on figure or theme change | Accepted | The grader never runs inside `practiceContext`; it runs once in the click handler for the scored check. |
| No regrade button after an equation change; label the snapshot with its equation | Accepted | A regrade button invites fishing for a favorable equation. |
| Other-equation key for every domain; `severityAlso` of the displayed key first, then the other key's severity; `keyB.severityAlso` not consulted | Accepted | Mirrors `scoreAnswers` exactly, so the two verdicts on one page agree. |
| Fuzzy matching on domain nouns only, reject if another entry is within d+1 | Accepted | Removes the polarity flips the reviewer listed. Value, negation, hedge and unit words are exact-match only. |
| "suggests", "suggestive of", "likely" are hedges; "consistent with", "evidence of" assertive | Accepted | Avoids overcalling a PRISm case as restriction. |
| "Normal spirometry" is a claim about spirometry only | Accepted | A restriction key may have normal spirometry. |
| COHb gate `coHbMeasured === true && coHbPercent > 2`; COHb-tied claims go to needs review with one neutral message that never says whether COHb was measured | Accepted | Same gate as `feedback.js`; avoids leaking an unmeasured COHb. |
| Hb-adjusted claim when hemoglobin is missing is needs review | Accepted | |
| Bronchodilator performed but not interpretable: any significance claim is needs review | Accepted, with a change | The reviewer would also make "not performed" contradictory. I make it needs review instead, because the structured row currently scores "Not performed" correct for these cases and the owner asked that structured grading be preserved. The discrepancy is reported, not fixed here. |
| Bare "obstruction" for `obstruction-low-fvc` credits the pattern, lists the volumes limitation as not mentioned | Accepted | Differs from structured scoring (exact option) and is stated in the feedback design. |
| 2005 rule: do not read numbers | Accepted, cue only | A clause citing 2005 or 12% or 200 mL is routed to needs review (the key uses the 2022 rule). No value is read or compared. |
| Cut the "reported as ignored" injection detector | Rejected | The text is inert either way, but a one-line neutral notice tells a learner why such text earned nothing, and the owner listed prompt injection explicitly. It changes no score. |
| Cut lung-volume contradiction checks | Partly accepted | TLC low/normal claims are checked against the engine's TLC label (an LLN comparison, not one of the unverified flags). Hyperinflation, air trapping and high-TLC claims go to needs review because the definitions are marked unverified. |
| Cut DLCO severity and subtype | Accepted | A severity word bound to DLCO is ignored; one bound to restriction, mixed or PRISm is needs review. |
| Held-out set: not independent if the same author; report false-credit rate with an upper bound; mutation tests | Accepted | The held-out phrasings were written by a separate agent that saw only the task description and six abstract scenarios, never the lexicon or code. It is still a language-model author, not clinicians. |
| Accessibility and privacy sentinel tests across location, storage, console, exports and `announce` | Accepted | |

Pre-existing issues surfaced and left alone (outside this feature's scope): the structured bronchodilator key defect above, and `concise.js` printing "COHb was not measured; recent smoking could lower the DLCO" in the composed summary after checking.
