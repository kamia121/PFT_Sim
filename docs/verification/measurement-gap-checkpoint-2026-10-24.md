# Measurement gap closure: first checkpoint

State inspected: clean `feature/advanced-case-puzzlers` at `9b9c77d`; no intervening local changes. No PR16/17 import, push, merge or deployment.

## Completed in this checkpoint

A new, currently **unintegrated** pure `src/core/pleth-session.js` consumes measured FRC and linked IC/SVC records with explicit within-manoeuvre quality assessments. It implements corrected Table 3 linkage thresholds, the no-FVC comparator prerequisite, retained FRC/SVC counts, FRC repeatability, matched-pair TLC, FRC-only/null outputs, exclusion reasons and technical-review status for a discordant pair. It never averages rejected trials or modifies inputs. Source constants are in `LUNG_VOLUMES_2023` in `standards.js`.

Corrected pediatric linkage uses the smaller candidate SVC threshold, not the smaller allowed difference. Age is decimal years; the generator still starts at 16 years. Quality judgments about the curves remain explicit inputs, not assumptions silently inferred from a numeric volume.

The exact subset search covers the simulator's maximum eight trials. Count, smaller fractional spread, then acquisition order settle competing acceptable subsets; outlier ties discard the latest acquisition. These are documented engineering choices. The source's Table 4 example is covered: three acceptable FRCs with only two acceptable retained SVCs produce overall B. A stronger FRC-only pool does not replace existing eligible pairs in this adapter; that preference is engineering, not an asserted source rule.

**RV pool remains a source-adjudication item before integration.** The source says RV equals reported TLC minus the largest VC measured; its precise scope across retained usable SVC, excluded but acceptable session SVC and spirometric FVC needs explicit resolution. The core currently names its policy `retained-linked` and labels it engineering. No production learner answer uses it yet.

Hand fixtures cover exact/adjacent adult SVC deficits, the pediatric branch, same-session comparator requirements, 5%/10% boundaries, A–F/U, component count combinations, pairing, outliers, ties, rejected/all-missing linkage, singleton repeatability, input immutability and nonpositive derived RV withholding. `tools/verify-pleth-session.R` independently checks the fixture arithmetic and boundary construction using base R, without reading implementation code or reference equations. This is not a second complete guideline implementation or a GLI output oracle.

## Claude consultation

Fresh session in **PFT Simulator**, user's **Chrome** (currently browser ID 1), Opus 5.5 High:
https://claude.ai/code/session_01UouK3Nbz2WKgrTxVPfdTnM

Claude inspected its different main checkout, not the local prototype, and implemented nothing. Accepted: pure core first, exact subsets, smallest-spread/acquisition ties, independent component grading, explicit unknown/pending results, circularity protection, independent numerical fixtures, new generator streams and a revision at eventual integration. Retained full precision with the existing scaled `8 × EPSILON × max(1, magnitudes)` equality allowance; rejected display-mL rounding and the later proposed blanket 1e−9 tolerance. Regression values FVC4.15/SVC4.00 and FVC4.15/SVC3.90 pass with the existing scaled allowance. Claude withdrew its mismatched FRC/IC-pool suggestion after reviewing the supplied pp4–5 wording. Its remembered DLCO VC=max(VC,VI) and conversion-limit suggestions were also withdrawn; neither was implemented. RV-pool scope remains explicitly open.

## Access recheck

On 2026-10-24, late UTC session:

- Official GLI calculator in Chrome still displayed “This site is exceeding reCAPTCHA Enterprise free quota.” No repeated checkbox/challenge attempt, bypass, API purchase or numerical output claim.
- Hall2021 original PDF `https://publications.ersnet.org/content/erj/57/3/2000289.full.pdf`: web retrieval HTTP403.
- Corrected Stanojevic2020 PDF `https://publications.ersnet.org/content/erj/56/4/1750010.full.pdf`: web retrieval HTTP403.
- Global original article `https://academic.oup.com/ajrccm/article/207/6/768/8428176`: inaccessible publisher redirect. Search returned partial indexed primary table text, not complete authenticated tables or supplements.
- Corrected 2023 measurement paper was accessible at https://vvlr-afp.be/wp-content/uploads/2025/03/Standardisatie-rapport-long-volumes-2023.pdf . Tables 3–4, reporting pp18–19 and derivation pp4–5 were read. Source copy contains the corrected adult/pediatric linkage text.

Minimal help if those original resources stay blocked: Hall2021 Table 3 and worked example; corrected-2020 TLCO Table 2 and footnotes; Global Table E3 and original Global workbook; official exported validation records with inputs, units, model version, date and precision. The archived volume/corrected-TLCO spline workbooks already exist and are not requested again. These are technical/source-access blocks, not missing user authorization.

## Remaining authorized work

1. Independently review this core and resolve the RV VC pool from primary text or authors' implementation.
2. Generate actual linked IC/SVC manoeuvres on new deterministic streams; replace old all-acceptable FRC means with selected reporting; propagate unavailable values through interpretation, figures, reports, quiz and all prose. Bump generator revision when integrating changed measured outputs and document old-link behavior; do not regenerate historical fixtures to hide the change.
3. Implement replicate DLCO assessment and source-backed reporting/selection. Keep overlapping Table 3 or mixed-criterion cases unclassified rather than inventing a catch-all grade. Use the source's printed threshold for stored units, and only independently acceptable comparators for the low-VI alternative.
4. Close other supported partial groups, rerun regression/physiologic/browser checks and update actual audit status.

The 41-group product counts remain 14 rule-text verified, 12 partial, 10 modeled and 5 blocked; no production gap is declared closed by an unused module, and no disclaimer was removed.

## Checkpoint verification

- `node --test tests/pleth-session.test.mjs`: 12/12 pass (`pleth-core-focused-2026-10-24.txt`).
- `Rscript tools/verify-pleth-session.R`: passes (`pleth-core-r-check-2026-10-24.txt`).
- `npm test`: 772 tests, 769 pass and the same three baseline failures (`pleth-core-tests-2026-10-24.txt`).
- `npm run build`: passes. `git diff --check`: passes.
- No UI changed and the new core is not imported by any product path; no measurement output or historical fixture was changed in this checkpoint. Integration still requires browser QA and end-to-end null/result tests.
