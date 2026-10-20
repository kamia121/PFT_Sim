/**
 * Standalone SVG export of the registry figures in the four palettes (transparent with dark ink, transparent
 * with light ink, dark panel, white panel). Everything except downloadSvg is pure and runs in Node.
 */
import { FIGURES } from './figures/index.js';
import { PALETTES, PALETTE_IDS } from './palettes.js';

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * Prepend the XML declaration and make sure the root element carries xmlns, width and height (taken from the viewBox).
 * @param {string} svg markup of a single <svg> element
 * @returns {string}
 */
export function standaloneSvg(svg) {
  let s = String(svg).replace(/^\s*<\?xml[^>]*\?>\s*/, '').trim();
  const open = /^<svg\b[^>]*>/.exec(s);
  if (!open) throw new Error('standaloneSvg expects markup that starts with <svg');
  let tag = open[0];
  if (!/\sxmlns\s*=/.test(tag)) tag = tag.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(tag);
  if (!/\swidth\s*=/.test(tag) && vb) tag = tag.replace(/>$/, ` width="${vb[1]}">`);
  if (!/\sheight\s*=/.test(tag) && vb) tag = tag.replace(/>$/, ` height="${vb[2]}">`);
  return `${XML_DECLARATION}\n${tag}${s.slice(open[0].length)}\n`;
}

/**
 * One standalone SVG string per palette for a registry figure.
 * @param {string} figureId key of FIGURES
 * @param {object} caseData the case with optional interp, resolve, revealed, showSchematic (see each figure module)
 * @param {{ width?: number, height?: number, title?: string, description?: string }} [opts]
 * @returns {Record<string, string>} empty when the figure does not exist or the case lacks that test
 */
export function svgVariants(figureId, caseData, opts = {}) {
  const fig = FIGURES[figureId];
  if (!fig) return {};
  const data = fig.dataFor(caseData);
  if (data === null || data === undefined) return {};
  const out = {};
  for (const id of PALETTE_IDS) out[id] = standaloneSvg(fig.render(data, { ...opts, palette: PALETTES[id] }));
  return out;
}

/** Short lowercase code for a case, used in file names: the seed in base 36. */
export function seedCode(caseData) {
  const seed = caseData?.descriptor?.seed;
  return Number.isInteger(seed) && seed >= 0 ? seed.toString(36) : 'case';
}

/** File name such as pft-flow-volume-1x2y3z-dark.svg. */
export function figureFilename(figureId, seedcode, paletteId) {
  const clean = (x) => String(x).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return `pft-${clean(figureId)}-${clean(seedcode)}-${clean(paletteId)}.svg`;
}

/**
 * Start a browser download of an SVG string. Returns false outside a browser.
 * @param {string} filename @param {string} svg
 */
export function downloadSvg(filename, svg) {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return false;
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
