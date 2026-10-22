/**
 * Interpretation workspace (src/app/workspace.css, src/app/practice-view.js): the markup contract that keeps printing unchanged and the
 * excerpts free of anything the stage withholds. The browser checks are in benchmarks/workspace-smoke.mjs and benchmarks/print-parity.mjs.
 *
 * Parity: with the workspace additions taken out (the screen controls, the per-question excerpts and the print-transparent data
 * wrapper), the practice markup of every state in tests/helpers/practice-markup.mjs hashes to what ec5f6cd rendered, and the fixed
 * sheets, the details sheet, the Lab report fallback and the report page are byte-identical to ec5f6cd
 * (tests/fixtures/practice-markup-baseline.json, written by tools/practice-markup-hashes.mjs at that commit).
 * The figures were re-baselined once for the spirometry trace texture (traceRendering in the fixture): everything outside the svg
 * figures is still byte-identical to ec5f6cd (the figure-free hashes), and the full hashes include the figures as drawn now.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { renderPractice, workspaceBarHtml, sheetCells, EXCERPTS } from '../src/app/practice-view.js';
import { markupCtx, markupStates, MARKUP_CASES, mods } from './helpers/practice-markup.mjs';
import { referenceMarkup } from './helpers/reference-markup.mjs';
import { stripWorkspace, withoutFigures } from '../tools/practice-markup-hashes.mjs';
import { TRACE_RENDERING_ID } from '../src/core/trace-texture.js';
import { GENERATOR_VERSION } from '../src/core/standards.js';

const baseline = JSON.parse(fs.readFileSync(new URL('./fixtures/practice-markup-baseline.json', import.meta.url), 'utf8'));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const EXCERPT_RE = /<div class="ws-ctx scroll" data-ws-ui>[\s\S]*?<\/table><\/div>/g;

/** The practice markup without the workspace additions (shared with the fixture tool, so both strip the same way). */
const strip = stripWorkspace;
const sheetOf = (ctx) => mods.summarySheetHtml(ctx.model, { rt: ctx.rt, caseData: ctx.caseData, interp: ctx.interp, equation: ctx.equation, palette: ctx.palette, flags: ctx.flags, showQualityLines: ctx.vis.showQualityLines, narrowZ: true });
const excerptsIn = (html) => html.match(EXCERPT_RE) ?? [];
const STATES = markupStates();

test('the fixture was recorded at ec5f6cd (figures re-baselined under the current trace rendering) and covers every state', () => {
  assert.equal(baseline.commit, 'ec5f6cd82e39f0b45eac5f0929dae98f1de96d74');
  assert.equal(baseline.traceRendering, TRACE_RENDERING_ID, 'the figures in the full hashes were drawn under another trace rendering');
  assert.equal(baseline.generatorVersion, GENERATOR_VERSION);
  assert.deepEqual(Object.keys(baseline.practice).sort(), STATES.map((s) => s.key).sort());
});

test('outside the svg figures, the practice markup of every state and the reference markup are byte-identical to ec5f6cd', () => {
  for (const { key, input, opts } of STATES) assert.equal(sha(withoutFigures(strip(renderPractice(markupCtx(input, opts))))), baseline.practiceWithoutFigures[key], key);
  for (const [k, v] of Object.entries(referenceMarkup())) assert.equal(sha(withoutFigures(v)), baseline.referenceWithoutFigures[k], k);
});

test('without the workspace additions, the practice markup of every state is the recorded markup (ec5f6cd, figures as now drawn)', () => {
  for (const { key, input, opts } of STATES) {
    const html = renderPractice(markupCtx(input, opts));
    assert.ok(html.includes('data-ws-ui'), `${key}: the workspace additions are present`);
    assert.equal(sha(strip(html)), baseline.practice[key], `${key}: markup differs from the recorded markup once the additions are removed`);
  }
});

test('the fixed and report sheets, the details sheet, the Lab report fallback and the report page are byte-identical to the recorded markup', () => {
  const now = referenceMarkup();
  assert.deepEqual(Object.keys(now).sort(), Object.keys(baseline.reference).sort());
  for (const [k, v] of Object.entries(now)) {
    assert.equal(sha(v), baseline.reference[k], `${k} changed`);
    assert.doesNotMatch(v, /data-ws|sheet-data/, `${k}: no workspace markup outside the practice page`);
  }
});

test('one answer form, unique ids, and no control, id or footnote in the additions, in every state', () => {
  for (const { key, input, opts } of STATES) {
    const ctx = markupCtx(input, opts);
    const html = renderPractice(ctx);
    assert.equal((html.match(/<form\b/g) ?? []).length, 1, `${key}: one form`);
    assert.equal((html.match(/id="answer-form"/g) ?? []).length, 1, `${key}: one answer form`);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual(dup, [], `${key}: duplicate ids ${dup.join(', ')}`);
    for (const ex of excerptsIn(html)) {
      assert.doesNotMatch(ex, /\sid=|<input|<button|<select|<textarea|\sname=/, `${key}: an excerpt holds an id or a control`);
      assert.doesNotMatch(ex, /Test quality|Reference values|accept|grade/i, `${key}: an excerpt holds footnote or quality text`);
      for (const line of [...(ctx.rt?.interpretationLines ?? []), ...(ctx.rt?.qualityLines ?? [])]) assert.ok(!ex.includes(line), `${key}: an excerpt holds a comment`);
      assert.doesNotMatch(ex, /data-t=|data-r=|data-c=/, `${key}: excerpt cells must not answer the sheet's cell selectors`);
    }
  }
});

