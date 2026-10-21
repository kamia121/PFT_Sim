#!/usr/bin/env node
/**
 * Evaluate the written-impression grader against a labelled phrasing set, and print every false credit, false contradiction and false "missing".
 *   node tools/eval-written.mjs tests/fixtures/written/heldout.json     (development/regression set: it was tuned on)
 *   node tools/eval-written.mjs tests/fixtures/written/unseen2.json     (run once; see docs/written-grader/EVALUATION.md)
 * Gold labels are those of the set's author (a language model that never saw this code), not a clinician panel.
 */
import fs from 'node:fs';
import { evaluateSet, summarize, verdicts, confusion, SCENARIOS } from '../tests/helpers/written-eval.mjs';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/eval-written.mjs <set.json>'); process.exit(2); }
const set = JSON.parse(fs.readFileSync(file, 'utf8'));
const m = evaluateSet(set);
console.log(JSON.stringify(summarize(m), null, 1));
console.log('\nconfusion (rows: author gold; columns: grader group; domains pattern, severity, bd, dlco, quality):');
console.log(JSON.stringify(confusion(set), null, 1));
for (const [k, label] of [['falseCredit', 'FALSE CREDIT (graded correct, author did not)'], ['falseContradiction', 'FALSE CONTRADICTION (graded contradictory, author said correct/uncertain/absent)'], ['falseMissing', 'FALSE MISSING (graded missing, author said correct/wrong)']]) {
  console.log(`\n== ${label}: ${m[k].length}`);
  for (const x of m[k]) { const it = set.find((y) => y.id === x.id); console.log(JSON.stringify({ id: x.id, scenario: it.scenario, domain: x.d, author: x.gold, actual: verdicts(it.text, SCENARIOS[it.scenario])[x.d], text: it.text })); }
}
