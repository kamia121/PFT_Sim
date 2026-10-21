#!/usr/bin/env node
/**
 * Phone-layout harness for the practice page (and the report, Lab report and quiz pages at the same widths). It measures the rendered
 * page, not the stylesheet: the document's scrollWidth, content clipped inside overflow:hidden or overflow:clip boxes (which a
 * document-level check cannot see), the effective type size of the report text (font size times the zoom of its ancestors), the
 * clearance of list bullets from the box border, the size of the answer controls, the preservation of the learner's selections across a
 * resize, and the print geometry of the sheet. Wide tables may scroll inside a labelled, focusable region; nothing may be clipped silently.
 *
 * Usage: node benchmarks/mobile-layout-smoke.mjs [screenshotDir]   (PFT_BROWSER = chromium | firefox | webkit)
 */
import { startServer, launchBrowser, ENGINE } from './lib/harness.mjs';
import { svgInkCollisions } from './lib/svg-ink.mjs';
import fs from 'node:fs';
import path from 'node:path';

const port = 5198;
const shotDir = process.argv[2];
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
const server = await startServer(port);
const browser = await launchBrowser();
let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('FAIL', msg); } else console.log('ok  ', msg); };
const base = `http://127.0.0.1:${port}/`;
const PHONES = [320, 375, 390, 430];
const FLOOR_PX = 11; // effective size of report text on a phone

/** Runs in the page. Content that is clipped (overflow hidden or clip) or hidden in a scroller that is not a labelled region. */
function clipReport() {
  const marks = [...document.querySelectorAll('.sheet-mark, .rp-mark')];
  for (const m of marks) m.style.display = 'none'; // the rotated watermark is clipped on purpose
  const out = [];
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}.${String(e.getAttribute('class') ?? '').split(' ')[0]}`;
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || !e.clientWidth || /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName) || e.classList.contains('visually-hidden')) continue; // a field scrolls its own text; hidden text is for screen readers
    const ox = cs.overflowX;
    if ((ox === 'hidden' || ox === 'clip') && e.scrollWidth > e.clientWidth + 1) out.push(`clipped ${name(e)} ${e.scrollWidth}>${e.clientWidth}`);
    if (ox === 'auto' || ox === 'scroll') {
      const labelled = e.hasAttribute('aria-label') && e.getAttribute('tabindex') === '0';
      if (e.scrollWidth > e.clientWidth + 1 && !labelled) out.push(`unlabelled scroller ${name(e)} ${e.scrollWidth}>${e.clientWidth}`);
    }
  }
  for (const m of marks) m.style.removeProperty('display');
  return out;
}

/** Runs in the page. Text whose glyph boxes leave the viewport or the box that holds it (outside a table's labelled scroll region). */
function glyphReport() {
  const vw = document.documentElement.clientWidth;
  const holders = '.sheet-frame, .dt-head, .compare-grid, fieldset, #reveal, .interp-box, .sheet-box';
  const out = [];
  for (const root of document.querySelectorAll('#summary-slot .sheet, #details-slot .dt-head, #reveal, #answer-form')) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (el.closest('svg, .sheet-mark, .visually-hidden, textarea, select, option') || ((el.closest('table') || el.closest('[role=region][tabindex]')) && !el.closest('caption')) || getComputedStyle(el).display === 'none') continue;
      const holder = el.closest(holders);
      const hb = holder ? holder.getBoundingClientRect() : null;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (!r.width) continue;
        if (r.right > vw + 1 || r.left < -1 || (hb && (r.right > hb.right + 1 || r.left < hb.left - 1))) { out.push(`${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').split(' ')[0]} "${n.textContent.trim().slice(0, 24)}" ${Math.round(r.left)}..${Math.round(r.right)} in ${hb ? `${Math.round(hb.left)}..${Math.round(hb.right)}` : vw}`); break; }
      }
    }
  }
  return out;
}

