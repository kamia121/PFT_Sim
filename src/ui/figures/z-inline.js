/**
 * Miniature z-score graphic for a table cell (ATS 2017 standardized report: a z-score strip beside each row).
 * `zInline(measure, { z, lln, uln }, { palette, width, height })` returns one self-contained `<svg>` element
 * sized width by height with a viewBox, so the string can be inserted into an HTML table cell as it is.
 *
 * The axis runs from z = -5 to +3. The result is a star; the lower limit of normal (z = -1.645) is dotted,
 * the predicted value (z = 0) is dashed, and the upper limit of normal (z = +1.645) is dotted and drawn only
 * when `uln` is given, i.e. for an index that is read on both sides (TLC, RV, RV/TLC, DLCO, KCO). `lln` and
 * `uln` are the limits in the units of the measure; only their presence matters for the drawing, because
 * the axis is in z-score units. Nothing is shaded; a z-score outside the axis is drawn at the edge with a
 * hollow star. Colors come only from the palette passed in (default: white panel).
 *
 * Also exports `starPoints`, used by the full z-score strip so both use the same marker.
 */
import { PALETTES } from '../palettes.js';
import { LLN_Z } from '../../interpret/interpret.js';
import { esc, fix } from './svg.js';

export const Z_AXIS = { min: -5, max: 3 };
const rnd = (x) => String(Math.round(x * 100) / 100);

/** Vertices of a five-point star as an SVG `points` string. */
export function starPoints(cx, cy, outer, inner = outer * 0.42) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${rnd(cx + r * Math.cos(a))},${rnd(cy + r * Math.sin(a))}`);
  }
  return pts.join(' ');
}

/** Star element: filled with the series color, or hollow when the value lies outside the axis. */
export function starEl(cx, cy, outer, color, { hollow = false } = {}) {
  return hollow
    ? `<polygon points="${starPoints(cx, cy, outer)}" fill="none" stroke="${color}" stroke-width="1.3" stroke-linejoin="round"/>`
    : `<polygon points="${starPoints(cx, cy, outer)}" fill="${color}" stroke="${color}" stroke-width="0.8" stroke-linejoin="round"/>`;
}

const finite = (x, fallback, lo) => (Number.isFinite(x) && x > 0 ? Math.max(lo, Math.round(x)) : fallback);

/**
 * @param {string} measure name of the index, used only in the accessible title (escaped)
 * @param {{ z: number, lln?: number|null, uln?: number|null }} v z-score of the result; `uln` present for a two-sided index
 * @param {{ palette?: object|string, width?: number, height?: number }} [o]
 * @returns {string} an `<svg>` element
 */
export function zInline(measure, { z, uln } = {}, { palette, width = 84, height = 14 } = {}) {
  const pal = (typeof palette === 'string' ? PALETTES[palette] : palette) ?? PALETTES.white;
  const W = finite(width, 84, 24), H = finite(height, 14, 8);
  const R = Math.min(H / 2 - 0.8, 6.5);
  const padX = R + 1;
  const sx = (v) => padX + ((v - Z_AXIS.min) / (Z_AXIS.max - Z_AXIS.min)) * (W - 2 * padX);
  const cy = H / 2;
  const twoSided = uln !== undefined && uln !== null && uln !== false;
  const has = Number.isFinite(z);
  const name = String(measure ?? '');
  const where = !has ? 'not available' : z < LLN_Z ? 'below the lower limit of normal' : twoSided && z > -LLN_Z ? 'above the upper limit of normal' : 'within limits';
  const title = has ? `${name} z-score ${fix(z, 2)}, ${where}` : `${name} z-score not available`;
  const desc = `Miniature z-score axis from ${Z_AXIS.min} to ${Z_AXIS.max} with the lower limit of normal at ${LLN_Z}, the predicted value at 0${twoSided ? ' and the upper limit of normal at +1.645' : ''}.`;
  let g = '';
  if (pal.background) g += `<rect x="0" y="0" width="${W}" height="${H}" rx="2" fill="${pal.background}"/>`;
  g += `<line x1="${rnd(sx(Z_AXIS.min))}" y1="${rnd(cy)}" x2="${rnd(sx(Z_AXIS.max))}" y2="${rnd(cy)}" stroke="${pal.axis}" stroke-width="0.8"/>`;
  g += `<line x1="${rnd(sx(0))}" y1="1" x2="${rnd(sx(0))}" y2="${H - 1}" stroke="${pal.predicted}" stroke-width="1.2" stroke-dasharray="3 2"/>`;
  g += `<line x1="${rnd(sx(LLN_Z))}" y1="1" x2="${rnd(sx(LLN_Z))}" y2="${H - 1}" stroke="${pal.lln}" stroke-width="1.2" stroke-dasharray="1 2"/>`;
  if (twoSided) g += `<line x1="${rnd(sx(-LLN_Z))}" y1="1" x2="${rnd(sx(-LLN_Z))}" y2="${H - 1}" stroke="${pal.lln}" stroke-width="1.2" stroke-dasharray="1 2"/>`;
  if (has) {
    const off = z < Z_AXIS.min || z > Z_AXIS.max;
    g += starEl(sx(Math.min(Math.max(z, Z_AXIS.min), Z_AXIS.max)), cy, R, pal.measured, { hollow: off });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"><title>${esc(title)}</title><desc>${esc(desc)}</desc>${g}</svg>`;
}

export default zInline;
