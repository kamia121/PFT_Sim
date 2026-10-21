#!/usr/bin/env node
/**
 * Browser checks of the light and dark themes on the practice, quiz and standalone report pages: the toggle flips the page and its label,
 * works while the page is loading and when the case link cannot be opened, the choice survives a reload and a move to another page, the
 * system preference is followed when nothing is saved, no visible text falls below 4.5:1 contrast on screen in either theme, nothing
 * overflows at phone width, and print media uses the light tokens (dark text) whatever the screen theme is.
 *
 * Usage: node benchmarks/theme-smoke.mjs
 */
import { startServer, launchBrowser } from './lib/harness.mjs';

const port = 5198;
const server = await startServer(port);
const browser = await launchBrowser();
let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('FAIL', msg); } else console.log('ok  ', msg); };
const base = `http://127.0.0.1:${port}/`;
const CASE = '?c=dj0yJnM9MzY2MTM4NjUzNSZhPWxvdy1kbGNvJnN2PTMmcD1zcGlyb21ldHJ5JnNjPWxpZ2h0';
const PAGES = [['practice', 'index.html', '#case table, #case svg'], ['quiz', 'quiz.html', '#p-case fieldset'], ['report', `report.html${CASE}`, 'body[data-ready]']];

/** In the page: the text that falls below 4.5:1 against its own opaque background (the first opaque ancestor). */
const lowContrast = () => {
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const rgb = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).map(Number); return { c: p.slice(0, 3), a: p[3] ?? 1 }; };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const p = rgb(getComputedStyle(e).backgroundColor); if (p && p.a >= 1) return p.c; } return [255, 255, 255]; };
  const bad = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden') continue;
    const fg = rgb(cs.color);
    if (!fg) continue;
    const a = lum(fg.c), b = lum(bgOf(el));
    const cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (cr < 4.5) bad.push(`${el.tagName} "${el.textContent.trim().slice(0, 24)}" ${cr.toFixed(2)}`);
  }
  return bad;
};
const state = (page) => page.evaluate(() => ({
  theme: document.documentElement.dataset.theme ?? null,
  bg: getComputedStyle(document.body).backgroundColor,
  label: document.querySelector('#theme-toggle').textContent,
  stored: (() => { try { return localStorage.getItem('pft-theme'); } catch { return 'unavailable'; } })(),
}));
const DARK_BG = 'rgb(17, 22, 21)', LIGHT_BG = 'rgb(250, 250, 248)';

