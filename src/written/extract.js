/**
 * Claim extraction for the written-impression grader. A pure function of the trainee's text: it never sees the key, the case or the equation.
 *
 * The text is cut into clauses; every domain word (obstruction, DLCO, bronchodilator, ...) found in a clause becomes a claim with the exact source span,
 * its value, its polarity (negation is resolved from explicit cue words in a bounded scope, never from similarity), its certainty (asserted, soft, hedged,
 * conditional, unresolved) and its attribution (the trainee's own statement, or something attributed to the report or the technologist). Wording that
 * cannot be resolved is kept as an `unresolved` claim so that the evaluator abstains instead of guessing.
 *
 * @typedef {'pattern'|'severity'|'bd'|'dlco'|'volumes'|'quality'} Domain
 * @typedef {object} Claim
 * @property {Domain} domain
 * @property {string} value
 * @property {'asserted'|'soft'|'hedged'|'conditional'|'unresolved'} certainty
 * @property {'self'|'other'} attribution
 * @property {string} scope the head the claim is about (obs, dlco, fev1, tlc, ...)
 * @property {{ start: number, end: number }} span span in the original text
 * @property {string} quote the trainee's own words at that span
 * @property {{ cohb?: boolean, hb?: boolean, rule?: boolean, graded?: boolean }} tags
 * @property {number} clause index of the clause
 */
import { tokenize, repairNoun, distance, MAX_CHARS } from './text.js';
import { INDEX, KNOWN_WORDS, NOUN_TARGETS, INJECTION, FOREIGN_WORDS, ENGLISH_FUNCTION, UNREAD_ANCHORS } from './lexicon.js';

const CONTRAST = new Set(['but', 'however', 'although', 'though', 'whereas', 'while', 'yet', 'except', 'nevertheless']);
const HARD = new Set(['.', ';', '!', '?']);
const DONEW = new Set(['performed', 'done', 'measured', 'obtained', 'available', 'given', 'administered', 'tested', 'testing', 'test', 'tests', 'study', 'studies', 'spirometry', 'data', 'undertaken', 'post', 'assessment', 'trial', 'record', 'recorded', 'included', 'run', 'carried']);
const INHERENT_NOT_DONE = new Set(['missing', 'unavailable', 'omitted', 'deferred', 'na', 'n/a']);
const RESP = new Set(['response', 'responsiveness', 'reversibility', 'improvement', 'change', 'benefit']);
const RED = new Set(['defect', 'impairment', 'abnormality', 'reduction', 'decrease', 'limitation', 'problem', 'issue', 'abnormalities']);
const CONCERN = new Set(['concerns', 'concern', 'issues', 'issue', 'problems', 'problem', 'limitations', 'limitation', 'flags', 'flag']);
const CONNECT = new Set(['or', 'nor', 'and', ',', '/']);
const STRONG_UNREAD = new Set(['unreliable', 'suboptimal', 'submaximal', 'unacceptable', 'invalid', 'inadequate']);
const COPULA = new Set(['is', 'are', 'was', 'were', 'appears', 'seems', 'shows', 'showing', ':', '=', 'looks']);
const DONE_VERB = new Set(['performed', 'done', 'measured', 'obtained', 'available', 'given', 'administered', 'tested', 'undertaken', 'recorded', 'included', 'carried']);
const WALL = new Set(['so', 'because', 'therefore', 'thus', 'hence', 'since', 'which', 'that', 'then']);
const SEV_FOR = new Set(['obs', 'res', 'mix', 'fev1', 'fvc', 'defect', 'spiro', 'study', 'ratio', 'dlco', 'kco', 'va', 'bd', 'tlc', 'vol']);
const VAL_FOR = new Set(['ratio', 'fev1', 'fvc', 'spiro', 'study', 'tlc', 'vol', 'dlco', 'kco', 'va']);
const PATTERN_BASE = { obs: 'obstruction', res: 'restriction', mix: 'mixed', prism: 'prism', nsp: 'nonspecific' };

