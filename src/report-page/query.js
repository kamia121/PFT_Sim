/**
 * Address of the report page. The case is the same descriptor query as the practice page (`?c=<code>` or `?v=2&s=..&a=..`),
 * with more parameters that are not part of the descriptor and so do not change the case: `eq` (the spirometry equation, as on
 * the practice page), `copy` (student or instructor), `qc` (1 turns the quality challenge on: the printed copy then withholds the
 * technologist's quality statement and the grade columns; absent or 0 is off) and `flags` (lln marks values below the lower limit
 * of normal, none marks nothing; default lln) and `st` (the stage of the quality challenge at which the report was opened: 1 the answers are open,
 * 2 the technologist's statement was released, 3 the answers were checked; it requires qc=1, is accepted at 1 and left out when a link is written; any other value, a repeated
 * value or a stage without the challenge is a link error and not a quiet fallback, so that no two addresses show the same page and a shared link shows what its
 * sender saw). The stage is a presentation setting, not a security measure: the page is computed in the browser from the case code.
 * The address of the practice page has no stage: answers are not stored, so a stage there cannot be restored.
 * A link that cannot be read produces an error whose message is written for the person who opened it.
 */
import { decodeCase, encodeCase } from '../core/code.js';
import { parseDescriptor, serializeDescriptor } from '../core/descriptor.js';

export const EQUATIONS = ['GLIglobal', 'GLI2012'];
export const COPIES = ['student', 'instructor'];
export const FLAG_SETTINGS = ['lln', 'none'];
export const DEFAULT_EQUATION = 'GLIglobal';
export const DEFAULT_FLAGS = 'lln';
export const STAGES = [1, 2, 3];

export class ReportLinkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReportLinkError';
  }
}

const sentence = (s) => { const t = String(s).replace(/[\r\n]+/g, ' ').trim(); return /[.!?]$/.test(t) ? t : `${t}.`; };

/**
 * @param {string} search the query string, with or without the leading ?
 * @returns {{ descriptor: object, token: string, equation: 'GLIglobal'|'GLI2012', copy: 'student'|'instructor', qualityChallenge: boolean, flags: 'lln'|'none', stage: 1|2|3, review: 'basic'|'advanced' }}
 * @throws {ReportLinkError}
 */
export function parseReportQuery(search) {
  const p = new URLSearchParams(String(search ?? ''));
  const equation = p.get('eq') ?? DEFAULT_EQUATION;
  if (!EQUATIONS.includes(equation)) throw new ReportLinkError(`The link names a spirometry equation (eq=${equation.slice(0, 30)}) that this page does not offer. Use GLIglobal or GLI2012.`);
  const copy = p.get('copy') ?? 'student';
  if (!COPIES.includes(copy)) throw new ReportLinkError(`The link names a copy (copy=${copy.slice(0, 30)}) that this page does not offer. Use student or instructor.`);
  const qc = p.get('qc') ?? '0';
  if (qc !== '0' && qc !== '1') throw new ReportLinkError(`The link sets the quality challenge to "${qc.slice(0, 30)}". Use qc=1 to turn it on or leave it out.`);
  let stage = 1;
  if (p.has('st')) {
    const all = p.getAll('st');
    if (all.length !== 1 || !/^[123]$/.test(all[0])) throw new ReportLinkError(`The link sets the stage to "${all.join(',').slice(0, 30)}". Use st=2 or st=3, or leave it out for stage 1.`);
    if (qc !== '1') throw new ReportLinkError(`The link names a stage (st=${all[0]}) without the quality challenge. Add qc=1, or leave the stage out.`);
    stage = Number(all[0]);
  }
  const flags = p.get('flags') ?? DEFAULT_FLAGS;
  if (!FLAG_SETTINGS.includes(flags)) throw new ReportLinkError(`The link names a flag setting (flags=${flags.slice(0, 30)}) that this page does not offer. Use lln or none.`);
  let descriptor;
  try {
    if (p.has('c')) descriptor = parseDescriptor(decodeCase(p.get('c')));
    else if (p.has('s')) descriptor = parseDescriptor(p.toString());
    else throw new ReportLinkError('The link carries no case. Open a report from the case practice page or the quiz review, which add the case code to the address.');
  } catch (e) {
    if (e instanceof ReportLinkError) throw e;
    if (e instanceof RangeError) throw new ReportLinkError(`This case link cannot be read: ${sentence(e.message)}`);
    throw new ReportLinkError('This case link cannot be read: the case code is damaged or incomplete.');
  }
  return { descriptor, token: p.has('c') ? p.get('c') : encodeCase(serializeDescriptor(descriptor)), equation, copy, qualityChallenge: qc === '1', flags, stage, review: p.get('qd') === 'adv' ? 'advanced' : 'basic' };
}

/** `qd=adv` is the practice page's advanced quality review. The report page prints the same either way; it only carries the setting so that the way back to the practice page keeps it. */
const settings = ({ qualityChallenge = false, flags = DEFAULT_FLAGS, review = 'basic' }) => `${qualityChallenge ? '&qc=1' : ''}${flags === DEFAULT_FLAGS ? '' : `&flags=${flags}`}${review === 'advanced' ? '&qd=adv' : ''}`;
/** The stage rides only with the quality challenge, and only above 1. */
const stageSetting = ({ qualityChallenge = false, stage = 1 }) => (qualityChallenge && stage > 1 && STAGES.includes(stage) ? `&st=${stage}` : '');

/** Query string of the report page for a case. The defaults (student copy, quality challenge off, LLN flags) are left out. */
export const reportQuery = ({ token, equation = DEFAULT_EQUATION, copy = 'student', qualityChallenge = false, flags = DEFAULT_FLAGS, stage = 1, review = 'basic' }) =>
  `?c=${encodeURIComponent(token)}&eq=${equation}${copy === 'student' ? '' : `&copy=${copy}`}${settings({ qualityChallenge, flags, review })}${stageSetting({ qualityChallenge, stage })}`;

/** Address of the same case on the practice page. */
export const practiceHref = ({ token, equation = DEFAULT_EQUATION, qualityChallenge = false, flags = DEFAULT_FLAGS, review = 'basic' }) =>
  `./?c=${encodeURIComponent(token)}&eq=${equation}${settings({ qualityChallenge, flags, review })}`;
