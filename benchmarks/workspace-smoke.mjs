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
 *       boxes that generate no box on wide screens keep their roles and names), before and after the answers are checked.
 *   W10 after the answers are checked (Check or Show the key; basic and advanced review; long and short feedback; page 1 or page 2 in view;
 *       light and dark; 1280, 1440 and 1920 px, a resize across 1200 px and back, and zoom): the key and feedback are in the data column
 *       and the sticky answer column never covers them, by geometry (no visible feedback item meets the column) and by paint order (the
 *       topmost element at both ends of every visible item is the item's own); the column stays in the window and inside the case area;
 *       the reveal lands at the top of the window; its tables do not overflow (with text at 200 % a wide table scrolls in its own labelled
 *       region); a redraw keeps the column's scroll position; a resize to a phone width and back; keyboard focus is never hidden under
 *       another box, Page Down scrolls the answer column and End reaches the end of the page.
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
  // Mixed obstruction and restriction with a bronchodilator study, quality challenge off (the reported case: long feedback after Check).
  mixedLong: 'v=2&s=21&a=mixed',
  mixedLongAdv: 'v=2&s=21&a=mixed&qd=adv',
  short: 'v=2&s=5&a=normal&p=spirometry',
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
      // Each position is measured once the scroll has been applied and a frame has been drawn (a separate task, so that an engine that
      // updates sticky offsets on its scroll event has done so); the numbers are reported with the result.
      const ys = await page.evaluate(() => {
        const bar = document.querySelector('.ws-bar').getBoundingClientRect().top + scrollY;
        const end = document.querySelector('.sheet-foot').getBoundingClientRect().bottom + scrollY - innerHeight;
        return [bar - 8, (bar + Math.max(bar, end)) / 2, Math.max(bar, end)].map(Math.round);
      });
      // Layout at the moment of the stick test and again afterwards, reported with both checks below (Firefox showed a page shorter at
      // this moment than a moment later; these numbers say which part of the layout grew).
      const layoutNow = () => page.evaluate(() => { const c = document.querySelector('#case'), i = document.querySelector('.sheet-interp').getBoundingClientRect(), d = document.querySelector('.sheet-data').getBoundingClientRect();
        return `page ${document.documentElement.scrollHeight}, rows [${getComputedStyle(c).gridTemplateRows}], case ${Math.round(c.getBoundingClientRect().height)}, data ${Math.round(d.height)}, column ${Math.round(i.top + scrollY)}+${Math.round(i.height)}, window ${innerHeight}, visual ${Math.round(visualViewport?.height ?? 0)}, t ${Math.round(performance.now())} ms`; });
      const before = await layoutNow();
      const stick = [];
      for (const y of ys) {
        await page.evaluate((y) => window.scrollTo(0, y), y);
        await page.waitForFunction((y) => Math.abs(scrollY - y) < 1 || scrollY >= document.documentElement.scrollHeight - innerHeight - 1, y);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50))));
        stick.push(await page.evaluate(() => { const b = document.querySelector('.sheet-interp').getBoundingClientRect(); return { y: Math.round(scrollY), top: Math.round(b.top), bottom: Math.round(b.bottom), h: innerHeight, ok: b.top >= -0.5 && b.bottom <= innerHeight + 0.5 }; }));
      }
      const room = await page.evaluate(() => ({ max: Math.round(document.documentElement.scrollHeight - innerHeight), bar: Math.round(document.querySelector('.ws-bar').getBoundingClientRect().top + scrollY), col: Math.round(document.querySelector('.sheet-interp').getBoundingClientRect().height), doc: document.documentElement.scrollHeight }));
      const after = await layoutNow();
      check(room.max >= room.bar - 8, `${tag}: the page scrolls far enough for the answer column to stick (largest scroll ${room.max}, column starts at ${room.bar} and is ${room.col} px; page ${room.doc} px)`);
      check(stick.every((x) => x.ok), `${tag}: the answer column stays in the window from the top to the end of page 1 (${stick.map((x) => `scroll ${x.y}: ${x.top}-${x.bottom} of ${x.h}`).join('; ')})${stick.every((x) => x.ok) ? '' : `; layout at the stick test: ${before}; afterwards: ${after}`}`);

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

  /* -------------------------- W3a: the statement released by a pointer from a scrolled answer column is in view, with the comment box */
  for (const height of [768, 900]) {
    const tag = `${ENGINE} 1280x${height} statement`;
    const page = await browser.newPage({ viewport: { width: 1280, height } });
    await open(page, Q.poorQc);
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.ws-bar').getBoundingClientRect().top + scrollY - 8));
    await page.locator('#answer-form input[name="ch:studyInterpretable"]').first().click();
    await page.evaluate(() => { const i = document.querySelector('.sheet-interp'), b = document.querySelector('#show-statement'); i.scrollTop += b.getBoundingClientRect().bottom - i.getBoundingClientRect().bottom + 20; });
    const before = await page.evaluate(() => document.querySelector('.sheet-interp').scrollTop);
    await page.locator('#show-statement').click();
    await page.waitForSelector('#statement-note');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50))));
    const r = await page.evaluate(() => {
      const box = document.querySelector('.sheet-interp').getBoundingClientRect(), note = document.querySelector('#statement-note').getBoundingClientRect(), com = document.querySelector('.sheet-comments').getBoundingClientRect();
      return { note: [Math.round(note.top), Math.round(note.bottom)], box: [Math.round(box.top), Math.round(box.bottom)], com: [Math.round(com.top), Math.round(com.bottom)], h: innerHeight, focus: document.activeElement?.id,
        noteIn: note.top >= box.top - 0.5 && note.bottom <= box.bottom + 0.5 && note.bottom <= innerHeight + 0.5 && note.top >= -0.5, comIn: com.top >= -0.5 && com.bottom <= innerHeight + 0.5, scrolled: document.querySelector('.sheet-interp').scrollTop };
    });
    check(before > 0, `${tag}: the answer column was scrolled to the statement button (${Math.round(before)} px)`);
    check(r.focus === 'statement-note' && r.noteIn, `${tag}: after a pointer click the note is focused and wholly in the answer column and the window (note ${r.note.join('-')}, column ${r.box.join('-')} of ${r.h}; column scroll ${Math.round(r.scrolled)})`);
    check(r.comIn, `${tag}: the comment box holding the statement is in the window beside it (${r.com.join('-')} of ${r.h})`);
    const comments = await page.locator('.sheet-comments').innerText();
    check(qualityLines(Q.poorQc).every((l) => comments.includes(l)), `${tag}: the comment box holds the statement`);
    if (height === 768) await shot(page, 'workspace-1280x768-statement');
    await page.close();
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
    // Playwright's Firefox actions scroll their target into view with a scroll the engine can still apply a frame later, over a scroll
    // made in the meantime (here the one of focusing the control, which then ended about 1100 px above the window in 10 of 20 runs; none
    // in 20 runs after this pause, and none when the same position was reached by a page script). The pause lets it land first.
    await page.waitForTimeout(500);
    await page.locator('#ws-chart-toggle').focus();
    const top0 = await page.evaluate(() => document.querySelector('#ws-chart-toggle').getBoundingClientRect().top);
    check(top0 >= 0 && top0 <= await page.evaluate(() => innerHeight), `${tag}: the focused disclosure control is in the window before it is used (at ${Math.round(top0)} px)`);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const d = await page.evaluate(() => ({ exp: document.querySelector('#ws-chart-toggle').getAttribute('aria-expanded'), tables: getComputedStyle(document.querySelector('#summary-slot .sheet-block')).display, focus: document.activeElement?.id, top: document.querySelector('#ws-chart-toggle').getBoundingClientRect().top, mut: window.__mut, ex: getComputedStyle(document.querySelector('.ws-ctx')).display }));
    check(d.exp === 'false' && d.tables === 'none' && d.ex !== 'none', `${tag}: the disclosure hides the tables and curves; the per-question values stay`);
    check(d.focus === 'ws-chart-toggle' && Math.abs(d.top - top0) <= 1 && d.mut === 0 && await formKept(page), `${tag}: the disclosure keeps focus and its place, and nothing under the form changes (focus ${d.focus}; control at ${Math.round(top0)} then ${Math.round(d.top)} px; ${d.mut} mutations)`);
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
      await page.waitForFunction(() => matchMedia('(min-width: 1200px)').matches && getComputedStyle(document.querySelector('#case')).display === 'grid', null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(100);
      // What is drawn is measured by the boxes (the computed display of an element inside a hidden subtree is engine dependent: WebKit
      // reports none there, Chromium and Firefox the element's own value). Page 2 was opened above, so the wide layout shows it beside
      // the answers (the Detailed maneuvers tab) and page 1's data give way to it; choosing page 1 then shows the tables, which the
      // narrow disclosure, collapsed, does not reach in this layout.
      const drawn = () => page.evaluate(() => {
        const h = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : -1; };
        const c = document.querySelector('#case');
        return { grid: getComputedStyle(c).display, page: c.dataset.wsPage, attr: c.dataset.wsChart, narrow: matchMedia('(max-width: 1199.98px)').matches,
          pressed: document.querySelector('[data-ws-view][aria-pressed="true"]')?.dataset.wsView, tables: h('#summary-slot .sheet-block'), p2: h('#details-slot .dt-sheet'),
          ex: Math.max(...[...document.querySelectorAll('.ws-ctx')].map((e) => e.getBoundingClientRect().height)), views: h('.ws-views'),
          exp: document.querySelector('#ws-chart-toggle').getAttribute('aria-expanded') };
      });
      const wide = await drawn();
      check(wide.grid === 'grid' && wide.page === 'details' && wide.pressed === 'details' && wide.p2 > 0 && wide.tables === 0 && wide.ex === 0 && wide.views > 0,
        `${tag} -> 1280: page 2, opened on the narrow screen, is the page beside the answers; the excerpts give way to the data column (case area ${wide.grid}, page ${wide.page}, tab ${wide.pressed}, page 2 ${wide.p2} px, tables ${wide.tables} px, excerpts ${wide.ex} px, view buttons ${wide.views} px; data-ws-chart ${wide.attr}, narrow query ${wide.narrow})`);
      // A click event, not a pointer click, so that the focus and the selection under test stay where they are.
      await page.evaluate(() => document.querySelector('[data-ws-view="summary"]').click());
      await page.waitForTimeout(100);
      const wide1 = await drawn();
      check(wide1.page === 'summary' && wide1.pressed === 'summary' && wide1.tables > 0 && wide1.p2 === 0 && wide1.attr === 'open' && wide1.exp === 'false',
        `${tag} -> 1280, page 1: the wide layout shows the tables whatever the narrow disclosure says (tables ${wide1.tables} px, page 2 ${wide1.p2} px; data-ws-chart ${wide1.attr}, disclosure aria-expanded ${wide1.exp})`);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => ({ focus: document.activeElement?.id, sel: [document.querySelector('#impression').selectionStart, document.querySelector('#impression').selectionEnd].join(), val: document.querySelector('#impression').value, checked: document.querySelector('#answer-form input[name="pattern"]:checked')?.value, ex: getComputedStyle(document.querySelector('.ws-ctx')).display, attr: document.querySelector('#case').dataset.wsChart, exp: document.querySelector('#ws-chart-toggle').getAttribute('aria-expanded'), tables: Math.round(document.querySelector('#summary-slot .sheet-block').getBoundingClientRect().height) }));
      check(after.attr === 'collapsed' && after.exp === 'false' && after.tables === 0, `${tag} -> 1280 -> 390: the narrow disclosure is collapsed again, as it was left (data-ws-chart ${after.attr}, aria-expanded ${after.exp}, tables ${after.tables} px)`);
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

  /* ------------------------------------------------------------------ W10: after the answers are checked */
  // The answer column is sticky with the case area as its containing block, so it stays in the window down to the end of the case area,
  // the key and feedback included; it paints above in-flow content. The key must therefore never be under it. Each position is measured
  // after the scroll and a drawn frame; item boxes are clipped to the window, and the topmost element is sampled at both ends of each item.
  const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60))));
  const revealState = (page) => page.evaluate(() => {
    const pane = document.querySelector('.sheet-interp'), rv = document.querySelector('#reveal'), cs = document.querySelector('#case');
    const P = pane.getBoundingClientRect(), R = rv.getBoundingClientRect(), C = cs.getBoundingClientRect();
    const wide = getComputedStyle(cs).display === 'grid';
    const clip = (r) => ({ l: Math.max(r.left, 0), t: Math.max(r.top, 0), r: Math.min(r.right, innerWidth), b: Math.min(r.bottom, innerHeight) });
    const meet = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
    const p = clip(P);
    let seen = 0, area = 0, covered = 0, outside = 0;
    const bad = [];
    for (const el of rv.querySelectorAll('h3, h4, p, li, table, .result-row, dt, dd')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight) continue;
      seen++;
      // A table that scrolls sideways is drawn only inside its scroll box.
      const sc = el.closest('.scroll')?.getBoundingClientRect();
      const c0 = clip(r), c = sc ? { l: Math.max(c0.l, sc.left), t: Math.max(c0.t, sc.top), r: Math.min(c0.r, sc.right), b: Math.min(c0.b, sc.bottom) } : c0;
      if (c.r - c.l < 4 || c.b - c.t < 1) continue;
      const a = meet(c, p);
      area += a;
      if (!el.closest('.scroll') && r.right > R.right + 0.5) outside++;
      const y = (c.t + c.b) / 2;
      for (const x of [c.l + 2, c.r - 2]) {
        if (x < 0 || x >= innerWidth) continue;
        const top = document.elementFromPoint(x, y);
        if (!top || !rv.contains(top)) { covered++; if (bad.length < 2) bad.push(`${el.tagName.toLowerCase()} at ${Math.round(x)},${Math.round(y)} under ${top ? (top.closest('.sheet-interp') ? 'the answer column' : top.tagName.toLowerCase()) : 'nothing'}`); }
      }
    }
    const over = [...rv.querySelectorAll('.scroll')].filter((e) => e.scrollWidth > e.clientWidth + 1);
    const scrolls = over.length, unmarked = over.filter((e) => e.getAttribute('role') !== 'region' || e.getAttribute('tabindex') !== '0').length;
    return {
      wide, y: Math.round(scrollY), seen, area: Math.round(area), covered, outside, bad, scrolls, unmarked,
      side: !wide || R.right <= P.left - 19, inCase: P.bottom <= C.bottom + 0.5,
      // In the window, or (at the end of the page, where the case area ends above the footer) resting on the end of the case area.
      inWindow: P.bottom <= innerHeight + 0.5 && (P.top >= -0.5 || Math.abs(P.bottom - C.bottom) <= 1),
      sticky: getComputedStyle(pane).position, pane: [Math.round(P.left), Math.round(P.top), Math.round(P.right), Math.round(P.bottom)], reveal: [Math.round(R.left), Math.round(R.right)],
    };
  });
  /** Scroll from the start of the key to the end of the page, checking at each stop; returns the stops. */
  async function sweep(page, tag, { wideTables = false } = {}) {
    const [start, end] = await page.evaluate(() => [document.querySelector('#reveal').getBoundingClientRect().top + scrollY - 40, document.documentElement.scrollHeight - innerHeight].map(Math.round));
    const stops = [];
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const y = Math.max(0, Math.round(start + (end - start) * f));
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await settle(page);
      stops.push(await revealState(page));
    }
    const ok = stops.every((x) => x.area === 0 && x.covered === 0 && x.outside === 0 && x.side && x.inCase && (!x.wide || (x.inWindow && x.sticky === 'sticky')));
    check(ok && stops.some((x) => x.seen > 0), `${tag}: the answer column never covers the key or the feedback (${stops.map((x) => `scroll ${x.y}: ${x.seen} items, overlap ${x.area} px², ${x.covered} hits under another box, column ${x.pane.join(',')}, key ${x.reveal.join('-')}`).join('; ')})${ok ? '' : `; ${stops.flatMap((x) => x.bad).slice(0, 3).join('; ')}`}`);
    // At the page's own text size every table of the key fits the data column; with larger text a wide table scrolls sideways inside its own
    // box, which is then a labelled, focusable region (src/ui/scroll-regions.js), and nothing is cut off.
    // Below 1200 px (the earlier layout) a wide table scrolls in its own region at any text size, as before the workspace.
    if (wideTables || stops.some((x) => !x.wide)) check(stops.every((x) => x.unmarked === 0), `${tag}: a table of the key wider than its column scrolls inside a labelled, focusable region (${Math.max(...stops.map((x) => x.scrolls))} such tables)`);
    else check(stops.every((x) => x.scrolls === 0), `${tag}: no table of the key overflows the data column`);
    return stops;
  }
  /** Check (or Show the key) and the landing of the reveal at the top of the window. */
  async function reveal(page, how, tag) {
    await page.click(how === 'key' ? '#show-key' : '#check-answers');
    await page.waitForSelector('#reveal');
    await settle(page);
    const land = await page.evaluate(() => ({ top: Math.round(document.querySelector('#reveal').getBoundingClientRect().top), atEnd: scrollY >= document.documentElement.scrollHeight - innerHeight - 1 }));
    check(Math.abs(land.top) <= 2 || land.atEnd, `${tag}: the key is brought to the top of the window (its top at ${land.top} px${land.atEnd ? ', page at its end' : ''})`);
  }
  async function openThemed(scheme, viewport, q, extra = {}) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport, ...extra });
    await ctx.addInitScript((t) => { try { localStorage.setItem('pft-theme', t); } catch { /* storage may be unavailable */ } }, scheme);
    const page = await ctx.newPage();
    await open(page, q);
    return { ctx, page };
  }
  for (const width of [1280, 1440, 1920]) {
    for (const [mode, q] of [['basic', Q.mixedLong], ['advanced', Q.mixedLongAdv]]) {
      const tag = `${ENGINE} ${width} after Check, ${mode} review, dark`;
      const { ctx, page } = await openThemed('dark', { width, height: 900 }, q);
      await reveal(page, 'check', tag);
      await sweep(page, tag);
      if (width === 1440 && mode === 'basic') await shot(page, 'workspace-1440-checked-dark');
      await ctx.close();
    }
  }
  for (const [name, q, how, steps, scheme] of [['Show the key', Q.mixedLong, 'key', [], 'light'], ['short feedback', Q.short, 'check', [], 'light'], ['page 2 in view', Q.mixedLong, 'check', ['details'], 'dark']]) {
    const tag = `${ENGINE} 1280 after ${name}, ${scheme}`;
    const { ctx, page } = await openThemed(scheme, { width: 1280, height: 900 }, q);
    for (const st of steps) { await page.click(`button[data-ws-view="${st}"]`); await settle(page); }
    await reveal(page, how, tag);
    await sweep(page, tag);
    await ctx.close();
  }
  {
    // A redraw after the check (the equation changed) keeps the answer column's scroll position, and the key stays clear of it; then the
    // window is resized across the wide layout's 1200 px limit and back.
    const tag = `${ENGINE} after Check, redraw and resize`;
    const { ctx, page } = await openThemed('dark', { width: 1920, height: 900 }, Q.mixedLongAdv);
    await reveal(page, 'check', tag);
    const before = await page.evaluate(() => { const i = document.querySelector('.sheet-interp'); i.scrollTop = Math.round((i.scrollHeight - i.clientHeight) / 2); return { top: i.scrollTop, over: i.scrollHeight > i.clientHeight + 1 }; });
    await page.check('input[name="eq"][value="GLI2012"]');
    await page.waitForFunction(() => document.querySelector('input[name="eq"][value="GLI2012"]')?.checked && document.querySelector('#reveal'));
    await settle(page);
    const after = await page.evaluate(() => document.querySelector('.sheet-interp').scrollTop);
    check(!before.over || Math.abs(after - before.top) <= 2, `${tag}: the redraw keeps the answer column's scroll position (${before.top} -> ${after} px${before.over ? '' : '; the answers fit'})`);
    await sweep(page, `${tag}, 1920 after the redraw`);
    for (const width of [1280, 1440, 1100, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await settle(page);
      await sweep(page, `${tag}, resized to ${width}`);
    }
    await ctx.close();
  }
  {
    // Keyboard: every control that Tab reaches in the key or in the answer column is drawn in the window and is not under another box; the
    // answer column, a focusable region when it scrolls, moves with Page Down; End takes the page to its end with the key still clear.
    const tag = `${ENGINE} 1440 keyboard after Check`;
    const { ctx, page } = await openThemed('dark', { width: 1440, height: 900 }, Q.mixedLong);
    await reveal(page, 'check', tag);
    const seen = { reveal: 0, column: 0 }, hidden = [];
    for (let i = 0; i < 90; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement, rv = document.querySelector('#reveal'), col = document.querySelector('.sheet-interp');
        const where = rv?.contains(el) ? 'reveal' : col?.contains(el) ? 'column' : null;
        if (!where) return null;
        const b = el.getBoundingClientRect();
        const x = Math.min(Math.max((b.left + b.right) / 2, 1), innerWidth - 1), y = Math.min(Math.max((b.top + b.bottom) / 2, 1), innerHeight - 1);
        const top = document.elementFromPoint(x, y);
        const inView = b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth;
        return { where, ok: inView && Boolean(top) && (el === top || el.contains(top) || (el.labels && [...el.labels].some((l) => l.contains(top)))), what: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} at ${Math.round(x)},${Math.round(y)} under ${top?.tagName.toLowerCase()}` };
      });
      if (!r) continue;
      seen[r.where]++;
      if (!r.ok && hidden.length < 3) hidden.push(r.what);
    }
    check(seen.column > 0 && hidden.length === 0, `${tag}: each control Tab reaches is in the window and on top (${seen.column} in the answer column, ${seen.reveal} in the key)${hidden.length ? `; hidden: ${hidden.join('; ')}` : ''}`);
    const pd = await page.evaluate(() => { const i = document.querySelector('.sheet-interp'); i.scrollTop = 0; i.focus(); return { region: i.getAttribute('role') === 'region', focused: document.activeElement === i }; });
    if (pd.region) {
      await page.keyboard.press('PageDown');
      await settle(page);
      const moved = await page.evaluate(() => document.querySelector('.sheet-interp').scrollTop);
      check(pd.focused && moved > 0, `${tag}: Page Down scrolls the focused answer column (${moved} px)`);
    } else skip(`${tag}: the answers fit, so the column is not a scroll region`);
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press('End');
    await page.waitForFunction(() => scrollY >= document.documentElement.scrollHeight - innerHeight - 1);
    await settle(page);
    const end = await revealState(page);
    check(end.area === 0 && end.covered === 0 && end.inCase, `${tag}: End reaches the end of the page with the key clear of the column (${end.seen} items, overlap ${end.area} px², column ${end.pane.join(',')})`);
    await ctx.close();
  }
  {
    // Larger text (text-only zoom to 200 %): the page's 17 px root becomes 34 px; the wide layout keeps its columns.
    const tag = `${ENGINE} 1440 text at 200% after Check`;
    const { ctx, page } = await openThemed('light', { width: 1440, height: 900 }, Q.mixedLong);
    await page.addStyleTag({ content: 'html { font-size: 34px !important; }' });
    await settle(page);
    await reveal(page, 'check', tag);
    await sweep(page, tag, { wideTables: true });
    await ctx.close();
  }
  // Browser zoom shrinks the window in CSS px and raises the device pixel ratio: 1920 x 900 at 150 % is 1280 x 600 CSS px, and 1440 x 900 at
  // 200 % is 720 x 450 and 1920 x 900 at 200 % is 960 x 450 (the narrow layout). The ratio only tests sub-pixel rounding; the media queries
  // follow the CSS width.
  for (const [w, h, dpr] of [[1280, 600, 1.5], [720, 450, 2], [960, 450, 2]]) {
    const tag = `${ENGINE} zoom ${w}x${h} at ${dpr}x after Check`;
    const { ctx, page } = await openThemed('dark', { width: w, height: h }, Q.mixedLong, { deviceScaleFactor: dpr });
    await reveal(page, 'check', tag);
    await sweep(page, tag);
    await ctx.close();
  }

  /* ------------------------------------------------------------------ W9: accessibility tree */
  // Playwright's ariaSnapshot computes roles and names from the DOM and the computed styles (its own computation, not the platform
  // accessibility API of the engine). The wide layout is compared with the same page under the baseline layout (workspace stylesheet
  // off): nothing is stripped; the only difference allowed is one added region, the answer column when it scrolls (labelled by
  // src/ui/scroll-regions.js), whose descendants must equal the baseline subtree line for line. Both snapshots are kept as artifacts.
  const LABEL = 'Interpretation answers, scroll up and down';
  for (const [name, q, steps] of [['stage 1', Q.poorQc, []], ['page 2 open', Q.poorQc, ['details', 'summary']], ['spirometry only', Q.adv, []], ['stage 3', Q.mixedLong, ['check']]]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await open(page, q);
    for (const s of steps) {
      if (s === 'check') { await page.click('#check-answers'); await page.waitForSelector('#reveal'); } else await page.locator(`[data-ws-view="${s}"]`).click();
      await page.waitForTimeout(150);
    }
    // The view buttons and excerpts are workspace additions and are taken out of both; the intended view hides (the narrow-layout
    // page-2 control, the report page not chosen) are undone, so that the same content is compared.
    await page.evaluate(() => { for (const e of document.querySelectorAll('[data-ws-ui]')) e.remove(); });
    await page.addStyleTag({ content: '#case[data-ws] > .details-bar { display: flex !important; } #case[data-ws] > #details-slot:not([hidden]) { display: block !important; }' });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 100))));
    const grid = await page.evaluate(() => getComputedStyle(document.querySelector('#case')).display);
    const reg = await page.evaluate(() => { const i = document.querySelector('.sheet-interp'); return { over: i.scrollHeight > i.clientHeight + 1, role: i.getAttribute('role'), label: i.getAttribute('aria-label'), tab: i.getAttribute('tabindex') }; });
    const a = await page.locator('main').ariaSnapshot();
    await page.locator('.sheet-interp').focus();
    const focusable = await page.evaluate(() => document.activeElement === document.querySelector('.sheet-interp'));
    // The baseline layout: the stylesheet off, and the scroll-region marker run again for that layout (as on any resize).
    await page.evaluate(() => { document.activeElement?.blur?.(); for (const l of document.querySelectorAll('link[data-ws-css]')) l.disabled = true; window.dispatchEvent(new Event('resize')); });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 150))));
    const b = await page.locator('main').ariaSnapshot();
    const slug = name.replace(/\W+/g, '-');
    fs.writeFileSync(path.join(tmp, `${ENGINE}-ax-${slug}-wide.yml`), a);
    fs.writeFileSync(path.join(tmp, `${ENGINE}-ax-${slug}-baseline.yml`), b);
    // Take out of the wide snapshot every region line named LABEL and lift its descendants by one level; record what was taken out.
    const A = a.split('\n'), added = [];
    const lifted = [];
    for (let i = 0; i < A.length; i++) {
      const m = A[i].match(/^(\s*)- region "([^"]*)"/);
      if (m) {
        const ind = m[1].length;
        let j = i + 1;
        while (j < A.length && (A[j].match(/^(\s*)/)[1].length > ind)) j++;
        if (m[2] === LABEL) { added.push(A[i].trim()); for (const l of A.slice(i + 1, j)) lifted.push(l.slice(2)); i = j - 1; continue; }
      }
      lifted.push(A[i]);
    }
    // Text that the added region splits from its neighbour (the signature lines inside the answer column, the sheet footer after it)
    // is reported by the snapshot as two text lines where the baseline has one; adjacent text lines at one depth are compared as one
    // run, in both snapshots. Nothing else is normalised.
    const runs = (L) => {
      const out = [];
      for (const l of L) {
        const m = l.match(/^(\s*)- text: (.*)$/);
        const v = m ? m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1') : null;
        const prev = out[out.length - 1];
        if (m && prev?.text !== undefined && prev.ind === m[1].length) prev.text += ` ${v}`;
        else out.push(m ? { ind: m[1].length, text: v } : { line: l });
      }
      return out.map((x) => (x.line !== undefined ? x.line : `${' '.repeat(x.ind)}- text: ${x.text}`));
    };
    const B = runs(b.split('\n'));
    lifted.splice(0, lifted.length, ...runs(lifted));
    const first = lifted.findIndex((l, i) => l !== B[i]);
    const same = first < 0 && lifted.length === B.length;
    const show = (L, i) => L.slice(Math.max(0, i - 1), i + 3).join(' / ');
    check(grid === 'grid' && same && added.length === (reg.over ? 1 : 0),
      `${ENGINE} accessibility tree, ${name}: the wide layout equals the baseline layout except ${reg.over ? 'one added region, the scrolling answer column' : 'nothing (the answers fit)'}; added ${JSON.stringify(added)}${same ? '' : `; first difference: wide ${show(lifted, first)} | baseline ${show(B, first)}`} (snapshots: ${ENGINE}-ax-${slug}-*.yml)`);
    if (reg.over) check(reg.role === 'region' && reg.label === LABEL && reg.tab === '0' && focusable, `${ENGINE} accessibility tree, ${name}: the added region is labelled "${reg.label}" and takes keyboard focus (tabindex ${reg.tab}, focused ${focusable})`);
    check(/article "Summary sheet, case/.test(a) && /heading "Interpretation"/.test(a) && /heading "Technologist comments"/.test(a), `${ENGINE} accessibility tree, ${name}: the summary sheet, its comment box and the interpretation box keep their roles and names`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log('workspace checks pass');
