/**
 * The single place where the quiz imports modules that other threads deliver later. Each import is a
 * dynamic import() inside try/catch, so the quiz runs on the built-in fallbacks now and uses the
 * real modules as soon as they exist, with no change to the quiz.
 *
 * Contracts assumed (docs/ARCHITECTURE-NEXT.md):
 *   src/scenarios/index.js            presence only; the case itself carries `case.scenario`
 *                                     { level, ids, statements[{id,category,text}], technologistComments[], caveats[{id,text,weight}],
 *                                       decoyCaveats[{id,text}], preTest, height{statedCm,trueCm,source,note}, referenceSex{used,birth,note}, coHbPercent }
 *                                     and buildCase() accepts `scenario: 'none'|'light'|'moderate'|'heavy'` in its input
 *   src/interpret/narrative.js        export composeNarrative({ caseData, interp, cmp, seed }) ->
 *                                     { sections, finalStatement, findings, distractors: [{ id, text, flaw }] }
 *   src/ui/figures/index.js           exports FIGURES (id -> { id, title, render(data, opts), dataFor(caseData) }) and FIGURE_ORDER
 */

/** What the quiz uses when no optional module is present. */
export const NO_ADAPTERS = Object.freeze({ scenarios: null, composeNarrative: null, figures: null, palettes: null, status: Object.freeze({ scenarios: false, narrative: false, figures: 0 }) });

const defaultImporter = (spec) => {
  switch (spec) {
    case 'scenarios': return import('../scenarios/index.js');
    case 'narrative': return import('../interpret/narrative.js');
    case 'figures': return import('../ui/figures/index.js');
    case 'palettes': return import('../ui/palettes.js');
    default: throw new Error(`unknown optional module: ${spec}`);
  }
};

/**
 * @param {(spec: 'scenarios'|'narrative'|'figures'|'palettes') => Promise<object>} [importer] replaced in tests
 */
export async function loadAdapters(importer = defaultImporter) {
  const attempt = async (spec) => { try { return await importer(spec); } catch { return null; } };
  const [scenarios, narrative, figures, palettes] = await Promise.all(['scenarios', 'narrative', 'figures', 'palettes'].map(attempt));
  const compose = typeof narrative?.composeNarrative === 'function' ? narrative.composeNarrative : null;
  const registry = figures?.FIGURES && typeof figures.FIGURES === 'object' ? { FIGURES: figures.FIGURES, FIGURE_ORDER: Array.isArray(figures.FIGURE_ORDER) ? figures.FIGURE_ORDER : Object.keys(figures.FIGURES) } : null;
  return {
    scenarios: scenarios ?? null,
    composeNarrative: compose,
    figures: registry,
    palettes: palettes?.PALETTES ?? null,
    status: { scenarios: Boolean(scenarios), narrative: Boolean(compose), figures: registry ? registry.FIGURE_ORDER.length : 0 },
  };
}

/**
 * Fields added to a descriptor to request a scenario level. Sent only when the scenario module is
 * present, so a build without it never sees an unknown field.
 */
export function descriptorExtras(adapters, level) {
  return adapters?.scenarios && level && level !== 'none' ? { scenario: level } : {};
}

/**
 * Narrative for a case, or null when the module is absent, throws, or returns an unusable shape.
 * @returns {{ finalStatement: string, distractors: { id: string, text: string, flaw?: string }[] } | null}
 */
export function narrativeFor(adapters, args) {
  if (!adapters?.composeNarrative) return null;
  try {
    const n = adapters.composeNarrative(args);
    if (!n || typeof n.finalStatement !== 'string' || !n.finalStatement.trim() || !Array.isArray(n.distractors)) return null;
    const distractors = n.distractors.filter((d) => d && typeof d.text === 'string' && d.text.trim() && d.text !== n.finalStatement);
    return { finalStatement: n.finalStatement, distractors, sections: n.sections ?? [] };
  } catch {
    return null;
  }
}

/**
 * Figures that exist for this case: [{ id, title, svg }] in registry order. Placeholders that return
 * null data or an empty string are skipped.
 */
export function figuresFor(adapters, caseData, paletteId = 'dark') {
  const out = [];
  const reg = adapters?.figures;
  const palette = adapters?.palettes?.[paletteId];
  if (!reg || !palette) return out;
  for (const id of reg.FIGURE_ORDER) {
    const f = reg.FIGURES[id];
    if (!f || typeof f.render !== 'function' || typeof f.dataFor !== 'function') continue;
    try {
      const data = f.dataFor(caseData);
      if (data === null || data === undefined) continue;
      const svg = f.render(data, { palette });
      if (typeof svg === 'string' && svg.trim()) out.push({ id, title: f.title ?? id, svg });
    } catch { /* a figure that fails is left out; the table carries the numbers */ }
  }
  return out;
}
