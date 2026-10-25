# Main integration checkpoint (local candidate)

Approved branch push succeeded: feature/advanced-case-puzzlers at 6441bcaefcc1ef5af0d7f278a0aa12e9da38601a in kamia121/PFT_Sim. Remote SHA was independently checked with git ls-remote. Draft PR: https://github.com/kamia121/PFT_Sim/pull/18. Main merge has NOT been attempted; no deployment occurred.

Current main 01fe8bc33cd89b2e99c2d0b21da41ae1b4079700 already includes separately merged PR17. This local integration preserves its texture, WeakMap cache/fingerprinting, resistance display and report-readiness changes while retaining source-audited reporting and scalar-FIVC safeguards. No open PR10, PR16 or PR17 action was taken. Four conflicts (SPEC.md, traces.js, representative.test.mjs, workspace.test.mjs) were resolved. Existing main's historical trace/markup fixtures are preserved; the separate source-corrected fixture is updated for the integrated display. Trace fixtures explicitly retain their recorded v2 case generation rather than asserting that all current generation must remain v2.

Local integration checks: 48 focused passed; full suite 847/850, with the same three recorded identity failures. Build passed. This candidate has NOT yet been pushed and is not independently re-reviewed.

## Actual pushed-commit CI failures

Run https://github.com/kamia121/PFT_Sim/actions/runs/40157716645 completed with failure. All four jobs failed. Logs were read, not inferred from local results.

- verify: exactly the three known unit identity failures (2230-case non-resistance identity; 50 level-none byte identities; explicit level-none identity). These remain failures.
- Chromium: interaction harness PDF checks fail: summary first-sheet/footer clearance for multiple cases; Lab report first-sheet/footer/page-duplication expectations, including a reported missing footer line. Not established as baseline; printed PDF/artifact investigation remains necessary.
- Firefox: practice harness structured-question assertion fails, plus workspace print-parity differences involving OPTION boxes in poorQc-load-1280. The latter is not yet established as a real layout regression versus hidden-control measurement behavior.
- WebKit: practice harness structured-question assertion fails. Its case-sensitive regex expects `Severity`, while current source-backed wording is `Ventilatory impairment severity ...`; this is a harness/label mismatch. It must be corrected with semantic coverage, not treated as a green check.

No failing check was bypassed. Main is unprotected with no returned branch rules, but the user's instruction still forbids merging while checks fail. Browser failures are not classified as the three known unit baseline failures. No duplicate workflow run has been manually triggered. Required next work: inspect print artifacts, diagnose Firefox parity, correct relevant harness/product defects, address the three unit failures without silently regenerating historical baselines, push a reviewed integration candidate and wait for eligible checks before any main merge.

Mac UI remains locked/off-limits; no interactive browser action was used. Existing source-validation and scientific caveats remain unchanged.
