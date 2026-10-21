/**
 * Interpretation workspace of the practice page, in the real page with real pointer and keyboard input (Chromium, Firefox, WebKit).
 *
 *   W1  wide screens (1280 and 1440 px): page 1 at its printed size beside the answers; for each question the answer control and the
 *       values it is read from are in the window together; the answer column sticks while the data scroll past, never taller than the
 *       window, and scrolls inside itself (as a labelled, focusable region) only when the answers are taller.
 *   W2  the page 1 / page 2 view buttons: page 2 opens in place the first time (recorded as opened), the form keeps its node, its
 *       answers, the caret and selection of the impression, and the focused button; the quality answers and the maneuvers are in view
 *       together.
 *   W3  stage gates in the workspace: the basic review checks directly; the statement is optional, refused before the study answer and
 *       locks it; the advanced review waits for the statement; with the challenge off there is no statement step.
 *   W4  nothing the stage withholds is in the page source (quality statement lines, stated grades, acceptability, grade columns).
 *   W5  one form and unique ids in every state reached.
 *   W6  narrow screens: each structured question shows the report values it is read from (the sheet's own cells), and the disclosure of
 *       the tables and curves changes the view only: no change under the form, focus kept, the control does not move.
 *   W7  390 -> 1280 -> 390 px keeps the answers, the impression, its selection, the focus and the form node.
 *   W8  light and dark themes: the answer column and page 1 take the paper token.
 *   W9  the accessibility tree of the page in the wide layout equals the tree of the same page with the workspace stylesheet off (the
 *       boxes that generate no box on wide screens keep their roles and names).
 *
 * Usage: node benchmarks/workspace-smoke.mjs   (PFT_SERVE_DIR=dist in CI; PFT_SHOTS_DIR copies the named screenshots there)
 */
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launchBrowser, artifactDir, ENGINE } from './lib/harness.mjs';
import { loadDatasets } from '../src/reference/load.js';
import { buildCase } from '../src/core/case.js';
import { parseDescriptor } from '../src/core/descriptor.js';
import { buildRtReport } from '../src/core/rt-report.js';

const port = 5470;
const base = `http://127.0.0.1:${port}/`;
const server = await startServer(port);
const browser = await launchBrowser();
const tmp = artifactDir('workspace');
const shotsOut = process.env.PFT_SHOTS_DIR ? path.resolve(process.env.PFT_SHOTS_DIR) : null;
if (shotsOut) fs.mkdirSync(shotsOut, { recursive: true });
let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('FAIL', msg); } else console.log('ok  ', msg); };
const skip = (msg) => console.log('skip', msg);
const shot = async (page, name) => {
  const file = path.join(tmp, `${ENGINE}-${name}.png`);
  await page.screenshot({ path: file });
  if (shotsOut && ENGINE === 'chromium') fs.copyFileSync(file, path.join(shotsOut, `${name}.png`));
};

const Q = {
  poorQc: 'v=2&s=8&a=bd-discordant&t=poor&qc=1',
  obstruction: 'v=2&s=12&a=obstruction&t=fair',
  notes: 'v=2&s=31&a=restriction-parenchymal&sc=heavy',
  adv: 'v=2&s=44&a=mixed&t=poor&p=spirometry&qc=1&qd=adv',
};
const ds = await loadDatasets();
const qualityLines = (q) => buildRtReport(buildCase(parseDescriptor(q.replace(/&q[cd]=[^&]*/g, '')), ds)).qualityLines;

