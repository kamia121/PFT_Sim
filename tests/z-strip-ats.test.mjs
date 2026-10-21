import test from 'node:test';
import assert from 'node:assert/strict';
import zStrip, { atsPanels, zBandColor, Z_SEVERITY, TWO_SIDED } from '../src/ui/figures/z-strip.js';
import { PALETTES, PALETTE_IDS } from '../src/ui/palettes.js';
import { LLN_Z } from '../src/interpret/interpret.js';
import { assertWellFormed, assertSelfContained } from './helpers/svg.mjs';
import { makeModel, resolveReference } from './report-helpers.mjs';

const make = (input) => {
  const { c, interp } = makeModel(input);
  return { ...c, interp, resolve: resolveReference, equation: 'GLIglobal' };
};
const CASES = {
  withPost: make({ seed: 12, archetype: 'obstruction' }),
  noPost: make({ seed: 5, archetype: 'normal', panel: 'full' }),
  restriction: make({ seed: 31, archetype: 'restriction-parenchymal' }),
  lowDlco: make({ seed: 5, archetype: 'low-dlco' }),
  spirometryOnly: make({ seed: 44, archetype: 'mixed', panel: 'spirometry' }),
};
const count = (s, re) => (s.match(re) ?? []).length;

// Relative luminance and contrast (WCAG 2), for the checks on the star and the text.
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (h) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const blend = (fg, bg, a) => `#${rgb(fg).map((v, i) => Math.round((v * a + rgb(bg)[i] * (1 - a)) * 255).toString(16).padStart(2, '0')).join('')}`;
/** Pages a palette may be drawn on: its own background, or both a light and a dark page for the transparent ones. */
const pagesOf = (p) => (p.background ? [p.background] : ['#FFFFFF', '#111111']);
const STOPS = (p) => [zBandColor(-5, p.zBand), zBandColor(-4, p.zBand), zBandColor(-3.2, p.zBand), zBandColor(-2.5, p.zBand), zBandColor(-2.0, p.zBand), zBandColor(-1.7, p.zBand), p.zBand.mild, p.zBand.ok];

test('the default style of the registry entry is unchanged', () => {
  const data = zStrip.dataFor(CASES.withPost);
  const svg = zStrip.render(data, { palette: PALETTES.white });
  assert.ok(!svg.includes('Bands apply'));
  assert.equal(count(svg, /<rect /g), 1, 'only the background rectangle, no band');
  assert.equal(svg, zStrip.render(data, { palette: PALETTES.white, style: 'default' }));
});

test('ats style: well formed, self-contained, four palettes, every case', () => {
  for (const [name, c] of Object.entries(CASES)) {
    const data = zStrip.dataFor(c);
    for (const pid of PALETTE_IDS) {
      for (const width of [744, 420]) {
        const svg = zStrip.render(data, { palette: PALETTES[pid], style: 'ats', width });
        assertWellFormed(svg, `ats ${name}/${pid}/${width}`);
        assertSelfContained(svg, `ats ${name}/${pid}/${width}`);
        assert.match(svg, new RegExp(`viewBox="0 0 ${width} \\d+"`));
        assert.equal(count(svg, /<rect x="0" y="0"/g), PALETTES[pid].background ? 1 : 0);
      }
    }
  }
});

test('ats style: panels for pre, post and the volume and DLCO indices', () => {
  const titles = (c) => atsPanels(zStrip.dataFor(c)).map((p) => p.title);
  assert.deepEqual(titles(CASES.withPost), ['Pre-bronchodilator', 'Post-bronchodilator', 'Lung volumes and DLCO']);
  assert.deepEqual(titles(CASES.noPost), ['Spirometry', 'Lung volumes', 'Diffusing capacity']);
  assert.deepEqual(titles(CASES.spirometryOnly), ['Spirometry']);
  const post = atsPanels(zStrip.dataFor(CASES.withPost))[1];
  assert.deepEqual(post.rows.map((r) => r.id), ['fvc', 'fev1', 'fev1_fvc']);
  const svg = zStrip.render(zStrip.dataFor(CASES.withPost), { palette: PALETTES.white, style: 'ats' });
  for (const t of ['Pre-bronchodilator', 'Post-bronchodilator', 'Lung volumes and DLCO']) assert.ok(svg.includes(`>${t}<`), t);
});

