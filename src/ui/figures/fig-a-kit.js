/**
 * Small SVG toolkit shared by the plethysmography and DLCO figures. Every color comes from the palette
 * passed to the figure and is written as an inline attribute; nothing here refers to CSS variables,
 * external files or fonts other than the palette font stack.
 */
import { FONT_STACK } from '../palettes.js';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const num = (x, dp = 2) => (Number.isFinite(x) ? x.toFixed(dp) : '');
const r2 = (x) => Math.round(x * 100) / 100;

/** Linear scale from the data interval to the pixel interval. */
export const scale = (d0, d1, p0, p1) => (v) => p0 + ((v - d0) / (d1 - d0)) * (p1 - p0);

/** Round tick positions covering [lo, hi]. */
export function niceTicks(lo, hi, target = 5) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}
const decimalsFor = (ticks) => {
  const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
  return step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step) - 1e-9));
};

/** Root element with title, description and optional background. */
export function open({ width, height, title, description, palette }) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" font-family="${esc(FONT_STACK)}" font-size="11">`,
    `<title>${esc(title)}</title>`,
    `<desc>${esc(description)}</desc>`,
    palette.background ? `<rect x="0" y="0" width="${width}" height="${height}" fill="${palette.background}"/>` : '',
  ].join('');
}
export const close = () => '</svg>';

export function text(x, y, str, { size = 11, anchor = 'start', fill, weight = 400, rotate = 0, italic = false, opacity = 1 } = {}) {
  const tr = rotate ? ` transform="rotate(${rotate} ${r2(x)} ${r2(y)})"` : '';
  return `<text x="${r2(x)}" y="${r2(y)}" font-size="${size}" text-anchor="${anchor}" fill="${fill}" font-weight="${weight}"${italic ? ' font-style="italic"' : ''}${opacity < 1 ? ` opacity="${opacity}"` : ''}${tr}>${esc(str)}</text>`;
}

export function line(x1, y1, x2, y2, { stroke, width = 1, dash = '', opacity = 1 } = {}) {
  return `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}${opacity < 1 ? ` stroke-opacity="${opacity}"` : ''}/>`;
}

export function rect(x, y, w, h, { fill = 'none', stroke = 'none', width = 1, opacity = 1 } = {}) {
  return `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="${fill}"${fill !== 'none' && opacity < 1 ? ` fill-opacity="${opacity}"` : ''} stroke="${stroke}" stroke-width="${width}"/>`;
}

export function polyline(points, { stroke, width = 1.5, dash = '', opacity = 1 } = {}) {
  if (points.length < 2) return '';
  const pts = points.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');
  return `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}${opacity < 1 ? ` stroke-opacity="${opacity}"` : ''}/>`;
}

/**
 * Plot frame with grid, ticks and axis labels.
 * @returns {string} svg markup; the caller supplies the scales it passed in.
 */
export function frame({ x0, y0, w, h, xs, ys, xRange, yRange, xTicks, yTicks, xLabel, yLabel, palette, xFmt, yFmt, zeroLines = false }) {
  const out = [];
  const xt = xTicks ?? niceTicks(xRange[0], xRange[1], 5);
  const yt = yTicks ?? niceTicks(yRange[0], yRange[1], 5);
  const xd = decimalsFor(xt), yd = decimalsFor(yt);
  for (const v of xt) out.push(line(xs(v), y0, xs(v), y0 + h, { stroke: palette.grid, width: 1 }));
  for (const v of yt) out.push(line(x0, ys(v), x0 + w, ys(v), { stroke: palette.grid, width: 1 }));
  if (zeroLines) {
    if (xRange[0] < 0 && xRange[1] > 0) out.push(line(xs(0), y0, xs(0), y0 + h, { stroke: palette.axis, width: 1, opacity: 0.7 }));
    if (yRange[0] < 0 && yRange[1] > 0) out.push(line(x0, ys(0), x0 + w, ys(0), { stroke: palette.axis, width: 1, opacity: 0.7 }));
  }
  out.push(rect(x0, y0, w, h, { stroke: palette.axis, width: 1 }));
  for (const v of xt) out.push(text(xs(v), y0 + h + 13, xFmt ? xFmt(v) : num(v, xd), { size: 10, anchor: 'middle', fill: palette.axis }));
  for (const v of yt) out.push(text(x0 - 5, ys(v) + 3.5, yFmt ? yFmt(v) : num(v, yd), { size: 10, anchor: 'end', fill: palette.axis }));
  if (xLabel) out.push(text(x0 + w / 2, y0 + h + 30, xLabel, { size: 11, anchor: 'middle', fill: palette.text }));
  if (yLabel) out.push(text(x0 - 36, y0 + h / 2, yLabel, { size: 11, anchor: 'middle', fill: palette.text, rotate: -90 }));
  return out.join('');
}

/** A legend row item: swatch line then label. Returns [markup, width]. */
export function legendItem(x, y, label, { stroke, dash = '', width = 2, palette }) {
  const labelWidth = label.length * 5.6;
  return [
    line(x, y - 3.5, x + 20, y - 3.5, { stroke, width, dash }) + text(x + 25, y, label, { size: 10.5, fill: palette.text }),
    25 + labelWidth + 14,
  ];
}
