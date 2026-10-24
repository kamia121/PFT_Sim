import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDatasets } from '../src/reference/load.js';
import { createReference } from '../src/reference/gli.js';
import { buildCase } from '../src/core/case.js';
import { buildDlcoTrace } from '../src/core/dlco-trace.js';
import { interpret } from '../src/interpret/interpret.js';
import { PALETTES, PALETTE_IDS } from '../src/ui/palettes.js';
import zStrip from '../src/ui/figures/z-strip.js';
import dlcoTrace from '../src/ui/figures/dlco-trace.js';
import panelDlco from '../src/ui/figures/panel-dlco.js';
import { zInline, starPoints } from '../src/ui/figures/z-inline.js';
import { assertWellFormed, assertSelfContained } from './helpers/svg.mjs';

const ds = await loadDatasets();
const { resolveReference } = createReference(ds);

const make = (d) => {
  const c = buildCase(d, ds);
  const interp = interpret(c.report, resolveReference, 'GLIglobal');
  return { ...c, interp, resolve: resolveReference, equation: 'GLIglobal' };
};
const CASES = {
  normal: { seed: 3, archetype: 'normal' },
  obstructionBd: { seed: 21, archetype: 'obstruction', severity: 3 },
  restriction: { seed: 8, archetype: 'restriction-parenchymal' },
  lowDlco: { seed: 5, archetype: 'low-dlco' },
  anemia: { seed: 6, archetype: 'anemia' },
  spirometryOnly: { seed: 21, archetype: 'obstruction', panel: 'spirometry' },
};
const cases = Object.fromEntries(Object.entries(CASES).map(([k, d]) => [k, make(d)]));
const count = (s, re) => (s.match(re) ?? []).length;
const texts = (svg) => [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" font-family="[^"]*" font-size="([\d.]+)"[^>]*?(?:text-anchor="(\w+)")?[^>]*>([^<]*)<\/text>/g)]
  .map((m) => ({ x: Number(m[1]), y: Number(m[2]), size: Number(m[3]), anchor: m[4] ?? 'start', s: m[5] }));

test('the obstruction case has a post-bronchodilator study and the spirometry-only case has none', () => {
  assert.ok(cases.obstructionBd.report.spirometry.post);
  assert.equal(cases.spirometryOnly.report.spirometry.post, null);
});

test('z-strip: stars replace circles, no shaded band, LLN and predicted lines kept', () => {
  for (const [name, c] of Object.entries(cases)) {
    const data = zStrip.dataFor(c);
    for (const p of PALETTE_IDS) {
      const svg = zStrip.render(data, { palette: PALETTES[p] });
      assertWellFormed(svg, `z-strip ${name}/${p}`);
      assertSelfContained(svg, `z-strip ${name}/${p}`);
      assert.ok(!svg.includes('<circle'), `${name}: no circle markers`);
      assert.equal(count(svg, /<rect /g), PALETTES[p].background ? 1 : 0, `${name}/${p}: only the background rectangle, no band`);
      assert.match(svg, /LLN −1\.645/);
      assert.match(svg, />Predicted</);
    }
  }
});

test('z-strip: pre and post rows are stacked for FEV1, FVC and FEV1/FVC when a post study exists', () => {
  const c = cases.obstructionBd;
  const data = zStrip.dataFor(c);
  assert.ok(data.hasPost);
  for (const r of data.rows) assert.equal(Boolean(r.post), ['fvc', 'fev1', 'fev1_fvc'].includes(r.id), r.id);
  const post = c.report.spirometry.post;
  const expect = resolveReference('fev1', { ...c.report.patient, measured: post.fev1 }, 'GLIglobal');
  assert.equal(data.rows.find((r) => r.id === 'fev1').post.z, expect.z, 'post z from the same equation as pre');
  const svg = zStrip.render(data, { palette: PALETTES.white });
  assert.equal(count(svg, /<polygon /g), data.rows.length + 3 + 2, 'one star per row, three post stars, two legend stars');
  assert.match(svg, /post-bronchodilator/);
  assert.equal(count(svg, />pre</g), 3);
  assert.equal(count(svg, />post</g), 3);
  // Post stars use the second series color, pre stars the measured color.
  assert.ok(svg.includes(`fill="${PALETTES.white.second}"`));
  // Without a resolver the post z-scores cannot be computed and the rows stay single.
  const { resolve, ...noResolve } = c;
  assert.equal(zStrip.dataFor(noResolve).hasPost, false);
  assert.equal(zStrip.dataFor({ ...c, resolve: undefined, interp: c.interp }).rows.some((r) => r.post), false);
});

