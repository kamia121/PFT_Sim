/**
 * Exports of a report model: CSV (tidy long layout and a wide layout per table), TSV, clipboard
 * HTML, a printable self-contained HTML file, and the browser helpers that deliver them. Every
 * export takes its cell text from `tableMatrix`/`formatCell` in table.js, so a number in the CSV is
 * the number on the page and in the clipboard. Text exports use a plain hyphen-minus so that
 * spreadsheets read the values as numbers; the on-screen report uses a true minus sign.
 */
import { formatCell, columnUnit, headerLabel, tableMatrix, esc } from './table.js';
import { allTables, SIMULATION_MARKER } from './model.js';
import { renderReportDocument } from './html.js';

export const CSV_COLUMNS = ['section', 'table', 'row', 'column', 'value', 'unit'];

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvLine = (cells) => cells.map(csvCell).join(',');
const EOL = '\r\n';

/** Filename that carries the case code: pft-report-<code>[-suffix].<ext> */
export const reportFilename = (model, ext, suffix = '') => `pft-report-${String(model.meta.caseCode).toLowerCase()}${suffix ? `-${suffix}` : ''}.${ext}`;

/** First line of a TSV and the heading of a pasted table. A leading # lets common readers skip it as a comment. */
export const TSV_NOTICE = `# ${SIMULATION_MARKER}`;

/**
 * Long (tidy) rows: one row per value, with the columns section, table, row, column, value, unit.
 * The first row is an ordinary row (section header, table report, row notice) that carries the simulation marker, so the
 * file stays a rectangular table and a reader that filters on section loses nothing but the notice.
 * @returns {string[][]} without the header row
 */
export function longRows(model) {
  const out = [['header', 'report', 'notice', 'value', SIMULATION_MARKER, '']];
  for (const f of model.header.fields) out.push(['header', 'patient', f.label, 'value', f.value, '']);
  for (const s of model.sections) {
    for (const t of s.tables) {
      for (const row of t.rows) {
        for (const col of t.columns) {
          if (col.key === 'index') continue;
          const text = formatCell(row[col.key], col, row);
          if (text === '') continue;
          out.push([s.id, t.id, row.index, headerLabel(col), text, columnUnit(col, row)]);
        }
      }
      out.push([s.id, t.id, '', 'footnote', t.footnote, '']);
    }
  }
  model.technologistComments.forEach((c, i) => out.push(['comments', 'technologist', String(i + 1), 'comment', c, '']));
  model.referenceNote.forEach((c, i) => out.push(['comments', 'reference-equation-note', String(i + 1), 'note', c, '']));
  if (model.interpretation) out.push(['comments', 'interpretation', '1', 'text', model.interpretation, '']);
  (model.interpretationNotes ?? []).forEach((c, i) => out.push(['comments', 'notes-on-simulation', String(i + 1), 'note', c, '']));
  out.push(['footer', 'report', 'case code', 'value', model.meta.caseCode, '']);
  out.push(['footer', 'report', 'generator version', 'value', String(model.meta.generatorVersion), '']);
  return out;
}

/** One table in wide layout: a header row, then one line per table row (units in the labels). */
export function toCsvWide(table) {
  const mx = tableMatrix(table);
  return [csvLine(mx.flatHead), ...mx.body.map(csvLine)].join(EOL) + EOL;
}

/**
 * @param {object} model
 * @param {{ layout?: 'long'|'wide' }} [opts] long: tidy rows for analysis. wide: every table as its own block, as laid out on the page.
 */
export function toCsv(model, { layout = 'long' } = {}) {
  if (layout === 'wide') {
    const blocks = [csvLine([SIMULATION_MARKER])];
    for (const f of [['Case code', model.meta.caseCode], ...model.header.fields.map((x) => [x.label, x.value])]) blocks.push(csvLine(f));
    for (const t of allTables(model)) blocks.push('', csvLine([t.caption]), toCsvWide(t).trimEnd(), csvLine([t.footnote]));
    return blocks.join(EOL) + EOL;
  }
  return [csvLine(CSV_COLUMNS), ...longRows(model).map(csvLine)].join(EOL) + EOL;
}