/** @param {string} text @returns {{ claims: Claim[], notes: object }} */
export function extractClaims(text) {
  const src = typeof text === 'string' ? text : '';
  const notes = { injection: false, foreign: false, corrections: false, tooLong: false, truncated: false, unread: new Set(), numericFev1: false, repairs: [], ignoredClauses: 0, recognized: 0, hbNegated: false };
  if (src.length > MAX_CHARS) { notes.tooLong = true; return { claims: [], notes }; }
  const { tokens, truncated } = tokenize(src);
  notes.truncated = truncated;
  const letters = tokens.filter((k) => k.kind === 'w');
  const nonAscii = letters.filter((k) => /[^\x00-\x7f]/.test(k.t)).length;
  const foreignStop = letters.filter((k) => FOREIGN_WORDS.has(k.t)).length;
  if (nonAscii >= 1 || foreignStop >= 1) { notes.foreign = true; return { claims: [], notes }; }

  // clauses
  const clauses = [];
  let a = 0;
  for (let i = 0; i <= tokens.length; i++) {
    const k = tokens[i];
    const hard = !k || k.kind === 'nl' || (k.kind === 'p' && HARD.has(k.t));
    const contrast = k && k.kind === 'w' && CONTRAST.has(k.t);
    if (hard || contrast) {
      if (i > a) clauses.push({ a, b: i, question: k?.t === '?', contrast: Boolean(contrast) || clauses.at(-1)?.nextContrast === true, nextContrast: false });
      if (contrast && clauses.length) clauses.at(-1).nextContrast = true;
      a = i + 1;
    }
  }
  // the clause after a contrast word knows it
  clauses.forEach((c, i) => { c.afterContrast = i > 0 && (clauses[i - 1].nextContrast === true); });

  const claims = [];
  let prevHeads = [];
  clauses.forEach((cl, ci) => {
    const toks = tokens.slice(cl.a, cl.b);
    const clauseText = src.slice(toks[0].s, toks.at(-1).e);
    if (INJECTION.test(clauseText)) { notes.injection = true; notes.ignoredClauses++; prevHeads = []; return; }
    const r = analyzeClause(toks, cl, ci, src, notes, prevHeads);
    claims.push(...r.claims);
    prevHeads = r.heads;
  });
  notes.recognized = claims.length;
  return { claims, notes };
}

/** @returns {{ c: string, v: string, i0: number, i1: number }[]} annotations of one clause's tokens */
function annotate(toks, notes) {
  const anns = [];
  for (let i = 0; i < toks.length;) {
    const k = toks[i];
    if (k.kind === 'n') { anns.push({ c: 'NUM', v: k.t, i0: i, i1: i }); i++; continue; }
    if (k.kind !== 'w') { i++; continue; }
    if (!KNOWN_WORDS.has(k.t) && !INDEX.has(k.t)) {
      const fixed = repairNoun(k.t, NOUN_TARGETS, KNOWN_WORDS);
      if (fixed) { notes.repairs.push({ from: k.t, to: fixed, start: k.s, end: k.e }); k.t = fixed; }
    }
    const t = k.t;
    // "nonobstructive": a negating prefix on a domain word
    if (!INDEX.has(t) && t.startsWith('non') && t.length > 5) {
      const rest = INDEX.get(t.slice(3));
      const hit = rest?.find((e) => e.c === 'HEAD' && e.w.length === 1);
      if (hit) { anns.push({ c: 'NEG', v: 'neg', i0: i, i1: i }, { c: 'HEAD', v: hit.v, i0: i, i1: i }); i++; continue; }
    }
    const entries = INDEX.get(t);
    let matched = false;
    if (entries) {
      for (const e of entries) {
        if (e.w.every((w, j) => toks[i + j]?.t === w)) { anns.push({ c: e.c, v: e.v, i0: i, i1: i + e.w.length - 1 }); i += e.w.length; matched = true; break; }
      }
    }
    if (!matched) {
      if (!KNOWN_WORDS.has(t) && t.length >= 4) {
        for (const [dom, list] of Object.entries(UNREAD_ANCHORS)) {
          if (list.some((w) => w !== t && distance(t, w, 2) <= (t.length >= 8 ? 2 : 1))) notes.unread.add(dom);
        }
      }
      i++;
    }
  }
  // "mild to moderate", "mild-moderate": adjacent graded severity words form a range
  const out = [];
  const GRADES = new Set(['mild', 'moderate', 'severe']);
  for (let j = 0; j < anns.length; j++) {
    const x = anns[j], y = anns[j + 1];
    if (x.c === 'SEV' && GRADES.has(x.v) && y?.c === 'SEV' && GRADES.has(y.v) && x.v !== y.v) {
      const between = toks.slice(x.i1 + 1, y.i0).map((k) => k.t);
      if (between.every((t) => ['to', '-', '/', 'or', 'and', 'through'].includes(t))) { out.push({ c: 'SEV', v: `range:${x.v}-${y.v}`, i0: x.i0, i1: y.i1 }); j++; continue; }
    }
    out.push(x);
  }
  return out;
}

