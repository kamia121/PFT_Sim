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
 */
export const PALETTES = {
  dark: {
    id: 'dark', label: 'Dark panel',
    background: '#0A1311', grid: '#16251F', axis: '#7E918B', text: '#D5E2DE',
    measured: '#5FD0BD', predicted: '#8FA19B', lln: '#A9BCF2', rejected: '#6A7572', second: '#E8B962', third: '#A9BCF2', mark: '#7E918B',
  },
  white: {
    id: 'white', label: 'White panel',
    background: '#FFFFFF', grid: '#E6E9E8', axis: '#56615E', text: '#1C2321',
    measured: '#2F6E66', predicted: '#6B7774', lln: '#0E2B73', rejected: '#9AA3A0', second: '#9A6B12', third: '#0E2B73', mark: '#56615E',
  },
  'transparent-dark-ink': {
    id: 'transparent-dark-ink', label: 'Transparent, dark ink (for light slides)',
    background: null, grid: '#D9DEDC', axis: '#56615E', text: '#1C2321',
    measured: '#2F6E66', predicted: '#6B7774', lln: '#0E2B73', rejected: '#9AA3A0', second: '#9A6B12', third: '#0E2B73', mark: '#56615E',
  },
  'transparent-light-ink': {
    id: 'transparent-light-ink', label: 'Transparent, light ink (for dark slides)',
    background: null, grid: '#3A4744', axis: '#B7C4C0', text: '#E4E9E7',
    measured: '#5FD0BD', predicted: '#B7C4C0', lln: '#A9BCF2', rejected: '#8A9693', second: '#E8B962', third: '#A9BCF2', mark: '#B7C4C0',
  },
};
export const PALETTE_IDS = Object.keys(PALETTES);
export const FONT_STACK = "'Source Sans 3', 'Segoe UI', Arial, Helvetica, sans-serif";
