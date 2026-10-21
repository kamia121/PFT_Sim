/**
 * Browser-side layout of the report page: scale the fixed-width pages to the window, and shrink a page's figures and then its
 * text in small steps until the content fits the Letter page (so the student copy stays at three pages whatever the panels
 * and the technologist comments turn out to need). The result of each page is written to data attributes so that a test can
 * read it. Layout measurements use CSS px and ignore the transform, so the fit made on screen is the fit that prints.
 */

const PAGE_W = 816;
/** Figure scale steps (width of the slots as a fraction of the page) and the floor below which text is shrunk instead. */
const FS_MIN = 0.62, FS_STEP = 0.04;
/** Text scale steps and floor (9 pt body text never goes below about 7.6 pt). */
const TS_MIN = 0.84, TS_STEP = 0.02;

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * @param {ParentNode} root
 * @returns {{ page: string, fs: number, ts: number, fits: boolean, overflowPx: number }[]}
 */
export function fitPages(root) {
  const out = [];
  for (const page of root.querySelectorAll('.rp-page:not(.rp-flow)')) {
    const content = page.querySelector('.rp-content');
    page.style.removeProperty('--rp-fs');
    page.style.removeProperty('--rp-ts');
    const over = () => content.scrollHeight - content.clientHeight;
    let fs = 1, ts = 1;
    while (over() > 1 && fs > FS_MIN) { fs = round2(fs - FS_STEP); page.style.setProperty('--rp-fs', String(fs)); }
    while (over() > 1 && ts > TS_MIN) { ts = round2(ts - TS_STEP); page.style.setProperty('--rp-ts', String(ts)); }
    const overflowPx = Math.max(0, Math.round(over()));
    page.dataset.fit = `${fs}/${ts}`;
    page.dataset.overflow = String(overflowPx);
    out.push({ page: page.dataset.page, fs, ts, fits: overflowPx <= 1, overflowPx });
  }
  return out;
}

/** Set the scale that fits the stage, and the height of the flowing appendix box. */
export function scalePages(stage, maxScale = 1.25) {
  const avail = stage.clientWidth || stage.parentElement?.clientWidth || PAGE_W;
  const s = Math.max(0.2, Math.min(maxScale, avail / PAGE_W));
  stage.style.setProperty('--rp-s', String(Math.floor(s * 1000) / 1000));
  for (const box of stage.querySelectorAll('.rp-box.flow')) {
    const page = box.querySelector('.rp-page');
    box.style.setProperty('--rp-h', String(page ? page.offsetHeight : 1056));
  }
  return s;
}
