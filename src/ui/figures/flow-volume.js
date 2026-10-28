/**
 * Flow-volume loop. Exhaled volume (L) on the horizontal axis, flow (L/s) on the vertical axis, expiration up
 * and inspiration down, with 2 L/s drawn as long as 1 L (ATS/ERS 2019; Culver 2017). The drawing code is the one
 * of the spirometry panel (panel-spirometry.js); this figure is the loop alone, for the practice page and for
 * download.
 *
 * Series color encodes the quantity (pre, post), dash style the relation (measured solid, predicted dashed).
 * The end of expiration turns into inspiration through a rounded corner, PEF is marked with an open diamond, and
 * there is no lower-limit loop (the 5th percentiles of PEF, FEF50 and FVC do not occur in one person). When the
 * schematic option is on, the predicted expiratory curve is drawn from the equation-backed predicted FEV1 and FVC
 * (and PEF when a loaded equation gives it) and labeled "predicted, constructed" with the equation named.
 * Rejected maneuvers are muted only when data.revealed is true (or opts.showQuality), so the page does not tell the
 * learner which maneuvers are acceptable before the answers are checked.
 *
 * Views: opts.view 'all' (default: every maneuver overlaid, the best emphasized), 'best', or 'separate' (one small
 * plot per maneuver); opts.selected is a list of 1-based maneuver numbers.
 *
 * caseData fields read by dataFor: spirometry.pre/post, descriptor.seed, revealed (default false),
 * showSchematic and interp (for the constructed predicted curve).
 */
import { TRACE_RENDERING_ATTRS } from '../../core/trace-texture.js';
import { wrapSvg, text, resolvePalette } from './svg.js';
import { spirometryData, chooseShown, loopRanges, loopScale, drawLoop, legendRows, legendItems, tileGrid, SET_LABEL } from './panel-spirometry.js';

const MARGIN = { l: 54, r: 14, t: 14, b: 46 };
const FS = 12;

/** @returns {object|null} */
function dataFor(c, interp) {
  const data = spirometryData(c, interp);
  if (!data) return null;
  const show = !!c.showSchematic && !!(interp ?? c.interp);
  return { ...data, predicted: show ? data.predicted : null, tidal: null };
}

/**
 * Axis ranges and pixel scale. 2 L/s occupies the same length as 1 L. Exported for the aspect-ratio test.
 * @param {object} data
 * @param {number} [W] @param {number} [H]
 * @param {{ drawn?: object[], legendH?: number }} [o] maneuvers that set the ranges (default: all), height reserved for the legend
 */
export function flowVolumeLayout(data, W = 640, H = 480, { drawn, legendH = 0 } = {}) {
  const ms = drawn ?? data.sets.flatMap((s) => s.maneuvers);
  const R = loopRanges(ms, [data.predicted]);
  const box = { x: MARGIN.l, y: MARGIN.t, w: W - MARGIN.l - MARGIN.r, h: H - MARGIN.t - MARGIN.b - legendH };
  const first = loopScale(R, box);
  // Center the plot in the free width.
  const sc = loopScale(R, { ...box, x: box.x + (box.w - first.w) / 2 });
  return { ...sc, plotW: sc.w, plotH: sc.h, x0: sc.x, y0: sc.y };
}

function render(data, opts = {}) {
  const palette = resolvePalette(opts.palette);
  const W = opts.width ?? 640;
  const view = ['best', 'all', 'separate'].includes(opts.view) ? opts.view : 'all';
  const quality = opts.showQuality ?? data.revealed ?? false;
  const shown = chooseShown(data, view, opts.selected);
  const drawn = shown.flatMap((s) => s.items.map((it) => it.m));
  const dData = { palette, shown, view, predicted: data.predicted, tidal: null, quality };
  const items = legendItems(data, shown, view, palette, { quality, tidal: false, tangent: false });
  let g = '', H;

  if (!drawn.length) {
    H = opts.height ?? 120;
    g += text(W / 2, H / 2, 'No maneuver selected', { palette, anchor: 'middle', size: 12, fill: palette.axis });
  } else if (view === 'separate') {
    const R = loopRanges(drawn, [data.predicted]);
    const tiles = shown.flatMap(({ set, items: its }) => its.map((it) => ({ set, it })));
    const grid = tileGrid({
      palette, tiles, W, top: 8, plotH: 130, quality,
      drawPlots: (box, t) => {
        const sc = loopScale(R, { x: box.x + 28, y: box.y, w: Math.min(box.w - 50, 200), h: box.h });
        return `<g data-subplot="flow-volume-${t.set.id}-${t.it.m.number}">${drawLoop(sc, { ...dData, shown: [{ set: t.set, items: [t.it] }] }, { fs: 9.5, titles: false, units: true, labelPef: false })}</g>`;
      },
    });
    g += grid.markup;
    const lg = legendRows(items, 12, 8 + grid.height + 8, W - 24, palette, 12);
    g += lg.markup;
    H = Math.ceil(8 + grid.height + 8 + lg.height + 6);
  } else {
    H = opts.height ?? 480;
    const lg = legendRows(items, MARGIN.l - 30, 0, W - MARGIN.l - MARGIN.r + 30, palette, 12);
    const L = flowVolumeLayout(data, W, H, { drawn, legendH: lg.height + 8 });
    g += `<g data-subplot="flow-volume">${drawLoop(L, dData, { fs: FS })}</g>`;
    g += legendRows(items, MARGIN.l - 30, H - lg.height + 12 - 8, W - MARGIN.l - MARGIN.r + 30, palette, 12).markup;
  }

  const n = data.sets.map((s) => `${s.maneuvers.length} ${SET_LABEL[s.id].toLowerCase()}`).join(' and ');
  const title = opts.title ?? 'Flow-volume loop';
  const description = opts.description ?? `Flow-volume loops of ${n} maneuvers. Exhaled volume in liters on the horizontal axis, flow in liters per second on the vertical axis, expiration up and inspiration down, 2 L/s drawn as long as 1 L.${data.predicted ? ' The dashed predicted expiratory curve is constructed from the predicted FEV1 and FVC.' : ''}`;
  return wrapSvg({ palette, width: W, height: H, title, description, body: g, attrs: TRACE_RENDERING_ATTRS });
}

export default { id: 'flow-volume', title: 'Expiratory and inspiratory flow-volume loop', render, dataFor };
