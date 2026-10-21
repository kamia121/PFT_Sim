/**
 * Regression tests for the independent review of the report-first practice page (R2, R4, R5, R6, R8, R9), against the real modules.
 * R1 is in challenge-rows.test.mjs; the interactions that need a browser (mobile sizing, printing, focus) are in benchmarks/interaction-smoke.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ds, resolveReference, makeModel, SAMPLE_INPUTS } from './report-helpers.mjs';
import { buildCase } from '../src/core/case.js';
import { interpret, compareEquations } from '../src/interpret/interpret.js';
import { buildReportModel } from '../src/report/model.js';
import { tableMatrix } from '../src/report/table.js';
import { toCsv } from '../src/report/export.js';
import { reportPageHref, renderReportHtml } from '../src/report/html.js';
import { parseReportQuery } from '../src/report-page/query.js';
import { summarySheetHtml, interpretationSectionHtml, INTERPRETATION_POINTER } from '../src/sheets/summary.js';
import { detailsSheet } from '../src/sheets/details.js';
import { interpretationFor } from '../src/report/statement.js';
import { buildRtReport } from '../src/core/rt-report.js';
import zStrip from '../src/ui/figures/z-strip.js';
import { PALETTES } from '../src/ui/palettes.js';
import { bdPctPredDp, bdPctPredText } from '../src/interpret/precision.js';

const ctx = (input, opts = {}) => {
  const { c, interp, model } = makeModel(input, opts);
  return { c, interp, model };
};

/* ------------------------------------------------------------------------------------------------------ R2 */

test('R2: the link to the printable report carries the case, the equation, the quality challenge and the flags, and reads back the same', () => {
  for (const equation of ['GLIglobal', 'GLI2012']) {
    for (const qualityChallenge of [false, true]) {
      for (const flags of ['lln', 'none']) {
        const { model } = ctx({ seed: 8, archetype: 'bd-discordant', technique: 'poor' }, { equation });
        const href = reportPageHref(model, { qualityChallenge, flags });
        assert.ok(href.startsWith('report.html?'), href);
        const q = parseReportQuery(href.slice(href.indexOf('?')));
        assert.equal(q.equation, equation);
        assert.equal(q.qualityChallenge, qualityChallenge);
        assert.equal(q.flags, flags);
        assert.equal(q.copy, 'student', 'the link is always the student copy');
        assert.equal(q.descriptor.seed, 8);
      }
    }
  }
});

test('R2: with no settings the link is the short form of before', () => {
  const { model } = ctx({ seed: 5, archetype: 'normal' });
  assert.equal(reportPageHref(model), `report.html?c=${encodeURIComponent(model.meta.caseToken)}&eq=GLIglobal`);
});

test('R2: the interactive report preview carries the settings in its "Open full report" link', () => {
  const { model } = ctx({ seed: 5, archetype: 'normal' });
  const html = renderReportHtml(model, { interactive: true, settings: { qualityChallenge: true, flags: 'none' } });
  assert.match(html, /href="report\.html\?[^"]*&amp;qc=1&amp;flags=none"/);
});

/* ------------------------------------------------------------------------------------------------------ R4 */

test('R4: the printed percent-of-predicted change is the unrounded decision quantity (seeds 132 and 333)', () => {
  const cases = [{ seed: 132, archetype: 'obstruction', technique: 'good', scenarioLevel: 'none' }, { seed: 333, archetype: 'obstruction', technique: 'good', scenarioLevel: 'none' }];
  for (const input of cases) {
    const { interp, model } = ctx(input);
    const t = model.sections.flatMap((s) => s.tables).find((x) => x.id === 'spirometry');
    const mx = tableMatrix(t);
    const col = t.columns.findIndex((x) => x.key === 'changePctPred');
    for (const [i, id] of [['0', 'fvc'], ['1', 'fev1']]) {
      const row = t.rows.find((r) => r.id === id);
      const exact = interp.bd.pctPred[id];
      assert.ok(Math.abs(row.changePctPred - exact) <= 0.05 + 1e-9, `${input.seed} ${id}: ${row.changePctPred} vs ${exact}`);
      const printed = Number(mx.body[t.rows.indexOf(row)][col]);
      // The printed value is on the same side of 10 as the decision.
      assert.equal(printed > 10, exact > 10, `${input.seed} ${id}: printed ${printed}, exact ${exact}`);
      void i;
    }
    const sig = ['fvc', 'fev1'].filter((id) => t.rows.find((r) => r.id === id).changePctPred > 10);
    assert.deepEqual(sig.sort(), [...interp.bd.rule2022.which.map((w) => w.toLowerCase())].sort(), `${input.seed}: the printed decision quantity gives the engine's decision`);
  }
});