function analyzeClause(toks, cl, ci, src, notes, prevHeads) {
  const anns = annotate(toks, notes);
  // notation glued to a head: "BD+", "BDR-", "BD (+)", "DLCO ↓", "TLCO ↑"
  toks.forEach((k, i) => {
    const sign = k.t === '+' ? 'sig' : k.t === '-' ? 'nsig' : k.t === '↓' ? 'low' : k.t === '↑' ? 'high' : null;
    if (!sign || k.kind !== 'p') return;
    let j = i - 1;
    while (j >= 0 && toks[j].t === '(') j--;
    const head = anns.find((x) => x.c === 'HEAD' && x.i1 === j);
    if (!head) return;
    const glued = toks[j].e === k.s || toks[i - 1].t === '(' || sign === 'low' || sign === 'high';
    if ((sign === 'sig' || sign === 'nsig') && head.v === 'bd' && glued) anns.push({ c: 'VAL', v: sign, i0: i, i1: i });
    else if ((sign === 'low' || sign === 'high') && VAL_FOR.has(head.v)) anns.push({ c: 'VAL', v: sign, i0: i, i1: i });
  });
  const annAt = new Map();
  for (const x of anns) for (let i = x.i0; i <= x.i1; i++) annAt.set(i, x);
  const seg = [];
  let sIdx = 0;
  toks.forEach((k, i) => { seg[i] = sIdx; if (k.kind === 'p' && k.t === ',') sIdx++; });
  const has = (c, pred = () => true) => anns.some((x) => x.c === c && pred(x));
  const hasFirst = has('FIRST');
  const corr = has('CORR');
  if (has('HB') && has('ADJ') && has('NEG')) notes.hbNegated = true;
  if (corr) notes.corrections = true;
  // attribution: a source noun followed by a reporting verb, or "according to"
  const attribCue = anns.some((x) => x.c === 'ATTRIB' && (x.i1 - x.i0 >= 1 || toks[x.i0].t === 'per' || anns.some((y) => y.c === 'SAYV' && y.i0 > x.i1 && y.i0 - x.i1 <= 3)));
  const REPORTED = new Set(['reported', 'said', 'stated', 'noted', 'flagged', 'listed', 'printed', 'labelled', 'called']);
  const attribution = attribCue && !hasFirst ? 'other' : 'self';
  const cueStart = Math.min(...anns.filter((x) => x.c === 'ATTRIB' || x.c === 'SAYV').map((x) => x.i0), Infinity);
  // a claim is the trainee's own when a first-person word comes after the attribution cue and before the claim, in the same comma segment ("the report says X, but I think Y" is split earlier at "but")
  const attributionAt = (h) => ((attribCue || anns.some((y) => y.c === 'SAYV' && REPORTED.has(toks[y.i0].t) && Math.abs(y.i0 - h.i0) <= 3 && seg[y.i0] === seg[h.i0])) && !anns.some((x) => x.c === 'FIRST' && seg[x.i0] === seg[h.i0] && x.i0 > cueStart && x.i0 < h.i0) ? 'other' : 'self');

  if (!anns.some((x) => x.c === 'HEAD' && x.v === 'bd')) {
    // "no significant response" with no bronchodilator word: a response word stands for the bronchodilator response
    const ri = toks.findIndex((k, i) => (k.t === 'response' || k.t === 'responsiveness') && !annAt.get(i)?.c?.startsWith('HEAD'));
    if (ri >= 0) { const w = { c: 'HEAD', v: 'bd', i0: ri, i1: ri, weak: true }; anns.push(w); annAt.set(ri, w); }
  }
  const heads = anns.filter((x) => x.c === 'HEAD');
  const consumed = new Set();
  // ---- bind value and severity words to heads
  const bound = new Map();
  const cands = [];
  for (const v of anns.filter((x) => x.c === 'VAL' || x.c === 'SEV')) {
    const grp = v.c === 'SEV' || v.v === 'notgraded' ? 'sev' : v.v === 'qlim' || v.v === 'qgood' ? 'q' : 'val';
    for (const h of heads) {
      const ok = grp === 'sev' ? (v.v === 'notgraded' ? ['fev1', 'defect', 'obs'].includes(h.v) : SEV_FOR.has(h.v))
        : grp === 'q' ? h.v === 'qual'
          : (v.v === 'sig' || v.v === 'nsig') ? h.v === 'bd' : VAL_FOR.has(h.v);
      if (!ok) continue;
      const before = v.i1 < h.i0;
      const lo = before ? v.i1 + 1 : h.i1 + 1, hi = before ? h.i0 : v.i0;
      if (!before && v.i0 <= h.i1) continue;
      const gap = hi - lo;
      if (gap > (before ? 3 : 4)) continue;
      if (anns.some((x) => x.c === 'HEAD' && x !== h && x.i0 >= lo && x.i1 < hi)) continue;
      if (anns.some((x) => (x.c === 'VAL' || x.c === 'SEV') && x !== v && x.i0 >= lo && x.i1 < hi && (x.c === v.c))) continue;
      const cop = !before && toks.slice(lo, hi).some((k) => COPULA.has(k.t));
      cands.push({ v, h, grp, score: before ? gap + 0.5 : gap + (cop ? -0.6 : 0.75) });
    }
  }
  // a value word that can only go to one head binds first, so that "DLCO normal TLC low" gives each head its own word
  const byVal = new Map();
  for (const c of cands) { if (!byVal.has(c.v)) byVal.set(c.v, []); byVal.get(c.v).push(c); }
  const order = [...byVal.values()].map((l) => l.sort((x, y) => x.score - y.score)).sort((l1, l2) => l1.length - l2.length || l1[0].score - l2[0].score);
  for (const list of order) {
    for (const c of list) {
      const slot = bound.get(c.h) ?? {};
      if (slot[c.grp]) continue;
      slot[c.grp] = c.v; bound.set(c.h, slot); break;
    }
  }

  // "normal TLC and DLCO", "normal spirometry, lung volumes and DLCO": one value word before a coordinated list of heads that is closed by "and"
  // covers each head that has none ("low FVC, TLC normall" is not such a list, and a head with its own unreadable word gets nothing)
  for (const [h, slot] of [...bound.entries()]) {
    const val = slot.val;
    if (!val || val.i1 >= h.i0) continue;
    const chain = [];
    let cur = h;
    for (;;) {
      const next = heads.find((x) => x.i0 > cur.i1 && VAL_FOR.has(x.v) && !bound.get(x)?.val && !consumed.has(x));
      if (!next) break;
      const between = toks.slice(cur.i1 + 1, next.i0).map((k) => k.t);
      if (!between.length || !between.every((t) => ['and', '&', ','].includes(t))) break;
      chain.push({ next, closer: between.includes('and') || between.includes('&') });
      cur = next;
    }
    if (!chain.length || !chain.at(-1).closer) continue;
    for (const { next } of chain) { const slot2 = bound.get(next) ?? {}; slot2.val = val; bound.set(next, slot2); }
  }

  // ---- cues in the clause
  const condClause = has('COND', (x) => !(hasFirst && ['would', 'should'].includes(toks[x.i0].t)));
  const questionMark = cl.question;
  const certaintyAt = (i) => {
    const s = seg[i];
    const inSeg = (x) => seg[x.i0] === s;
    if (condClause || anns.some((x) => x.c === 'LIMIT' && inSeg(x))) return 'conditional';
    if (questionMark || anns.some((x) => x.c === 'HEDGE' && inSeg(x))) return 'hedged';
    if (anns.some((x) => x.c === 'SOFT' && inSeg(x))) return 'soft';
    return 'asserted';
  };

  // negation before a head: strong cues count once each; "nor"/"neither" alone count once
  const negBefore = (h, lim = 6) => {
    let strong = 0, weak = 0;
    const found = [];
    // a negating prefix on the head itself ("nonobstructive") sits on the head's own token
    for (const x of anns) if (x.c === 'NEG' && x.i0 === h.i0 && x.i1 === h.i1) { strong++; found.push(x); }
    for (let i = h.i0 - 1; i >= Math.max(0, h.i0 - lim); i--) {
      const x = annAt.get(i);
      if (x && x.i1 === i) {
        if (x.c === 'NEG') { if (x.v === 'neg' && (toks[x.i0].t === 'nor' || toks[x.i0].t === 'neither')) weak++; else strong++; found.push(x); continue; }
        if (x.c === 'HEAD' || x.c === 'VAL' || x.c === 'SEV') {
          if (x.c === 'HEAD') {
            const between = toks.slice(x.i1 + 1, h.i0).map((k) => k.t);
            if (between.every((t) => CONNECT.has(t))) continue;
            break;
          }
          continue;
        }
      }
      if (seg[i] !== seg[h.i0]) { const t = toks[i + 1]?.t; if (!(t === 'or' || t === 'nor')) break; }
      if (WALL.has(toks[i].t) || (DONE_VERB.has(toks[i].t) && !x)) break;
      if (toks[i].kind === 'p' && toks[i].t !== ',' && toks[i].t !== '/' && toks[i].t !== '(' && toks[i].t !== ')' && toks[i].t !== '-') break;
    }
    let n = strong > 0 ? strong : weak > 0 ? 1 : 0;
    // a second negation earlier in the same comma segment, across a wall word ("it is not true that there is no obstruction"), is a double negation
    if (n === 1) {
      const earlier = anns.filter((x) => x.c === 'NEG' && x.i1 < h.i0 && seg[x.i0] === seg[h.i0] && !found.includes(x) && !['nor', 'neither'].includes(toks[x.i0].t) && !(DONEW.has(toks[x.i1 + 1]?.t)));
      if (earlier.length && found.length) { n = 2; found.push(...earlier); }
    }
    return { n, found };
  };
  // negation after a head: "obstruction absent", "restriction excluded", "TLC not measured"
  const after = (h, lim = 4) => {
    const hi = Math.min(toks.length, h.i1 + 1 + lim);
    let post = null, notDone = false, resp = false, negAfter = 0, doneWord = false;
    const ctx = [];
    for (let i = h.i1 + 1; i < hi; i++) {
      const x = annAt.get(i);
      if (x && x.c === 'HEAD' && x.v === 'spiro') { doneWord = true; ctx.push({ i0: i, i1: i }); if (negAfter > 0) notDone = true; i = x.i1; continue; }
      if (x && x.c === 'HEAD' && x.v !== 'defect') break;
      if (x?.c === 'POSTNEG') {
        const before = toks.slice(Math.max(h.i1 + 1, i - 3), i).map((k) => k.t);
        post = before.some((t) => t === 'cannot' || t === 'cant' || t === 'not') ? 'inverted' : 'neg';
        i = x.i1; continue;
      }
      if (x?.c === 'NEG') { negAfter++; continue; }
      const t = toks[i].t;
      if (INHERENT_NOT_DONE.has(t)) { notDone = true; doneWord = true; ctx.push({ i0: i, i1: i }); }
      else if (DONEW.has(t)) { doneWord = true; if (negAfter > 0) notDone = true; ctx.push({ i0: i, i1: i }); }
      if (RESP.has(t)) { resp = true; ctx.push({ i0: i, i1: i }); }
    }
    return { post, notDone, resp, negAfter, doneWord, ctx };
  };

  const out = [];
  const spanOf = (xs) => {
    const i0 = Math.min(...xs.map((x) => x.i0)), i1 = Math.max(...xs.map((x) => x.i1));
    return { start: toks[i0].s, end: toks[i1].e };
  };
  const push = (domain, value, h, extra = [], o = {}) => {
    const members = [h, ...extra].filter(Boolean);
    const span = spanOf(members);
    const cert = o.certainty ?? certaintyAt(h.i0);
    out.push({
      domain, value, certainty: cert, attribution: attributionAt(h), scope: o.scope ?? h.v, span, quote: src.slice(span.start, span.end),
      tags: o.tags ?? {}, clause: ci,
    });
  };
  const tagsFor = () => ({ adjNegated: (has('HB') && has('ADJ') && has('NEG')) || undefined, cohb: has('COHB') || undefined, hb: (has('HB') && !has('COHB')) || undefined, rule: /\b(2005|12\s*%|200\s*ml)\b/i.test(toks.map((k) => k.t).join(' ')) || undefined });

  for (const h of heads) {
    if (consumed.has(h)) continue;
    const b = bound.get(h) ?? {};
    const ng = negBefore(h);
    const af = after(h);
    let n = ng.n + (af.post === 'neg' ? 1 : 0);
    const inv = af.post === 'inverted';
    const certInv = inv ? 'hedged' : undefined;
    const extra = [b.sev, b.val, b.q, ...ng.found].filter(Boolean);
    const polarity = n === 0 ? 0 : n === 1 ? 1 : 2;
    // "it is not the case that spirometry is not normal": an earlier negation in the same segment, no other head between, and a negated value
    const earlierNeg = anns.some((x) => x.c === 'NEG' && x.i1 < h.i0 && x.i1 < (b.val ?? b.q ?? h).i0 - 2 && h.i0 - x.i1 <= 8 && seg[x.i0] === seg[h.i0] && !['nor', 'neither'].includes(toks[x.i0].t) && !DONEW.has(toks[x.i1 + 1]?.t) && !anns.some((y) => y.c === 'HEAD' && y !== h && y.i0 > x.i1 && y.i1 < h.i0));
    const dn = Boolean(b.val ?? b.q) && valNeg(toks, b.val ?? b.q, h) && earlierNeg;
    const unres = polarity === 2 || dn;

    switch (h.v) {
      case 'obs': case 'res': case 'mix': case 'prism': case 'nsp': {
        const base = PATTERN_BASE[h.v];
        const value = polarity === 1 ? (h.v === 'obs' ? 'no-obstruction' : h.v === 'res' ? 'no-restriction' : `not-${base}`) : base;
        push('pattern', value, h, ng.found, { certainty: unres ? 'unresolved' : certInv });
        if (polarity === 0 && (h.v === 'obs' || h.v === 'res') && ['pure', 'purely', 'solely', 'exclusively'].includes(toks[h.i0 - 1]?.t)) push('pattern', h.v === 'obs' ? 'no-restriction' : 'no-obstruction', h, [{ i0: h.i0 - 1, i1: h.i0 - 1 }], { scope: 'exclusive', certainty: certInv });
        if (b.sev && polarity === 0) push('severity', b.sev.v, h, [b.sev], { scope: h.v, certainty: certInv });
        break;
      }
      case 'ratio': {
        const v = b.val?.v;
        if (b.sev && polarity === 0) push('severity', b.sev.v, h, [b.sev], { scope: 'ratio' });
        if (!v) break;
        const neg = polarity === 1 || valNeg(toks, b.val, h);
        if (v === 'low') push('pattern', neg ? 'ratio-normal' : 'obstruction', h, extra, { scope: 'ratio', certainty: unres ? 'unresolved' : undefined });
        else if (v === 'norm') push('pattern', neg ? 'abnormal' : 'ratio-normal', h, extra, { scope: 'ratio', certainty: unres ? 'unresolved' : undefined });
        break;
      }
      case 'fev1': {
        const after1 = toks.slice(h.i1 + 1, h.i1 + 4).some((k) => k.kind === 'n');
        if (after1) notes.numericFev1 = true;
        if (b.sev && polarity === 0) push('severity', b.sev.v, h, [b.sev], { scope: 'fev1' });
        const v = b.val?.v;
        const neg = polarity === 1 || (b.val && valNeg(toks, b.val, h));
        if (v === 'norm') push('severity', neg ? 'unresolved-fev1' : 'fev1-normal', h, extra, { scope: 'fev1', certainty: neg ? 'unresolved' : undefined });
        else if (v === 'low') push(neg ? 'severity' : 'pattern', neg ? 'fev1-normal' : 'low-fev1', h, extra, { scope: 'fev1' });
        if (b.sev?.v === 'notgraded') push('severity', 'fev1-normal', h, [b.sev], { scope: 'fev1' });
        break;
      }
      case 'fvc': {
        const v = b.val?.v;
        const neg = polarity === 1 || (b.val && valNeg(toks, b.val, h));
        if (v === 'low' && !neg) push('pattern', 'low-fvc', h, extra, { scope: 'fvc' });
        if (b.sev) { /* a severity word on FVC grades nothing the key grades */ }
        break;
      }
      case 'spiro': case 'study': {
        const v = b.val?.v;
        if (b.sev && polarity === 0) push('severity', b.sev.v, h, [b.sev], { scope: h.v });
        if (!v) break;
        const neg = polarity === 1 || valNeg(toks, b.val, h);
        const abn = v === 'abn' || v === 'low';
        const normalValue = h.v === 'study' ? 'normal' : 'spiro-normal';
        const value = (v === 'norm') !== neg ? normalValue : 'abnormal';
        // "not abnormal" is not the same statement as "normal": it is left unresolved
        push('pattern', abn && neg ? normalValue : value, h, extra, { scope: h.v, certainty: unres || (abn && neg) ? 'unresolved' : undefined });
        break;
      }
      case 'defect': {
        const near = anns.some((x) => x.c === 'HEAD' && (x.v === 'dlco' || x.v === 'kco') && Math.abs(x.i0 - h.i0) <= 3 && x !== h);
        if (near) break;
        if (b.sev && polarity === 0) { push('severity', b.sev.v, h, [b.sev], { scope: 'defect' }); break; }
        const otherHead = anns.some((x) => x.c === 'HEAD' && x !== h && !['defect', 'study'].includes(x.v));
        if (polarity === 1 && !otherHead) push('pattern', 'normal', h, ng.found, { scope: 'defect' });
        break;
      }
      case 'tlc': case 'vol': {
        const v = b.val?.v;
        if (v) {
          const neg = polarity === 1 || valNeg(toks, b.val, h);
          if (v === 'low') push('pattern', neg ? 'no-restriction' : 'restriction', h, extra, { scope: 'tlc', certainty: unres ? 'unresolved' : undefined });
          else if (v === 'norm') push('pattern', neg ? 'unresolved-tlc' : 'no-restriction', h, extra, { scope: 'tlc', certainty: neg || unres ? 'unresolved' : undefined });
          else if (v === 'high') push('volumes', neg ? 'unresolved-tlc' : 'tlc-high', h, extra, { scope: 'tlc', certainty: neg ? 'unresolved' : undefined });
          break;
        }
        if (n >= 1 || af.notDone) push('volumes', 'absent', h, [...ng.found, ...af.ctx], { scope: h.v, certainty: unres ? 'unresolved' : 'asserted' });
        else if (anns.some((x) => (x.c === 'LIMIT' && seg[x.i0] === seg[h.i0]) || (x.c === 'COND' && ['pending', 'awaiting'].includes(toks[x.i0].t)))) push('volumes', 'needed', h, [], { scope: h.v, certainty: 'asserted' });
        break;
      }
      case 'hyper': {
        if (polarity === 0) push('volumes', 'tlc-high', h, [], { scope: 'hyper' });
        break;
      }
      case 'bd': {
        // a second, different statement about the response in the same clause ("significant and also not significant", "significant and no response")
        const usedVals = new Set([...bound.values()].flatMap((sl) => Object.values(sl)));
        const leftover = anns.some((x) => x.c === 'VAL' && (x.v === 'sig' || x.v === 'nsig') && !usedVals.has(x))
          || anns.some((x) => x.c === 'NEG' && x.i0 > h.i1 && !ng.found.includes(x) && [1, 2].some((d) => RESP.has(toks[x.i1 + d]?.t)));
        bdClaim(h, b, ng, af, n + (leftover && b.val ? 2 : 0), push, toks, anns, tagsFor);
        break;
      }
      case 'dlco': {
        const v = b.val?.v;
        const tags = tagsFor();
        const redAfter = toks.slice(h.i1 + 1, h.i1 + 4).some((k) => RED.has(k.t));
        if (v) {
          const neg = polarity === 1 || valNeg(toks, b.val, h);
          const map = { low: neg ? 'not-reduced' : 'reduced', high: neg ? 'unresolved-dlco' : 'raised', norm: neg ? 'abnormal' : 'normal', abn: neg ? 'unresolved-dlco' : 'abnormal' };
          const val = map[v];
          push('dlco', val, h, extra, { tags, certainty: unres || val.startsWith('unresolved') || tags.adjNegated ? 'unresolved' : certInv });
        } else if (n >= 1 && redAfter) {
          push('dlco', 'not-reduced', h, ng.found, { tags });
        } else if (n >= 1 || af.notDone) {
          push('dlco', 'not-performed', h, [...ng.found, ...af.ctx], { tags, certainty: unres ? 'unresolved' : 'asserted' });
        }
        break;
      }
      case 'kco': case 'va': break;
      case 'qual': {
        const v = b.q?.v;
        let val = null;
        if (v) { const neg = polarity === 1 || valNeg(toks, b.q, h); val = (v === 'qlim') !== neg ? 'limited' : 'good'; }
        else if (polarity === 1 && toks.slice(h.i1 + 1, h.i1 + 4).some((k) => CONCERN.has(k.t))) val = 'good';
        if (val) push('quality', val, h, extra, { certainty: unres ? 'unresolved' : undefined });
        break;
      }
      default: break;
    }
  }

  // standalone quality phrases and bare normal
  const used = new Set(bound.size ? [...bound.values()].flatMap((s) => Object.values(s)) : []);
  for (const x of anns) {
    if (x.c !== 'VAL' || (x.v !== 'qlim' && x.v !== 'qgood') || used.has(x)) continue;
    if (!(x.i1 > x.i0 || STRONG_UNREAD.has(toks[x.i0].t))) continue;
    const neg = toks.slice(Math.max(0, x.i0 - 3), x.i0).some((k) => ['no', 'not', 'without', 'isnt', 'wasnt'].includes(k.t));
    const value = (x.v === 'qlim') !== neg ? 'limited' : 'good';
    out.push({ domain: 'quality', value, certainty: certaintyAt(x.i0), attribution, scope: 'qual', span: spanOf([x]), quote: src.slice(toks[Math.max(0, neg ? x.i0 - 3 : x.i0)].s, toks[x.i1].e), tags: {}, clause: ci });
  }
  const unboundVal = anns.filter((x) => x.c === 'VAL' && !used.has(x) && ['low', 'high', 'norm', 'abn', 'sig', 'nsig'].includes(x.v));
  const contentWords = toks.filter((k, i) => k.kind === 'w' && annAt.get(i)?.c !== 'ADV').length;
  if (heads.length === 0 && unboundVal.length) {
    const nv = unboundVal.find((x) => x.v === 'norm');
    if (nv && (contentWords <= 2 || (nv.i0 === 0 && [',', 'and', undefined].includes(toks[1]?.t))) && !anns.some((x) => x.c === 'NEG' && x.i0 < nv.i0)) out.push({ domain: 'pattern', value: 'normal', certainty: certaintyAt(nv.i0), attribution, scope: 'bare', span: spanOf([nv]), quote: src.slice(toks[nv.i0].s, toks[nv.i1].e), tags: {}, clause: ci });
    else if (prevHeads.length && (hasFirst || cl.afterContrast || corr)) {
      for (const dom of new Set(prevHeads)) out.push({ domain: dom, value: 'unresolved', certainty: 'unresolved', attribution: 'self', scope: 'elided', span: spanOf([unboundVal[0]]), quote: src.slice(toks[unboundVal[0].i0].s, toks[unboundVal[0].i1].e), tags: {}, clause: ci });
    }
  }
  // severity words bound to nothing
  for (const x of anns) {
    if (x.c === 'SEV' && !used.has(x) && !heads.some((h) => SEV_FOR.has(h.v))) out.push({ domain: 'severity', value: x.v, certainty: certaintyAt(x.i0), attribution, scope: 'unbound', span: spanOf([x]), quote: src.slice(toks[x.i0].s, toks[x.i1].e), tags: {}, clause: ci });
  }
  // not interpretable
  toks.forEach((k, i) => {
    const t = k.t;
    const near = (re) => toks.slice(Math.max(0, i - 3), i).some((y) => re.test(y.t));
    const hit = ['uninterpretable', 'noninterpretable', 'nondiagnostic', 'indeterminate'].includes(t) || (t === 'interpretable' && near(/^(not|non)$/)) || (/^interpret/.test(t) && t !== 'interpretable' && near(/^(cannot|cant|unable)$/));
    if (hit) out.push({ domain: 'pattern', value: 'not-interpretable', certainty: certaintyAt(i), attribution, scope: 'study', span: { start: toks[Math.max(0, i - 2)].s, end: k.e }, quote: src.slice(toks[Math.max(0, i - 2)].s, k.e), tags: {}, clause: ci });
  });

  const domains = heads.map((h) => (h.v === 'dlco' ? 'dlco' : h.v === 'bd' ? 'bd' : 'pattern'));
  return { claims: out, heads: domains };
}

