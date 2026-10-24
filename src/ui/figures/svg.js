/**
 * Small helpers shared by the figure modules: escaping, number formatting, axis ticks and the SVG wrapper.
 * Colors are always written as inline attributes taken from a palette; there are no CSS variables, classes
 * that carry style, or external references in the output.
 */
import { PALETTES, FONT_STACK } from '../palettes.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Number to at most `dp` decimals without trailing zeros; minus sign as given by toString. */
export const r1 = (x) => String(Math.round(x * 10) / 10);
export const r2 = (x) => String(Math.round(x * 100) / 100);
export const fix = (x, dp) => x.toFixed(dp).replace('-', '−');

export const resolvePalette = (p) => (typeof p === 'string' ? PALETTES[p] : p) ?? PALETTES.dark;

/** Tick values from lo to hi (inclusive) at a fixed step. */
export function tickValues(lo, hi, step) {
  const out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** Smallest of 1, 2, 5 times a power of ten that is at least raw. */
export function niceStep(raw) {
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 5, 10].map((s) => s * mag).find((s) => s >= raw - 1e-12);
}

/** Polyline path through points already in pixels. */
export function pathD(points) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`).join('');
}

export function text(x, y, s, { palette, anchor = 'start', size = 12, fill, weight, rotate, italic } = {}) {
  const color = fill ?? palette.text;
  const rot = rotate ? ` transform="rotate(${rotate} ${r1(x)} ${r1(y)})"` : '';
  return `<text x="${r1(x)}" y="${r1(y)}" font-family="${FONT_STACK}" font-size="${size}" fill="${color}" text-anchor="${anchor}"${weight ? ` font-weight="${weight}"` : ''}${italic ? ' font-style="italic"' : ''}${rot}>${esc(s)}</text>`;
}

export function line(x1, y1, x2, y2, { stroke, width = 1, dash } = {}) {
  return `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

export function pathEl(d, { stroke, width = 1.8, dash, fill = 'none' } = {}) {
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

/** Dash patterns: dash style encodes the relation (measured solid, predicted dashed, LLN dotted). */
export const DASH = { measured: undefined, predicted: '7 5', lln: '2 4', mark: '4 4' };

/**
 * Complete standalone <svg>. `palette.background === null` writes no background rectangle.
 * @param {{ palette: object, width: number, height: number, title: string, description: string, body: string }} p
 */
export function wrapSvg({ palette, width, height, title, description, body, attrs = {} }) {
  const bg = palette.background ? `<rect x="0" y="0" width="${width}" height="${height}" rx="6" fill="${palette.background}"/>` : '';
  const extra = Object.entries(attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="fig" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"${extra}>`
    + `<title>${esc(title)}</title><desc>${esc(description)}</desc>${bg}${body}</svg>`;
}

/** Legend rows drawn as short line samples with labels. Returns markup and the height used. */
export function legendRows(items, x, y, palette, { rowHeight = 18, sample = 26 } = {}) {
  let out = '';
  items.forEach((it, i) => {
    const yy = y + i * rowHeight;
    out += line(x, yy - 4, x + sample, yy - 4, { stroke: it.color, width: it.width ?? 2, dash: it.dash });
    out += text(x + sample + 7, yy, it.label, { palette, size: 12 });
  });
  return out;
}

/**
 * Legend laid out in rows that wrap at maxWidth. Item width is estimated from the label length (12 px text).
 * @returns {{ markup: string, rows: number }}
 */
export function legendFlow(items, x, y, maxWidth, palette, { rowHeight = 18, sample = 26 } = {}) {
  let out = '', cx = 0, row = 0;
  for (const it of items) {
    const w = sample + 7 + it.label.length * 6.3 + 18;
    if (cx > 0 && cx + w > maxWidth) { cx = 0; row++; }
    const yy = y + row * rowHeight;
    out += line(x + cx, yy - 4, x + cx + sample, yy - 4, { stroke: it.color, width: it.width ?? 2, dash: it.dash });
    out += text(x + cx + sample + 7, yy, it.label, { palette, size: 12 });
    cx += w;
  }
  return { markup: out, rows: row + 1 };
}