async function open(page, q) {
  await page.goto(`${base}?${q}`);
  await page.waitForSelector('#answer-form');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.evaluate(() => { document.querySelector('#answer-form').__ws = 7; });
}
const formKept = (page) => page.evaluate(() => document.querySelector('#answer-form')?.__ws === 7);
const idReport = (page) => page.evaluate(() => {
  const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
  return { dup: ids.filter((id, i) => ids.indexOf(id) !== i), forms: document.querySelectorAll('form').length, answer: document.querySelectorAll('#answer-form').length };
});
async function checkIds(page, tag) {
  const r = await idReport(page);
  check(r.dup.length === 0 && r.forms === 1 && r.answer === 1, `${tag}: one form, unique ids${r.dup.length ? ` (duplicates: ${r.dup.join(', ')})` : ''}`);
}
/** Both boxes wholly inside the window, and not overlapping. */
const together = (page, a, b) => page.evaluate(([a, b]) => {
  const A = document.querySelector(a)?.getBoundingClientRect(), B = document.querySelector(b)?.getBoundingClientRect();
  if (!A || !B || !A.width || !B.width) return { ok: false, why: `missing ${!A || !A.width ? a : b}` };
  const inside = (r) => r.top >= -0.5 && r.bottom <= innerHeight + 0.5 && r.left >= -0.5 && r.right <= innerWidth + 0.5;
  const overlap = !(A.right <= B.left || B.right <= A.left || A.bottom <= B.top || B.bottom <= A.top);
  return { ok: inside(A) && inside(B) && !overlap, why: `${a} ${Math.round(A.top)}-${Math.round(A.bottom)}, ${b} ${Math.round(B.top)}-${Math.round(B.bottom)} of ${innerHeight}` };
}, [a, b]);

