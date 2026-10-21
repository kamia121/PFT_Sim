import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDatasets } from '../src/reference/load.js';
import { createReference } from '../src/reference/gli.js';
import { buildCase } from '../src/core/case.js';
import { interpret, compareEquations } from '../src/interpret/interpret.js';
import { composeNarrative } from '../src/interpret/narrative.js';
import { buildReportModel, allTables, patientId, SIMULATION_MARKER } from '../src/report/model.js';
import { renderReportHtml, renderReportDocument } from '../src/report/html.js';
import { toCsv, toTsv, toClipboardHtml, longRows } from '../src/report/export.js';
import { interpretationFor } from '../src/report/statement.js';
import { loadReportCss } from '../src/report/export.js';
import * as R from '../src/app/render.js';
import { PATTERN_TEXT, DLCO_TEXT, LOW_ERV_TEXT, BD_TEXT } from '../src/app/explain.js';
import { scoreAnswers, QUESTIONS, questionLabel } from '../src/app/answers.js';
import { renderChart } from '../src/quiz/chart.js';
import { feedbackHtml } from '../src/quiz/explain.js';
import { scoreItem } from '../src/quiz/scoring.js';
import { caseFacts, fallbackCaveats } from '../src/quiz/fallbacks.js';
import { hbLow, hbKnown, coHbMeasured } from '../src/app/format.js';
import { build, sweep } from './quiz-helpers.mjs';
import { loadAdapters } from '../src/quiz/adapters.js';

const ds = await loadDatasets();
const { resolveReference } = createReference(ds);
const adapters = await loadAdapters();

function make(input, equation = 'GLIglobal') {
  const c = buildCase({ technique: 'good', panel: 'full', ...input }, ds);
  const interp = interpret(c.report, resolveReference, equation);
  const cmp = compareEquations(c.report, resolveReference, 'GLI2012', 'GLIglobal');
  const narrative = composeNarrative({ caseData: c, interp, cmp, seed: input.seed });
  const model = buildReportModel(c, interp, { resolve: resolveReference, equation, interpretationText: narrative.finalStatement, interpretationNotes: narrative.notes });
  return { c, interp, cmp, narrative, model };
}
const narrativeText = (n) => [n.finalStatement, ...n.sections.map((s) => s.text), ...n.findings.map((f) => f.text), ...n.distractors.map((d) => d.text)].join('\n');
const visible = (html) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
const modelText = (m) => JSON.stringify({ ...m, sections: m.sections.map(({ figures, ...rest }) => rest) });

// ------------------------------------------------------------------ 1. carboxyhemoglobin

test('carboxyhemoglobin: no value appears anywhere when co-oximetry was not done', () => {
  let seen = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const x = make({ seed, archetype: 'obstruction', scenarioIds: ['sub-smoked-hours-ago'] });
    const sc = x.c.scenario;
    if (!(sc.coHbPercent > 0)) continue;
    assert.equal(sc.coHbMeasured, false);
    seen++;
    const COHB_VALUE = /(?:carboxyhemoglobin|COHb)[^.;]{0,40}\d+\.\d%/i;
    const dlcoFoot = x.model.sections.find((s) => s.id === 'dlco').tables[0].footnote;
    assert.match(dlcoFoot, /COHb was not measured; the DLCO may be underestimated if smoking was recent/);
    assert.doesNotMatch(dlcoFoot, /COHb \d/);
    assert.doesNotMatch(modelText(x.model), COHB_VALUE, 'report model');
    assert.doesNotMatch(narrativeText(x.narrative), COHB_VALUE, 'narrative');
    assert.match(x.narrative.sections.find((s) => s.id === 'dlco').text, /Carboxyhemoglobin was not measured|Without co-oximetry|No carboxyhemoglobin measurement/);
    assert.ok(x.narrative.findings.some((f) => f.id === 'cohb' && /not measured/.test(f.text)));
    assert.doesNotMatch(visible(renderReportHtml(x.model)), COHB_VALUE, 'report html');
    const { prep, items } = build({ seed, archetype: 'obstruction', technique: 'good', panel: 'full', scenarioLevel: 'none', scenarioIds: ['sub-smoked-hours-ago'] }, { adapters });
    const chart = visible(renderChart(prep, { adapters }));
    assert.doesNotMatch(chart, /COHb \d/);
    for (const it of items) for (const o of it.options) assert.doesNotMatch(o.label, /\d\.\d% (?:carboxy|COHb)|(?:carboxyhemoglobin|COHb)[^.]*\d\.\d%/i);
    assert.doesNotMatch(visible(R.renderDlco(x.c, x.interp)), /Carboxyhemoglobin\s+\d/);
  }
  assert.ok(seen >= 10);
});

