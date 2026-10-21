/**
 * Explicit color sets for exported figures. Exported SVGs are self-contained, so they cannot rely on the
 * CSS variables used on the page; every figure function takes one of these palettes and writes colors
 * as inline attributes. `background: null` produces a transparent SVG.
 *
 * Series keys are shared by every figure so a series keeps its meaning across figures:
 *   measured   the patient's data (current maneuver or tracing)
 *   predicted  reference value (dashed)
 *   lln        lower limit of normal (dotted)
 *   rejected   maneuvers or tests that failed quality rules
 *   second     a second quantity in the same panel (for example the tracer gas against CO)
 *   third      a third quantity (for example a volume trace)
 *   mark       annotation lines and labels
 *
 * The z-score graphic in the ATS 2017 style (z-strip.js, style 'ats') adds three keys, which carry the colors of
 * the --z-severe, --z-moderate, --z-mild and --z-ok tokens (the one place where a fill carries a flag, recorded
 * in CLAUDE.md):
 *   zBand      gradient colors at the severity boundaries: severe (z below -4.0), moderate (-4.0 to -2.5), mild
 *              (-2.5 to the LLN) and ok (above the LLN)
 *   zBandAlpha fill opacity of the bands (1 on an opaque panel; below 1 on the transparent palettes, whose bands
 *              must read on a light and on a dark page)
 *   zStar      fill and halo of the result star and of the reference lines; the halo separates the star from every
 *              band color, and the star and the words beside the bar carry the meaning without the color
 */
export const PALETTES = {
  dark: {
    id: 'dark', label: 'Dark panel',
    background: '#0A1311', grid: '#16251F', axis: '#7E918B', text: '#D5E2DE',
    measured: '#5FD0BD', predicted: '#8FA19B', lln: '#A9BCF2', rejected: '#6A7572', second: '#E8B962', third: '#A9BCF2', mark: '#7E918B',
    zBand: { severe: '#B5432F', moderate: '#C27A2C', mild: '#B79D2F', ok: '#3E7F63' }, zBandAlpha: 1,
    zStar: { fill: '#D5E2DE', halo: '#0A1311' },
  },
  white: {
    id: 'white', label: 'White panel',
    background: '#FFFFFF', grid: '#E6E9E8', axis: '#56615E', text: '#1C2321',
    measured: '#2F6E66', predicted: '#6B7774', lln: '#0E2B73', rejected: '#9AA3A0', second: '#9A6B12', third: '#0E2B73', mark: '#56615E',
    zBand: { severe: '#C8553D', moderate: '#E8A04C', mild: '#F2D95C', ok: '#CFE8CC' }, zBandAlpha: 1,
    zStar: { fill: '#1C2321', halo: '#FFFFFF' },
  },
  'transparent-dark-ink': {
    id: 'transparent-dark-ink', label: 'Transparent, dark ink (for light slides)',
    background: null, grid: '#D9DEDC', axis: '#56615E', text: '#1C2321',
    measured: '#2F6E66', predicted: '#6B7774', lln: '#0E2B73', rejected: '#9AA3A0', second: '#9A6B12', third: '#0E2B73', mark: '#56615E',
    zBand: { severe: '#D0543A', moderate: '#E59A33', mild: '#E8CB4A', ok: '#7DBF8E' }, zBandAlpha: 0.75,
    zStar: { fill: '#1C2321', halo: '#FFFFFF' },
  },
  'transparent-light-ink': {
    id: 'transparent-light-ink', label: 'Transparent, light ink (for dark slides)',
    background: null, grid: '#3A4744', axis: '#B7C4C0', text: '#E4E9E7',
    measured: '#5FD0BD', predicted: '#B7C4C0', lln: '#A9BCF2', rejected: '#8A9693', second: '#E8B962', third: '#A9BCF2', mark: '#B7C4C0',
    zBand: { severe: '#D0543A', moderate: '#E59A33', mild: '#E8CB4A', ok: '#7DBF8E' }, zBandAlpha: 0.75,
    zStar: { fill: '#E4E9E7', halo: '#0A1311' },
  },
};
export const PALETTE_IDS = Object.keys(PALETTES);
export const FONT_STACK = "'Source Sans 3', 'Segoe UI', Arial, Helvetica, sans-serif";
