import { loadDatasets } from '../src/reference/load.js';
import { createReference } from '../src/reference/gli.js';
import { buildCase } from '../src/core/case.js';
import { interpret } from '../src/interpret/interpret.js';
import { buildReportModel } from '../src/report/model.js';

export const ds = await loadDatasets();
export const { resolveReference } = createReference(ds);

export function makeModel(input, options = {}) {
  const c = buildCase({ technique: 'fair', ...input }, ds);
  const equation = options.equation ?? 'GLIglobal';
  const interp = interpret(c.report, resolveReference, equation);
  return { c, interp, model: buildReportModel(c, interp, { resolve: resolveReference, equation, ...options }) };
}

/** Cases that between them cover post-bronchodilator and spirometry-only reports. */
export const SAMPLE_INPUTS = [
  { seed: 12, archetype: 'obstruction' },
  { seed: 5, archetype: 'normal' },
  { seed: 31, archetype: 'restriction-parenchymal' },
  { seed: 8, archetype: 'bd-discordant', technique: 'poor' },
  { seed: 44, archetype: 'mixed', panel: 'spirometry' },
  { seed: 90, archetype: 'anemia', group: 'Black or African American' },
];

/** Minimal RFC 4180 reader for the exported CSV text. */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\r') { /* skip */ } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export const isNumeric = (s) => /^[+-]?\d+(\.\d+)?$/.test(s);
