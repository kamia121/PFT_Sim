/**
 * Runs in the page (pass it to page.evaluate). Collisions between the labels of the visible charts of the summary sheet, measured on
 * the ink of the glyphs and not on line boxes: for each <text>, the canvas gives the extent of the string's outlines at the label's font
 * (actualBoundingBox left, right, ascent, descent from the alphabetic baseline), SVG gives the baseline start of its first character, and the
 * label's screen matrix (translation, scale, rotation) maps that ink rectangle to the screen. Two labels collide when their ink rectangles
 * overlap by more than 0.5 px in both directions; a label is clipped when its ink leaves its figure by more than 0.5 px (or, for a figure whose SVG overflow is visible, leaves the sheet). The rectangle bounds
 * every glyph of the string, so it can only over-report (a tall letter and a descender in different strings), never miss an overlap.
 * @returns {string[]}
 */
export function svgInkCollisions() {
  const canvas = document.createElement('canvas').getContext('2d');
  const out = [];
  for (const svg of document.querySelectorAll('#summary-slot .sheet svg')) {
    const sb = svg.getBoundingClientRect();
    if (!sb.width) continue;
    const fig = svg.closest('figure')?.dataset.figureId ?? '?';
    const ink = [];
    for (const t of svg.querySelectorAll('text')) {
      const str = t.textContent.trim();
      if (!str || !t.getComputedTextLength()) continue;
      const cs = getComputedStyle(t);
      canvas.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = canvas.measureText(str);
      const p = t.getStartPositionOfChar(0);
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
      if (iw > 0.5 && ih > 0.5) out.push(`${fig}: "${a.t}" x "${b.t}" ink ${iw.toFixed(1)}x${ih.toFixed(1)} px`);
    }
    const hold = getComputedStyle(svg).overflow === 'visible' ? (svg.closest('.sheet') ?? svg).getBoundingClientRect() : sb;
    for (const b of ink) {
      const ov = Math.max(hold.left - b.l, b.r - hold.right, hold.top - b.tp, b.bt - hold.bottom);
      if (ov > 0.5) out.push(`${fig}: "${b.t}" ink leaves its figure by ${ov.toFixed(1)} px`);
    }
  }
  return out;
}
