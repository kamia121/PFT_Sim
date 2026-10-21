/**
 * View state and controls of the panels that can separate their maneuvers or trials (the spirometry panel and the plethysmography
 * panel). Shared by the card view of the practice page (src/app/render.js) and the details sheet (src/sheets/details.js), so that a
 * panel is controlled the same way wherever it is drawn. The controls are plain inputs carrying `data-fig-view` and `data-fig-chip`;
 * the page owns the state and redraws on change.
 */

export const VIEW_LABELS = [['best', 'Best'], ['all', 'Overlay'], ['separate', 'Separate']];

/** Number of maneuvers or trials a panel can separate; 0 when it has nothing to separate. */
export function separableCount(id, c) {
  if (id === 'panel-spirometry') return Math.max(c.spirometry.pre.maneuvers.length, c.spirometry.post?.maneuvers.length ?? 0);
  if (id === 'panel-pleth') return c.pleth?.trials?.length ?? 0;
  return 0;
}

/**
 * The view state of a panel: `fallback` ('best' for the cards) unless the learner chose one, every maneuver selected unless a selection was made.
 * @param {string} id @param {number} n @param {Record<string, { view?: string, selected?: number[] }>} [figView]
 * @param {string} [fallback]
 */
export function figureView(id, n, figView = {}, fallback = 'best') {
  const v = figView?.[id] ?? {};
  return { view: VIEW_LABELS.some(([k]) => k === v.view) ? v.view : fallback, selected: (v.selected ?? Array.from({ length: n }, (_, i) => i + 1)).filter((k) => k >= 1 && k <= n) };
}

/** The numbered chips of a panel: real checkboxes in a labelled group of their own, absent in the best view. Redrawn on their own when the view changes. */
export function chipsHtml(id, n, view) {
  if (view.view === 'best') return '';
  const noun = id === 'panel-pleth' ? 'trial' : 'maneuver';
  const chips = Array.from({ length: n }, (_, i) => `<label class="chip"><input type="checkbox" data-fig-chip="${id}" value="${i + 1}" ${view.selected.includes(i + 1) ? 'checked' : ''}><span class="visually-hidden">${noun} </span>${i + 1}</label>`).join('');
  return `<fieldset class="chips" data-fig-chips="${id}"><legend class="muted">${noun === 'trial' ? 'Trials' : 'Maneuvers'} drawn</legend>${chips}</fieldset>`;
}

/**
 * View switch and numbered chips for a panel with several maneuvers or trials. The radios and the chips are separate labelled groups, so that
 * the page can redraw the figure (and the chips) in place and leave the radio the learner is using untouched.
 */
export function viewControls(id, n, view) {
  const noun = id === 'panel-pleth' ? 'trial' : 'maneuver';
  const radios = VIEW_LABELS.map(([v, l]) => `<label><input type="radio" name="fv-${id}" data-fig-view="${id}" value="${v}" ${view.view === v ? 'checked' : ''}> ${l}</label>`).join(' ');
  return `<div class="fig-view no-print" data-fig-controls="${id}"><fieldset class="fv-radios"><legend class="muted">${noun === 'trial' ? 'Panting trials' : 'Maneuvers'} shown as</legend>${radios}</fieldset>${chipsHtml(id, n, view)}</div>`;
}