/** Runs in the page. Effective px of the text in the live sheet: computed size times the zoom of the element and its ancestors. */
function effectiveSizes() {
  const zoomOf = (e) => { let z = 1; for (let p = e; p && p !== document.documentElement; p = p.parentElement) z *= parseFloat(getComputedStyle(p).zoom) || 1; return z; };
  const rows = [];
  for (const e of document.querySelectorAll('#summary-slot .sheet *')) {
    if (e.closest('svg, #answer-form, .sheet-mark') || e.tagName === 'SUB' || getComputedStyle(e).display === 'none') continue;
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    rows.push({ el: `${e.tagName.toLowerCase()}.${String(e.getAttribute('class') ?? '').split(' ')[0]}`, px: parseFloat(getComputedStyle(e).fontSize) * zoomOf(e) });
  }
  const svgs = [];
  for (const s of document.querySelectorAll('#summary-slot .sheet svg')) {
    if (!s.getBoundingClientRect().width) continue;
    const vb = s.viewBox.baseVal;
    if (!vb || !vb.width) continue;
    const k = s.getBoundingClientRect().width / vb.width;
    const sizes = [...s.querySelectorAll('text')].map((t) => parseFloat(t.getAttribute('font-size') || getComputedStyle(t).fontSize) * k).filter((v) => v > 0);
    if (sizes.length) svgs.push({ fig: s.closest('figure')?.dataset.figureId ?? s.closest('[class]')?.className ?? 'svg', min: Math.min(...sizes) });
  }
  return { rows, svgs };
}

async function openPractice(width, height = 844) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700 });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(base);
  await page.waitForSelector('#answer-form');
  await page.waitForTimeout(500);
  return { ctx, page, problems };
}

