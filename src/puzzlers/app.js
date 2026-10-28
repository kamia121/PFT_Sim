import { PUZZLERS, findPuzzler } from './catalog.js';
import { startPuzzler, puzzlerView, answerPuzzler, advancePuzzler } from './session.js';
import { renderPuzzler } from './view.js';

const select = document.querySelector('#puzzler-case'), root = document.querySelector('#puzzler');
for (const c of PUZZLERS) { const option = document.createElement('option'); option.value = c.id; option.textContent = c.title; select.append(option); }
let caseData, state;
function render(focus = false) {
  root.innerHTML = renderPuzzler(puzzlerView(caseData, state));
  if (focus) root.querySelector('#pz-title').focus();
}
function choose(id, updateUrl = true) {
  caseData = findPuzzler(id); state = startPuzzler(caseData); select.value = id;
  if (updateUrl) { const url = new URL(location.href); url.search = `?pz=${id}@${caseData.version}`; history.replaceState(null, '', url); }
  render();
}
try {
  const params = new URLSearchParams(location.search), token = params.get('pz');
  if ([...params.keys()].some((key) => key !== 'pz') || params.getAll('pz').length > 1) throw new Error('Use a case puzzler link with only one pz parameter.');
  if (token) {
    const [id, version, extra] = token.split('@'), c = findPuzzler(id);
    if (extra || version !== String(c.version)) throw new Error('This case version is unavailable. Select a case to restart.');
    choose(id, false);
  } else choose(PUZZLERS[0].id);
} catch (error) { root.textContent = error.message; }

select.addEventListener('change', () => choose(select.value));
root.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = root.querySelector('input[name="answer"]:checked');
  if (!input) { root.querySelector('input[name="answer"]').focus(); return; }
  state = answerPuzzler(caseData, state, input.value); render();
  root.querySelector('.pz-feedback').setAttribute('tabindex', '-1'); root.querySelector('.pz-feedback').focus();
});
root.addEventListener('click', (event) => {
  if (event.target.id === 'pz-next') { state = advancePuzzler(caseData, state); render(true); }
  if (event.target.id === 'pz-restart') { state = startPuzzler(caseData); render(true); }
});