test('z-strip: spirometry-only and no-post cases have single rows, no volume or DLCO rows, and no post legend', () => {
  const data = zStrip.dataFor(cases.spirometryOnly);
  assert.deepEqual(data.rows.map((r) => r.id), ['fvc', 'fev1', 'fev1_fvc']);
  assert.equal(data.hasPost, false);
  const svg = zStrip.render(data, { palette: PALETTES.white });
  assert.equal(count(svg, /<polygon /g), 3);
  assert.ok(!/ULN|post-bronchodilator/.test(svg), 'no upper limit line for one-sided indices');
  const full = zStrip.dataFor(cases.normal);
  assert.deepEqual(full.rows.map((r) => r.id), ['fvc', 'fev1', 'fev1_fvc', 'tlc', 'rv', 'rv_tlc', 'dlco', 'va', 'kco']);
  assert.ok(!zStrip.render(full, { palette: PALETTES.white }).includes('post-bronchodilator'));
});

test('z-strip: ULN line at +1.645 only through the two-sided indices (TLC, RV, RV/TLC, DLCO, KCO)', () => {
  const data = zStrip.dataFor(cases.obstructionBd);
  assert.deepEqual(data.rows.filter((r) => r.twoSided).map((r) => r.id), ['tlc', 'rv', 'rv_tlc', 'dlco', 'kco']);
  const svg = zStrip.render(data, { palette: PALETTES.white });
  assert.match(svg, /ULN \+1\.645/);
  // Vertical dotted lines in the lower-limit color: the LLN line plus the ULN segments (TLC through DLCO, then KCO after the break at VA).
  const vert = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="\1" y2="([\d.]+)" stroke="#0E2B73" stroke-width="1.8" stroke-dasharray="2 4"/g)];
  const xs = [...new Set(vert.map((m) => m[1]))];
  assert.equal(xs.length, 2, 'two x positions: LLN and ULN');
  const uln = vert.filter((m) => m[1] === xs[1] || m[1] === xs[0]).map((m) => Number(m[1]));
  const [lln, up] = [Math.min(...uln), Math.max(...uln)];
  const ticks = [...svg.matchAll(/<text x="([\d.]+)"[^>]*>(−5|3)<\/text>/g)].map((m) => Number(m[1]));
  const sx = (z) => ticks[0] + ((z + 5) / 8) * (ticks[1] - ticks[0]);
  assert.ok(Math.abs(lln - sx(-1.645)) < 0.2 && Math.abs(up - sx(1.645)) < 0.2, 'ULN and LLN at the z positions');
  assert.equal(vert.filter((m) => Number(m[1]) === up).length, 2, 'ULN: one run from TLC through DLCO, a break at VA (read on the lower side only), then KCO');
});

test('z-strip: borderline wording kept, off-scale values hollow, text columns stay inside the figure', () => {
  const data = { llnZ: -1.645, hasPost: true, rows: [
    { id: 'fev1', label: 'FEV1', section: 'spirometry', z: -1.5, below: false, borderline: true, twoSided: false, equation: 'GLI Global', post: { z: -7.4, below: true, borderline: false } },
    { id: 'tlc', label: 'TLC', section: 'volumes', z: 1.7, below: false, borderline: true, twoSided: true, equation: 'GLI-2021 volumes' },
  ] };
  const svg = zStrip.render(data, { palette: PALETTES.dark });
  assertWellFormed(svg, 'borderline');
  assert.match(svg, /within limits, borderline/);
  assert.match(svg, /above ULN, borderline/);
  assert.match(svg, /below LLN \(off scale\)/);
  assert.match(svg, /<polygon [^>]*fill="none" stroke="#E8B962"/, 'off-scale post value is a hollow star in the post color');
  for (const t of texts(svg)) {
    const w = t.s.length * t.size * 0.55;
    const x1 = t.anchor === 'end' ? t.x : t.anchor === 'middle' ? t.x + w / 2 : t.x + w;
    assert.ok(x1 <= 672 + 1 && t.x >= 0, `text "${t.s}" inside the figure`);
  }
  // Every text row is legible: sizes between 10 and 12.5 px.
  for (const t of texts(zStrip.render(zStrip.dataFor(cases.obstructionBd), { palette: PALETTES.white }))) assert.ok(t.size >= 10 && t.size <= 12.5, `font size ${t.size}`);
});

