/**
 * Markup of the written-impression feedback. Every string that came from the trainee (quotes) is escaped; the rest is fixed text.
 * Status is carried by words and headings, not by color alone.
 */
import { esc } from '../app/format.js';
import { EQUATION_NAMES } from '../app/format.js';

const TITLES = { correct: 'Correct', missing: 'Not mentioned', contradictory: 'Contradicts the key', review: 'Needs review' };
const ORDER = ['correct', 'missing', 'contradictory', 'review'];

const itemHtml = (i) => `<li>${esc(i.text)}${i.quotes?.length ? ` ${i.quotes.map((q) => `<q>${esc(q)}</q>`).join(' ')}` : ''}${i.note ? ` <span class="muted">${esc(i.note)}</span>` : ''}</li>`;

/**
 * @param {{ result: ReturnType<import('./index.js').gradeWritten>, equation: string }|null} snapshot
 * @param {{ currentEquation?: string }} [opts]
 */
export function writtenFeedbackHtml(snapshot, { currentEquation = snapshot?.equation } = {}) {
  if (!snapshot) return '';
  const r = snapshot.result;
  if (r.status === 'blank') return '';
  const eq = EQUATION_NAMES[snapshot.equation] ?? snapshot.equation;
  const head = '<h4 id="h-written">Written impression: formative check</h4><p class="muted">Rule-based and local: your text stays in this page and is not sent or stored. It reads short statements against the key for this case. It gives no score, it is not a validated assessment, and wording it cannot read is listed for your own review rather than marked wrong.</p>';
  const stale = currentEquation && currentEquation !== snapshot.equation ? `<p class="note">This feedback was produced under ${esc(eq)}. The spirometry equation was changed afterward; the feedback is not recomputed.</p>` : `<p class="muted">Checked under ${esc(eq)}.</p>`;
  if (r.status === 'too-long') return `<section class="written-feedback" aria-labelledby="h-written">${head}<p class="note" role="status">The impression is longer than ${esc(String(2000))} characters, so it was not checked. Shorten it to the findings and check again with a new case.</p></section>`;
  const notices = r.notices.map((n) => `<p class="muted">${esc(n)}</p>`).join('');
  const focus = r.focus.length ? `<p class="written-focus"><strong>Start here:</strong> ${r.focus.map((i) => esc(i.text)).join(' ')}</p>` : '';
  const groups = ORDER.filter((g) => r.groups[g].length).map((g) => `<div class="written-group written-${g}"><h5>${TITLES[g]}</h5><ul>${r.groups[g].map(itemHtml).join('')}</ul></div>`).join('');
  return `<section class="written-feedback" aria-labelledby="h-written">${head}${stale}${notices}${focus}${groups || '<p class="muted">Nothing was scored.</p>'}</section>`;
}

/** One short sentence for the polite live region; it holds counts only, never the trainee's words. */
export function writtenAnnouncement(snapshot) {
  const r = snapshot?.result;
  if (!r || r.status === 'blank') return '';
  if (r.status === 'too-long') return 'The written impression is too long to check.';
  const n = (g) => r.groups[g].length;
  return `Written impression checked: ${n('correct')} matched, ${n('contradictory')} contradicted, ${n('missing')} not mentioned, ${n('review')} to review.`;
}