test('carboxyhemoglobin: a measured value is reported; the key is read without a COHb correction and the COHb-adjusted reference is supplementary', () => {
  const x = make({ seed: 9, archetype: 'obstruction', scenarioIds: ['sub-cohb-measured'] });
  assert.ok(coHbMeasured(x.c.scenario));
  const pct = x.c.scenario.coHbPercent.toFixed(1);
  assert.match(x.model.sections.find((s) => s.id === 'dlco').tables[0].footnote, new RegExp(`COHb ${pct.replace('.', '\\.')}%\\.[^]*read on the Hb-adjusted reference only`));
  assert.ok(x.narrative.sections.find((s) => s.id === 'dlco').text.includes(`${pct}%`));
  const { prep } = build({ seed: 9, archetype: 'obstruction', technique: 'good', panel: 'full', scenarioLevel: 'none', scenarioIds: ['sub-cohb-measured'] }, { adapters });
  prep.caseData = x.c;
  assert.match(renderChart(prep, { adapters }), new RegExp(`COHb ${pct.replace('.', '\\.')}%`));
});

// ------------------------------------------------------------------ 2. missing hemoglobin

test('missing hemoglobin is not a low hemoglobin and is never called adjusted', () => {
  assert.equal(hbLow(null), false);
  assert.equal(hbLow(undefined), false);
  assert.equal(hbLow(10.5), true);
  assert.equal(hbKnown({ hbGdl: null }), false);
  const x = make({ seed: 7, archetype: 'anemia', scenarioIds: ['dlco-hb-missing'] });
  assert.equal(x.c.dlco.hbGdl, null);
  // report model
  const dl = x.model.sections.find((s) => s.id === 'dlco').tables[0];
  assert.match(dl.footnote, /without hemoglobin adjustment, because no hemoglobin was available/);
  assert.doesNotMatch(dl.footnote, /Hb-adjusted DLCO \(Cotes/);
  assert.ok(dl.rows.every((r) => !/Hb-adjusted/.test(r.index)));
  assert.equal(dl.rows.find((r) => r.id === 'hb').result, 'not available');
  assert.ok(!dl.rows.some((r) => r.id === 'hb-factor'));
  assert.equal(x.model.header.fields.find((f) => f.label === 'Hemoglobin').value, 'not available');
  // narrative
  const all = narrativeText({ ...x.narrative, distractors: [] });
  assert.doesNotMatch(all, /hemoglobin-adjusted|adjusted for hemoglobin|standard hemoglobin|Adjusted DLCO/i);
  assert.match(x.narrative.finalStatement, /no hemoglobin (?:was )?available/);
  assert.doesNotMatch(all, /hemoglobin is low|low hemoglobin concentration lowers the measured DLCO because less hemoglobin/);
  // learner page
  for (const html of [R.renderDlco(x.c, x.interp), R.renderPatient(x.c)]) assert.doesNotMatch(visible(html), /Adjusted DLCO|hemoglobin-adjusted/);
  const q = QUESTIONS.find((y) => y.id === 'dlco');
  assert.doesNotMatch(questionLabel(x.c, q), /hemoglobin-adjusted/);
  const reveal = visible(R.renderReveal(x.c, x.interp, x.cmp, scoreAnswers({}, x.interp.key, x.interp.key), false));
  assert.doesNotMatch(reveal, /hemoglobin is low|after hemoglobin correction/);
  // quiz
  const { prep, items } = build({ seed: 7, archetype: 'anemia', technique: 'good', panel: 'full', scenarioLevel: 'none', scenarioIds: ['dlco-hb-missing'] }, { adapters });
  assert.equal(prep.caseData.dlco.hbGdl, null);
  const f = caseFacts(prep);
  assert.equal(f.hbMissing, true);
  assert.equal(f.hb, null);
  const { caveats } = fallbackCaveats(prep);
  assert.ok(!caveats.some((c) => c.id === 'fb-hb'), 'a missing hemoglobin is not reported as low');
  const dlcoItem = items.find((i) => i.id === 'dlco');
  assert.doesNotMatch(dlcoItem.stem, /hemoglobin-adjusted/);
  assert.match(dlcoItem.stem, /not adjusted|unadjusted/);
  const html = feedbackHtml(dlcoItem, prep, scoreItem(dlcoItem, dlcoItem.key.correct));
  assert.doesNotMatch(visible(html), /hemoglobin is low|Cotes/);
  assert.doesNotMatch(visible(renderChart(prep, { adapters })), /\bnull\b|NaN/);
  const finalItem = items.find((i) => i.id === 'final');
  for (const o of finalItem.explain.options) assert.doesNotMatch(o.text, /hemoglobin-adjusted|adjusted for hemoglobin/);
});

test('across many cases a missing hemoglobin never produces a low-hemoglobin statement', () => {
  for (const d of sweep(4)) {
    const { prep, items } = build({ ...d, panel: 'full', scenarioLevel: 'none', scenarioIds: ['dlco-hb-missing'] }, { adapters });
    if (prep.caseData.dlco?.hbGdl !== null) continue;
    const lim = items.find((i) => i.id === 'limitations');
    for (const o of lim.explain.options) assert.doesNotMatch(o.text, /^The hemoglobin is low|A low hemoglobin concentration lowers the measured DLCO and KCO while the VA is unchanged, which is why/);
  }
});

// ------------------------------------------------------------------ 3. birth sex

test('a sex the patient declined to give is not revealed before the answers are checked', () => {
  let shown = 0, same = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const x = make({ seed, archetype: 'obstruction', scenarioIds: ['sex-not-recorded'] });
    const rs = x.c.scenario.referenceSex;
    if (rs.used === rs.birth) same++; else shown++;
    const birth = rs.birth === 'M' ? 'male' : 'female';
    const texts = [
      ...x.narrative.sections.map((s) => s.text), x.narrative.finalStatement, ...x.narrative.findings.map((f) => f.text),
      modelText(x.model), visible(renderReportHtml(x.model)), visible(R.renderPatient(x.c)),
    ];
    for (const t of texts) {
      assert.doesNotMatch(t, /assigned at birth|recorded at birth|sex at birth/i, `seed ${seed}`);
      assert.doesNotMatch(t, /Sex assigned at birth/);
    }
    // a sentence about the default is written whether or not it matches the birth sex, so its absence reveals nothing
    assert.match(x.narrative.sections.find((s) => s.id === 'reference').text, /Sex was not disclosed|did not give a sex|because sex was not disclosed/);
    assert.ok(x.model.referenceNote.some((n) => /did not disclose sex/.test(n)));
    assert.doesNotMatch(R.renderPatient(x.c), new RegExp(`assigned at birth: ${birth}`));
    const { prep } = build({ seed, archetype: 'obstruction', technique: 'good', panel: 'full', scenarioLevel: 'none', scenarioIds: ['sex-not-recorded'] }, { adapters });
    assert.doesNotMatch(visible(renderChart(prep, { adapters })), /assigned at birth/i);
  }
  assert.ok(shown > 3 && same > 3, `cases where the default differs from the birth sex: ${shown}; matches: ${same}`);
});

