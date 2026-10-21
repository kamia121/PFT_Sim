/**
 * Keyboard and screen-reader access to the boxes that scroll sideways on a narrow screen. A wide table sits in a `.scroll` box (the
 * Lab report sheet in a `.sheet-wrap`); where the content is wider than the box, the box becomes a focusable, labelled region, so that
 * its columns can be reached with the arrow keys and are announced as scrollable instead of being cut off without notice.
 * Boxes that fit are left alone, and a box that stops overflowing loses the attributes this module added.
 */
const SELECTOR = '.scroll, .sheet-wrap, .rpt-block';
/** Boxes that scroll up and down: the answer column of the interpretation workspace on a wide screen (src/app/workspace.css). */
const Y_SELECTOR = '#case[data-ws] .sheet-live .sheet-interp';

/** @param {HTMLElement} box */
function labelOf(box) {
  const own = box.getAttribute('data-scroll-label');
  if (own) return own;
  const cap = box.querySelector('caption')?.textContent?.trim();
  const head = box.querySelector('h2, h3, h4')?.textContent?.trim();
  return `${(cap || head || 'Table').replace(/\s+/g, ' ').slice(0, 80)}, scrolls sideways`;
}

/** @param {ParentNode} root */
export function markScrollRegions(root = document) {
  for (const box of root.querySelectorAll(SELECTOR)) {
    const over = box.scrollWidth > box.clientWidth + 1;
    const ours = box.hasAttribute('data-scroll-region');
    if (over && !box.hasAttribute('tabindex')) {
      box.setAttribute('role', 'region');
      box.setAttribute('tabindex', '0');
      box.setAttribute('aria-label', labelOf(box));
      box.setAttribute('data-scroll-region', '');
    } else if (!over && ours) {
      for (const a of ['role', 'tabindex', 'aria-label', 'data-scroll-region']) box.removeAttribute(a);
    }
  }
  for (const box of root.querySelectorAll(Y_SELECTOR)) {
    const over = box.scrollHeight > box.clientHeight + 1 && getComputedStyle(box).overflowY !== 'visible';
    const ours = box.hasAttribute('data-scroll-region');
    if (over && !box.hasAttribute('tabindex')) {
      box.setAttribute('role', 'region');
      box.setAttribute('tabindex', '0');
      box.setAttribute('aria-label', 'Interpretation answers, scroll up and down');
      box.setAttribute('data-scroll-region', '');
    } else if (!over && ours) {
      for (const a of ['role', 'tabindex', 'aria-label', 'data-scroll-region']) box.removeAttribute(a);
    }
  }
}

/** Mark now, and again after every re-render or resize. Returns a function that stops watching. */
export function watchScrollRegions() {
  let pending = 0;
  const run = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => markScrollRegions()); };
  const mo = new MutationObserver(run);
  mo.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', run);
  run();
  return () => { mo.disconnect(); window.removeEventListener('resize', run); cancelAnimationFrame(pending); };
}
