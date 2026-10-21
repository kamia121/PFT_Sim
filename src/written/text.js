/**
 * Text layer of the written-impression grader: Unicode normalization that keeps a map to the original string (so quotes are
 * always slices of what the trainee typed), tokenization, and the small closed-vocabulary typo repair. Pure; no DOM, no storage, no network.
 */

export const MAX_CHARS = 2000;
export const MAX_TOKENS = 700;

const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿­]/;

/**
 * Lowercased NFKC form of `text`, one normalized character at a time, with the index range of the original text each came from.
 * @param {string} text
 * @returns {{ s: string, from: number[], to: number[] }}
 */
export function normalize(text) {
  let s = '';
  const from = [], to = [];
  let i = 0;
  for (const ch of String(text)) {
    const len = ch.length;
    if (!INVISIBLE.test(ch)) {
      let n = ch.normalize('NFKC').toLowerCase();
      if (/[‘’ʼ]/.test(n)) n = "'";
      else if (/[‐-―−]/.test(n)) n = '-';
      else if (/[“”]/.test(n)) n = '"';
      for (const c of n) for (let u = 0; u < c.length; u++) { s += c[u]; from.push(i); to.push(i + len); }
    }
    i += len;
  }
  return { s, from, to };
}

/**
 * @typedef {{ t: string, s: number, e: number, kind: 'w'|'n'|'p'|'nl', fixed?: string }} Token
 * `t` is the normalized token, `s`/`e` the span in the original text. `fixed` is set when a typo was repaired (the token then reads as `t`).
 */

const TOKEN = /[\p{L}][\p{L}\p{M}']*\p{N}*|\p{N}+(?:[.,]\p{N}+)*|\n|[^\s]/gu;

/** @param {string} text @returns {{ tokens: Token[], truncated: boolean }} */
export function tokenize(text) {
  const { s, from, to } = normalize(text);
  /** @type {Token[]} */
  let toks = [];
  for (const m of s.matchAll(TOKEN)) {
    const a = m.index, b = a + m[0].length;
    const raw = m[0];
    const kind = raw === '\n' ? 'nl' : /^\p{N}/u.test(raw) ? 'n' : /^\p{L}/u.test(raw) ? 'w' : 'p';
    toks.push({ t: kind === 'w' ? raw.replace(/'/g, '') : raw, s: from[a], e: to[b - 1], kind });
  }
  // A hyphen glued to a word on both sides is a joiner, not a token ("post-bd", "non-obstructive").
  toks = toks.filter((k, i) => !(k.t === '-' && toks[i - 1] && toks[i + 1] && toks[i - 1].e === k.s && k.e === toks[i + 1].s && toks[i - 1].kind === 'w' && toks[i + 1].kind === 'w'));
  // "fev 1" reads as fev1.
  const merged = [];
  for (const k of toks) {
    const p = merged[merged.length - 1];
    if (p && p.t === 'fev' && k.t === '1' && k.kind === 'n') { p.t = 'fev1'; p.e = k.e; continue; }
    merged.push({ ...k });
  }
  const truncated = merged.length > MAX_TOKENS;
  return { tokens: truncated ? merged.slice(0, MAX_TOKENS) : merged, truncated };
}

/** Optimal-string-alignment distance, bounded: returns max+1 when the distance exceeds `max`. */
export function distance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * Repair a misspelled domain noun. Only the nouns in `targets` are ever repaired (never a value, negation, hedge, number or unit word, so a typo cannot flip polarity),
 * only for words of 7 or more letters (distance 1; distance 2 from 13 letters), and only when exactly one target is that close and no other lies within one more edit.
 * @param {string} t @param {string[]} targets @param {Set<string>} known words that are never repaired
 * @returns {string|null} the target, or null
 */
export function repairNoun(t, targets, known) {
  if (known.has(t) || t.length < 7 || /\d/.test(t)) return null;
  const max = t.length >= 13 ? 2 : 1;
  let best = null, bestD = 99, second = 99;
  for (const w of targets) {
    const d = distance(t, w, max + 2);
    if (d < bestD) { second = bestD; bestD = d; best = w; } else if (d < second) second = d;
  }
  return bestD <= max && second >= bestD + 2 ? best : null;
}
