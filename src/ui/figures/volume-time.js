/**
 * Volume-time curve of the best maneuver (or of the selected maneuvers). The record starts 1 s before time zero,
 * the back-extrapolated start of the forced expiration, with the volume held at 0 (total lung capacity); there is no
 * pre-test wave. Exhaled volume is measured from total lung capacity, so the FVC is the highest point. A short tick at
 * t = 1 s marks the FEV1 position (no dots, no drop lines, no values) and the tangent at peak flow is drawn from time
 * zero to just past the peak. The back-extrapolated volume and the volume change over the last second (the
 * end-of-forced-expiration plateau) are written under the plot, outside the curves. When a post-bronchodilator set
 * exists its best maneuver is overlaid, aligned at its own time zero. The dashed line is the predicted FVC from the
 * reference equation when the schematic option is on.
 *
 * Views: opts.view 'best' (default), 'all' (every selected maneuver, the best emphasized, numbered at the end of the
 * trace) or 'separate' (one small plot per maneuver); opts.selected is a list of 1-based maneuver numbers.
 *
 * caseData fields read by dataFor: spirometry.pre/post, descriptor.seed, revealed, showSchematic and interp. The best
 * maneuver is chosen as in the maneuver table (acceptable first, then the larger FVC + FEV1).
 */
import { TRACE_RENDERING_ATTRS } from '../../core/trace-texture.js';
import { wrapSvg, text, resolvePalette } from './svg.js';
import { spirometryData, chooseShown, vtRanges, drawVolumeTime, legendRows, legendItems, tileGrid, noteLines } from './panel-spirometry.js';

const MARGIN = { l: 54, r: 60, t: 16, b: 46 };
const FS = 12;

function dataFor(c, interp) {
  const data = spirometryData(c, interp);
  if (!data) return null;
  const show = !!c.showSchematic && !!(interp ?? c.interp);
  // The best maneuver's fields are also given on the set itself (t, v, fev1, fvc, ... ), as before the views existed.
  const sets = data.sets.map((s) => ({ ...s.maneuvers[s.best], ...s, index: s.best }));
  return { ...data, sets, predicted: show ? data.predicted : null, tidal: null };
}

function render(data, opts = {}) {
  const palette = resolvePalette(opts.palette);
  const W = opts.width ?? 640;
  const view = ['best', 'all', 'separate'].includes(opts.view) ? opts.view : 'best';
  const quality = opts.showQuality ?? data.revealed ?? false;
  const shown = chooseShown(data, view, opts.selected);
  const drawn = shown.flatMap((s) => s.items.map((it) => it.m));
  const dData = { palette, shown, view, predicted: data.predicted, quality };
  const items = legendItems(data, shown, view, palette, { quality, tidal: false, tangent: view !== 'separate' });
  let g = '', H;

  if (!drawn.length) {
    H = opts.height ?? 120;
    g += text(W / 2, H / 2, 'No maneuver selected', { palette, anchor: 'middle', size: 12, fill: palette.axis });
  } else if (view === 'separate') {
    const VR = vtRanges(drawn, data.predicted?.fvc ?? 0);
    const tiles = shown.flatMap(({ set, items: its }) => its.map((it) => ({ set, it })));
    const grid = tileGrid({
      palette, tiles, W, top: 8, plotH: 130, quality,
      drawPlots: (box, t) => {
        const vt = { x: box.x + 28, y: box.y, w: box.w - 28 - 18, h: box.h, ...VR };
        return `<g data-subplot="volume-time-${t.set.id}-${t.it.m.number}">${drawVolumeTime(vt, { ...dData, shown: [{ set: t.set, items: [t.it] }] }, { fs: 9.5, titles: false, units: true })}</g>`;
      },
    });
    g += grid.markup;
    const lg = legendRows(items, 12, 8 + grid.height + 8, W - 24, palette, 12);
    g += lg.markup;
    H = Math.ceil(8 + grid.height + 8 + lg.height + 6);
  } else {
    H = opts.height ?? 400;
    const notes = noteLines(shown, view);
    const lg = legendRows(items, MARGIN.l - 30, 0, W - MARGIN.l - 14 + 30, palette, 12);
    const bottom = MARGIN.b + notes.length * 16 + 8 + lg.height;
    const VR = vtRanges(drawn, data.predicted?.fvc ?? 0);
    const vt = { x: MARGIN.l, y: MARGIN.t, w: W - MARGIN.l - MARGIN.r, h: H - MARGIN.t - bottom, ...VR };
    g += `<g data-subplot="volume-time">${drawVolumeTime(vt, dData, { fs: FS, tangent: true, numbers: view === 'all' && drawn.length > 1 })}</g>`;
    const ny = vt.y + vt.h + MARGIN.b + 4;
    notes.forEach((n, i) => { g += text(MARGIN.l, ny + i * 16, n, { palette, size: 12, fill: palette.axis }); });
    g += legendRows(items, MARGIN.l - 30, ny + notes.length * 16 + 6 + 8, W - MARGIN.l - 14 + 30, palette, 12).markup;
  }

  const title = opts.title ?? 'Volume-time curve';
  const description = opts.description ?? `Exhaled volume in liters against time in seconds for the ${view === 'best' ? 'best maneuver' : 'selected maneuvers'}${data.sets.length > 1 ? ' before and after bronchodilator' : ''}, from 1 s before the back-extrapolated start of the forced expiration. FEV1 is marked by a tick one second after time zero.`;
  return wrapSvg({ palette, width: W, height: H, title, description, body: g, attrs: TRACE_RENDERING_ATTRS });
}

export default { id: 'volume-time', title: 'Volume-time curve', render, dataFor };
