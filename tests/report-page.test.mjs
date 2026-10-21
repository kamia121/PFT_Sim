import test from 'node:test';
import assert from 'node:assert/strict';
import { ds, resolveReference } from './report-helpers.mjs';
import { buildCase } from '../src/core/case.js';
import { interpret, compareEquations, PATTERNS } from '../src/interpret/interpret.js';
import { encodeCase } from '../src/core/code.js';
import { serializeDescriptor, parseDescriptor } from '../src/core/descriptor.js';
import { buildReportModel, resistanceRows, AIRWAY_RESISTANCE_LIMITS } from '../src/report/model.js';
import { interpretationFor } from '../src/report/statement.js';
import { FIGURES } from '../src/ui/figures/index.js';
import { PALETTES } from '../src/ui/palettes.js';
import { assembleReport } from '../src/report-page/assemble.js';
import { parseReportQuery, reportQuery, ReportLinkError } from '../src/report-page/query.js';
import { SLOTS, resolveSlot, slotCaseData, inlineCell, loadZInline } from '../src/report-page/panels.js';

const FULL = { seed: 12, archetype: 'obstruction', technique: 'fair' };
const SPIRO_ONLY = { seed: 44, archetype: 'mixed', panel: 'spirometry' };
const build = (input) => buildCase(input, ds);
const asm = (input, opts = {}) => assembleReport({ caseData: build(input), resolve: resolveReference, ...opts });

/** Visible text of an HTML string: style elements and tags removed, entities of esc() undone. */
const textOf = (html) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const VOID = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'col', 'source']);
function assertBalanced(html) {
  const stack = [];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m, raw = null;
  while ((m = re.exec(html))) {
    if (raw) { if (m[1]?.toLowerCase() === raw) raw = null; else continue; }
    if (m[1]) assert.equal(stack.pop(), m[1].toLowerCase(), `unexpected </${m[1]}>`);
    else if (m[2]) {
      const name = m[2].toLowerCase();
      if (name === 'style' || name === 'script') { stack.push(name); raw = name; continue; }
      if (!VOID.has(name) && !m[4]) stack.push(name);
    }
  }
  assert.deepEqual(stack, [], 'unclosed elements');
}

test('the report address: code, plain descriptor, equation and copy', () => {
  const d = parseDescriptor(serializeDescriptor(parseDescriptor('v=2&s=12&a=obstruction&t=fair')));
  const token = encodeCase(serializeDescriptor(d));
  const a = parseReportQuery(`?c=${token}`);
  assert.equal(a.equation, 'GLIglobal');
  assert.equal(a.copy, 'student');
  assert.equal(a.descriptor.seed, 12);
  const b = parseReportQuery('v=2&s=12&a=obstruction&t=fair&eq=GLI2012&copy=instructor');
  assert.deepEqual([b.equation, b.copy, b.descriptor.archetype], ['GLI2012', 'instructor', 'obstruction']);
  assert.equal(parseReportQuery(reportQuery({ token, equation: 'GLI2012', copy: 'instructor' })).copy, 'instructor');
  assert.equal(parseReportQuery(reportQuery({ token })).copy, 'student');
});