test('R4: the CSV export prints the same decision quantity', () => {
  const { interp, model } = ctx({ seed: 132, archetype: 'obstruction', technique: 'good', scenarioLevel: 'none' });
  const csv = toCsv(model);
  assert.match(csv, new RegExp(`${interp.bd.pctPred.fev1.toFixed(2)}`), 'two decimals within a rounding step of 10%');
  assert.doesNotMatch(csv, /"?\+?10\.2"?[,\n]/, 'the value of the rounded volumes is not printed');
});

test('R4: the digits of the percent of predicted show which side of 10 the value is on, and only near 10', () => {
  assert.equal(bdPctPredDp(6.27), 1);
  assert.equal(bdPctPredDp(10.2), 1);
  assert.equal(bdPctPredDp(9.8), 1);
  assert.equal(bdPctPredText(9.964683635804136), '9.96');
  assert.equal(bdPctPredText(10.03132925090867), '10.03');
  assert.equal(bdPctPredText(9.99), '9.99');
  assert.equal(bdPctPredText(10.0004), '10.0004');
  assert.equal(bdPctPredText(9.9996), '9.9996');
  assert.equal(bdPctPredText(10), '10.0', 'exactly 10 is not above the threshold and prints as such');
  assert.equal(bdPctPredDp(NaN), 1);
  for (const x of [9.951, 9.96, 9.99, 9.9996, 10.0004, 10.01, 10.049]) assert.notEqual(Number(bdPctPredText(x)), 10, `${x}`);
});

test('R4: wherever a post study exists, the printed decision quantity and the engine agree on the side of 10', () => {
  let n = 0;
  for (let seed = 1; seed <= 150; seed++) {
    for (const archetype of ['obstruction', 'mixed', 'normal']) {
      const { c, interp, model } = ctx({ seed, archetype, technique: 'good' });
      if (!c.spirometry.post || !interp.bd) continue;
      n++;
      const t = model.sections.flatMap((s) => s.tables).find((x) => x.id === 'spirometry');
      const mx = tableMatrix(t);
      const col = t.columns.findIndex((x) => x.key === 'changePctPred');
      for (const id of ['fvc', 'fev1']) {
        const printed = Number(mx.body[t.rows.findIndex((r) => r.id === id)][col]);
        assert.equal(printed > 10, interp.bd.pctPred[id] > 10, `seed ${seed} ${archetype} ${id}: printed ${printed}, exact ${interp.bd.pctPred[id]}`);
      }
    }
  }
  assert.ok(n > 30, `${n} cases with a post study checked`);
});

test('R4: the volume change and the percent of baseline stay arithmetic on the printed volumes, and the footnote says what is exact', () => {
  const { model } = ctx({ seed: 132, archetype: 'obstruction', technique: 'good', scenarioLevel: 'none' });
  const t = model.sections.flatMap((s) => s.tables).find((x) => x.id === 'spirometry');
  for (const id of ['fvc', 'fev1']) {
    const r = t.rows.find((x) => x.id === id);
    assert.equal(Number((r.post - r.pre).toFixed(2)), r.change);
    assert.equal(r.changePct, Number(((100 * r.change) / r.pre).toFixed(1)));
  }
  assert.match(t.footnote, /Change, % of predicted, is computed from the unrounded values/);
});

/* ------------------------------------------------------------------------------------------------------ R5 */