try {
  /* ------------------------------------------------------------------ W1, W2, W4, W5: wide screens */
  for (const width of [1280, 1440]) {
    for (const [name, q] of [['poorQc', Q.poorQc], ['obstruction', Q.obstruction], ['notes', Q.notes]]) {
      const tag = `${ENGINE} ${width} ${name}`;
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await open(page, q);
      const lay = await page.evaluate(() => {
        const r = (s) => document.querySelector(s)?.getBoundingClientRect();
        const interp = document.querySelector('.sheet-interp');
        return {
          grid: getComputedStyle(document.querySelector('#case')).display, sticky: getComputedStyle(interp).position, main: r('.sheet-main')?.width,
          dataRight: r('.sheet-data').right, interpLeft: r('.sheet-interp').left, interpH: interp.getBoundingClientRect().height, docOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          font: parseFloat(getComputedStyle(document.querySelector('#sheet-spirometry td')).fontSize), overscroll: getComputedStyle(interp).overscrollBehaviorY,
          toggleShown: getComputedStyle(document.querySelector('#toggle-details')).display !== 'none' && document.querySelector('#toggle-details').getBoundingClientRect().width > 0,
        };
      });
      check(lay.grid === 'grid' && lay.sticky === 'sticky', `${tag}: the workspace layout is on (case area ${lay.grid}, answers ${lay.sticky})`);
      check(Math.abs(lay.main - 744) < 1 && Math.abs(lay.font - 10) < 0.05, `${tag}: page 1 keeps its printed layout at scale 1, not scaled down (tables and curves ${Math.round(lay.main)} px; table text ${lay.font.toFixed(1)} px, the printed 7.5 pt)`);
      check(lay.interpLeft >= lay.dataRight && lay.docOver <= 1, `${tag}: answers to the right of the data, no sideways page scroll`);
      check(lay.interpH <= 900 - 16 + 1 && lay.overscroll === 'auto', `${tag}: the answer column is bounded to the window (${Math.round(lay.interpH)} px) and does not trap the wheel`);
      check(!lay.toggleShown, `${tag}: the narrow-layout page-2 control is not shown; the view buttons take its place`);
      // Nothing in the answer column is drawn over another box of it: the form, the signature lines and the heading follow one another.
      const stack = await page.evaluate(() => {
        const r = (e) => e.getBoundingClientRect();
        const parts = [document.querySelector('.sheet-interp > h2'), document.querySelector('#answer-form'), document.querySelector('.sheet-interp .toolbar'), document.querySelector('.sheet-interp .sheet-sign')].filter(Boolean).map(r);
        return parts.every((b, i) => i === 0 || b.top >= parts[i - 1].bottom - 0.5);
      });
      check(stack, `${tag}: the heading, the form, its buttons and the signature lines follow one another without overlap`);
      await checkIds(page, tag);

      // The answer column sticks while the data scroll past.
      const stick = await page.evaluate(async () => {
        const out = [];
        const bar = document.querySelector('.ws-bar').getBoundingClientRect().top + scrollY;
        const end = document.querySelector('.sheet-foot').getBoundingClientRect().bottom + scrollY - innerHeight;
        for (const y of [bar - 8, (bar + Math.max(bar, end)) / 2, Math.max(bar, end)]) {
          window.scrollTo(0, y);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const b = document.querySelector('.sheet-interp').getBoundingClientRect();
          out.push(b.top >= -0.5 && b.bottom <= innerHeight + 0.5);
        }
        return out;
      });
      check(stick.every(Boolean), `${tag}: the answer column stays in the window from the top to the end of page 1 (${stick.join(', ')})`);

      // Each answer with the values it is read from.
      await page.evaluate(() => window.scrollTo(0, document.querySelector('.ws-bar').getBoundingClientRect().top + scrollY - 8));
      const pairs = [
        ['pattern', '#answer-form input[name="pattern"]', '#sheet-spirometry td[data-r="fev1_fvc"][data-c="z"]'],
        ['severity', '#answer-form input[name="severity"]', '#sheet-spirometry td[data-r="fev1"][data-c="z"]'],
        ['bronchodilator', '#answer-form input[name="bronchodilator"]', '#sheet-spirometry td[data-r="fev1"][data-c="change"]'],
        ['dlco', '#answer-form input[name="dlco"]', '#sheet-dlco td[data-r="dlco"][data-c="z"]'],
        ['impression', '#impression', '#sheet-spirometry'],
        ['check', '#check-answers', '#sheet-spirometry'],
      ];
      for (const [label, ctrl, data] of pairs) {
        if (!(await page.locator(data).count())) { skip(`${tag}: ${label}: the case has no ${data}`); continue; }
        await page.locator(ctrl).first().focus();
        await page.waitForTimeout(80);
        const t = await together(page, `${ctrl}:focus, ${ctrl}`, data);
        check(t.ok, `${tag}: ${label}: the focused answer and its data are in the window together (${t.why})`);
        if (name === 'poorQc' && ['pattern', 'dlco', 'check'].includes(label)) await shot(page, `workspace-${width}-${label}`);
      }
      // The answers scroll inside their column only when taller; the last control is reachable.
      const region = await page.evaluate(() => { const i = document.querySelector('.sheet-interp'); return { over: i.scrollHeight > i.clientHeight + 1, role: i.getAttribute('role'), tab: i.getAttribute('tabindex'), label: i.getAttribute('aria-label') }; });
      check(!region.over || (region.role === 'region' && region.tab === '0' && region.label), `${tag}: ${region.over ? 'the taller answer column is a labelled, focusable scroll region' : 'the answers fit; no scroll region'}`);
      await page.locator('#show-key').focus();
      const last = await together(page, '#show-key', '.sheet-interp h2');
      const lastIn = await page.evaluate(() => { const b = document.querySelector('#show-key').getBoundingClientRect(), p = document.querySelector('.sheet-interp').getBoundingClientRect(); return b.top >= p.top - 0.5 && b.bottom <= p.bottom + 0.5 && b.bottom <= innerHeight; });
      check(lastIn, `${tag}: the last answer control can be reached and is shown inside the answer column (${last.why})`);

      // W2: page 2 in place, the form untouched.
      await page.fill('#impression', 'Obstruction, see page two');
      await page.locator('#answer-form input[name="pattern"]').nth(1).check();
      // A selection is made in the focused impression, as a learner makes it.
      await page.locator('#impression').focus();
      await page.evaluate(() => document.querySelector('#impression').setSelectionRange(4, 9));
      await page.locator('[data-ws-view="details"]').focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('#details-slot .dt-sheet');
      const w2 = await page.evaluate(() => ({
        sel: [document.querySelector('#impression').selectionStart, document.querySelector('#impression').selectionEnd], val: document.querySelector('#impression').value,
        checked: document.querySelector('#answer-form input[name="pattern"]:checked')?.value, focus: document.activeElement?.dataset?.wsView,
        pressed: [...document.querySelectorAll('button[data-ws-view]')].map((b) => b.getAttribute('aria-pressed')).join(),
        summaryShown: getComputedStyle(document.querySelector('.sheet-data')).display !== 'none', expanded: document.querySelector('#toggle-details').getAttribute('aria-expanded'),
        slotHidden: document.querySelector('#details-slot').hidden,
      }));
      check(await formKept(page), `${tag}: opening page 2 keeps the form node`);
      check(w2.val === 'Obstruction, see page two' && w2.sel.join() === '4,9' && w2.checked === 'obstruction', `${tag}: opening page 2 keeps the answers, the impression and its selection (${w2.sel})`);
      check(w2.focus === 'details' && w2.pressed === 'false,true', `${tag}: focus stays on the page 2 button, which is pressed`);
      check(!w2.summaryShown && w2.expanded === 'true' && !w2.slotHidden, `${tag}: page 2 replaces page 1 beside the answers, opened as by the page-2 control`);
      const quality = (await page.locator('#answer-form input[name^="ch:"]').count()) ? '#answer-form input[name^="ch:"]' : null;
      if (quality) {
        await page.evaluate(() => window.scrollTo(0, document.querySelector('.ws-bar').getBoundingClientRect().top + scrollY - 8));
        await page.locator(quality).first().focus();
        await page.waitForTimeout(80);
        const t = await together(page, `${quality}:focus`, '#details-slot .rpt-table');
        check(t.ok, `${tag}: a quality answer and the maneuver table are in the window together (${t.why})`);
        if (name === 'poorQc') await shot(page, `workspace-${width}-page2-quality`);
      }
      await checkIds(page, `${tag} page 2`);
      if (name === 'poorQc') {
        const src = await page.evaluate(() => document.documentElement.outerHTML);
        const lines = qualityLines(Q.poorQc);
        check(lines.every((l) => !src.includes(l)) && !/FEV(?:1|₁)\s*-\s*[A-FU]\b|FVC\s*-\s*[A-FU]\b/.test(src) && !/FEV1 accept\.|Criteria not met/.test(src),
          `${tag}: challenge on, stage 1, page 2 open: no quality statement, stated grade or acceptability in the page source`);
      }
      await page.locator('[data-ws-view="summary"]').click();
      const back = await page.evaluate(() => ({ summary: getComputedStyle(document.querySelector('.sheet-data')).display, details: getComputedStyle(document.querySelector('#details-slot')).display }));
      check(back.summary !== 'none' && back.details === 'none' && await formKept(page), `${tag}: page 1 again: the view changes only (form node kept)`);
      await page.close();
    }
  }

  /* ------------------------------------------------------------------ W3: stage gates in the workspace */
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await open(page, Q.poorQc);
    const tag = `${ENGINE} gates`;
    check(!(await page.locator('#check-answers').isDisabled()) && await page.locator('#show-statement').count() === 1, `${tag}: basic review, challenge on: Check is offered at once, the statement is optional`);
    await page.click('#show-statement');
    check(await page.locator('#statement-note').count() === 0, `${tag}: the statement is refused before the study answer`);
    await page.locator('#answer-form input[name="ch:studyInterpretable"]').first().check();
    await page.click('button[data-ws-view="details"]');
    await page.click('#show-statement');
    await page.waitForSelector('#statement-note');
    const s2 = await page.evaluate(() => ({ focus: document.activeElement?.id, locked: [...document.querySelectorAll('#answer-form input[name="ch:studyInterpretable"]')].every((i) => i.disabled), open: [...document.querySelectorAll('#answer-form input[name="pattern"]')].every((i) => !i.disabled), check: document.querySelector('#check-answers').disabled }));
    const comments = await page.locator('.sheet-comments').innerText();
    check(s2.focus === 'statement-note' && s2.locked && s2.open && !s2.check, `${tag}: the statement locks the study answer only; focus moves to the note; Check stays available`);
    const view = await page.evaluate(() => ({ page: document.querySelector('#case').dataset.wsPage, comments: getComputedStyle(document.querySelector('.sheet-comments')).display, open: document.querySelector('#toggle-details').getAttribute('aria-expanded') }));
    check(qualityLines(Q.poorQc).every((l) => comments.includes(l)) && view.page === 'summary' && view.comments !== 'none' && view.open === 'true', `${tag}: released from the page 2 view, the statement is shown in the comment box beside the answers (page 2 stays open)`);
    await page.click('#check-answers');
    await page.waitForSelector('#reveal');
    check(await page.locator('#reveal').isVisible(), `${tag}: the checked answers show the key and the feedback`);
    await checkIds(page, `${tag} stage 3`);
    await open(page, Q.poorQc);
    await page.locator('#answer-form input[name="pattern"]').first().check();
    await page.click('#check-answers');
    await page.waitForSelector('#reveal');
    check(await page.locator('#statement-note').count() === 0, `${tag}: basic review: a direct Check without the statement`);
    await open(page, Q.adv);
    check(await page.locator('#check-answers').isDisabled() && await page.locator('#check-hint').count() === 1, `${tag}: advanced review: Check waits for the statement`);
    await page.click('#show-statement');
    await page.waitForSelector('#statement-note');
    check(!(await page.locator('#check-answers').isDisabled()), `${tag}: advanced review: Check after the statement`);
    await open(page, Q.obstruction);
    check(await page.locator('#show-statement').count() === 0 && !(await page.locator('#check-answers').isDisabled()), `${tag}: challenge off: no statement step`);
    await page.close();
  }

  /* ------------------------------------------------------------------ W6, W7: narrow screens and resizing */
  for (const width of [390, 820]) {
    const tag = `${ENGINE} ${width}`;
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await open(page, Q.obstruction);
    const ex = await page.evaluate(() => {
      const out = { shown: 0, before: 0, cells: 0, equal: 0, flags: 0 };
      for (const fs of document.querySelectorAll('#answer-form .answers > fieldset')) {
        const e = fs.querySelector('.ws-ctx');
        if (!e) continue;
        if (getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0) out.shown++;
        const first = fs.querySelector('label');
        if (first && e.getBoundingClientRect().bottom <= first.getBoundingClientRect().top + 0.5) out.before++;
      }
      for (const td of document.querySelectorAll('#answer-form td[data-ws-cell]')) {
        const [t, r, c] = td.dataset.wsCell.split('/');
        const src = document.querySelector(`#summary-slot td[data-t="${t}"][data-r="${r}"][data-c="${c}"]`);
        out.cells++;
        if (src && src.textContent === td.textContent) out.equal++;
        if (src && src.classList.contains('flag') === td.classList.contains('flag')) out.flags++;
      }
      return out;
    });
    check(ex.shown >= 3 && ex.before === ex.shown, `${tag}: the report values are shown above the options of ${ex.shown} questions`);
    check(ex.cells > 0 && ex.equal === ex.cells && ex.flags === ex.cells, `${tag}: every excerpt cell is the sheet's cell, value and flag (${ex.equal} of ${ex.cells})`);
    // The disclosure: a view change only.
    await page.locator('#answer-form input[name="pattern"]').nth(1).check();
    await page.fill('#impression', 'Narrow screen impression');
    await page.evaluate(() => {
      window.__mut = 0;
      new MutationObserver((l) => { window.__mut += l.length; }).observe(document.querySelector('#answer-form'), { subtree: true, childList: true, attributes: true, characterData: true });
    });
    await page.locator('#ws-chart-toggle').focus();
    const top0 = await page.evaluate(() => document.querySelector('#ws-chart-toggle').getBoundingClientRect().top);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const d = await page.evaluate(() => ({ exp: document.querySelector('#ws-chart-toggle').getAttribute('aria-expanded'), tables: getComputedStyle(document.querySelector('#summary-slot .sheet-block')).display, focus: document.activeElement?.id, top: document.querySelector('#ws-chart-toggle').getBoundingClientRect().top, mut: window.__mut, ex: getComputedStyle(document.querySelector('.ws-ctx')).display }));
    check(d.exp === 'false' && d.tables === 'none' && d.ex !== 'none', `${tag}: the disclosure hides the tables and curves; the per-question values stay`);
    check(d.focus === 'ws-chart-toggle' && Math.abs(d.top - top0) <= 1 && d.mut === 0 && await formKept(page), `${tag}: the disclosure keeps focus and its place, and nothing under the form changes (${d.mut} mutations)`);
    if (width === 390) {
      await shot(page, 'workspace-390-collapsed');
      await page.evaluate(() => { const f = document.querySelector('#answer-form .answers > fieldset'); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - 8); });
      await shot(page, 'workspace-390-excerpt-pattern');
      await page.evaluate(() => { const f = [...document.querySelectorAll('#answer-form .answers > fieldset')][2]; window.scrollTo(0, f.getBoundingClientRect().top + scrollY - 8); });
      await shot(page, 'workspace-390-excerpt-bronchodilator');
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    check((await page.locator('#ws-chart-toggle').getAttribute('aria-expanded')) === 'true' && await page.locator('#summary-slot .sheet-block').first().isVisible(), `${tag}: the disclosure shows them again`);
    if (width === 390) {
      // Page 2 through the narrow-layout control: in place, the form untouched.
      await page.locator('#impression').focus();
      await page.evaluate(() => document.querySelector('#impression').setSelectionRange(2, 6));
      await page.click('#toggle-details');
      await page.waitForSelector('#details-slot .dt-sheet');
      const p2 = await page.evaluate(() => ({ focus: document.activeElement?.id, sel: [document.querySelector('#impression').selectionStart, document.querySelector('#impression').selectionEnd].join(), exp: document.querySelector('#toggle-details').getAttribute('aria-expanded') }));
      check(await formKept(page) && p2.focus === 'toggle-details' && p2.sel === '2,6' && p2.exp === 'true', `${tag}: page 2 opens in place: form node, selection (${p2.sel}) and focus kept`);
      // W7: resize through the wide layout and back, with the chart collapsed and the impression focused.
      await page.locator('#ws-chart-toggle').click();
      await page.locator('#impression').focus();
      await page.evaluate(() => document.querySelector('#impression').setSelectionRange(3, 8));
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.waitForTimeout(300);
      const wide = await page.evaluate(() => ({ grid: getComputedStyle(document.querySelector('#case')).display, data: getComputedStyle(document.querySelector('#summary-slot .sheet-block')).display, ex: getComputedStyle(document.querySelector('.ws-ctx')).display, views: getComputedStyle(document.querySelector('.ws-views')).display }));
      check(wide.grid === 'grid' && wide.data !== 'none' && wide.ex === 'none' && wide.views !== 'none', `${tag} -> 1280: the wide layout shows the data whatever the narrow disclosure says; the excerpts give way to the data column`);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => ({ focus: document.activeElement?.id, sel: [document.querySelector('#impression').selectionStart, document.querySelector('#impression').selectionEnd].join(), val: document.querySelector('#impression').value, checked: document.querySelector('#answer-form input[name="pattern"]:checked')?.value, ex: getComputedStyle(document.querySelector('.ws-ctx')).display }));
      check(await formKept(page) && after.focus === 'impression' && after.sel === '3,8' && after.val === 'Narrow screen impression' && after.checked === 'obstruction' && after.ex !== 'none',
        `${tag} -> 1280 -> 390: answers, impression, selection, focus and form node kept`);
      await checkIds(page, tag);
      // The in-place update equals a full redraw (a change event on the flag setting, at its current value, redraws the case area).
      const area = () => page.evaluate(() => { const c = document.querySelector('#case').cloneNode(true); for (const e of c.querySelectorAll('[data-scroll-region]')) for (const a of ['role', 'tabindex', 'aria-label', 'data-scroll-region']) e.removeAttribute(a); return c.querySelector('.details-bar').outerHTML + c.querySelector('#details-slot').outerHTML; });
      // Page 2 is open here, reached by the in-place update; the redraw replaces the form, so this comes last.
      const inPlace = await area();
      await page.evaluate(() => document.querySelector('#flags').dispatchEvent(new Event('change', { bubbles: true })));
      await page.waitForTimeout(200);
      check(inPlace === await area(), `${tag}: page 2 opened in place is the markup a full redraw gives`);
    }
    await page.close();
  }

  /* ------------------------------------------------------------------ W8: themes */
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await open(page, Q.poorQc);
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.ws-bar').getBoundingClientRect().top + scrollY - 8));
    const c = await page.evaluate(() => ({ interp: getComputedStyle(document.querySelector('.sheet-interp')).backgroundColor, paper: getComputedStyle(document.querySelector('#case'), '::before').backgroundColor, token: getComputedStyle(document.documentElement).getPropertyValue('--paper-bg').trim(), body: getComputedStyle(document.body).backgroundColor }));
    check(c.interp === c.paper && c.interp !== 'rgba(0, 0, 0, 0)', `${ENGINE} ${scheme}: the answer column and page 1 are on the paper token (${c.interp}; --paper-bg ${c.token})`);
    await shot(page, `workspace-1280-${scheme}`);
    await ctx.close();
  }

  /* ------------------------------------------------------------------ W9: accessibility tree */
  for (const [name, q, steps] of [['stage 1', Q.poorQc, []], ['page 2 open', Q.poorQc, ['details', 'summary']], ['spirometry only', Q.adv, []]]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await open(page, q);
    for (const s of steps) { await page.locator(`[data-ws-view="${s}"]`).click(); await page.waitForTimeout(150); }
    // The view buttons and excerpts are workspace additions; they are removed so that the comparison is of the page's own content.
    await page.evaluate(() => { for (const e of document.querySelectorAll('[data-ws-ui]')) e.remove(); for (const e of document.querySelectorAll('[data-scroll-region]')) for (const a of ['role', 'tabindex', 'aria-label', 'data-scroll-region']) e.removeAttribute(a); });
    const grid = await page.evaluate(() => getComputedStyle(document.querySelector('#case')).display);
    // The wide layout also hides, on purpose, the narrow-layout page-2 control and the report page not chosen; those are undone here, so
    // that the comparison isolates the boxes that generate no box.
    await page.addStyleTag({ content: '#case[data-ws] > .details-bar { display: flex !important; } #case[data-ws] > #details-slot:not([hidden]) { display: block !important; }' });
    const a = await page.locator('main').ariaSnapshot();
    await page.evaluate(() => { for (const l of document.querySelectorAll('link[data-ws-css]')) l.disabled = true; });
    await page.waitForTimeout(150);
    const b = await page.locator('main').ariaSnapshot();
    const lines = (s) => s.split('\n');
    const diff = lines(a).filter((l, i) => l !== lines(b)[i]).slice(0, 3);
    check(grid === 'grid' && a === b, `${ENGINE} accessibility tree, ${name}: the wide layout keeps every role, name and order of the baseline layout${diff.length ? `; first differences: ${diff.join(' | ')}` : ''}`);
    check(/article "Summary sheet, case/.test(a) && /heading "Interpretation"/.test(a) && /heading "Technologist comments"/.test(a), `${ENGINE} accessibility tree, ${name}: the summary sheet, its comment box and the interpretation box keep their roles and names`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log('workspace checks pass');
