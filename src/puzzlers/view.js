import { esc } from '../app/format.js';

/** Render the public projection only; the authoring catalog and future stages are never passed here. */
export function renderPuzzler(v) {
  const feedback = v.feedback ? `<section class="pz-feedback" role="status"><h3>${!v.feedback.scored ? 'Source review pending — unscored' : v.feedback.correct ? 'Supported' : 'Reconsider this check'}</h3><p>${esc(v.feedback.why)}</p></section>` : '';
  const sources = v.sources.length ? `<details><summary>Sources and scope</summary><ul>${v.sources.map(([label, url]) => `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a></li>`).join('')}</ul><p>Reference-method evidence does not validate synthetic measurements or establish a diagnosis.</p></details>` : '';
  const scores = v.scores ? `<p>${Object.entries(v.scores).filter(([, s]) => s.total || s.unscored).map(([label, s]) => `${esc(label)}: ${s.correct}/${s.total}${s.unscored ? ` (${s.unscored} unscored)` : ''}`).join(' · ')}</p>` : '';
  return `<h2 id="pz-title" tabindex="-1">${esc(v.title)}</h2><p>${esc(v.intro)}</p>
    <div class="pz-workspace"><section class="card"><h3>Measured values</h3><table><caption>Same study, both reports</caption><thead><tr><th scope="col">Index</th><th scope="col">Measured</th><th scope="col">Unit</th></tr></thead><tbody>${v.measurements.map((m) => `<tr><th scope="row">${esc(m.label)}</th><td>${esc(m.value)}</td><td>${esc(m.unit)}</td></tr>`).join('')}</tbody></table>
    <h3>Available context</h3>${v.reveals.map((text) => `<p>${esc(text)}</p>`).join('')}</section>
    <section class="card"><p>Step ${v.stage} of ${v.stageCount}</p><form id="pz-form"><fieldset><legend>${esc(v.question.prompt)}</legend>${v.question.options.map(([id, label]) => `<label class="pz-option"><input type="radio" name="answer" value="${esc(id)}" ${v.feedback ? 'disabled' : ''} ${v.feedback?.answer === id ? 'checked' : ''}> ${esc(label)}</label>`).join('')}</fieldset>${v.feedback ? '' : '<button class="primary" type="submit">Check this answer</button>'}</form>
    ${feedback}${scores}${v.feedback && !v.complete ? '<button class="primary" id="pz-next" type="button">Reveal next context</button>' : ''}${v.complete ? '<p>Case complete.</p>' : ''}${sources}<button id="pz-restart" class="secondary" type="button">Restart case</button></section></div>`;
}