/** Tab-separated text of one table: a notice line, the flat header, then the rows. */
export function toTsv(table) {
  const mx = tableMatrix(table);
  const clean = (s) => String(s).replace(/[\t\r\n]+/g, ' ');
  return [TSV_NOTICE, ...[mx.flatHead, ...mx.body].map((r) => r.map(clean).join('\t'))].join('\n') + '\n';
}

const TD = 'border:1px solid #000;padding:2px 6px;';
/** A clean <table> with inline styles only, for pasting into PowerPoint, Word or a mail client. */
export function toClipboardHtml(table) {
  const mx = tableMatrix(table);
  const cols = table.columns;
  const align = (c, i) => (i === 0 || c.align === 'left' ? 'left' : 'right');
  const groupRow = mx.groups ? `<tr>${mx.groups.map((g) => `<th colspan="${g.span}" style="${TD}text-align:center;background:#efefef">${esc(g.label)}</th>`).join('')}</tr>` : '';
  const head = `<tr>${mx.head.map((h, i) => `<th style="${TD}text-align:${align(cols[i], i)}">${esc(h)}</th>`).join('')}</tr>`;
  const body = mx.body.map((r) => `<tr>${r.map((v, i) => (i === 0 ? `<th style="${TD}text-align:left">${esc(v)}</th>` : `<td style="${TD}text-align:${align(cols[i], i)}">${esc(v)}</td>`)).join('')}</tr>`).join('');
  const foot = table.footnote ? `<tfoot><tr><td colspan="${cols.length}" style="border:0;padding:3px 0;font-size:9pt">${esc(table.footnote)}</td></tr></tfoot>` : '';
  return `<table style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:10pt"><caption style="text-align:left;font-weight:bold">${esc(table.caption)}<div style="font-weight:normal;font-size:8pt">${esc(SIMULATION_MARKER)}</div></caption><thead>${groupRow}${head}</thead><tbody>${body}</tbody>${foot}</table>`;
}

// ---------------------------------------------------------------- browser delivery

/**
 * Copy a table with both text/html and text/plain. Uses the async Clipboard API and falls back to
 * execCommand('copy') with a copy-event handler that sets both flavors.
 * @returns {Promise<'clipboard'|'execCommand'|false>}
 */
export async function copyTable(table) {
  const html = toClipboardHtml(table), text = toTsv(table);
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return 'clipboard';
    }
  } catch { /* permission or support missing: fall through */ }
  const holder = document.createElement('div');
  holder.innerHTML = html;
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre';
  document.body.appendChild(holder);
  const onCopy = (e) => { e.clipboardData.setData('text/html', html); e.clipboardData.setData('text/plain', text); e.preventDefault(); };
  document.addEventListener('copy', onCopy, { once: true });
  const sel = getSelection();
  const range = document.createRange();
  range.selectNodeContents(holder);
  sel.removeAllRanges();
  sel.addRange(range);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  sel.removeAllRanges();
  document.removeEventListener('copy', onCopy);
  holder.remove();
  return ok ? 'execCommand' : false;
}

function downloadText(filename, text, type, bom = '') {
  const blob = new Blob([bom, text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save CSV text; a byte-order mark makes Excel read UTF-8. */
export function downloadCsv(filename, csv) {
  downloadText(filename, csv, 'text/csv', '﻿');
}

export function printReport() {
  window.print();
}

let cssCache = null;
/** Text of report.css, fetched in the browser and read from disk under Node (tests). */
export async function loadReportCss() {
  if (cssCache) return cssCache;
  const url = new URL('./report.css', import.meta.url);
  if (typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
    const { readFile } = await import('node:fs/promises');
    cssCache = await readFile(url, 'utf8');
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`could not load report.css (${res.status})`);
    cssCache = await res.text();
  }
  return cssCache;
}

/** The complete printable document (inline CSS and SVG), as a string. */
export async function reportDocument(model) {
  return renderReportDocument(model, { css: await loadReportCss() });
}

/** Download a single self-contained HTML file; open it and use the browser's "Save as PDF". */
export async function downloadReportHtml(model) {
  downloadText(reportFilename(model, 'html'), await reportDocument(model), 'text/html');
}