test('zInline: self-contained svg of the requested size with a star, LLN, predicted and (two-sided) ULN lines', () => {
  for (const id of PALETTE_IDS) {
    const pal = PALETTES[id];
    const svg = zInline('TLC', { z: 0.5, lln: 4.1, uln: 6.9 }, { palette: pal });
    assertWellFormed(svg, `zInline/${id}`);
    assertSelfContained(svg, `zInline/${id}`);
    assert.match(svg, /^<svg [^>]*viewBox="0 0 84 14" width="84" height="14"/);
    assert.equal(count(svg, /stroke-dasharray/g), 3, 'predicted, LLN and ULN');
    assert.equal(count(svg, /<polygon /g), 1);
    assert.ok(svg.includes(`fill="${pal.measured}"`));
    assert.equal(count(svg, /<rect /g), pal.background ? 1 : 0);
  }
  const one = zInline('FEV1', { z: -2.3, lln: 3 }, { palette: PALETTES.white, width: 120, height: 18 });
  assert.match(one, /viewBox="0 0 120 18" width="120" height="18"/);
  assert.equal(count(one, /stroke-dasharray/g), 2, 'no ULN line without uln');
  assert.match(one, /below the lower limit of normal/);
});

test('zInline: star at the z position on the -5 to +3 axis, hollow at the edge when off scale, empty when z is not a number', () => {
  const cx = (svg) => {
    const pts = svg.match(/<polygon points="([^"]+)"/)[1].split(' ').map((p) => p.split(',').map(Number));
    return pts.reduce((s, p) => s + p[0], 0) / pts.length;
  };
  const lineX = (svg, color) => Number(new RegExp(`<line x1="([\\d.]+)"[^>]*stroke="${color}"[^>]*stroke-dasharray`).exec(svg)[1]);
  const at0 = zInline('x', { z: 0 }, { palette: PALETTES.white });
  assert.ok(Math.abs(cx(at0) - lineX(at0, PALETTES.white.predicted)) < 0.1);
  const atLln = zInline('x', { z: -1.645 }, { palette: PALETTES.white });
  assert.ok(Math.abs(cx(atLln) - lineX(atLln, PALETTES.white.lln)) < 0.1);
  const lo = zInline('x', { z: -9 }, { palette: PALETTES.white }), hi = zInline('x', { z: 6 }, { palette: PALETTES.white });
  for (const s of [lo, hi]) assert.match(s, /<polygon [^>]*fill="none"/);
  assert.ok(cx(lo) < cx(atLln) && cx(hi) > cx(at0));
  for (const s of [lo, hi, at0]) for (const p of s.match(/<polygon points="([^"]+)"/)[1].split(' ')) {
    const [x, y] = p.split(',').map(Number);
    assert.ok(x >= 0 && x <= 84 && y >= 0 && y <= 14, 'star inside the viewBox');
  }
  for (const bad of [NaN, undefined, null, Infinity]) {
    const s = zInline('x', { z: bad }, { palette: PALETTES.white });
    assertWellFormed(s, 'no z');
    assert.equal(count(s, /<polygon /g), 0);
    assert.match(s, /not available/);
  }
  assert.equal(starPoints(10, 10, 5).split(' ').length, 10);
});

