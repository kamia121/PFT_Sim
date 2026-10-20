import assert from 'node:assert/strict';

/**
 * Minimal XML well-formedness check for the SVG the figures write: balanced and properly nested tags, quoted
 * attributes with no repeated names, no raw '<' in text or attribute values, only the five predefined entities
 * (or numeric references), one root element. Returns the list of element names in document order.
 */
export function assertWellFormed(xml, label = 'svg') {
  let s = xml.replace(/^<\?xml[^>]*\?>\s*/, '');
  const stack = [];
  const names = [];
  let roots = 0;
  const re = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>|([^<]+)/g;
  let pos = 0, m;
  while ((m = re.exec(s))) {
    assert.equal(m.index, pos, `${label}: unparseable markup near "${s.slice(pos, pos + 60)}"`);
    pos = re.lastIndex;
    if (m[5] !== undefined) {
      const bad = m[5].replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, '');
      assert.ok(!bad.includes('&'), `${label}: bad entity in text "${m[5].slice(0, 40)}"`);
      if (!stack.length) assert.equal(m[5].trim(), '', `${label}: text outside the root element`);
      continue;
    }
    const [, close, name, attrs, selfClose] = m;
    if (close) {
      assert.equal(stack.pop(), name, `${label}: mismatched </${name}>`);
      continue;
    }
    const seen = new Set();
    for (const a of attrs.matchAll(/\s+([\w:-]+)="([^"]*)"/g)) {
      assert.ok(!seen.has(a[1]), `${label}: repeated attribute ${a[1]} on <${name}>`);
      seen.add(a[1]);
      assert.ok(!/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(a[2]), `${label}: bad entity in ${a[1]}`);
    }
    if (!stack.length) roots++;
    names.push(name);
    if (!selfClose) stack.push(name);
  }
  assert.equal(pos, s.length, `${label}: trailing unparsed markup`);
  assert.equal(stack.length, 0, `${label}: unclosed <${stack[stack.length - 1]}>`);
  assert.equal(roots, 1, `${label}: expected one root element`);
  assert.equal(names[0], 'svg');
  return names;
}

/** Checks that apply to every exported figure: self-contained, no CSS variables, no external references, inline colors. */
export function assertSelfContained(xml, label = 'svg') {
  assert.ok(!xml.includes('var('), `${label}: CSS variable`);
  assert.ok(!/url\(|@import|<style|<script|<image|<use|<foreignObject|xlink:href|\shref=|<link/i.test(xml), `${label}: external or style reference`);
  const urls = xml.match(/https?:\/\/[^"'\s<]+/g) ?? [];
  assert.ok(urls.every((u) => u === 'http://www.w3.org/2000/svg'), `${label}: external URL ${urls.find((u) => u !== 'http://www.w3.org/2000/svg')}`);
  for (const m of xml.matchAll(/\s(fill|stroke)="([^"]*)"/g)) assert.match(m[2], /^(none|#[0-9A-Fa-f]{6})$/, `${label}: ${m[1]}="${m[2]}" is not an inline hex color`);
  assert.ok(!/NaN|undefined|Infinity/.test(xml), `${label}: non-finite number or undefined in markup`);
  assert.match(xml, /<title>[^<]+<\/title><desc>[^<]+<\/desc>/, `${label}: title and desc`);
  assert.match(xml, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(xml, /viewBox="0 0 \d+ \d+"/);
}
