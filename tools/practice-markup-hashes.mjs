/**
 * Writes tests/fixtures/practice-markup-baseline.json: the SHA-256 of the practice-page markup (renderPractice) for every state of
 * tests/helpers/practice-markup.mjs, and of the summary sheet, details sheet and report page markup for the sample cases. Run it at a
 * commit whose markup is the reference (it was run at ec5f6cd, before the interpretation workspace), from the repository root:
 *   node tools/practice-markup-hashes.mjs
 * The workspace test strips the workspace additions from the current markup and compares the hashes, so that a change of the
 * baseline markup (and therefore of what prints) fails a test.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { renderPractice } from '../src/app/practice-view.js';
import { markupCtx, markupStates } from '../tests/helpers/practice-markup.mjs';
import { referenceMarkup } from '../tests/helpers/reference-markup.mjs';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const practice = Object.fromEntries(markupStates().map(({ key, input, opts }) => [key, sha(renderPractice(markupCtx(input, opts)))]));
const reference = Object.fromEntries(Object.entries(referenceMarkup()).map(([k, v]) => [k, sha(v)]));
let commit = 'unknown';
try { commit = execSync('git rev-parse HEAD').toString().trim(); } catch { /* not a checkout */ }
const out = { commit, note: 'SHA-256 of markup at the reference commit; see tools/practice-markup-hashes.mjs.', practice, reference };
fs.writeFileSync('tests/fixtures/practice-markup-baseline.json', `${JSON.stringify(out, null, 1)}\n`);
console.log(`wrote ${Object.keys(practice).length} practice and ${Object.keys(reference).length} reference hashes at ${commit}`);