/** A negation word right before the value, or between the head and the value ("DLCO not reduced", "no significant response"). */
function valNeg(toks, val, head) {
  const lo = Math.min(val.i0, head.i0), hi = Math.max(val.i1, head.i1);
  const w = toks.slice(Math.max(0, val.i0 - 2), val.i0).map((k) => k.t);
  const between = toks.slice(lo, hi + 1).map((k) => k.t);
  return w.some((t) => ['no', 'not', 'without', 'never', 'isnt', 'wasnt', 'arent', 'dont', 'doesnt'].includes(t)) || (val.i0 > head.i1 && between.some((t) => ['not', 'isnt', 'wasnt', 'arent'].includes(t)));
}

/** Bronchodilator: a result (significant or not) is told apart from a test that was not performed by the word that follows the negation. */
function bdClaim(h, b, ng, af, n, push, toks, anns, tagsFor) {
  const tags = tagsFor();
  const v = b.val?.v;
  const resp = af.resp || toks[h.i0].t === 'bdr' || RESP.has(toks[h.i0].t) || toks.slice(Math.max(0, h.i0 - 3), h.i0).some((k) => RESP.has(k.t) && k.t !== toks[h.i0].t);
  const unres = n >= 2;
  if (v) {
    const neg = n === 1 || valNeg(toks, b.val, h);
    const flipped = neg ? (v === 'sig' ? 'not-significant' : 'significant') : v === 'sig' ? 'significant' : 'not-significant';
    push('bd', neg && v === 'nsig' ? 'unresolved' : flipped, h, [b.val, ...ng.found], { tags, certainty: unres || (neg && v === 'nsig') ? 'unresolved' : undefined });
    return;
  }
  if (n >= 1 && resp) { push('bd', 'not-significant', h, [...ng.found, ...af.ctx], { tags, certainty: unres ? 'unresolved' : undefined }); return; }
  if (n >= 1 && af.doneWord) { push('bd', 'not-performed', h, [...ng.found, ...af.ctx], { tags, certainty: unres ? 'unresolved' : 'asserted' }); return; }
  if (af.notDone) { push('bd', 'not-performed', h, af.ctx, { tags, certainty: 'asserted' }); return; }
  if (n >= 1) push('bd', 'ambiguous-none', h, ng.found, { tags, certainty: 'unresolved' });
  else if (af.negAfter && !af.notDone) push('bd', 'ambiguous-none', h, [], { tags, certainty: 'unresolved' });
}
