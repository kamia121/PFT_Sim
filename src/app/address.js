/**
 * Address of the practice page. The case is the descriptor (`?c=<code>`, or the plain `?v=..&s=..&a=..` form for instructors).
 * Three settings ride beside it and are not part of the descriptor, so a shared link reproduces what the sender saw without
 * changing the case: `eq` (spirometry equation, as on the report page), `qc=1` (quality challenge on) and `flags=none`
 * (no flags on abnormal values; the default flags values outside the lower limit of normal). A fourth, `qd=adv`, selects the advanced
 * (per-maneuver) quality review; any other value, or none, is the basic (study-level) review.
 */
import { encodeCase } from '../core/code.js';

export const EQUATIONS = ['GLIglobal', 'GLI2012'];
export const FLAG_MODES = ['lln', 'none'];
export const REVIEW_LEVELS = ['basic', 'advanced'];
const SETTING_KEYS = ['eq', 'qc', 'flags', 'copy', 'qd'];

/**
 * @param {string} search query string with or without the leading ?
 * @returns {{ kind: 'code'|'plain'|null, code: string|null, plainQuery: string|null, equation: 'GLIglobal'|'GLI2012'|null, qualityChallenge: boolean, flags: 'lln'|'none', review: 'basic'|'advanced' }}
 */
export function parseAddress(search) {
  const p = new URLSearchParams(String(search ?? ''));
  const eq = p.get('eq');
  const equation = EQUATIONS.includes(eq) ? eq : null;
  const qualityChallenge = p.get('qc') === '1';
  const flags = p.get('flags') === 'none' ? 'none' : 'lln';
  const review = p.get('qd') === 'adv' ? 'advanced' : 'basic';
  const rest = new URLSearchParams(p);
  for (const k of SETTING_KEYS) rest.delete(k);
  if (rest.has('c')) return { kind: 'code', code: rest.get('c'), plainQuery: null, equation, qualityChallenge, flags, review };
  if (rest.has('s')) return { kind: 'plain', code: null, plainQuery: rest.toString(), equation, qualityChallenge, flags, review };
  return { kind: null, code: null, plainQuery: null, equation, qualityChallenge, flags, review };
}

/**
 * Query string for a case and the page settings. Settings at their defaults are left out, so an ordinary link stays short.
 * @param {{ query: string, mode?: 'code'|'plain', equation?: string, qualityChallenge?: boolean, flags?: string, review?: string }} arg query is the serialized descriptor
 */
export function buildSearch({ query, mode = 'code', equation = 'GLIglobal', qualityChallenge = false, flags = 'lln', review = 'basic' }) {
  const head = mode === 'plain' ? query : `c=${encodeCase(query)}`;
  const extra = [];
  if (equation === 'GLI2012') extra.push('eq=GLI2012');
  if (qualityChallenge) extra.push('qc=1');
  if (flags === 'none') extra.push('flags=none');
  if (review === 'advanced') extra.push('qd=adv');
  return `?${[head, ...extra].join('&')}`;
}