test('the excerpts are fixed per question: the same cells, and the same markup, at every stage and quality-challenge setting', () => {
  for (const name of Object.keys(MARKUP_CASES)) {
    const forCase = STATES.filter((s) => s.key.startsWith(`${name}|`) && !s.key.endsWith('flags-none'));
    const sets = forCase.map(({ input, opts }) => excerptsIn(renderPractice(markupCtx(input, opts))).join(''));
    assert.ok(sets.every((s) => s === sets[0]), `${name}: the excerpts change with the stage or the setting`);
    const ctx = markupCtx(MARKUP_CASES[name], {});
    const cells = sheetCells(sheetOf(ctx));
    const shown = new Set([...sets[0].matchAll(/data-ws-cell="([^"]+)"/g)].map((m) => m[1]));
    const expected = new Set();
    for (const [qid, blocks] of Object.entries(EXCERPTS)) {
      if (qid === 'bronchodilator' && !ctx.caseData.report.spirometry.post) continue;
      if (qid === 'dlco' && !ctx.caseData.report.dlco) continue;
      for (const [t, rows, cols] of blocks) {
        const present = rows.filter((r) => cells[t]?.[r]);
        const keep = cols.filter((k) => present.some((r) => cells[t][r].cells[k]?.text));
        for (const r of present) for (const k of keep) expected.add(`${t}/${r}/${k}`);
      }
    }
    assert.deepEqual([...shown].sort(), [...expected].sort(), `${name}: the excerpt cells are the fixed rows and columns present on the sheet`);
  }
});

test('excerpt values and flags are the sheet cells, and follow the flag setting', () => {
  for (const flags of ['lln', 'none']) {
    for (const [name, input] of Object.entries(MARKUP_CASES)) {
      const ctx = markupCtx(input, { flags });
      const html = renderPractice(ctx);
      const cells = sheetCells(sheetOf(ctx));
      for (const m of excerptsIn(html).join('').matchAll(/<td data-ws-cell="([^"]+)"( class="flag" title="[^"]*")?>([^<]*)<\/td>/g)) {
        const [t, r, k] = m[1].split('/');
        const cell = cells[t][r].cells[k];
        assert.equal(m[3], cell.text, `${name} ${m[1]}: value`);
        assert.equal(Boolean(m[2]), Boolean(cell.flag), `${name} ${m[1]}: flag`);
      }
      if (flags === 'none') assert.doesNotMatch(excerptsIn(html).join(''), /class="flag"/, `${name}: no flag with flags=none`);
    }
  }
});

test('quality challenge on, stages 1 and 2: nothing the stage withholds is in the page source, the additions included', () => {
  for (const { key, input, opts } of STATES.filter((s) => /\|on-s[12]\|/.test(s.key))) {
    const ctx = markupCtx(input, opts);
    const html = renderPractice(ctx);
    // Stage 1 withholds the technologist's statement and the grades it states; stage 2 releases them (visibility.js), not the grade columns.
    if (ctx.stage === 1) {
      for (const line of ctx.rt.qualityLines) assert.ok(!html.includes(line), `${key}: quality line in the source`);
      assert.doesNotMatch(html, /FEV(?:1|₁)\s*-\s*[A-FU]\b|FVC\s*-\s*[A-FU]\b/, `${key}: a grade statement`);
    }
    assert.doesNotMatch(html, /<(?:td|li|b|strong|span)\b[^>]*>\s*(?:not )?(?:acceptable|usable)\s*</i, `${key}: an acceptability cell`);
    assert.doesNotMatch(html, /FEV1 accept\.|Criteria not met|data-key|data-why|data-truth/, `${key}: grade columns or key attributes`);
    for (const item of ctx.items) if (item.why) assert.ok(!html.includes(item.why), `${key}: explanation of ${item.id}`);
  }
});