test('a reference sex that differs from the birth sex is still stated when the birth sex was given', () => {
  const x = make({ seed: 3, archetype: 'obstruction', scenarioIds: ['sex-identity-entered'] });
  assert.ok(x.model.header.fields.some((f) => f.label === 'Sex assigned at birth'));
  assert.match(x.narrative.sections.find((s) => s.id === 'reference').text, /recorded at birth|recorded sex at birth/);
});

// ------------------------------------------------------------------ 4. discordant bronchodilator wording

test('the discordant response explanation follows the value that fell', () => {
  const x = make({ seed: 19, archetype: 'bd-discordant', technique: 'good' });
  assert.ok(x.interp.bd, 'bronchodilator study');
  const sectionFor = (dFev1, dFvc) => composeNarrative({ caseData: x.c, interp: { ...x.interp, bd: { ...x.interp.bd, dFev1, dFvc, discordant: true } }, cmp: x.cmp, seed: 4 })
    .sections.find((s) => s.id === 'bronchodilator').text;
  for (let seed = 0; seed < 3; seed++) {
    const run = (dFev1, dFvc) => composeNarrative({ caseData: x.c, interp: { ...x.interp, bd: { ...x.interp.bd, dFev1, dFvc, discordant: true } }, cmp: x.cmp, seed, forceVariant: seed }).sections.find((s) => s.id === 'bronchodilator').text;
    const fvcFell = run(0.15, -0.2), fev1Fell = run(-0.15, 0.25);
    assert.match(fvcFell, /FVC (?:fell|falling)/);
    assert.match(fvcFell, /expiratory time|expiration/);
    assert.match(fev1Fell, /FEV1 (?:fell|falling)/);
    assert.doesNotMatch(fev1Fell, /(?:shorter|shorter forced) (?:forced )?expirat\w+ [^.]*lower(?:s)? the FVC/);
    assert.match(fev1Fell, /first-second effort|weaker|bronchoconstrict|narrowing/);
  }
  assert.notEqual(sectionFor(0.15, -0.2), sectionFor(-0.15, 0.25));
});

