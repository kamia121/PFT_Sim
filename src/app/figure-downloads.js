/**
 * "Download SVG" and "Copy SVG" controls for the figures on the page. The controls are plain markup placed
 * under each figure by render.js; one delegated click handler on the case container serves all of them, so
 * re-rendering the page needs no re-binding. The SVG for the chosen variant is generated at click time from the
 * current case state, so the export always matches what is drawn (including whether the answers were checked).
 */
import { FIGURE_ORDER, FIGURES } from '../ui/figures/index.js';
import { svgVariants, downloadSvg, figureFilename, seedCode } from '../ui/svg-export.js';

/** Variant order and short names shown in the menu. */
export const VARIANTS = [
  ['transparent-dark-ink', 'Transparent, dark ink'],
  ['transparent-light-ink', 'Transparent, light ink'],
  ['dark', 'Dark panel'],
  ['white', 'White panel'],
];

/**
 * Figures the registry can produce for this case, in page order.
 * @param {object} caseData @returns {{ id: string, title: string, data: object }[]}
 */
export function availableFigures(caseData) {
  const out = [];
  for (const id of FIGURE_ORDER) {
    const fig = FIGURES[id];
    if (!fig) continue;
    let data = null;
    try { data = fig.dataFor(caseData); } catch { data = null; }
    if (data) out.push({ id, title: fig.title, data });
  }
  return out;
}

/** Markup of the compact control for one figure. */
export function downloadControlsHtml(figureId) {
  const rows = VARIANTS.map(([pal, label]) => `<li><span>${label}</span><button type="button" data-fig-dl="${figureId}" data-pal="${pal}" data-act="download">.svg</button><button type="button" data-fig-dl="${figureId}" data-pal="${pal}" data-act="copy">Copy</button></li>`).join('');
  return `<details class="fig-dl"><summary>Download SVG</summary><ul>${rows}</ul><span class="fig-dl-status" role="status" aria-live="polite"></span></details>`;
}

let stylesAdded = false;
function ensureStyles() {
  if (stylesAdded || typeof document === 'undefined') return;
  stylesAdded = true;
  const style = document.createElement('style');
  style.textContent = `
.fig-dl{position:relative;margin-top:6px;font-size:.85rem}
.fig-dl summary{cursor:pointer;color:var(--link);display:inline-block;padding:2px 0}
.fig-dl ul{list-style:none;margin:6px 0 0;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);display:grid;gap:4px;max-width:340px}
.fig-dl li{display:grid;grid-template-columns:1fr auto auto;gap:6px;align-items:center}
.fig-dl button{font:inherit;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);cursor:pointer}
.fig-dl button:hover{border-color:var(--link)}
.fig-dl-status{display:block;color:var(--text-muted);min-height:1.1em}`;
  document.head.appendChild(style);
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

/**
 * Handle clicks on the download controls inside `root`.
 * @param {HTMLElement} root container that holds the figures (re-rendered freely)
 * @param {() => object} getCaseData returns the current case data for the registry (case plus interp, revealed, showSchematic)
 */
export function bindFigureDownloads(root, getCaseData) {
  ensureStyles();
  if (root.dataset.figDlBound) return;
  root.dataset.figDlBound = '1';
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest?.('button[data-fig-dl]');
    if (!btn) return;
    const caseData = getCaseData();
    const id = btn.dataset.figDl, pal = btn.dataset.pal;
    const svg = svgVariants(id, caseData, caseData.figView?.[id] ?? {})[pal];
    const status = btn.closest('.fig-dl')?.querySelector('.fig-dl-status');
    if (!svg) { if (status) status.textContent = 'This figure is not available for the case.'; return; }
    if (btn.dataset.act === 'copy') {
      const ok = await copyText(svg);
      if (status) status.textContent = ok ? 'SVG copied to the clipboard.' : 'Copying was blocked by the browser.';
    } else {
      const name = figureFilename(id, seedCode(caseData), pal);
      const ok = downloadSvg(name, svg);
      if (status) status.textContent = ok ? `Saved ${name}` : 'Downloads are not available here.';
    }
  });
}