try {
  for (const w of [...PHONES, 768, 1280]) {
    const phone = w <= 700;
    const { ctx, page, problems } = await openPractice(w);
    const tag = `${w} px`;
    const doc = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    check(doc[0] <= doc[1] + 1, `${tag}: no document-level horizontal scroll (${doc[0]} of ${doc[1]})`);
    check(!(await page.evaluate(clipReport)).length, `${tag}: practice page has no content clipped inside overflow hidden or clip boxes${(await page.evaluate(clipReport)).join('; ')}`);

    // Bullets stay inside the comment box. The list text is inflated to 150% (what iOS text autosizing does to a wide text block) and
    // the measurements are taken while it is inflated; the style is removed afterwards.
    const bullet = await page.evaluate(() => {
      const ul = document.querySelector('#summary-slot .sheet-box ul');
      if (!ul) return null;
      const style = document.createElement('style');
      style.textContent = '#summary-slot .sheet-box ul { font-size: 150% !important; }';
      document.head.append(style);
      try {
        const box = ul.closest('.sheet-box').getBoundingClientRect();
        const fs = parseFloat(getComputedStyle(ul.querySelector('li')).fontSize);
        const pad = parseFloat(getComputedStyle(ul).paddingLeft);
        const outside = [];
        for (const li of ul.querySelectorAll('li')) {
          const r = li.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(li);
          const t = range.getBoundingClientRect();
          if (r.left - pad < box.left || t.right > box.right + 1 || r.right > box.right + 1) outside.push(`${li.textContent.slice(0, 20)} ${Math.round(r.left - pad)}..${Math.round(t.right)} in ${Math.round(box.left)}..${Math.round(box.right)}`);
        }
        return { pad, fs, inflated: true, outside, indent: ul.querySelector('li').getBoundingClientRect().left - box.left };
      } finally { style.remove(); }
    });
    if (bullet) {
      check(bullet.pad >= 1.2 * bullet.fs, `${tag}: with the list text inflated to 150% (${bullet.fs.toFixed(1)} px) the indent is ${bullet.pad.toFixed(1)} px, at least 1.2 em, so the marker clears the border; text starts ${bullet.indent.toFixed(1)} px inside the box`);
      check(!bullet.outside.length, `${tag}: with the list text inflated to 150% every comment and its marker stay inside the comment box${bullet.outside.slice(0, 2).join('; ')}`);
    } else console.log(`skip ${tag}: this case has no technologist comment list`);

    const adjust = await page.evaluate(() => { if (!CSS.supports('text-size-adjust', '100%') && !CSS.supports('-webkit-text-size-adjust', '100%')) return ''; const cs = getComputedStyle(document.documentElement); return cs.textSizeAdjust || cs.webkitTextSizeAdjust || ''; });
    if (adjust) check(adjust === '100%', `${tag}: text-size-adjust is 100% (${adjust})`); else console.log(`skip ${tag}: text-size-adjust is not exposed by this engine`);

    if (phone) {
      const sizes = await page.evaluate(effectiveSizes);
      const small = sizes.rows.filter((r) => r.px < FLOOR_PX);
      check(sizes.rows.length > 20 && !small.length, `${tag}: report text renders at ${FLOOR_PX} px or more (smallest ${Math.min(...sizes.rows.map((r) => r.px)).toFixed(1)} px over ${sizes.rows.length} elements${small.length ? `; e.g. ${[...new Map(small.map((r) => [r.el, r])).values()].slice(0, 6).map((r) => `${r.el} ${r.px.toFixed(1)}`).join(', ')}` : ''})`);
      const z = sizes.svgs.filter((s) => s.fig === 'z-strip-ats-narrow');
      check(z.length === 1 && z[0].min >= 7.5, `${tag}: the stacked z-score graphic shows its labels at ${z[0] ? z[0].min.toFixed(1) : '?'} px or more (floor 7.5)`);
      const zv = await page.evaluate(() => { const d = (id) => { const f = document.querySelector(`[data-figure-id="${id}"]`); return f ? getComputedStyle(f).display : 'absent'; }; return { wide: d('z-strip-ats'), narrow: d('z-strip-ats-narrow') }; });
      check(zv.wide === 'none' && zv.narrow !== 'none' && zv.narrow !== 'absent', `${tag}: the phone shows the stacked z-score graphic and not the 744 px one`);

      // Numeric columns: a table wider than the screen scrolls inside a labelled, focusable region; the first column stays in view.
      const tables = await page.evaluate(() => [...document.querySelectorAll('#summary-slot .sheet-block')].map((b) => ({ id: b.dataset.block, sw: b.scrollWidth, cw: b.clientWidth, region: b.getAttribute('role') === 'region' && b.getAttribute('tabindex') === '0' && Boolean(b.getAttribute('aria-label')), cells: [...b.querySelectorAll('td, th')].every((c) => c.getBoundingClientRect().width > 0) })));
      for (const t of tables) check(t.sw <= t.cw + 1 || t.region, `${tag}: table ${t.id} (${t.sw} of ${t.cw}) fits or scrolls in a labelled focusable region`);
      const frame = await page.evaluate(() => { const f = document.querySelector('#summary-slot .sheet-frame').getBoundingClientRect(); const s = document.querySelector('#summary-slot').getBoundingClientRect(); return [f.width, s.width]; });
      check(frame[0] <= frame[1] + 1, `${tag}: the sheet frame (${Math.round(frame[0])} px) fits its container (${Math.round(frame[1])} px) at scale 1`);

      // Answer controls: 44 px rows, readable labels that wrap inside their fieldset, textarea at 16 px (no iOS focus zoom).
      const form = await page.evaluate(() => {
        const labels = [...document.querySelectorAll('#answer-form label')].filter((l) => l.getBoundingClientRect().width);
        const bad = labels.filter((l) => l.getBoundingClientRect().height < 43.5 || l.scrollWidth > l.clientWidth + 1 || l.getBoundingClientRect().right > (l.closest('fieldset') ?? l.closest('form')).getBoundingClientRect().right + 1);
        const ta = document.querySelector('#impression');
        return { n: labels.length, bad: bad.map((l) => `${l.textContent.trim().slice(0, 30)} ${Math.round(l.getBoundingClientRect().height)}`).slice(0, 3), ta: ta ? parseFloat(getComputedStyle(ta).fontSize) : 16 };
      });
      check(form.n > 5 && !form.bad.length, `${tag}: ${form.n} answer labels are at least 44 px tall and inside their fieldsets${form.bad.length ? ` (${form.bad.join('; ')})` : ''}`);
      check(form.ta >= 16, `${tag}: the impression box is ${form.ta} px type`);

      // Learner state survives a resize through the desktop layout and back.
      await page.locator('#answer-form input[type=radio]').first().check({ force: true });
      await page.fill('#impression', 'Resize test');
      const picked = await page.evaluate(() => [...document.querySelectorAll('#answer-form input:checked')].map((i) => `${i.name}=${i.value}`).join());
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.waitForTimeout(300);
      await page.setViewportSize({ width: w, height: 844 });
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => [...document.querySelectorAll('#answer-form input:checked')].map((i) => `${i.name}=${i.value}`).join());
      check(picked && after === picked && (await page.inputValue('#impression')) === 'Resize test', `${tag}: selections and the written impression are kept across a resize`);
      if (shotDir) { await page.locator('#summary-slot .sheet-frame').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(shotDir, `${ENGINE}-${w}-practice.png`) }); }

      // Print: the reflow is screen only. The sheet keeps its Letter width at scale 1 and the wide z-score graphic.
      await page.emulateMedia({ media: 'print' });
      const pr = await page.evaluate(() => { const d = (id) => { const f = document.querySelector(`[data-figure-id="${id}"]`); return f ? getComputedStyle(f).display : 'absent'; }; return { narrow: d('z-strip-ats-narrow'), wide: d('z-strip-ats') }; });
      check((pr.narrow === 'none' || pr.narrow === 'absent') && pr.wide !== 'none' && pr.wide !== 'absent', `${tag}: in print the 744 px z-score graphic is used and the stacked one is not`);
      await page.emulateMedia({ media: 'screen' });
    } else {
      const frame = await page.evaluate(() => document.querySelector('#summary-slot .sheet-frame').getBoundingClientRect().width);
      const narrow = await page.evaluate(() => { const f = document.querySelector('[data-figure-id="z-strip-ats-narrow"]'); return f ? getComputedStyle(f).display : 'none'; });
      check(narrow === 'none', `${tag}: the stacked z-score graphic is not shown above 700 px`);
      if (w === 1280) check(Math.abs(frame - 816) < 2, `${tag}: the sheet is 816 px wide at scale 1 (${Math.round(frame)})`);
      else check(frame > 600 && frame <= w, `${tag}: the sheet is scaled to the width of the window (${Math.round(frame)} px)`);
    }

    // Page 2, the Lab report view, the report page and the quiz at the same width.
    await page.click('#toggle-details');
    await page.waitForTimeout(400);
    check(!(await page.evaluate(clipReport)).length && (await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)), `${tag}: page 2 open: no clipped content and no document scroll`);
    const dh = await page.evaluate(() => { const h = document.querySelector('#details-slot .dt-head'); return h ? { sw: h.scrollWidth, cw: h.clientWidth, id: document.querySelector('#details-slot .dt-id').getBoundingClientRect().right, right: h.getBoundingClientRect().right } : null; });
    check(!dh || (dh.sw <= dh.cw + 1 && dh.id <= dh.right + 1), `${tag}: page 2 header fields stay inside the header (${dh ? `${Math.round(dh.id)} of ${Math.round(dh.right)}` : 'absent'})`);
    check(!(await page.evaluate(glyphReport)).length, `${tag}: normal text: every glyph box is inside its container and the viewport${(await page.evaluate(glyphReport)).slice(0, 3).join('; ')}`);

    // Long unbroken learner text, before and after the key: it wraps, the grids keep their width, nothing is hidden by an ancestor.
    await page.fill('#impression', 'VeryLongUnbrokenAnswer'.repeat(25));
    check(!(await page.evaluate(glyphReport)).length && (await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)), `${tag}: long unbroken impression before the key: no overflow${(await page.evaluate(glyphReport)).slice(0, 2).join('; ')}`);
    await page.click('#show-key');
    await page.waitForSelector('#reveal');
    await page.waitForTimeout(400);
    const cg = await page.evaluate(() => { const g = document.querySelector('.compare-grid'); return g ? [g.clientWidth, g.scrollWidth, g.parentElement.clientWidth] : null; });
    check(cg && cg[1] <= cg[0] + 1 && cg[0] <= cg[2] + 1, `${tag}: with the key shown, the compare grid (${cg}) keeps its container width and holds the long text`);
    const afterKey = await page.evaluate(clipReport);
    check(!afterKey.length && (await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)), `${tag}: long unbroken impression after the key: nothing clipped, no document scroll${afterKey.slice(0, 3).join('; ')}`);
    const gl = await page.evaluate(glyphReport);
    check(!gl.length, `${tag}: long text and key: every glyph box is inside its container${gl.slice(0, 3).join('; ')}`);
    if (shotDir) { await page.locator('#reveal').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(shotDir, `${ENGINE}-${w}-key.png`) }); }
    await page.click('.tabs button[data-tab=report]');
    await page.waitForTimeout(700);
    const lab = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, frame: document.querySelector('#report-root .sheet-frame')?.getBoundingClientRect().width ?? 0, clip: null }));
    check(lab.doc && Math.abs(lab.frame - 816) < 2, `${tag}: Lab report view keeps its 816 px paper sheet (${Math.round(lab.frame)} px) without document scroll`);
    const code = new URL(page.url()).searchParams.get('c');
    await page.goto(`${base}report.html?c=${code}`);
    await page.waitForTimeout(1500);
    const rp = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    const rpc = await page.evaluate(clipReport);
    check(rp && !rpc.length, `${tag}: report page: no document scroll and no clipped content ${rpc.slice(0, 3).join('; ')}`);
    await page.goto(`${base}quiz.html`);
    await page.waitForTimeout(1200);
    check((await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)) && !(await page.evaluate(clipReport)).length, `${tag}: quiz page: no document scroll and no clipped content`);
    check(!problems.length, `${tag}: no page errors${problems.length ? ` (${problems[0]})` : ''}`);
    await ctx.close();
  }

  // Chart text collisions on a full panel (spirometry, volumes, DLCO, quality challenge, heavy notes) at each phone width, measured on glyph ink (lib/svg-ink.mjs).
  // Two controls first: a descender over a capital that overlap in ink (Source Sans 3, 20 px, baselines 30 and 46.9) must be reported, and the same pair 50 px apart must not.
  for (const w of PHONES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${base}?v=2&s=485924449&a=obstruction&t=poor&sc=heavy`);
    await page.waitForSelector('#answer-form');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const control = await page.evaluate((fn) => {
      const run = new Function(`return (${fn})`)();
      const add = (id, y2) => {
        const f = document.createElement('figure');
        f.dataset.figureId = id;
        f.innerHTML = `<svg viewBox="0 0 200 100" width="200" height="100" style="font-family:'Source Sans 3',sans-serif;overflow:visible"><text x="10" y="30" font-size="20">g</text><text x="10" y="${y2}" font-size="20">T</text></svg>`;
        document.querySelector('#summary-slot .sheet').append(f);
        return f;
      };
      const hit = add('control-overlap', 46.9), clear = add('control-apart', 80);
      const all = run().filter((x) => x.startsWith('control-'));
      hit.remove(); clear.remove();
      return all;
    }, svgInkCollisions.toString());
    check(control.some((x) => x.startsWith('control-overlap')) && !control.some((x) => x.startsWith('control-apart')), `${w} px: ink control: an overlapping g/T pair is reported and the same pair 50 px apart is not (${control.join('; ') || 'none reported'})`);
    const found = await page.evaluate(svgInkCollisions);
    check(!found.length, `${w} px: full panel: no chart label's ink overlaps another or leaves its figure${found.slice(0, 3).join('; ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} check(s) failed on ${ENGINE}` : `\nall checks passed on ${ENGINE}`);
process.exit(failures ? 1 : 0);
