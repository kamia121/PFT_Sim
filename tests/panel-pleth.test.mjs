import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDatasets } from '../src/reference/load.js';
import { createReference } from '../src/reference/gli.js';
import { buildCase } from '../src/core/case.js';
import { interpret } from '../src/interpret/interpret.js';
import { PALETTES, PALETTE_IDS } from '../src/ui/palettes.js';
import { buildPleth } from '../src/core/pleth.js';
import panel from '../src/ui/figures/panel-pleth.js';
import plethShutter from '../src/ui/figures/pleth-shutter.js';
import plethRaw from '../src/ui/figures/pleth-raw.js';
import { volumeBars, volumeBarsData } from '../src/ui/figures/volume-bars.js';
import { assertWellFormed, assertSelfContained } from './helpers/svg.mjs';

const ds = await loadDatasets();
const { resolveReference } = createReference(ds);
const build = (input) => { const c = buildCase(input, ds); c.interp = interpret(c.report, resolveReference, 'GLIglobal'); return c; };
const CASES = {
  normal: build({ seed: 5, archetype: 'normal', severity: 2 }),
  obstruction: build({ seed: 3, archetype: 'obstruction', severity: 2 }),
  restriction: build({ seed: 4, archetype: 'restriction-parenchymal', severity: 2 }),
  mixed: build({ seed: 5, archetype: 'mixed', severity: 2 }),
  poor: build({ seed: 3, archetype: 'obstruction', severity: 2, technique: 'poor', scenarioIds: ['pleth-thermal-drift', 'pleth-pant-fast'] }),
};