// ------------------------------------------------------------------ 5. explain texts

test('explanation texts match the engine: mixed disease is not graded and obesity is not said to raise the DLCO', () => {
  const mixed = PATTERN_TEXT.mixed.join(' ');
  assert.doesNotMatch(mixed, /graded from the FEV₁ z-score/);
  assert.match(mixed, /does not grade severity for mixed disease/);
  const all = [...Object.values(PATTERN_TEXT).flat(), ...Object.values(DLCO_TEXT).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v))), LOW_ERV_TEXT, ...Object.values(BD_TEXT)].join(' ');
  assert.doesNotMatch(DLCO_TEXT.raised, /obesity/i);
  assert.doesNotMatch(LOW_ERV_TEXT, /DLCO and KCO are normal or raised/);
  assert.doesNotMatch(all, /obesity[^.]*(?:raise|increase)[^.]*DLCO|DLCO[^.]*(?:raised|increased) (?:from|by|in) obesity/i);
});

// ------------------------------------------------------------------ 6. reference wording and scoring labels

test('reference wording describes a limit of the reference population and never asks for a race-specific equation', () => {
  const bad = /no equation (?:derived|exists|was available)|none is available|has no specific equation|no group-specific/i;
  let fallbacks = 0;
  for (const g of ['Black or African American', 'Asian: Southeast', 'Asian: Northeast']) {
    const x = make({ seed: 90, archetype: 'normal', group: g });
    const text = [narrativeText(x.narrative), modelText(x.model), visible(renderReportHtml(x.model))].join('\n');
    if (/European ancestry/.test(text)) fallbacks++;
    assert.doesNotMatch(text, bad);
    assert.match(x.narrative.sections.find((s) => s.id === 'reference').text, /European ancestry/);
    assert.doesNotMatch(visible(R.renderReport(x.interp, ['tlc', 'dlco'], 't', 'x')), /no equation exists/);
    assert.match(R.renderReport(x.interp, ['tlc'], 't', 'x'), /European reference population/);
    const { prep } = build({ seed: 90, archetype: 'normal', technique: 'good', panel: 'full', group: g }, { adapters });
    assert.doesNotMatch(visible(renderChart(prep, { adapters })), /no equation exists/);
  }
  assert.equal(fallbacks, 3);
});

