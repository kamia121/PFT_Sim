import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url));
const ENTRY_PAGES = ['index.html', 'report.html', 'quiz.html'];
const LINKS = [
  '<link rel="icon" href="./assets/icons/favicon.ico" sizes="32x32">',
  '<link rel="icon" href="./assets/icons/favicon.svg" type="image/svg+xml">',
  '<link rel="apple-touch-icon" href="./assets/icons/apple-touch-icon.png">',
];

/** @returns {{ width: number, height: number, colorType: number }} the IHDR fields of a PNG */
function pngHeader(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'PNG signature');
  assert.equal(buf.toString('latin1', 12, 16), 'IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf.readUInt8(25) };
}

test('every entry page links the SVG favicon, the ICO fallback and the Apple icon, and no inline icon remains', () => {
  for (const page of ENTRY_PAGES) {
    const html = read(page).toString('utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    for (const link of LINKS) assert.equal(head.split(link).length - 1, 1, `${page}: ${link}`);
    assert.equal((head.match(/rel="(icon|apple-touch-icon|shortcut icon)"/g) || []).length, 3, page);
    assert.doesNotMatch(head, /rel="icon" href="data:/, page);
  }
});

test('the linked icon files exist, the build copies them and the dev server types the ICO', () => {
  for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png']) assert.ok(fs.existsSync(new URL(`../assets/icons/${f}`, import.meta.url)), f);
  assert.match(read('scripts/build.mjs').toString('utf8'), /'assets'/);
  assert.match(read('scripts/serve.mjs').toString('utf8'), /'\.ico':'image\/x-icon'/);
});

test('the SVG source is a self-contained 32 unit square drawn only in theme token colors', () => {
  const svg = read('assets/icons/favicon.svg').toString('utf8');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 32 32">/);
  assert.match(svg, /<\/svg>\s*$/);
  assert.doesNotMatch(svg, /<script|<image|<foreignObject|href=|<text|@import|url\(/i, 'no scripts, external references or text');
  for (const [, body] of svg.matchAll(/<!--([\s\S]*?)-->/g)) assert.ok(!body.includes('--'), 'XML forbids a double hyphen inside a comment');
  const tokens = read('src/styles/tokens.css').toString('utf8');
  const colors = [...new Set(svg.match(/#[0-9A-Fa-f]{6}\b/g))];
  assert.deepEqual(colors.sort(), ['#0E2B73', '#5FD0BD']);
  for (const [name, hex] of [['--mcw-navy', '#0E2B73'], ['--mon-current', '#5FD0BD']]) assert.match(tokens, new RegExp(`${name}: ${hex};`), name);
});

test('the loop is one closed stroked outline, so that it reads as a loop at 16 px and not as two shapes', () => {
  const svg = read('assets/icons/favicon.svg').toString('utf8');
  const outlines = [...svg.matchAll(/<path d="([^"]+)"[^>]*stroke="#5FD0BD"[^>]*>/g)];
  assert.equal(outlines.length, 1, 'one stroked path');
  assert.match(outlines[0][1], /Z$/, 'the outline is closed');
  assert.equal((outlines[0][1].match(/M/g) || []).length, 1, 'a single subpath');
});

test('favicon.ico holds PNG images at 16, 32 and 48 px', () => {
  const ico = read('assets/icons/favicon.ico');
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1, 'icon type');
  const n = ico.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < n; i++) {
    const e = 6 + 16 * i;
    const size = ico.readUInt8(e) || 256;
    const length = ico.readUInt32LE(e + 8);
    const offset = ico.readUInt32LE(e + 12);
    assert.ok(offset + length <= ico.length, `entry ${i} lies inside the file`);
    const png = pngHeader(ico.subarray(offset, offset + length));
    assert.equal(png.width, size); assert.equal(png.height, size);
    assert.equal(png.colorType, 6, 'RGBA, so the rounded corners stay transparent');
    sizes.push(size);
  }
  assert.deepEqual(sizes, [16, 32, 48]);
});

test('apple-touch-icon.png is an opaque 180 px square', () => {
  assert.deepEqual(pngHeader(read('assets/icons/apple-touch-icon.png')), { width: 180, height: 180, colorType: 2 });
});