test('a link that cannot be read gives a readable message, never a stack or a bare error', () => {
  const bad = ['', '?s=12', '?c=!!!!', '?c=bm90IGEgZGVzY3JpcHRvcg', '?v=1&s=12&a=obstruction', '?v=2&s=12&a=nonsense', '?v=2&s=12&a=normal&eq=XYZ', '?v=2&s=12&a=normal&copy=teacher', '?v=2&s=-4&a=normal', '?c=%E0%A4%A'];
  for (const q of bad) {
    assert.throws(() => parseReportQuery(q), (e) => {
      assert.ok(e instanceof ReportLinkError, `${q}: ${e}`);
      assert.match(e.message, /^[A-Z].{15,}[.]$/, `${q}: ${e.message}`);
      assert.ok(!/undefined|\[object|\n/.test(e.message), e.message);
      return true;
    }, q);
  }
});

test('airway-resistance rows: present with limits when the loop exists, absent otherwise', () => {
  const c = build(FULL);
  const model = buildReportModel(c, interpret(c.report, resolveReference, 'GLIglobal'), { resolve: resolveReference, figures: false });
  const vols = model.sections.find((s) => s.id === 'volumes').tables[0];
  const ids = vols.rows.map((r) => r.id);
  assert.deepEqual(ids.slice(-3), ['sraw', 'sgaw', 'raw']);
  const row = (id) => vols.rows.find((r) => r.id === id);
  assert.equal(row('sraw').uln, AIRWAY_RESISTANCE_LIMITS.sRawUpper.value);
  assert.equal(row('raw').uln, AIRWAY_RESISTANCE_LIMITS.rawUpper.value);
  assert.equal(row('sgaw').lln, AIRWAY_RESISTANCE_LIMITS.sGawLower.value);
  assert.equal(row('sraw').z, null);
  // Raw is sRaw over the reported FRC, to the printed precision, and sGaw is 1/sRaw.
  assert.ok(Math.abs(row('raw').result - c.pleth.raw.sRawKpaS / c.pleth.reportedFrcL) < 0.006);
  assert.ok(Math.abs(row('sgaw').result - 1 / c.pleth.raw.sRawKpaS) < 0.006);
  assert.match(vols.footnote, /least-squares slope of box pressure on flow over \|flow\| up to 0\.5 L\/s/);
  assert.match(vols.footnote, /breathing mode: tidal breathing/);
  assert.match(vols.footnote, /Raw = sRaw divided by the reported FRC/);
  assert.match(vols.footnote, /not verified against the primary papers/);
  assert.equal(AIRWAY_RESISTANCE_LIMITS.rawUpper.verification, 'unverified');
  // A value that is absent is omitted; nothing is derived from another row.
  const partial = resistanceRows({ reportedFrcL: 3, raw: { sRawKpaS: 0.7, fitRangeLs: 0.5 } });
  assert.deepEqual(partial.rows.map((r) => r.id), ['sraw']);
  assert.deepEqual(resistanceRows(null).rows, []);
  assert.deepEqual(resistanceRows({ raw: {} }).rows, []);
  assert.equal(resistanceRows({ raw: { rawKpaSL: 0.2 } }).rows[0].id, 'raw');
  // The case's own limit takes precedence.
  assert.equal(resistanceRows({ raw: { sRawKpaS: 1, reference: { sRawUpperKpaS: 1.5 } } }).rows[0].uln, 1.5);
});

test('spirometry-only cases have no airway-resistance rows; the fallback page 1 adds a sheet of tables only when volumes or DLCO exist', () => {
  const out = asm(SPIRO_ONLY);
  assert.equal(out.pageCount, 2);
  assert.ok(!out.model.sections.some((s) => s.id === 'volumes'));
  assert.ok(!out.html.includes('data-section="volumes"'));
  assert.equal(asm(FULL).pageCount, 3);
});

test('the student copy is well formed (page 1, then the flowing details), and carries no answer-key text with the quality challenge on or off', () => {
  for (const input of [FULL, { seed: 5, archetype: 'normal' }, { seed: 31, archetype: 'restriction-parenchymal' }, { seed: 8, archetype: 'bd-discordant', technique: 'poor' }, SPIRO_ONLY, { seed: 90, archetype: 'mixed', scenarioLevel: 'heavy' }]) {
    const c = build(input);
    for (const qualityChallenge of [false, true]) {
    const out = assembleReport({ caseData: c, resolve: resolveReference, copy: 'student', qualityChallenge });
    assertBalanced(out.html);
    assert.equal((out.html.match(/class="rp-box/g) ?? []).length, out.pageCount);
    assert.doesNotMatch(out.html, /data-page="appendix"/);
    const text = textOf(out.html);
    const interp = interpret(c.report, resolveReference, 'GLIglobal');
    const stmt = interpretationFor(c, interp, null);
    for (const phrase of [PATTERNS[c.anchorKey.pattern], stmt.parts.impression.slice(0, 40), stmt.supporting.slice(0, 50), ...stmt.notes.map((n) => n.slice(0, 40)), 'Answer key', 'Instructor appendix', 'Interpretation summary', 'Supporting explanation', 'Notes on this simulation', 'Computed from the reported values']) {
      assert.ok(!text.includes(phrase), `student copy contains "${phrase}"`);
    }
    // Grades are the technologist's report and print with the challenge off; with it on, no grade or acceptability text is in the markup.
    if (qualityChallenge) assert.doesNotMatch(out.html, /\b(FEV1|FVC) - [A-FU]\b|[Gg]rade [A-F]\b|Accept\.|[Aa]cceptab|Test quality|withheld|Criteria not met/);
    else assert.match(text, /\b(FEV1|FVC) - [A-FU]\b/);
    assert.match(text, /Student copy/);
    assert.equal(out.fullModel, null);
    assert.equal(out.model.quality, null);
    assert.equal(out.model.interpretation, null);
    }
  }
});

test('the instructor copy adds an appendix with grades, the statement, the notes and the key', () => {
  const c = build(FULL);
  const out = assembleReport({ caseData: c, resolve: resolveReference, copy: 'instructor' });
  assertBalanced(out.html);
  const text = textOf(out.html);
  const stmt = interpretationFor(c, interpret(c.report, resolveReference, 'GLIglobal'), compareEquations(c.report, resolveReference, 'GLI2012', 'GLIglobal'));
  for (const phrase of ['Instructor appendix', 'Test quality grades', 'Interpretation summary', 'Supporting explanation', 'Notes on this simulation', 'Answer key', stmt.parts.impression.slice(0, 40), stmt.supporting.slice(0, 50), 'Instructor copy', PATTERNS[c.anchorKey.pattern].toLowerCase()]) assert.ok(text.includes(phrase), `instructor copy lacks "${phrase}"`);
  assert.match(text, /FEV1 - [A-F]/);
  assert.match(out.html, /data-page="appendix"/);
  // The student pages are the same in both copies, apart from the label in the footer.
  const stu = assembleReport({ caseData: c, resolve: resolveReference, copy: 'student' });
  const pages = (h) => [...h.matchAll(/<article class="pft-report rp-page" data-page="\d"[\s\S]*?<\/article>/g)].map((m) => m[0].replace(/Student copy|Instructor copy/g, 'COPY'));
  assert.deepEqual(pages(out.html), pages(stu.html));
  // Ids are unique, so the appendix tables do not repeat those of the student pages.
  const ids = [...out.html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
});

test('the equation choice changes the references and the page says which one', () => {
  const c = build(FULL);
  const a = assembleReport({ caseData: c, resolve: resolveReference, equation: 'GLIglobal' });
  const b = assembleReport({ caseData: c, resolve: resolveReference, equation: 'GLI2012' });
  assert.match(textOf(a.html), /Spirometry: GLI Global 2022/);
  assert.match(textOf(b.html), /Spirometry: GLI-2012/);
  assert.notEqual(a.html, b.html);
});

test('figure slots: the first available entry of the chain is used and a missing id is tolerated', () => {
  // Panels may or may not be registered yet; the test sets them aside and puts them back.
  const PANELS = ['panel-spirometry', 'panel-pleth', 'panel-dlco'];
  const saved = Object.fromEntries(PANELS.map((id) => [id, FIGURES[id]]));
  for (const id of PANELS) delete FIGURES[id];
  try { slotChecks(); } finally { for (const id of PANELS) if (saved[id]) FIGURES[id] = saved[id]; else delete FIGURES[id]; }
});

function slotChecks() {
  const c = build(FULL);
  const interp = interpret(c.report, resolveReference, 'GLIglobal');
  const cd = slotCaseData(c, interp, 'GLIglobal', resolveReference);
  const errors = [];
  // Before any panel is registered the individual figures fill the slots.
  const s = resolveSlot('spirometry', cd, { palette: PALETTES.white, errors });
  assert.deepEqual([s.ids, s.span], [['flow-volume', 'volume-time'], 'pair']);
  assert.deepEqual(resolveSlot('dlco', cd, { palette: PALETTES.white }).ids, ['dlco-trace']);
  assert.deepEqual(resolveSlot('pleth', cd, { palette: PALETTES.white }).ids, ['pleth-shutter', 'pleth-raw']);
  assert.deepEqual(resolveSlot('zstrip', cd, { palette: PALETTES.white }).ids, ['z-strip']);
  assert.equal(resolveSlot('zstrip', cd, { palette: PALETTES.white, hasInline: true }), null);
  assert.equal(resolveSlot('nonexistent', cd, { palette: PALETTES.white }), null);
  // A registered panel at the head of the chain wins and is drawn 7 in wide.
  const seen = [];
  FIGURES['panel-spirometry'] = { id: 'panel-spirometry', title: 'stub', dataFor: () => ({}), render: (d, o) => { seen.push(o); return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 672 400"><title>p</title></svg>'; } };
  try {
    const p = resolveSlot('spirometry', cd, { palette: PALETTES.white });
    assert.deepEqual([p.ids, p.span], [['panel-spirometry'], 'full']);
    assert.equal(seen[0].width, 672);
    assert.equal(seen[0].view, 'best');
    assert.equal(seen[0].showQuality, false);
    // A panel that has no data or throws falls through to the next entry.
    FIGURES['panel-spirometry'].dataFor = () => null;
    assert.deepEqual(resolveSlot('spirometry', cd, { palette: PALETTES.white }).ids, ['flow-volume', 'volume-time']);
    FIGURES['panel-spirometry'].dataFor = () => { throw new Error('boom'); };
    assert.deepEqual(resolveSlot('spirometry', cd, { palette: PALETTES.white, errors }).ids, ['flow-volume', 'volume-time']);
    assert.equal(errors[0].id, 'panel-spirometry');
    const out = assembleReport({ caseData: c, resolve: resolveReference });
    assert.ok(out.errors.length >= 1);
  } finally {
    delete FIGURES['panel-spirometry'];
  }
  assert.ok(SLOTS.spirometry.chain[0] === 'panel-spirometry');
  // The plethysmography and DLCO panels belong to the details sheet; the page slots hold only the fallback page 1 figures.
  const sp = assembleReport({ caseData: build(SPIRO_ONLY), resolve: resolveReference });
  assert.deepEqual(Object.keys(sp.slots).sort(), ['spirometry', 'zstrip']);
}

test('the inline z-score column appears when zInline exists and the strip fills in when it does not', () => {
  const c = build(FULL);
  const calls = [];
  const zInline = (measure, vals, opts) => { calls.push([measure, vals, opts]); return `<line x1="0" y1="8" x2="${opts.width}" y2="8" stroke="#000"/>`; };
  const withInline = assembleReport({ caseData: c, resolve: resolveReference, zInline });
  assertBalanced(withInline.html);
  assert.ok(withInline.html.includes('z-score plot'));
  assert.equal(withInline.slots.zstrip, null);
  const measures = new Set(calls.map((x) => x[0]));
  for (const m of ['fvc', 'fev1', 'fev1_fvc', 'tlc', 'rv', 'rv_tlc', 'dlco', 'va', 'kco']) assert.ok(measures.has(m), m);
  assert.ok(!measures.has('sraw') && !measures.has('fet') && !measures.has('pef'));
  const tlc = calls.find((x) => x[0] === 'tlc');
  assert.equal(tlc[1].lln, -1.645);
  assert.equal(tlc[1].uln, 1.645);
  assert.equal(calls.find((x) => x[0] === 'fvc')[1].uln, null);
  assert.ok(Number.isFinite(tlc[1].z));
  assert.match(withInline.html, /<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 125 16"/);
  const without = assembleReport({ caseData: c, resolve: resolveReference, zInline: null });
  assert.ok(!without.html.includes('z-score plot'));
  assert.ok(without.slots.zstrip);
  // The wrapper accepts a complete svg and survives a module that throws or returns nothing.
  assert.equal(inlineCell(() => '<svg viewBox="0 0 1 1"></svg>', 'fvc', { z: -1 }, -1.645, PALETTES.white), '<svg viewBox="0 0 1 1"></svg>');
  assert.equal(inlineCell(() => { throw new Error('x'); }, 'fvc', { z: -1 }, -1.645, PALETTES.white), '');
  assert.equal(inlineCell(() => '', 'fvc', { z: -1 }, -1.645, PALETTES.white), '');
  assert.equal(inlineCell(() => '<g/>', 'fvc', { z: null }, -1.645, PALETTES.white), '');
  assert.equal(inlineCell(null, 'fvc', { z: -1 }, -1.645, PALETTES.white), '');
});

test('zInline is optional: a missing module loads as null', async () => {
  const fn = await loadZInline();
  assert.ok(fn === null || typeof fn === 'function');
});

test('printed pages carry the sizes the layout promises', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../src/report-page/page.css', import.meta.url), 'utf8');
  assert.match(css, /width: 816px; height: 1056px/);
  assert.match(css, /width: 8\.5in; height: 11in/);
  assert.match(css, /break-after: page/);
  assert.match(css, /break-inside: avoid/);
  const out = asm(FULL);
  assert.match(out.html, /@page\{size:8\.5in 11in;margin:0\}/);
  assert.equal((out.html.match(/<footer class="rpt-end">/g) ?? []).length, 1);
  assert.match(textOf(out.html), /Page 1/);
  assert.match(textOf(out.html), /Page 2/);
});

test('model strings reach the page escaped', () => {
  const c = build(FULL);
  c.scenario = { ...c.scenario, technologistComments: ['<img src=x onerror=alert(1)>'] };
  const out = assembleReport({ caseData: c, resolve: resolveReference });
  assert.ok(!out.html.includes('<img src=x'));
  assert.ok(out.html.includes('&lt;img src=x'));
});