test('an answer that matches only the other equation is accepted and labeled with the equation it matches', () => {
  const a = { pattern: 'normal', severity: 'na' }, b = { pattern: 'obstruction', severity: 'mild' };
  const g = scoreAnswers({ pattern: 'obstruction' }, a, b, 'GLIglobal').find((s) => s.id === 'pattern');
  assert.equal(g.status, 'other-equation');
  assert.match(g.otherLabel, /GLI-2012/);
  assert.match(g.otherLabel, /earlier, race-specific/);
  const r = scoreAnswers({ pattern: 'obstruction' }, a, b, 'GLI2012').find((s) => s.id === 'pattern');
  assert.match(r.otherLabel, /GLI Global/);
  assert.equal(scoreAnswers({ pattern: 'normal' }, a, b).find((s) => s.id === 'pattern').status, 'correct');
  const { prep, items } = build({ seed: 5, archetype: 'normal', technique: 'good' }, { equation: 'GLIglobal' });
  const it = { ...items[0], key: { correct: 'x', alt: 'y', altEquation: 'GLI2012' }, id: 'pattern', options: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }] };
  assert.match(feedbackHtml(it, prep, scoreItem(it, 'y')), /GLI-2012 key \(the earlier, race-specific convention\)/);
});

// ------------------------------------------------------------------ 8. exports and print

test('every export carries the simulation marker, the patient ID is synthetic and the signature line is a simulated one', async () => {
  const x = make({ seed: 12, archetype: 'obstruction' });
  assert.equal(SIMULATION_MARKER, 'SIMULATED REPORT - educational use only');
  assert.match(patientId(12), /^SIM-[0-9A-Z]{7}$/);
  assert.equal(x.model.header.fields.find((f) => f.label === 'ID').value, patientId(12));
  const csv = toCsv(x.model);
  assert.equal(csv.split('\r\n')[1].split(',').slice(0, 3).join(','), 'header,report,notice');
  assert.ok(csv.split('\r\n')[1].includes(SIMULATION_MARKER));
  assert.equal(longRows(x.model)[0][4], SIMULATION_MARKER);
  assert.ok(toCsv(x.model, { layout: 'wide' }).startsWith(SIMULATION_MARKER));
  for (const t of allTables(x.model)) {
    assert.ok(toTsv(t).startsWith(`# ${SIMULATION_MARKER}\n`), 'TSV first line');
    assert.ok(toClipboardHtml(t).includes(SIMULATION_MARKER), 'clipboard caption');
  }
  assert.equal(x.model.footer.signatureLabel, 'Simulated interpreting physician (not signed)');
  const html = renderReportHtml(x.model);
  assert.ok(html.includes('class="rpt-watermark"'));
  assert.ok(html.includes('SIMULATED REPORT - educational use only. PFT Sim'), 'footer text in the @page margin box');
  const css = await loadReportCss();
  assert.match(css, /@media print[\s\S]*\.rpt-watermark\s*\{[^}]*position:\s*fixed[^}]*rotate\(-32deg\)/);
  const doc = renderReportDocument(x.model, { css });
  assert.ok(doc.includes('rpt-watermark'));
});

test('the DLCO footnote and the learner page say that inspired volume and breath-hold time are simulated', () => {
  const x = make({ seed: 12, archetype: 'obstruction' });
  const foot = x.model.sections.find((s) => s.id === 'dlco').tables[0].footnote;
  assert.match(foot, /Inspired volume \(VI\/VC\) and breath-hold time are simulated/);
  assert.doesNotMatch(foot, /VI\/VC and breath-hold time are not simulated/);
  const rows = x.model.sections.find((s) => s.id === 'dlco').tables[0].rows;
  assert.ok(rows.some((r) => r.id === 'vi-vc') && rows.some((r) => r.id === 'breath-hold'));
  assert.match(visible(R.renderDlco(x.c, x.interp)), /inspired volume and the breath-hold time are simulated/);
  assert.doesNotMatch(visible(R.renderMethod(1)), /(?:inspired volume|breath-hold)[^;.]*\bnot simulated/);
});

// ------------------------------------------------------------------ 9. notes on the simulation

