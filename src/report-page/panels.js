/**
 * Figure slots of the printed report page, in one place. Each slot lists registry ids in order of preference (a fallback
 * chain). An entry is either one id (a single figure) or an array of ids (figures drawn side by side). The first entry for
 * which at least one figure has data and renders is used; an id that is not in the registry is skipped, so this file can name
 * panels before they exist and the page degrades to the individual figures.
 *
 * To swap a panel in, add its id at the head of the slot's chain (it is already listed) and make sure `src/ui/figures/index.js`
 * registers it; nothing else on the page changes. A figure whose id starts with `panel-`, and the z-score strip, is drawn at the full 7 in width of the
 * page; every other figure is drawn at half width (a pair is two halves).
 */
import { FIGURES } from '../ui/figures/index.js';

/** @type {Record<string, { chain: (string|string[])[], onlyWithoutInline?: boolean }>} */
export const SLOTS = {
  spirometry: { chain: ['panel-spirometry', ['flow-volume', 'volume-time']] },
  pleth: { chain: ['panel-pleth', ['pleth-shutter', 'pleth-raw']] },
  dlco: { chain: ['panel-dlco', 'dlco-trace'] },
  // A full-width z-score strip is used only where the per-row inline graphic is not available.
  zstrip: { chain: ['z-strip'], onlyWithoutInline: true },
  // The maneuver log draws each forced maneuver on its own, so that repeatability can be judged by eye; with more than eight
  // maneuvers the tiles would take several sheets, so they are overlaid instead.
  review: { chain: ['panel-spirometry'], view: (cd) => ((cd.spirometry.pre.maneuvers.length + (cd.spirometry.post?.maneuvers.length ?? 0)) <= 8 ? 'separate' : 'all') },
};

/** Drawing width of a full-width panel: 7 in at 96 px per inch. */
export const PANEL_WIDTH_PX = 672;

const isPanel = (id) => id.startsWith('panel-');
/** Figures drawn across the whole page width: the combined panels and the z-score strip (wide and low). */
const isFull = (id) => isPanel(id) || id === 'z-strip';

/** Case data in the form the figure registry reads (the practice page's figureCaseData plus what the z-score strip needs). */
export const slotCaseData = (caseData, interp, equation, resolve = null) => ({ ...caseData, interp, equation, resolve, revealed: false, showSchematic: false });

function drawOne(id, cd, palette, errors, view = 'best') {
  const f = FIGURES[id];
  if (!f || typeof f.dataFor !== 'function' || typeof f.render !== 'function') return null;
  try {
    const data = f.dataFor(cd);
    if (data === null || data === undefined) return null;
    const svg = f.render(data, { palette, ...(isFull(id) ? { width: PANEL_WIDTH_PX } : {}), showQuality: false, view });
    return typeof svg === 'string' && svg.trim() ? { id, svg, title: f.title ?? id } : null;
  } catch (e) {
    errors?.push({ id, message: String(e?.message ?? e) });
    return null;
  }
}

/**
 * @param {keyof typeof SLOTS} name
 * @param {object} cd result of slotCaseData
 * @param {{ palette: object, hasInline?: boolean, errors?: object[] }} opts
 * @returns {{ ids: string[], svgs: string[], span: 'full'|'half'|'pair' } | null} null when no figure in the chain has data
 */
export function resolveSlot(name, cd, { palette, hasInline = false, errors } = {}) {
  const slot = SLOTS[name];
  if (!slot || (slot.onlyWithoutInline && hasInline)) return null;
  for (const entry of slot.chain) {
    const ids = Array.isArray(entry) ? entry : [entry];
    const drawn = ids.map((id) => drawOne(id, cd, palette, errors, typeof slot.view === 'function' ? slot.view(cd) : slot.view ?? 'best')).filter(Boolean);
    if (!drawn.length) continue;
    const span = !Array.isArray(entry) && isFull(entry) ? 'full' : Array.isArray(entry) && drawn.length > 1 ? 'pair' : 'half';
    return { ids: drawn.map((d) => d.id), svgs: drawn.map((d) => d.svg), span };
  }
  return null;
}

/**
 * The inline z-score graphic, if the module exists. Loaded dynamically so that the page works before it is written.
 * @returns {Promise<Function|null>} zInline(measure, { z, lln, uln }, { palette, width, height }) or null
 */
export async function loadZInline() {
  try {
    const m = await import('../ui/figures/z-inline.js');
    const fn = typeof m.zInline === 'function' ? m.zInline : typeof m.default === 'function' ? m.default : null;
    return fn;
  } catch {
    return null;
  }
}

/** Indices with a two-sided reference range, which get an upper limit line at z = +1.645 in the inline graphic. */
export const TWO_SIDED = new Set(['tlc', 'rv', 'rv_tlc']);
/** Size of the inline z-score graphic in the tables: 1.3 in by 0.17 in at 96 px per inch. */
export const INLINE_SIZE = { width: 125, height: 16 };

/**
 * Markup for one table cell, or '' when the row has no z-score or the module misbehaves. The function may return a complete
 * `<svg>` or a fragment of SVG elements; a fragment is wrapped in an `<svg>` of the size requested.
 */
export function inlineCell(zInline, measure, row, lln, palette) {
  if (typeof zInline !== 'function' || !Number.isFinite(row?.z)) return '';
  try {
    const { width, height } = INLINE_SIZE;
    const out = zInline(measure, { z: row.z, lln, uln: TWO_SIDED.has(measure) ? -lln : null, ...(Number.isFinite(row.postZ) ? { post: row.postZ } : {}) }, { palette, width, height });
    if (typeof out !== 'string' || !out.trim()) return '';
    return /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(out)
      ? out
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="z-score ${row.z.toFixed(2)}">${out}</svg>`;
  } catch {
    return '';
  }
}
