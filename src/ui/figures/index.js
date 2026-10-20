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

export const FIGURES = Object.fromEntries([flowVolume, volumeTime, zStrip, plethShutter, plethRaw, dlcoTrace].map((f) => [f.id, f]));
export const FIGURE_ORDER = ['flow-volume', 'volume-time', 'z-strip', 'pleth-shutter', 'pleth-raw', 'dlco-trace'];