test('ats style: one star per bar, the z-score and the words in the text column, ULN lines for the two-sided indices', () => {
  for (const [name, c] of Object.entries(CASES)) {
    const data = zStrip.dataFor(c);
    const panels = atsPanels(data);
    const rows = panels.flatMap((p) => p.rows);
    const svg = zStrip.render(data, { palette: PALETTES.white, style: 'ats' });
    assert.equal(count(svg, /<polygon /g), rows.length * 2, `${name}: a halo and a star per bar`);
    for (const r of rows) {
      const z = r.z.toFixed(2).replace('-', '−');
      const words = r.z < LLN_Z ? 'below LLN' : r.twoSided && r.z > -LLN_Z ? 'above ULN' : 'within limits';
      assert.ok(svg.includes(`>${z}</text>`), `${name}: ${r.id} z ${z}`);
      assert.ok(svg.includes(`>${words}</text>`), `${name}: ${r.id} ${words}`);
      assert.equal(r.twoSided, TWO_SIDED.has(r.id));
    }
    for (const l of ['severe', 'moderate', 'mild', 'within limits', 'LLN', 'predicted']) assert.ok(svg.includes(`>${l}</text>`), `${name}: ${l}`);
    assert.equal(svg.includes('>ULN</text>'), rows.some((r) => r.twoSided), `${name}: ULN label`);
    // Lines: predicted and LLN per panel, ULN per run of two-sided rows (heavy dashed lines, width 1.9).
    const heavy = count(svg, /stroke-width="1\.9"/g);
    let expected = panels.length * 2;
    for (const p of panels) { let inRun = false; for (const r of p.rows) { if (r.twoSided && !inRun) { expected++; inRun = true; } else if (!r.twoSided) inRun = false; } }
    assert.equal(heavy, expected, `${name}: reference lines`);
    assert.ok(svg.includes('Bands apply to all measures') && svg.includes('Severity of impairment is not necessarily disease severity.'));
  }
});

test('ats style: a z-score off the axis gets a hollow star and the text says so in the description', () => {
  const data = zStrip.dataFor(CASES.lowDlco);
  data.rows[0] = { ...data.rows[0], z: -6.2 };
  const svg = zStrip.render(data, { palette: PALETTES.white, style: 'ats' });
  assert.match(svg, /fill="none" stroke="#FFFFFF" stroke-width="3\.4"/);
  assert.match(svg, /−6\.20/);
  assert.match(svg, /\(off scale\)/);
});

test('ats style: gradient stops at -4.0, -2.5 and the LLN with the palette colors', () => {
  for (const pid of PALETTE_IDS) {
    const band = PALETTES[pid].zBand;
    assert.equal(zBandColor(-5, band), band.severe);
    assert.equal(zBandColor(Z_SEVERITY.severe, band), band.severe);
    assert.equal(zBandColor(Z_SEVERITY.moderate, band), band.moderate);
    assert.equal(zBandColor(LLN_Z, band), band.ok);
    assert.equal(zBandColor(LLN_Z - 1e-6, band).toLowerCase() !== band.ok.toLowerCase(), true);
    assert.ok(contrast(zBandColor(LLN_Z - 1e-6, band), band.mild) < 1.2, 'just below the LLN is the mild (yellow) color');
    const svg = zStrip.render(zStrip.dataFor(CASES.withPost), { palette: PALETTES[pid], style: 'ats' });
    for (const k of ['severe', 'ok']) assert.ok(svg.includes(`fill="${band[k]}"`), `${pid}: ${k} color drawn`);
    assert.equal(svg.includes('fill-opacity'), PALETTES[pid].zBandAlpha < 1, `${pid}: transparent palettes use semi-transparent bands`);
  }
  assert.ok(PALETTES.white.zBandAlpha === 1 && PALETTES['transparent-dark-ink'].zBandAlpha < 1 && PALETTES['transparent-light-ink'].zBandAlpha < 1);
});

test('contrast: the star on every gradient stop, the label text on the page, in every palette', () => {
  for (const pid of PALETTE_IDS) {
    const p = PALETTES[pid];
    for (const page of pagesOf(p)) {
      for (const stop of STOPS(p)) {
        const seen = p.zBandAlpha < 1 ? blend(stop, page, p.zBandAlpha) : stop;
        // The halo separates the star from the band; the star must read against the band or its halo against it, and against its halo.
        assert.ok(Math.max(contrast(p.zStar.fill, seen), contrast(p.zStar.halo, seen)) >= 3, `${pid} on ${page}: star on ${stop}`);
        assert.ok(contrast(p.zStar.fill, p.zStar.halo) >= 7, `${pid}: star against its halo`);
        // Reference lines are drawn in the star color, so they follow the same rule.
      }
    }
    // Text sits outside the bars, on the panel or on the page the palette is made for.
    const home = p.background ? p.background : pid.includes('dark-ink') ? '#FFFFFF' : '#111111';
    assert.ok(contrast(p.text, home) >= 7, `${pid}: text`);
    assert.ok(contrast(p.axis, home) >= 4.5, `${pid}: axis labels`);
  }
});

test('ats style: nothing but text carries the verdict (a grayscale render keeps star, words and band names)', () => {
  const svg = zStrip.render(zStrip.dataFor(CASES.withPost), { palette: PALETTES.white, style: 'ats' });
  const texts = [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
  for (const w of ['below LLN', 'within limits', 'severe', 'moderate', 'mild']) assert.ok(texts.includes(w), w);
  assert.ok(count(svg, /<polygon /g) > 0);
});
