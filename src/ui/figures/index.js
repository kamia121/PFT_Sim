/**
 * Figure registry. Each entry is { id, title, render(data, { palette, width, height, title, description }), dataFor(caseData) }.
 * dataFor returns null when the case lacks the test. See docs/ARCHITECTURE-NEXT.md.
 */
import flowVolume from './flow-volume.js';
import volumeTime from './volume-time.js';
import zStrip from './z-strip.js';
import plethShutter from './pleth-shutter.js';
import plethRaw from './pleth-raw.js';
import dlcoTrace from './dlco-trace.js';
import panelSpirometry from './panel-spirometry.js';
import panelPleth from './panel-pleth.js';
import panelDlco from './panel-dlco.js';

export const FIGURES = Object.fromEntries([panelSpirometry, panelPleth, panelDlco, flowVolume, volumeTime, zStrip, plethShutter, plethRaw, dlcoTrace].map((f) => [f.id, f]));
/** Combined panels first (they are what a laboratory report shows), then the stand-alone plots they are built from. */
export const PANEL_IDS = ['panel-spirometry', 'panel-pleth', 'panel-dlco'];
export const FIGURE_ORDER = [...PANEL_IDS, 'z-strip', 'flow-volume', 'volume-time', 'pleth-shutter', 'pleth-raw', 'dlco-trace'];