test('R5: the summary sheet is blank before a statement is released and names the statement once the model carries one', () => {
  const { c, interp } = ctx({ seed: 8, archetype: 'bd-discordant', technique: 'poor' });
  const rt = buildRtReport(c);
  const cmp = compareEquations(c.report, resolveReference, 'GLI2012', 'GLIglobal');
  const stmt = interpretationFor(c, interp, cmp);
  const withText = buildReportModel(c, interp, { equation: 'GLIglobal', resolve: resolveReference, interpretationText: stmt.text, interpretationNotes: stmt.notes });
  const without = buildReportModel(c, interp, { equation: 'GLIglobal', resolve: resolveReference });
  const args = { rt, caseData: c, interp, equation: 'GLIglobal' };
  const blank = summarySheetHtml(without, args);
  assert.match(blank, /<div id="sheet-interpretation" class="sheet-interp-body"><\/div>/, 'an empty element the practice page can fill');
  assert.equal(interpretationSectionHtml(without), '');
  assert.ok(!blank.includes(stmt.text.slice(0, 40)));
  const sheet = summarySheetHtml(withText, args);
  assert.ok(sheet.includes(INTERPRETATION_POINTER));
  const section = interpretationSectionHtml(withText);
  assert.ok(section.includes('<h2>Interpretation</h2>'));
  // The statement is the model's text, escaped, and every note follows under its own heading.
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  assert.ok(section.includes(esc(stmt.text)), 'the whole statement');
  for (const n of stmt.notes) assert.ok(section.includes(esc(n)), `note: ${n.slice(0, 40)}`);
  assert.match(section, /Notes on this simulation/);
});

test('R5: markup in a statement is escaped', () => {
  const { model } = ctx({ seed: 5, archetype: 'normal' });
  const html = interpretationSectionHtml({ ...model, interpretation: 'FEV1 <b>low</b> & "odd"', interpretationNotes: ['<i>note</i>'] });
  assert.doesNotMatch(html, /<b>|<i>/);
  assert.match(html, /FEV1 &lt;b&gt;low&lt;\/b&gt; &amp; &quot;odd&quot;/);
});

/* ------------------------------------------------------------------------------------------------- R6, R9 */

const detailsFor = (input, opts = {}) => {
  const c = buildCase(input, ds);
  const interp = interpret(c.report, resolveReference, opts.equation ?? 'GLIglobal');
  const model = buildReportModel(c, interp, { equation: opts.equation ?? 'GLIglobal', resolve: resolveReference, figures: false, gradesWithheld: null });
  return { c, interp, html: detailsSheet(model, { caseData: c, interp, equation: opts.equation ?? 'GLIglobal', ...opts }).html };
};
const MANY = { seed: 8, archetype: 'bd-discordant', technique: 'poor' };

test('R6: a case with more than eight maneuvers overlays by default and the screen sheet offers the view controls, the printed sheet does not', () => {
  const { c, html } = detailsFor(MANY, { controls: true });
  const n = c.spirometry.pre.maneuvers.length + c.spirometry.post.maneuvers.length;
  assert.ok(n > 8, `${n} maneuvers`);
  const views = [...html.matchAll(/data-fig-view="panel-spirometry" value="(\w+)" (checked)?/g)];
  assert.deepEqual(views.map((m) => m[1]), ['best', 'all', 'separate']);
  assert.equal(views.find((m) => m[2])?.[1], 'all', 'the default is the overlay');
  assert.ok((html.match(/data-fig-chip="panel-spirometry"/g) ?? []).length >= Math.max(c.spirometry.pre.maneuvers.length, c.spirometry.post.maneuvers.length));
  const printed = detailsFor(MANY).html;
  assert.doesNotMatch(printed, /data-fig-view|data-fig-chip/, 'no controls unless the page asks for them');
});