test('verification notes sit in a separate block and not in the physician text', () => {
  const meta = /not been (?:verified|checked)|unverified|has not been reviewed|this tool|secondary summar/i;
  let withNotes = 0;
  for (let i = 0; i < 60; i++) {
    const x = make({ seed: 300 + i, archetype: ['obstruction', 'restriction-parenchymal', 'mixed', 'low-dlco', 'bd-discordant', 'nonspecific'][i % 6], scenarioLevel: 'moderate' });
    const phys = [x.narrative.finalStatement, ...x.narrative.sections.map((s) => s.text)].join('\n');
    assert.doesNotMatch(phys, meta, `seed ${300 + i}`);
    assert.ok(x.narrative.notes.length >= 1);
    assert.ok(x.narrative.notes.some((n) => meta.test(n)));
    const html = renderReportHtml(x.model);
    assert.match(html, /<h3>Notes on this simulation<\/h3>/);
    assert.ok(html.indexOf('Notes on this simulation') > html.indexOf('<h2>Interpretation</h2>'));
    withNotes++;
  }
  assert.equal(withNotes, 60);
  const x = make({ seed: 12, archetype: 'obstruction' });
  const bare = buildReportModel(x.c, x.interp, { resolve: resolveReference });
  assert.ok(!renderReportHtml(bare).includes('Notes on this simulation'), 'no notes block before an interpretation is shown');
  const csv = toCsv(x.model);
  assert.match(csv, /notes-on-simulation/);
  assert.equal(interpretationFor(x.c, x.interp, x.cmp).notes.length, x.narrative.notes.length);
});

// ------------------------------------------------------------------ fault ids

test('no fault id or flaw id is printed raw in the report, the narrative or the quiz', () => {
  const ids = /\b(?:slow-start|early-termination|variable-effort|glottic-closure|mouthpiece-obstruction|pause-at-TLC|submaximal-effort|no-plateau|wrong-pattern|wrong-severity|ignores-quality|over-diagnoses|restriction-without-tlc)\b|\b(?:PLE|DLC|SPR|MAN)-\d{2}\b/;
  for (const d of sweep(3)) for (const level of ['heavy']) {
    const { prep, items } = build({ ...d, scenarioLevel: level }, { adapters });
    const x = { c: prep.caseData, interp: prep.a, cmp: prep.cmp };
    const narrative = composeNarrative({ ...{ caseData: x.c, interp: x.interp, cmp: x.cmp }, seed: d.seed });
    const model = buildReportModel(x.c, x.interp, { resolve: resolveReference, equation: 'GLIglobal', interpretationText: narrative.finalStatement, interpretationNotes: narrative.notes });
    const texts = [visible(renderReportHtml(model)), toCsv(model), narrativeText({ ...narrative, distractors: narrative.distractors }), visible(renderChart(prep, { adapters })), visible(R.renderManeuvers(x.c.spirometry.pre, 't', { revealed: true, id: 'm' }))];
    for (const it of items) {
      texts.push(it.stem, ...it.options.map((o) => o.label));
      const html = feedbackHtml(it, prep, scoreItem(it, it.key.correct));
      texts.push(visible(html));
      const wrongId = it.options.find((o) => o.id !== [].concat(it.key.correct)[0])?.id;
      texts.push(visible(feedbackHtml(it, prep, scoreItem(it, it.type === 'multi' ? [wrongId] : wrongId))));
    }
    for (const t of texts) assert.doesNotMatch(t, ids, `${d.archetype} seed ${d.seed}: ${t.match(ids)?.[0]}`);
  }
});

// ------------------------------------------------------------------ ids that other modules own

test('the quiz and the narrative know every caveat id of the scenario library', async () => {
  const { SCENARIOS } = await import('../src/scenarios/library.js');
  const { CAVEAT_PARAPHRASE } = await import('../src/interpret/narrative.js');
  const { SCENARIO_TOPIC } = await import('../src/quiz/items.js');
  const ids = new Set(Object.values(SCENARIOS).flatMap((s) => s.caveats.map((c) => c.id)));
  for (const id of ids) assert.ok(CAVEAT_PARAPHRASE[id], `no paraphrase for caveat ${id}`);
  for (const id of Object.keys(CAVEAT_PARAPHRASE)) assert.ok(ids.has(id), `paraphrase for unknown caveat ${id}`);
  for (const id of Object.keys(SCENARIO_TOPIC)) assert.ok(ids.has(id), `topic for unknown caveat ${id}`);
});

test('the equation sensitivity item does not offer the sex assumption to a patient who declined to give a sex', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { items } = build({ seed, archetype: 'normal', technique: 'good', panel: 'full', scenarioLevel: 'none', scenarioIds: ['sex-not-recorded'] }, { adapters });
    const it = items.find((i) => i.id === 'sensitivity');
    if (it) assert.ok(!it.explain.options.some((o) => o.sem === 'sex'));
  }
});