/** Text elements with position, size and anchor, for geometry checks. */
function texts(svg) {
  const out = [], stack = [[0, 0]];
  for (const m of svg.matchAll(/<(\/?)g\b([^>]*)>|<text x="([-\d.]+)" y="([-\d.]+)" font-size="([\d.]+)" text-anchor="(\w+)" fill="[^"]+"([^>]*)>([^<]*)<\/text>/g)) {
    if (m[3] === undefined) {
      if (m[1]) stack.pop();
      else { const tr = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(m[2]); const [ox, oy] = stack[stack.length - 1]; stack.push(tr ? [ox + +tr[1], oy + +tr[2]] : [ox, oy]); }
      continue;
    }
    const [ox, oy] = stack[stack.length - 1];
    out.push({ x: +m[3] + ox, y: +m[4] + oy, size: +m[5], anchor: m[6], rotated: /rotate\(/.test(m[7]), bold: /font-weight="[67]00"/.test(m[7]), s: m[8].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') });
  }
  return out;
}
const box = (t) => {
  const w = t.s.length * t.size * (t.bold ? 0.53 : 0.49);
  const x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
  return { x0: x0 + 0.5, x1: x0 + w - 0.5, y0: t.y - 0.72 * t.size + 0.5, y1: t.y + 0.2 * t.size - 0.5 };
};

test('registry contract: id, title, render and dataFor', () => {
  assert.equal(panel.id, 'panel-pleth');
  assert.equal(typeof panel.title, 'string');
  assert.equal(typeof panel.render, 'function');
  assert.equal(typeof panel.dataFor, 'function');
});

test('dataFor returns null for a case without plethysmography and for no case', () => {
  const spiro = buildCase({ seed: 3, archetype: 'normal', panel: 'spirometry' }, ds);
  assert.equal(panel.dataFor(spiro), null);
  assert.equal(panel.dataFor(null), null);
  assert.equal(panel.dataFor({}), null);
  assert.equal(panel.render(null, { palette: PALETTES.white }), '');
});

test('dataFor builds the data for a case without stored tracings, identical to the stored ones', () => {
  const c = CASES.obstruction;
  const bare = { ...c, pleth: undefined };
  const d = c.descriptor;
  assert.equal(JSON.stringify(panel.dataFor(bare).pleth), JSON.stringify(buildPleth({ seed: d.seed, truth: c.truth, volumes: c.volumes, technique: d.technique, scenario: null })));
  assert.equal(panel.dataFor(c).pleth, c.pleth);
  assert.ok(panel.dataFor(c).bars.predicted, 'predicted partition from the interpretation');
  assert.equal(panel.dataFor(buildCase({ seed: 5, archetype: 'normal' }, ds)).bars.predicted, null, 'no reference values without an interpretation');
});

test('one well-formed, self-contained svg in all four palettes, every view, with and without quality', () => {
  let count = 0;
  for (const [name, c] of Object.entries(CASES)) {
    const data = panel.dataFor(c);
    for (const pid of PALETTE_IDS) for (const view of ['best', 'all', 'separate']) for (const showQuality of [false, true]) {
      const svg = panel.render(data, { palette: PALETTES[pid], view, showQuality });
      const names = assertWellFormed(svg, `${name} ${pid} ${view}`);
      assertSelfContained(svg, `${name} ${pid} ${view}`);
      assert.equal(names.filter((x) => x === 'svg').length, 1);
      // colors only from the palette
      const allowed = new Set(Object.values(PALETTES[pid]).filter((v) => typeof v === 'string' && v.startsWith('#')));
      for (const m of svg.matchAll(/\s(?:fill|stroke)="(#[0-9A-Fa-f]{6})"/g)) assert.ok(allowed.has(m[1]), `${pid}: color ${m[1]} is not in the palette`);
      count++;
    }
  }
  assert.equal(count, 5 * 4 * 3 * 2);
});

test('60 generated cases (every archetype and technique, with and without an interpretation) render in every view without non-finite numbers', () => {
  let n = 0;
  for (const archetype of ['normal', 'obstruction', 'restriction-parenchymal', 'restriction-extraparenchymal', 'mixed', 'nonspecific', 'low-dlco', 'anemia', 'obesity-low-erv', 'bd-discordant']) {
    for (const technique of ['good', 'fair', 'poor']) for (let seed = 40; seed < 42; seed++) {
      const c = buildCase({ seed, archetype, technique, severity: 1 + (seed % 3) }, ds);
      if (seed === 41) c.interp = interpret(c.report, resolveReference, 'GLIglobal');
      const data = panel.dataFor(c);
      for (const view of ['best', 'all', 'separate']) {
        const svg = panel.render(data, { palette: PALETTES.white, view, showQuality: technique === 'poor' });
        assertWellFormed(svg);
        assertSelfContained(svg);
        n++;
      }
    }
  }
  assert.equal(n, 180);
});

test('four sub-plots A, B, C and D as data-subplot groups, in order, nested directly in the one svg', () => {
  const svg = panel.render(panel.dataFor(CASES.normal), { palette: PALETTES.white });
  assert.deepEqual([...svg.matchAll(/<g data-subplot="([A-D])"/g)].map((m) => m[1]), ['A', 'B', 'C', 'D']);
  assert.equal((svg.match(/<svg /g) ?? []).length, 1);
  assert.match(svg, /viewBox="0 0 672 \d+"/);
});

test('the sign convention and the resistance estimator are stated on the plot', () => {
  for (const c of Object.values(CASES)) {
    const svg = panel.render(panel.dataFor(c), { palette: PALETTES.white });
    assert.match(svg, /compression positive/);
    assert.match(svg, /sRaw: least-squares slope of shift signal on flow, \|flow\| ≤ 0\.5 L\/s/);
    assert.match(svg, /tidal breathing/);
    assert.match(svg, /Raw = sRaw \/ reported FRC \(\d\.\d\d L\)/);
    assert.match(svg, /axis anchored at the reported mean FRC/);
    assert.match(svg, /trial \d of \d;/);
    for (const s of ['Shift volume (mL)', 'Mouth pressure (kPa)', 'Flow (L/s)', 'Volume (L)', 'Time (s)', 'Time from closure (s)']) assert.ok(svg.includes(s), s);
  }
});

test('panel D: stacked RV, ERV and IC for measured and predicted, TLC range and RV ULN, no LLN bar', () => {
  const c = CASES.obstruction;
  const svg = panel.render(panel.dataFor(c), { palette: PALETTES.white });
  for (const s of ['TLC ULN', 'TLC LLN', 'RV ULN', 'Measured', 'Predicted']) assert.ok(svg.includes(s), s);
  assert.ok(!/RV LLN|ERV LLN|IC LLN|LLN bar/.test(svg));
  const data = volumeBarsData(c, c.interp);
  const out = volumeBars(data, { palette: PALETTES.white, width: 322, height: 200 });
  assert.equal(out.width, 322);
  assert.equal(out.height, 200);
  assert.ok(out.svg.startsWith('<g ') && out.svg.endsWith('</g>'));
  // six filled segments (three per bar) and no bar for the lower limit
  assert.equal((out.svg.match(/fill-opacity=/g) ?? []).length, 6);
  const m = data.measured, pr = data.predicted;
  assert.ok(Math.abs(m.rv + m.erv + m.ic - c.volumes.tlc) < 1e-9, 'the measured stack is TLC');
  assert.ok(pr.rv > 0 && pr.erv > 0 && pr.ic > 0);
  assert.ok(data.tlc.lln < data.tlc.uln && data.rvUln > pr.rv);
  const bare = volumeBars(volumeBarsData(buildCase({ seed: 5, archetype: 'normal' }, ds)), { palette: PALETTES.dark });
  assert.ok(bare.svg.includes('no reference') && !bare.svg.includes('TLC ULN'));
  assert.equal(volumeBars(null, { palette: PALETTES.dark }).svg, '');
});

test('views and selection: best, all, separate; trials numbered from 1; invalid numbers ignored', () => {
  const c = CASES.poor;
  const data = panel.dataFor(c);
  const n = data.pleth.trials.length;
  assert.ok(n >= 3);
  const sep = panel.render(data, { palette: PALETTES.white, view: 'separate' });
  assert.deepEqual([...sep.matchAll(/<g data-trial="(\d+)"/g)].map((m) => +m[1]), data.pleth.trials.map((t) => t.index));
  const some = panel.render(data, { palette: PALETTES.white, view: 'separate', selected: [2, 99, 0, 3] });
  assert.deepEqual([...some.matchAll(/<g data-trial="(\d+)"/g)].map((m) => +m[1]), [2, 3]);
  for (const k of [2, 3]) assert.ok(some.includes(`Trial ${k}`));
  assert.ok(!some.includes('Trial 1<'));
  assert.ok(some.includes('trial 2 of'), 'the record shows the first selected trial');
  assert.equal(panel.render(data, { palette: PALETTES.white, view: 'best' }).includes('data-trial='), false);
  // each small panel carries its FRC and frequency
  for (const t of data.pleth.trials) assert.ok(sep.includes(`${t.frcL.toFixed(2)} L, ${t.panFreqHz.toFixed(2)} Hz`));
  // the best trial is the default focus in best and all views; an empty or invalid selection falls back to every trial
  const k = data.best;
  assert.ok(panel.render(data, { palette: PALETTES.white, view: 'best' }).includes(`trial ${k} of ${n};`));
  assert.ok(panel.render(data, { palette: PALETTES.white, view: 'all', selected: [] }).includes(`trial ${k} of ${n};`));
  // best overlays the selected trials in one color; all uses distinct tints
  const countStroke = (svg, color) => (svg.match(new RegExp(`<polyline[^>]*stroke="${color}"`, 'g')) ?? []).length;
  const best = panel.render(data, { palette: PALETTES.white, view: 'best' }), all = panel.render(data, { palette: PALETTES.white, view: 'all' });
  assert.ok(countStroke(all, PALETTES.white.second) > 0 && countStroke(best, PALETTES.white.second) === 0);
});

test('quality verdicts appear only when showQuality is true', () => {
  const data = panel.dataFor(CASES.poor);
  for (const view of ['best', 'all', 'separate']) {
    const off = panel.render(data, { palette: PALETTES.white, view });
    assert.ok(!/acceptable|usable|rejected|Grade|grade/.test(off), `${view}: no verdict without showQuality`);
    const on = panel.render(data, { palette: PALETTES.white, view, showQuality: true });
    assert.ok(/rejected|usable|acceptable/.test(on), `${view}: verdicts with showQuality`);
  }
  const sepOn = panel.render(data, { palette: PALETTES.white, view: 'separate', showQuality: true });
  assert.match(sepOn, /panting/, 'the fault text under each small panel');
});

test('the offset of an unstable end-tidal level is shown on the record', () => {
  const c = build({ seed: 3, archetype: 'obstruction', severity: 2, scenarioIds: ['pleth-thermal-drift'] });
  const data = panel.dataFor({ ...c, scenario: { ids: ['PLE-05'] }, pleth: undefined });
  const svg = panel.render(data, { palette: PALETTES.white });
  assert.match(svg, /Shutter closed 0\.\d\d L (above|below) the stable end-expiratory level/);
  assert.ok(!/Shutter closed \d\.\d\d L (above|below)/.test(panel.render(panel.dataFor(CASES.normal), { palette: PALETTES.white })));
});

test('text size is 9.5 to 12 px (7 to 9 pt at 7 in), the default width is 672, and no text runs off the figure', () => {
  for (const c of Object.values(CASES)) for (const view of ['best', 'separate']) {
    const svg = panel.render(panel.dataFor(c), { palette: PALETTES.white, view, showQuality: true });
    const w = +svg.match(/viewBox="0 0 (\d+) /)[1];
    assert.equal(w, 672);
    for (const t of texts(svg)) {
      assert.ok(t.size >= 9.5 && t.size <= 12, `${t.s}: ${t.size} px`);
      if (t.rotated) continue;
      const b = box(t);
      assert.ok(b.x0 >= 0 && b.x1 <= w, `"${t.s}" runs off the figure (${b.x0.toFixed(0)}..${b.x1.toFixed(0)})`);
    }
  }
});

test('no two labels collide (estimated text boxes)', () => {
  for (const [name, c] of Object.entries(CASES)) for (const view of ['best', 'all', 'separate']) {
    const svg = panel.render(panel.dataFor(c), { palette: PALETTES.white, view, showQuality: view === 'separate' });
    const ts = texts(svg).filter((t) => !t.rotated && t.s.trim());
    const bad = [];
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
      const a = box(ts[i]), b = box(ts[j]);
      if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) bad.push(`"${ts[i].s}" x "${ts[j].s}"`);
    }
    assert.deepEqual(bad.slice(0, 3), [], `${name} ${view}: ${bad.length} colliding label pairs`);
  }
});

test('rendering is deterministic and honors width, title and description', () => {
  const data = panel.dataFor(CASES.mixed);
  const a = panel.render(data, { palette: PALETTES.dark }), b = panel.render(data, { palette: PALETTES.dark });
  assert.equal(a, b);
  const sized = panel.render(data, { palette: PALETTES.white, width: 800, height: 700, title: 'My <title> & more', description: 'My "desc"' });
  assertWellFormed(sized);
  assert.ok(sized.includes('viewBox="0 0 800 700"') && sized.includes('My &lt;title&gt; &amp; more') && sized.includes('My &quot;desc&quot;'));
  assertSelfContained(sized);
});

test('the standalone shutter and resistance figures keep their interface and lose the colliding labels and the long upper-limit line', () => {
  const c = CASES.poor;
  const shutter = plethShutter.render(plethShutter.dataFor(c), { palette: PALETTES.white });
  assertWellFormed(shutter);
  assert.ok(!/font-weight="700"[^>]*>[1-5]<\/text>/.test(shutter), 'no bold trial numbers drawn over the traces');
  for (const s of ['Mouth pressure (kPa)', 'Box pressure (Pa)', 'Shutter trace', 'Least-squares slope', 'Reported FRC']) assert.ok(shutter.includes(s), s);
  const raw = plethRaw.render(plethRaw.dataFor(c), { palette: PALETTES.white });
  assertWellFormed(raw);
  assert.ok(!raw.includes('stroke-dasharray="1.5 3.5"'), 'the dotted upper-limit line is gone');
  assert.match(raw, /sRaw upper limit \(tick\)/);
  assert.match(raw, /least-squares slope of shift signal on flow/);
  assert.match(raw, /Raw = sRaw \/ reported FRC/);
  assert.match(raw, /compression positive/);
  assert.match(raw, /tidal breathing/);
  // every polyline point is finite and the loops have no segment longer than a quarter of the plot (no closing jumps)
  const pts = [...raw.matchAll(/<polyline points="([^"]+)"/g)].map((m) => m[1].split(' ').map((p) => p.split(',').map(Number)));
  for (const pl of pts) {
    if (pl.length < 50) continue;
    for (let i = 1; i < pl.length; i++) assert.ok(Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]) < 80, 'no long jump between samples');
  }
});
