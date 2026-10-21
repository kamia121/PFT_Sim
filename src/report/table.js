/**
 * Shared table formatting for the report. The on-screen HTML, the clipboard HTML, the TSV and both
 * CSV layouts all take their cell text from `tableMatrix`, so the numbers cannot differ between
 * them. A table is plain JSON:
 *
 *   { id, caption, columns: [{ key, label, unit?, align?, dp?, group?, rowDp?, signed? }], rows: object[], footnote }
 *
 * Cell values are numbers (already rounded to the displayed precision), strings, or null (blank).
 * `unit: 'row'` takes the unit from `row.unit`. `rowDp: true` takes the decimals from `row.dp`. `dpKey` names a row field that
 * gives the decimals of that cell when the row has it (a value that needs more digits than its column to show which side of a threshold it is on).
 *
 * @typedef {{ key: string, label: string, unit?: string, align?: 'left'|'right', dp?: number, group?: string, rowDp?: boolean, dpKey?: string, signed?: boolean }} ReportColumn
 * @typedef {{ id: string, caption: string, columns: ReportColumn[], rows: Record<string, any>[], footnote: string }} ReportTable
 */

export const MINUS = '−';

/** Round to dp decimals as a number, never returning negative zero. */
export function round(x, dp) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  const r = Number(x.toFixed(dp));
  return r === 0 ? 0 : r;
}

/**
 * @param {number|string|null|undefined} value
 * @param {ReportColumn} col
 * @param {Record<string, any>} row
 * @param {{ unicodeMinus?: boolean }} [opts]
 */
export function formatCell(value, col, row = {}, { unicodeMinus = false } = {}) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '';
  const dp = col.dpKey && Number.isFinite(row[col.dpKey]) ? row[col.dpKey] : col.rowDp ? (row.dp ?? 2) : (col.dp ?? 2);
  let s = Math.abs(value).toFixed(dp);
  const negative = value < 0 && Number(s) !== 0;
  if (col.signed) s = (negative ? '-' : '+') + s;
  else if (negative) s = '-' + s;
  return unicodeMinus ? s.replace('-', MINUS) : s;
}

export const columnUnit = (col, row) => (col.unit === 'row' ? (row?.unit ?? '') : (col.unit ?? ''));

/** Header text of a column for flat exports: "Pre-bronchodilator: Best". Units are separate. */
export const headerLabel = (col) => (col.group ? `${col.group}: ${col.label}` : col.label);

/**
 * The table as strings. `head` is the header row for display (group shown separately in `groups`);
 * `flatHead` includes the group for flat exports; `groups` holds the group spans for a two-row
 * header (null when no column has a group).
 * @param {ReportTable} table
 * @param {{ unicodeMinus?: boolean }} [opts]
 */
export function tableMatrix(table, opts = {}) {
  const { columns, rows } = table;
  const body = rows.map((row) => columns.map((col) => {
    const text = formatCell(row[col.key], col, row, opts);
    // The row label carries its unit, as in "FVC (L)"; a ratio has no unit to print.
    return col.key === 'index' && row.unit && row.unit !== 'ratio' ? `${text} (${row.unit})` : text;
  }));
  const units = columns.map((col) => (col.unit && col.unit !== 'row' ? col.unit : ''));
  const head = columns.map((col, i) => (units[i] ? `${col.label} (${units[i]})` : col.label));
  let groups = null;
  if (columns.some((c) => c.group)) {
    groups = [];
    for (const col of columns) {
      const last = groups[groups.length - 1];
      if (last && last.label === (col.group ?? '')) last.span += 1;
      else groups.push({ label: col.group ?? '', span: 1 });
    }
  }
  const flatHead = columns.map((col, i) => (units[i] ? `${headerLabel(col)} (${units[i]})` : headerLabel(col)));
  return { head, flatHead, groups, body };
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Escaped label with the subscripts used on printed reports. */
export const labelHtml = (s) => esc(s).replace(/FEV1/g, 'FEV<sub>1</sub>').replace(/FRCpleth/g, 'FRC<sub>pleth</sub>');