test('R6: a per-panel view and selection change what is drawn (separate panels, one maneuver), and an object given as view is read as the panel states', () => {
  const overlay = detailsFor(MANY, { views: { 'panel-spirometry': { view: 'all' } } }).html;
  const separate = detailsFor(MANY, { views: { 'panel-spirometry': { view: 'separate' } } }).html;
  const one = detailsFor(MANY, { views: { 'panel-spirometry': { view: 'separate', selected: [2] } } }).html;
  const best = detailsFor(MANY, { views: { 'panel-spirometry': { view: 'best' } } }).html;
  const svgOf = (h) => h.match(/<figure class="dt-fig[^"]*" data-figure-id="panel-spirometry">[\s\S]*?<\/figure>/)[0];
  const sizes = [overlay, separate, one, best].map((h) => svgOf(h).length);
  assert.equal(new Set(sizes).size, 4, `four different drawings: ${sizes}`);
  assert.ok(svgOf(one).length < svgOf(separate).length, 'one selected maneuver draws less than every maneuver');
  assert.match(svgOf(separate), /separate view/);
  assert.match(svgOf(overlay), /all view/);
  assert.match(svgOf(best), /best view/);
  const asObject = detailsFor(MANY, { view: { 'panel-spirometry': { view: 'separate', selected: [2] } } }).html;
  assert.equal(svgOf(asObject), svgOf(one), 'the practice page\'s figure state object works as the panel states');
  const chips = [...detailsFor(MANY, { controls: true, views: { 'panel-spirometry': { view: 'separate', selected: [2, 3] } } }).html.matchAll(/data-fig-chip="panel-spirometry" value="(\d+)" (checked)?/g)];
  assert.deepEqual(chips.filter((m) => m[2]).map((m) => m[1]), ['2', '3']);
});

test('R6: the quality text stays withheld in every view when grades are not shown', () => {
  for (const view of ['best', 'all', 'separate']) {
    const { html } = detailsFor(MANY, { controls: true, showGrades: false, views: { 'panel-spirometry': { view }, 'panel-pleth': { view } } });
    assert.doesNotMatch(html, /\b(FEV1|FVC) - [A-FU]\b|grade [A-F]\b|criteria not met|usable|rejected/i, view);
  }
});

const zRows = (html) => {
  const fig = html.match(/<figure class="dt-fig[^"]*" data-figure-id="z-strip">[\s\S]*?<\/figure>/)?.[0] ?? '';
  return { fig, desc: fig.match(/<desc[^>]*>([\s\S]*?)<\/desc>/)?.[1] ?? '' };
};

test('R9: the details z-score graphic carries the post-bronchodilator rows with the numbers of the summary graphic, under both equations', () => {
  for (const equation of ['GLIglobal', 'GLI2012']) {
    const { c, interp, html } = detailsFor(MANY, { equation, resolve: resolveReference });
    const { fig } = zRows(html);
    assert.match(fig, /post-bronchodilator/, equation);
    const model = buildReportModel(c, interp, { equation, resolve: resolveReference, figures: false });
    const sp = model.sections.flatMap((s) => s.tables).find((t) => t.id === 'spirometry');
    for (const id of ['fvc', 'fev1', 'fev1_fvc']) {
      const z = sp.rows.find((r) => r.id === id).postZ;
      assert.ok(Number.isFinite(z), `${id} postZ`);
      const text = Math.abs(z).toFixed(2);
      assert.ok(fig.includes(`z ${z < 0 ? '−' : ''}${text}`) || fig.includes(`z ${z < 0 ? '-' : ''}${text}`), `${equation} ${id}: post z ${z} in the details graphic`);
    }
    // Without the resolver the post rows are not drawn, which is what the review found.
    assert.doesNotMatch(zRows(detailsFor(MANY, { equation }).html).fig, /post-bronchodilator/);
  }
});

/* ------------------------------------------------------------------------------------------------------ R8 */

const zData = (input) => {
  const { c, interp } = makeModel(input);
  return zStrip.dataFor({ ...c, interp, resolve: resolveReference, equation: 'GLIglobal' });
};
const synthetic = (zs) => {
  const base = zData({ seed: 5, archetype: 'normal', panel: 'full' });
  const rows = base.rows.map((r) => (r.id in zs ? { ...r, z: zs[r.id], below: zs[r.id] < -1.645 } : r));
  return { ...base, rows };
};
const words = (svg) => [...svg.matchAll(/>(within limits|above ULN|below LLN|not reduced)</g)].map((m) => m[1]);