test('the workspace stylesheet is screen-only, scoped to the case area and colored by tokens', () => {
  const css = fs.readFileSync(new URL('../src/app/workspace.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const top = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '').trim();
  assert.equal(top.replace(/\s+/g, ' '), '#case [data-ws-ui] { display: none; }', 'outside a media block the file only hides the additions');
  const medias = [...css.matchAll(/@media([^{]*)\{/g)].map((m) => m[1].trim());
  assert.ok(medias.length >= 2 && medias.every((m) => m.startsWith('screen and')), `every media block is screen-only: ${medias.join(' | ')}`);
  assert.doesNotMatch(css, /print/);
  assert.doesNotMatch(css, /zoom|--sheet-s/, 'the workspace never changes the scale the printed sheet takes from the screen');
  const selectors = [...css.matchAll(/(?:^|\}|\{)\s*([^\s@{}][^{}]*)\{/g)].map((m) => m[1].trim()).filter(Boolean);
  // Split a selector list at its top-level commas (not those inside :is() or :has()).
  const parts = (sel) => { const out = ['']; let depth = 0; for (const ch of sel) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) out.push(''); else out[out.length - 1] += ch; } return out; };
  for (const sel of selectors) for (const part of parts(sel)) assert.match(part.trim(), /^(#case|main:has\(> #panel-practice)/, `selector outside the case area: ${part}`);
  assert.doesNotMatch(css.replace(/#case|#panel-practice|#details-slot|#reveal|#summary-slot|#ws-chart-toggle/g, ''), /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, 'colors come from tokens');
});

test('the data wrapper generates no box in any medium, and only the practice-page sheet has it', () => {
  const css = fs.readFileSync(new URL('../src/sheets/sheets.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const top = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '');
  assert.match(top, /\.sheet-data \{ display: contents; \}/);
  assert.equal((css.match(/\.sheet-data\b/g) ?? []).length, 1, 'no other rule in sheets.css gives the wrapper a box');
  const ctx = markupCtx(MARKUP_CASES.normal, {});
  const opts = { rt: ctx.rt, caseData: ctx.caseData, interp: ctx.interp, equation: 'GLIglobal', palette: ctx.palette, flags: 'lln', showQualityLines: false };
  assert.doesNotMatch(mods.summarySheetHtml(ctx.model, opts), /sheet-data/);
  assert.equal((mods.summarySheetHtml(ctx.model, { ...opts, narrowZ: true }).match(/class="sheet-data"/g) ?? []).length, 1);
});

test('the bronchodilator excerpt carries the data of the 2022 rule: the %Pred cells before and after give the change as a percentage of predicted', () => {
  // Bronchodilator studies drawn from fixed seeds across the archetypes that have one; the excerpt is read alone, as a learner reads it
  // with the tables collapsed. The difference of the two %Pred cells is the change as a percentage of the predicted value, to within
  // their rounding (each to 1 %, so at most 1 point); where the true value lies further than that from the 10 % limit, the call made
  // from the excerpt is the key's.
  const inputs = [];
  for (const archetype of ['obstruction', 'bd-discordant', 'mixed', 'normal', 'restriction-parenchymal']) for (let seed = 1; seed <= 12; seed++) inputs.push({ seed, archetype, technique: 'fair' });
  let decided = 0, sig = 0, notSig = 0, studies = 0;
  for (const input of inputs) {
    const ctx = markupCtx(input, {});
    if (!ctx.caseData.report.spirometry.post || !ctx.interp.bd) continue;
    studies++;
    const ex = excerptsIn(renderPractice(ctx)).find((e) => e.includes('data-ws-cell="spirometry/fev1/postPct"'));
    assert.ok(ex, `${input.archetype} ${input.seed}: the bronchodilator excerpt has the %Pred cells`);
    assert.match(ex, />Pre %Pred</); assert.match(ex, />Post %Pred</); assert.match(ex, />Change, % of baseline</);
    const cell = (r, c) => Number((ex.match(new RegExp(`data-ws-cell="spirometry/${r}/${c}"[^>]*>([^<]*)<`)) ?? [])[1]?.replace('−', '-'));
    const derived = { fev1: cell('fev1', 'postPct') - cell('fev1', 'pct'), fvc: cell('fvc', 'postPct') - cell('fvc', 'pct') };
    for (const k of ['fev1', 'fvc']) {
      assert.ok(Number.isFinite(derived[k]), `${input.archetype} ${input.seed} ${k}: both %Pred cells are numbers`);
      assert.ok(Math.abs(derived[k] - ctx.interp.bd.pctPred[k]) <= 1 + 1e-9, `${input.archetype} ${input.seed} ${k}: %Pred difference ${derived[k]} against ${ctx.interp.bd.pctPred[k].toFixed(2)}`);
    }
    const margin = Math.min(...['fev1', 'fvc'].map((k) => Math.abs(ctx.interp.bd.pctPred[k] - 10)));
    if (margin > 1) {
      decided++;
      const call = derived.fev1 > 10 || derived.fvc > 10 ? 'significant' : 'not-significant';
      assert.equal(call, ctx.interp.key.bronchodilator, `${input.archetype} ${input.seed}: the call from the excerpt`);
      if (call === 'significant') sig++; else notSig++;
    }
    assert.doesNotMatch(ex, /significant|responsive|response/i, 'no classification in the excerpt');
  }
  assert.ok(studies >= 20 && decided >= 15 && sig >= 3 && notSig >= 3, `coverage: ${studies} studies, ${decided} decided away from the limit (${sig} significant, ${notSig} not)`);
});