test('zInline: embeds in an HTML table cell with balanced tags and escapes its input', () => {
  const evil = `<script>alert("x")</script> & 'q'`;
  const svg = zInline(evil, { z: -2 }, { palette: PALETTES.white });
  assertWellFormed(svg, 'escaped');
  assert.ok(!svg.includes('<script'));
  assert.ok(svg.includes('&lt;script&gt;') && svg.includes('&amp;'));
  const html = `<table><tbody><tr><th scope="row">FEV1</th><td>${svg}</td><td>${zInline('TLC', { z: 1, uln: 7 }, { palette: PALETTES.white })}</td></tr></tbody></table>`;
  assert.equal(count(html, /<svg /g), 2);
  assert.equal(count(html, /<\/svg>/g), 2);
  for (const tag of ['table', 'tbody', 'tr', 'td', 'th', 'title', 'desc', 'text']) assert.equal(count(html, new RegExp(`<${tag}[ >]`, 'g')), count(html, new RegExp(`</${tag}>`, 'g')), `<${tag}> balanced`);
  assert.ok(!/id="/.test(html), 'no ids, so many fragments can share one page');
  assert.equal(zInline(7, { z: 0 }).includes('<title>7 z-score'), true, 'a non-string measure is accepted');
  assert.match(zInline('a', { z: 0 }, { width: -4, height: NaN }), /width="84" height="14"/, 'bad sizes fall back to the default');
});

test('panel-dlco: null without DLCO; markup for every archetype in four palettes; subplot groups and the validity strip', () => {
  assert.equal(panelDlco.id, 'panel-dlco');
  assert.equal(panelDlco.dataFor(cases.spirometryOnly), null);
  assert.equal(panelDlco.dataFor(null), null);
  assert.equal(panelDlco.dataFor({}), null);
  assert.equal(panelDlco.render(null, { palette: PALETTES.white }), '');
  for (const name of ['normal', 'obstructionBd', 'restriction', 'lowDlco', 'anemia']) {
    const c = cases[name];
    const data = panelDlco.dataFor(c);
    assert.ok(data, name);
    const out = {};
    for (const p of PALETTE_IDS) {
      const svg = panelDlco.render(data, { palette: PALETTES[p] });
      out[p] = svg;
      assertWellFormed(svg, `panel-dlco ${name}/${p}`);
      assertSelfContained(svg, `panel-dlco ${name}/${p}`);
      assert.match(svg, /viewBox="0 0 672 \d+"/);
      assert.equal(count(svg, /<g data-subplot="/g), 2);
      assert.ok(svg.includes('data-subplot="gas-volume"') && svg.includes('data-subplot="validity-strip"'));
    }
    assert.equal(new Set(Object.values(out)).size, 4);
    const svg = out.white;
    const v = data.values;
    for (const s of ['Expired volume (L)', 'washout (discarded)', 'sample window', 'VD ', 'VI/VC', 'Time to 85%', 'Breath-hold', 'Washout', 'Sample', 'VA', 'DLCO', 'KCO', v.vaL.toFixed(2), v.dlcoMlMinMmHg.toFixed(1), v.kco.toFixed(2), data.quality.breathHoldS.toFixed(1), data.quality.washoutL.toFixed(2), data.quality.sampleL.toFixed(2), String(Math.round(data.quality.viOverVc * 100))]) assert.ok(svg.includes(s), `${name}: ${s}`);
    // Gas fractions are plotted against expired volume, not time, and nothing is drawn for the hold.
    assert.ok(!/Time \(s\)|not sampled/.test(svg));
    for (const t of texts(svg)) assert.ok(t.size >= 9.5 && t.size <= 12.5, `${name}: font size ${t.size}`);
  }
});

test('panel-dlco: grade, failed criteria and value marks only with showQuality; flag color is text only', () => {
  const c = make({ seed: 3, archetype: 'obstruction', severity: 2, technique: 'poor', scenarioIds: ['pleth-thermal-drift', 'dlco-valsalva'] });
  const data = panelDlco.dataFor(c);
  const plain = panelDlco.render(data, { palette: PALETTES.white });
  assert.ok(!/rubric|grade|requires review|Valsalva/i.test(plain));
  const q = panelDlco.render(data, { palette: PALETTES.white, showQuality: true });
  assertWellFormed(q, 'quality');
  assert.match(q, /Simulator rubric D, requires review: Valsalva/);
  assert.match(q, />Model</);
  // No filled rectangle other than the background and the two window bands and legend swatches (all in the series colors with opacity).
  for (const m of q.matchAll(/<rect [^>]*fill="(#[0-9A-Fa-f]{6})"([^>]*)>/g)) {
    assert.ok(m[1] === PALETTES.white.background || /fill-opacity/.test(m[2]), 'filled rectangles are the background or translucent window bands');
  }
});

test('panel-dlco: best, all and separate views over several tests; selected picks tests by 1-based number', () => {
  const c = cases.obstructionBd;
  const tests = [0, 1, 2].map((i) => buildDlcoTrace({ seed: 100 + i, truth: c.truth, dlco: { raw: c.dlco.raw, va: c.dlco.va }, volumes: c.volumes, patient: c.descriptor, technique: i === 1 ? 'poor' : 'good' }));
  assert.ok(tests.every(Boolean));
  const poly = (s) => count(s, /<polyline /g);
  const best = panelDlco.render(tests, { palette: PALETTES.white });
  const all = panelDlco.render(tests, { palette: PALETTES.white, view: 'all' });
  const sep = panelDlco.render(tests, { palette: PALETTES.white, view: 'separate' });
  const some = panelDlco.render({ tests }, { palette: PALETTES.white, view: 'separate', selected: [1, 3] });
  for (const s of [best, all, sep, some]) { assertWellFormed(s, 'view'); assertSelfContained(s, 'view'); }
  assert.equal(poly(best), 2, 'best: one test, two gases');
  assert.equal(poly(all), 6);
  assert.equal(poly(sep), 6);
  assert.equal(poly(some), 4);
  assert.equal(count(some, /Test [13]( \(best\))?<\/text>/g), 2);
  assert.ok(!/>Test 2/.test(some));
  assert.match(all, />Test</, 'the strip names the tests when the case holds several');
  // Selecting nothing valid falls back to every test; a single test draws alone in separate view.
  assert.equal(poly(panelDlco.render(tests, { palette: PALETTES.white, view: 'all', selected: [9] })), 6);
  const single = panelDlco.render(tests[0], { palette: PALETTES.white, view: 'separate' });
  assertWellFormed(single, 'single separate');
  assert.equal(poly(single), 2);
  assert.ok(!/>Test<\/text>/.test(single), 'no Test column for a single test');
  // Quality mode names the best test by grade; the poor test is grade D and is not chosen as best.
  const q = panelDlco.render(tests, { palette: PALETTES.white, view: 'all', showQuality: true });
  assert.match(q, /Test 2: Rubric D/);
});

test('panel-dlco: title is escaped, height option is honored, width option scales the viewBox', () => {
  const data = panelDlco.dataFor(cases.normal);
  const svg = panelDlco.render(data, { palette: PALETTES.white, title: 'A<B & "C"', width: 600, height: 520 });
  assertWellFormed(svg, 'title');
  assert.ok(svg.includes('A&lt;B &amp; &quot;C&quot;'));
  assert.match(svg, /viewBox="0 0 600 520"/);
});

test('dlco-trace: the breath-hold is not drawn as a flat concentration; the interval is marked not sampled', () => {
  const c = cases.normal;
  const data = dlcoTrace.dataFor(c);
  const svg = dlcoTrace.render(data, { palette: PALETTES.white });
  assertWellFormed(svg, 'dlco-trace');
  assertSelfContained(svg, 'dlco-trace');
  assert.match(svg, /not sampled/);
  assert.ok(!svg.includes('stroke-dasharray="2 3"'), 'no dashed concentration across the hold');
  assert.equal(count(svg, /<polyline /g), 7, 'volume, two gases before and after the hold, and the two expired-volume curves');
  // Existing registry interface is unchanged.
  assert.equal(dlcoTrace.id, 'dlco-trace');
  for (const s of ['Time (s)', 'Expired volume (L)', 'Concentration (%)', 'breath-hold', 'washout', 'sample']) assert.ok(svg.includes(s), s);
  // Several stored tests: the best one is drawn.
  const t2 = buildDlcoTrace({ seed: 101, truth: c.truth, dlco: { raw: c.dlco.raw, va: c.dlco.va }, volumes: c.volumes, patient: c.descriptor, technique: 'good' });
  assertWellFormed(dlcoTrace.render([data, t2], { palette: PALETTES.dark }), 'dlco-trace array');
  assert.equal(dlcoTrace.render(null, { palette: PALETTES.dark }), '');
});