test('R8: the green area is named "not reduced", never "within limits", and the area beyond the ULN is named for two-sided panels', () => {
  const svg = zStrip.render(synthetic({ rv: 1.4, tlc: 1.9, dlco: 4.5 }), { palette: PALETTES.white, style: 'ats', width: 744 });
  const bandLabels = [...svg.matchAll(/<text[^>]*>(not reduced|above ULN)<\/text>/g)].map((m) => m[1]);
  assert.ok(bandLabels.includes('not reduced'));
  assert.ok(bandLabels.includes('above ULN'), 'the band label for the region beyond the ULN on a two-sided panel');
  // The shared band label over the whole green area is gone: "within limits" is left only as a row's own reading, at the same height as its z-score.
  const bandRow = (word) => [...svg.matchAll(new RegExp(`<text[^>]*y="([\\d.]+)"[^>]*>${word}</text>`, 'g'))];
  for (const m of bandRow('within limits')) assert.ok(Number(m[1]) > 40, `a "within limits" label at y=${m[1]} is in a row, not above an axis`);
  assert.match(svg, /within limits means between the LLN and the ULN/);
  assert.match(svg, /marked above ULN and is not graded by severity/);
});

test('R8: the row words and the stars agree at the limits: z = 1.645 is within limits, 1.646 and above 3 are above ULN, one-sided rows stay within limits', () => {
  for (const [z, expected] of [[1.645, 'within limits'], [1.646, 'above ULN'], [3.4, 'above ULN']]) {
    const svg = zStrip.render(synthetic({ rv: z }), { palette: PALETTES.white, style: 'ats', width: 744 });
    const row = svg.match(new RegExp(`<text[^>]*>RV</text>[\\s\\S]*?<text[^>]*>(?:${z.toFixed(2)})</text><text[^>]*>([^<]+)</text>`));
    assert.equal(row?.[1], expected, `RV z ${z}`);
  }
  const one = zStrip.render(synthetic({ fvc: 2.5 }), { palette: PALETTES.white, style: 'ats', width: 744 });
  assert.match(one, /<text[^>]*>FVC<\/text>[\s\S]*?<text[^>]*>2\.50<\/text><text[^>]*>within limits<\/text>/, 'a one-sided index above +1.645 is not called above ULN');
});

test('R8: a spirometry-only graphic has no ULN caption and no "above ULN" band label', () => {
  const data = zData({ seed: 44, archetype: 'mixed', panel: 'spirometry' });
  const svg = zStrip.render(data, { palette: PALETTES.white, style: 'ats', width: 744 });
  assert.doesNotMatch(svg, /<text[^>]*>above ULN<\/text>/);
  assert.doesNotMatch(svg, /between the LLN and the ULN/);
  assert.match(svg, /not reduced above the LLN/);
});

test('R8: the severity bands and the gradient are unchanged (no high-side bands are drawn)', () => {
  const svg = zStrip.render(synthetic({ rv: 3.4 }), { palette: PALETTES.white, style: 'ats', width: 744 });
  for (const w of ['severe', 'moderate', 'mild']) assert.equal(svg.match(new RegExp(`<text[^>]*>${w}</text>`, 'g'))?.length, svg.match(/<text[^>]*>severe<\/text>/g).length, w);
  assert.ok(!/above ULN \(severe|high severe|high moderate/.test(svg));
});

/* ------------------------------------------------------------------------------------------- modules */

test('R5: the page picks up the interpretation section from the summary module, and a build without it still loads the sheet', async () => {
  const { loadOptionalModules } = await import('../src/app/modules.js');
  const full = await loadOptionalModules({
    summary: () => import('../src/sheets/summary.js'), details: () => import('../src/sheets/details.js'), rt: () => import('../src/core/rt-report.js'),
    challenges: () => import('../src/challenges/index.js'), visibility: () => import('../src/challenges/visibility.js'),
  });
  assert.equal(typeof full.interpretationSectionHtml, 'function');
  const bare = await loadOptionalModules({
    summary: async () => ({ summarySheetHtml: () => '' }), details: () => import('../src/sheets/details.js'), rt: () => import('../src/core/rt-report.js'),
    challenges: () => import('../src/challenges/index.js'), visibility: () => import('../src/challenges/visibility.js'),
  });
  assert.equal(bare.summarySheetHtml !== null, true);
  assert.equal(bare.interpretationSectionHtml, null);
  assert.ok(!bare.missing.includes('summary'));
});
