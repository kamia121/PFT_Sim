/**
 * Page-source test against the real sheet, technologist-report and challenge modules, once they are in the build. Until then the
 * test reports itself skipped; tests/practice-view.test.mjs covers the same rule with stand-ins.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ds, resolveReference } from './report-helpers.mjs';
import { buildCase } from '../src/core/case.js';
import { interpret, compareEquations } from '../src/interpret/interpret.js';
import { buildReportModel } from '../src/report/model.js';
import { PALETTES } from '../src/ui/palettes.js';
import { loadOptionalModules } from '../src/app/modules.js';
import { renderPractice } from '../src/app/practice-view.js';
import { createStage, showStatement, check } from '../src/app/stage.js';
import { emptyResponses } from '../src/app/collect.js';
import { buildFeedback } from '../src/app/feedback.js';

const mods = await loadOptionalModules({
  summary: () => import('../src/sheets/summary.js'),
  details: () => import('../src/sheets/details.js'),
  rt: () => import('../src/core/rt-report.js'),
  challenges: () => import('../src/challenges/index.js'),
  visibility: () => import('../src/challenges/visibility.js'),
});
const complete = mods.missing.length === 0;

const CASES = [
  { seed: 5, archetype: 'normal', technique: 'good' },
  { seed: 12, archetype: 'obstruction', technique: 'fair' },
  { seed: 8, archetype: 'bd-discordant', technique: 'poor' },
  { seed: 44, archetype: 'mixed', technique: 'poor', panel: 'spirometry' },
];

function ctxFor(input, qualityChallenge, stage) {
  const caseData = buildCase(input, ds);
  const interp = interpret(caseData.report, resolveReference, 'GLIglobal');
  const interpOther = interpret(caseData.report, resolveReference, 'GLI2012');
  const cmp = compareEquations(caseData.report, resolveReference, 'GLI2012', 'GLIglobal');
  const rt = mods.buildRtReport(caseData);
  const items = mods.buildChallenges(caseData, { rt, interp, qualityChallenge });
  let st = createStage({ qualityChallenge });
  if (stage >= 2) st = showStatement(st);
  if (stage === 3) st = check(st, { scored: true });
  const vis = mods.visibility({ qualityChallenge, stage: st.stage });
  const model = buildReportModel(caseData, interp, { equation: 'GLIglobal', includeGrades: vis.showGradeColumns, resolve: resolveReference, palette: PALETTES.white });
  const responses = emptyResponses();
  const feedback = st.stage === 3 ? buildFeedback({ caseData, interp, interpOther, equation: 'GLIglobal', responses, items, scoreChallenge: mods.scoreChallenge, rt, detailsOpened: false }) : null;
  return { rt, items, ctx: { caseData, interp, cmp, equation: 'GLIglobal', flags: 'lln', qualityChallenge, stage: st.stage, scored: st.scored, detailsOpen: true, vis, canCheck: st.stage !== 3 && (!qualityChallenge || st.stage === 2), rt, items, responses, model, sheets: { summarySheetHtml: mods.summarySheetHtml, detailsSheetHtml: mods.detailsSheetHtml }, palette: PALETTES.white, figView: {}, showSchematic: false, resolve: resolveReference, feedback } };
}

for (const input of CASES) {
  test(`real modules, quality challenge on, stage 1: no grade, acceptability or quality statement in the source (${input.archetype}, ${input.technique})`, { skip: complete ? false : `missing: ${mods.missing.join(', ')}` }, () => {
    const { rt, items, ctx } = ctxFor(input, true, 1);
    const html = renderPractice(ctx);
    for (const line of rt.qualityLines) assert.ok(!html.includes(line), `quality line in the source: ${line}`);
    assert.doesNotMatch(html, /FEV(?:1|₁)\s*-\s*[A-FU]\b|FVC\s*-\s*[A-FU]\b/);
    assert.doesNotMatch(html, />\s*(?:not )?(?:acceptable|usable)\s*</i);
    for (const item of items) if (item.why) assert.ok(!html.includes(item.why), `explanation of ${item.id} in the source`);
    assert.doesNotMatch(html, /details held/);
  });

  test(`real modules, stage 3: the feedback lists every item (${input.archetype}, ${input.technique})`, { skip: complete ? false : `missing: ${mods.missing.join(', ')}` }, () => {
    const { items, ctx } = ctxFor(input, true, 3);
    assert.equal(ctx.feedback.rows.length, 4 + items.length);
    assert.match(renderPractice(ctx), /id="reveal"/);
  });
}
