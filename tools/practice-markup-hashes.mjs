/**
 * Writes tests/fixtures/practice-markup-baseline.json: the SHA-256 of the practice-page markup (renderPractice) for every state of
 * tests/helpers/practice-markup.mjs, and of the summary sheet, details sheet and report page markup for the sample cases. Run it at a
 * commit whose markup is the reference (it was run at ec5f6cd, before the interpretation workspace), from the repository root:
 *   node tools/practice-markup-hashes.mjs
 * The workspace test strips the workspace additions from the current markup and compares the hashes, so that a change of the
 * baseline markup (and therefore of what prints) fails a test.
 *
 * Re-baselining for a figure rendering change (first done for the spirometry trace texture, `traceRendering`): the markup outside
 * the svg figures must be byte-identical to the reference commit, which `--rebaseline-figures` checks against the stored
 * figure-free hashes before it writes anything. It keeps `commit` (the reference for everything outside the figures), records the
 * trace-rendering identifier and the generator version, and replaces the full hashes, which include the figures:
 *   node tools/practice-markup-hashes.mjs --rebaseline-figures
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { renderPractice, workspaceBarHtml } from '../src/app/practice-view.js';
import { markupStates, markupCtx } from '../tests/helpers/practice-markup.mjs';
import { referenceMarkup } from '../tests/helpers/reference-markup.mjs';
import { TRACE_RENDERING_ID } from '../src/core/trace-texture.js';
import { GENERATOR_VERSION } from '../src/core/standards.js';

export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const EXCERPT_RE = /<div class="ws-ctx scroll" data-ws-ui>[\s\S]*?<\/table><\/div>/g;

/** The practice markup without the workspace additions (the screen controls, the per-question excerpts and the data wrapper). */
export function stripWorkspace(html) {
  let out = html.replace(workspaceBarHtml(), '').replace(EXCERPT_RE, '');
  if (out.includes('<div class="sheet-data">')) {
    out = out.replace('<div class="sheet-content"><div class="sheet-data">', '<div class="sheet-content">');
    // The wrapper closes immediately before the comment and interpretation boxes; any one of the adjacent closing tags is it.
    out = out.replace('</div><div class="sheet-boxes', '<div class="sheet-boxes');
  }
  return out;
}
/** Markup with every svg figure reduced to an empty element: what must not change when only the figure rendering changes. */
export const withoutFigures = (html) => html.replace(/<svg\b[\s\S]*?<\/svg>/g, '<svg/>');

export function currentHashes() {
  const practiceHtml = Object.fromEntries(markupStates().map(({ key, input, opts }) => [key, stripWorkspace(renderPractice(markupCtx(input, opts)))]));
  const referenceHtml = referenceMarkup();
  const map = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, sha(f(v))]));
  return {
    practice: map(practiceHtml, (x) => x), reference: map(referenceHtml, (x) => x),
    practiceWithoutFigures: map(practiceHtml, withoutFigures), referenceWithoutFigures: map(referenceHtml, withoutFigures),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = 'tests/fixtures/practice-markup-baseline.json';
  const now = currentHashes();
  let out;
  if (process.argv.includes('--rebaseline-figures')) {
    const old = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Without stored figure-free hashes (the first re-baseline), the old full hashes must still match with the figures of the old rendering; the caller checks that separately (docs/trace-texture-model.md records how).
    for (const kind of ['practiceWithoutFigures', 'referenceWithoutFigures']) {
      if (!old[kind]) continue;
      for (const [k, v] of Object.entries(now[kind])) if (old[kind][k] !== v) throw new Error(`${kind} ${k}: markup outside the figures changed; this is not a figure-only change`);
    }
    let head = 'unknown';
    try { head = execSync('git rev-parse HEAD').toString().trim(); } catch { /* not a checkout */ }
    out = {
      commit: old.commit,
      note: 'Markup outside the svg figures is byte-identical to the reference commit (practiceWithoutFigures, referenceWithoutFigures); the full hashes include the figures as drawn under traceRendering.',
      traceRendering: TRACE_RENDERING_ID, generatorVersion: GENERATOR_VERSION, figuresRecordedOnTopOf: head,
      ...now,
    };
  } else {
    let commit = 'unknown';
    try { commit = execSync('git rev-parse HEAD').toString().trim(); } catch { /* not a checkout */ }
    out = { commit, note: 'SHA-256 of markup at the reference commit; see tools/practice-markup-hashes.mjs.', traceRendering: TRACE_RENDERING_ID, generatorVersion: GENERATOR_VERSION, ...now };
  }
  fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`wrote ${Object.keys(now.practice).length} practice and ${Object.keys(now.reference).length} reference hashes`);
}