try {
  for (const [name, url, ready] of PAGES) {
    for (const os of ['light', 'dark']) {
      const ctx = await browser.newContext({ colorScheme: os, viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      const problems = [];
      page.on('pageerror', (e) => problems.push(e.message));
      await page.goto(base + url);
      await page.waitForSelector(ready, { timeout: 15000 });
      const tag = `${name}, system ${os}`;
      let s = await state(page);
      check(s.bg === (os === 'dark' ? DARK_BG : LIGHT_BG) && s.label === (os === 'dark' ? 'Light mode' : 'Dark mode') && s.stored === null, `${tag}: follows the system preference when nothing is saved`);
      const lowNow = await page.evaluate(lowContrast);
      check(lowNow.length === 0, `${tag}: contrast of all visible text on load${lowNow.length ? ' (' + lowNow.slice(0, 3).join('; ') + ')' : ''}`);
      await page.click('#theme-toggle');
      const flipped = os === 'dark' ? 'light' : 'dark';
      s = await state(page);
      check(s.theme === flipped && s.bg === (flipped === 'dark' ? DARK_BG : LIGHT_BG) && s.stored === flipped && s.label === (flipped === 'dark' ? 'Light mode' : 'Dark mode'), `${tag}: the toggle flips the page, its label and the saved choice`);
      const low = await page.evaluate(lowContrast);
      check(low.length === 0, `${tag}: contrast of all visible text after the toggle (${flipped})${low.length ? ' ' + low.slice(0, 3).join('; ') : ''}`);
      await page.reload();
      await page.waitForSelector(ready, { timeout: 15000 });
      s = await state(page);
      check(s.theme === flipped && s.bg === (flipped === 'dark' ? DARK_BG : LIGHT_BG), `${tag}: the choice survives a reload`);
      if (name !== 'report') {
        await page.click(name === 'practice' ? 'a[href="./quiz.html"]' : '#back-link');
        await page.waitForSelector('#theme-toggle');
        s = await state(page);
        check(s.theme === flipped && s.bg === (flipped === 'dark' ? DARK_BG : LIGHT_BG), `${tag}: the choice carries to the other page`);
      }
      check(problems.length === 0, `${tag}: no page errors${problems.length ? ' ' + problems[0] : ''}`);
      await ctx.close();
    }
  }

  // The toggle must work when the page cannot show a case, and while a slow page is still loading.
  {
    const ctx = await browser.newContext({ colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.goto(`${base}report.html`);
    await page.waitForSelector('#theme-toggle');
    await page.click('#theme-toggle');
    check((await state(page)).bg === DARK_BG, 'report page without a case link: the toggle works');
    await page.route('**/src/report-page/main.js', async (route) => { await new Promise((r) => setTimeout(r, 1500)); route.continue(); });
    await page.goto(`${base}report.html${CASE}`, { waitUntil: 'commit' });
    await page.waitForSelector('#theme-toggle');
    await page.click('#theme-toggle');
    const early = await state(page);
    check(early.theme === 'light' && early.bg === LIGHT_BG, 'report page: the toggle works while the case is still loading');
    await ctx.close();
  }

  // Storage blocked: the toggle still flips for the page.
  {
    const ctx = await browser.newContext({ colorScheme: 'light' });
    await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    const page = await ctx.newPage();
    await page.goto(`${base}quiz.html`);
    await page.waitForSelector('#theme-toggle');
    await page.click('#theme-toggle');
    check((await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === DARK_BG, 'storage blocked: the toggle still flips the page');
    await ctx.close();
  }


  // Actual colors of the content: sheets and figures follow the screen theme and are light in print.
  const SHEET = { practice: '.sheet', quiz: null, report: '.rp-page' };
  const FIG = { practice: '#case svg.fig > rect', quiz: '#p-case svg.fig > rect', report: '.rp-page svg.fig > rect' };
  const colors = (page, name) => page.evaluate(([sheetSel, figSel]) => ({
    paper: sheetSel ? getComputedStyle(document.querySelector(sheetSel)).backgroundColor : null,
    fig: getComputedStyle(document.querySelector(figSel)).fill,
    figs: document.querySelectorAll(figSel).length,
  }), [SHEET[name], FIG[name]]);
  for (const [name, url, ready] of PAGES) {
    for (const [width, height] of [[1280, 900], [390, 800]]) {
      const ctx = await browser.newContext({ colorScheme: 'light', viewport: { width, height } });
      const page = await ctx.newPage();
      await page.goto(base + url);
      await page.waitForSelector(ready, { timeout: 15000 });
      await page.waitForSelector(FIG[name], { state: 'attached', timeout: 15000 });
      const tag = `${name} ${width}px`;
      let c = await colors(page, name);
      check(c.figs > 0 && c.fig === 'rgb(255, 255, 255)' && (c.paper === null || c.paper === 'rgb(255, 255, 255)'), `${tag}: light theme draws white paper and white figure panels (${c.paper}, ${c.fig})`);
      await page.click('#theme-toggle');
      c = await colors(page, name);
      check(c.fig === 'rgb(10, 19, 17)' && (c.paper === null || c.paper === 'rgb(24, 30, 29)'), `${tag}: dark theme draws dark paper and dark figure panels (${c.paper}, ${c.fig})`);
      const low = await page.evaluate(lowContrast);
      check(low.length === 0, `${tag}: contrast of all visible text on the dark content${low.length ? ' ' + low.slice(0, 3).join('; ') : ''}`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${tag}: no horizontal overflow in dark`);
      await page.emulateMedia({ media: 'print' });
      c = await colors(page, name);
      check(c.fig === 'rgb(255, 255, 255)' && (c.paper === null || c.paper === 'rgb(255, 255, 255)'), `${tag}: print is light while the screen theme is dark (${c.paper}, ${c.fig})`);
      await ctx.close();
    }
  }

  // The system preference is followed live while nothing is saved, and a change of the choice in another tab reaches this tab.
  {
    const ctx = await browser.newContext({ colorScheme: 'light' });
    const a = await ctx.newPage();
    const b = await ctx.newPage();
    await a.goto(`${base}quiz.html`);
    await b.goto(`${base}quiz.html`);
    await a.waitForSelector('#theme-toggle');
    await a.emulateMedia({ colorScheme: 'dark' });
    await a.waitForFunction(() => document.querySelector('#theme-toggle').textContent === 'Light mode');
    check((await state(a)).bg === DARK_BG, 'a change of the system preference updates the page and the label while nothing is saved');
    await b.click('#theme-toggle');
    await a.evaluate(() => localStorage.setItem('pft-theme', 'dark')); // a's own write does not fire in a; b hears it
    await b.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await a.emulateMedia({ colorScheme: 'light' });
    await b.evaluate(() => localStorage.clear());
    await a.waitForFunction(() => !document.documentElement.dataset.theme, null, { timeout: 3000 }).catch(() => {});
    check((await state(a)).bg === LIGHT_BG && (await state(a)).label === 'Dark mode', 'localStorage.clear() in another tab returns this tab to the system preference');
    await b.click('#theme-toggle');
    const bTheme = (await state(b)).theme;
    await a.waitForFunction((t) => document.documentElement.dataset.theme === t, bTheme);
    const sa = await state(a);
    check(sa.theme === bTheme && sa.label === (bTheme === 'dark' ? 'Light mode' : 'Dark mode'), 'a choice made in another tab reaches this tab, label included');
    await ctx.close();
  }

  // Keyboard and pointer on the toggle while the page has no case, and while the case is still loading.
  {
    const ctx = await browser.newContext({ colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.goto(`${base}report.html`);
    await page.focus('#theme-toggle');
    await page.keyboard.press('Enter');
    check((await state(page)).bg === DARK_BG, 'keyboard Enter toggles on the report page without a case');
    await page.keyboard.press('Space');
    check((await state(page)).bg === LIGHT_BG, 'keyboard Space toggles back');
    await ctx.close();
  }

  // The toggle changes colors only: answers, the stage and the figure state stay as they are.
  {
    const ctx = await browser.newContext({ colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.goto(base);
    await page.waitForSelector('#answer-form input[type=radio]', { timeout: 15000 });
    const radio = page.locator('#answer-form input[type=radio]').first();
    await radio.check();
    const name = await radio.getAttribute('name');
    const value = await radio.getAttribute('value');
    const before = await page.evaluate(() => [location.href, document.querySelector('#caseCode').value, document.querySelector('#case').innerHTML.length]);
    await page.click('#theme-toggle');
    await page.click('#theme-toggle');
    const after = await page.evaluate(() => [location.href, document.querySelector('#caseCode').value, document.querySelector('#case').innerHTML.length]);
    check(JSON.stringify(before) === JSON.stringify(after), 'practice: the case, its address and the page content are unchanged by the toggle');
    check(await page.locator(`#answer-form input[name="${name}"][value="${value}"]`).isChecked(), 'practice: a chosen answer stays chosen through the toggle');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.goto(`${base}quiz.html`);
    await page.waitForSelector('#p-case fieldset.qitem input', { timeout: 15000 });
    const input = page.locator('#p-case fieldset.qitem input').first();
    await input.check();
    const before = await page.locator('#p-case').innerHTML();
    await page.click('#theme-toggle');
    await page.click('#theme-toggle');
    check(await input.isChecked() && before.length === (await page.locator('#p-case').innerHTML()).length, 'quiz: the case and a chosen answer are unchanged by the toggle');
    await ctx.close();
  }

  // Phone width in dark, and print media in dark.
  for (const [name, url, ready] of PAGES) {
    const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(base + url);
    await page.waitForSelector(ready, { timeout: 15000 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${name}: no horizontal overflow at phone width in dark`);
    await page.emulateMedia({ media: 'print' });
    // Backgrounds may be dropped on paper, so printed chrome is judged as its text color against white.
    const chrome = await page.evaluate(() => {
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const bad = [];
      for (const el of document.querySelectorAll('.masthead, .masthead a, .wordmark, button.primary, button.secondary, .linkbutton, .tabs button')) {
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (!r.width || !r.height || cs.visibility === 'hidden') continue;
        const cr = 1.05 / (lum(cs.color.match(/[\d.]+/g).map(Number)) + 0.05);
        if (cr < 4.5) bad.push(`${el.tagName}.${el.className} ${cr.toFixed(2)}`);
      }
      return bad;
    });
    check(chrome.length === 0, `${name}: printed masthead and buttons are dark ink on white without background graphics${chrome.length ? ' ' + chrome.slice(0, 3).join('; ') : ''}`);
    const ink = await page.evaluate(() => [getComputedStyle(document.body).color, getComputedStyle(document.body).backgroundColor]);
    check(ink[0] === 'rgb(28, 35, 33)', `${name}: dark text for print while the screen theme is dark (${ink[0]})`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
process.exit(failures ? 1 : 0);
