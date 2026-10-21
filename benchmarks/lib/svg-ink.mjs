/**
 * Runs in the page (pass it to page.evaluate). Collisions between the labels of the visible charts of the summary sheet, measured on
 * the ink of the glyphs and not on line boxes: for each <text>, the canvas gives the extent of the string's outlines at the label's font
 * (actualBoundingBox left, right, ascent, descent from the alphabetic baseline), SVG gives the baseline start of its first character, and the
 * label's screen matrix (translation, scale, rotation) maps that ink rectangle to the screen. Two labels collide when their ink rectangles
 * overlap at all (more than 0.01 px) in both directions; a label is clipped when its ink leaves its figure by more than 0.5 px (or, for a
 * figure whose SVG overflow is visible, leaves the sheet).
 *
 * What this does and does not establish. The rectangle is the bounding box of the string's outlines, so it can report two strings whose glyphs
 * do not touch (a capital over a descender elsewhere in the other string), and it can miss nothing larger than the canvas's own error: it is measured
 * from the canvas, not from the rendered pixels, so sub-pixel hinting, antialiasing and the fallback of a single character to another font can
 * move a real edge by a fraction of a pixel. A pair that overlaps by about 0.1 px in ink boxes (the g over T control) already shares dozens of
 * dark pixels at 4x, which is why the cutoff is 0.01 px and not a visible size. Family, size, style, weight, position, anchor and rotation are
 * taken from the label; letter and word spacing are not, so text that has either is reported in `skipped` and the callers fail on a skip.
 * Absence of a report is evidence at this resolution, not proof of no collision.
 * @returns {{ collisions: string[], measured: number, skipped: string[] }} the collisions, how many labels were measured, and the labels that could not be (a check that measures nothing must not pass)
 */
export function svgInkCollisions() {
  const MIN_OVERLAP = 0.01; // px: any real overlap of two ink rectangles; the g over T control overlaps by about 0.1 px yet shares dozens of dark pixels at 4x
  const canvas = document.createElement('canvas').getContext('2d');
  const out = [];
  let measured = 0;
  const skipped = [];
  for (const svg of document.querySelectorAll('#summary-slot .sheet svg')) {
    const sb = svg.getBoundingClientRect();
    if (!sb.width) continue;
    const fig = svg.closest('figure')?.dataset.figureId ?? '?';
    const ink = [];
    for (const t of svg.querySelectorAll('text')) {
      const str = t.textContent.trim();
      if (!str) continue;
      const cs = getComputedStyle(t);
      // The measurement does not copy letter or word spacing; text with either is reported as not measured, so that a check cannot pass on it.
      if ((cs.letterSpacing !== 'normal' && parseFloat(cs.letterSpacing) !== 0) || (cs.wordSpacing !== 'normal' && parseFloat(cs.wordSpacing) !== 0)) { skipped.push(`${fig}: "${str.slice(0, 12)}" letter or word spacing`); continue; }
      canvas.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = canvas.measureText(str);
      let p;
      try { p = t.getStartPositionOfChar(0); } catch (e) { skipped.push(`${fig}: "${str.slice(0, 12)}" ${e.name}`); continue; }
      measured++;
      const ctm = t.getScreenCTM();
      const xs = [], ys = [];
      for (const [x, y] of [[p.x - m.actualBoundingBoxLeft, p.y - m.actualBoundingBoxAscent], [p.x + m.actualBoundingBoxRight, p.y - m.actualBoundingBoxAscent], [p.x - m.actualBoundingBoxLeft, p.y + m.actualBoundingBoxDescent], [p.x + m.actualBoundingBoxRight, p.y + m.actualBoundingBoxDescent]]) {
        xs.push(ctm.a * x + ctm.c * y + ctm.e);
        ys.push(ctm.b * x + ctm.d * y + ctm.f);
      }
      ink.push({ t: str.slice(0, 24), l: Math.min(...xs), r: Math.max(...xs), tp: Math.min(...ys), bt: Math.max(...ys) });
    }
    for (let i = 0; i < ink.length; i++) for (let j = i + 1; j < ink.length; j++) {
      const a = ink[i], b = ink[j];
      const iw = Math.min(a.r, b.r) - Math.max(a.l, b.l), ih = Math.min(a.bt, b.bt) - Math.max(a.tp, b.tp);
      if (iw > MIN_OVERLAP && ih > MIN_OVERLAP) out.push(`${fig}: "${a.t}" x "${b.t}" ink ${iw.toFixed(1)}x${ih.toFixed(1)} px`);
    }
    const hold = getComputedStyle(svg).overflow === 'visible' ? (svg.closest('.sheet') ?? svg).getBoundingClientRect() : sb;
    for (const b of ink) {
      const ov = Math.max(hold.left - b.l, b.r - hold.right, hold.top - b.tp, b.bt - hold.bottom);
      if (ov > 0.5) out.push(`${fig}: "${b.t}" ink leaves its figure by ${ov.toFixed(1)} px`);
    }
  }
  return { collisions: out, measured, skipped };
}
