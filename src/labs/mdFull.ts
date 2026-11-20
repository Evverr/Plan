import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import type { TextLink, TextRun } from '../model/textLinks';
import { newTable, ROW_H } from '../model/table';
import { font, measureTextHeight } from '../canvas/text';
import { docTableLook, objMax, withObject } from './docObjects';
import { textArea } from './docPage';
import { shownMarkdown } from './mdInline';

/**
 * «Markdown полностью» (src/labs): a .md file opened as a «Документ» the way Obsidian or GitHub shows it.
 * Over «Markdown в документе»: its tables as our tables in the text (a long one, a page at a time, its
 * header over each part), its links as links (`[text](address)`, `<address>`, an address alone), its
 * blocks of code coloured by what's in them (strings, numbers, words of the language, comments), and
 * room under a heading as well as over it. Saved as Markdown, all of it comes back as it was.
 */

/** A table as Markdown has it: its rows of cells (the first its header), each column's alignment. */
export interface MdTable { rows: string[][]; aligns: Array<'left' | 'center' | 'right' | undefined> }

/** Whether a line is a table's row: a «|» in it (not escaped). */
const rowLike = (line: string) => /(^|[^\\])\|/.test(line);
/** Whether a line is the one under a table's header: «---» between «|»s, «:» at an end for alignment. */
const ruleLike = (line: string) => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line) && line.includes('-');

/** A table's row's cells (round «|»s taken off, «\|» a «|»). */
function cellsOf(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const out: string[] = [];
  let cur = '', code = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '`') code = !code;
    if (c === '|' && !code) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** The table starting at line `i` (its header there, the rule under it), and how many lines it takes. */
export function tableAt(lines: string[], i: number): { table: MdTable; n: number } | null {
  if (!rowLike(lines[i]) || i + 1 >= lines.length || !ruleLike(lines[i + 1])) return null;
  const head = cellsOf(lines[i]), rule = cellsOf(lines[i + 1]);
  if (rule.length !== head.length) return null;
  const aligns = rule.map((r) => (r.startsWith(':') && r.endsWith(':') ? 'center' : r.endsWith(':') ? 'right' : r.startsWith(':') ? 'left' : undefined)) as MdTable['aligns'];
  const rows = [head];
  let n = 2;
  while (i + n < lines.length && lines[i + n].trim() && rowLike(lines[i + n])) {
    const cells = cellsOf(lines[i + n]);
    rows.push(Array.from({ length: head.length }, (_, k) => cells[k] ?? ''));
    n++;
  }
  return { table: { rows, aligns }, n };
}

/** A cell's text as it's kept (its Markdown, a «<br>» a line break: drawn as it marks, see mdCell), and as
 *  it's shown (for its size), and whether it has code (wider letters). */
export function plainCell(t: string): { text: string; shown: string; code: boolean } {
  const text = t.replace(/<br\s*\/?>/gi, '\n');
  return { text, shown: shownMarkdown(text).text, code: t.includes('`') };
}

/** The letter size of a table in a document, and the room each side and over and under its cells' text. */
const CELL_FS = 14, PAD_X = 16, PAD_Y = 8;

/** A table of Markdown's as our table's fields, `w` wide: its columns as wide as their text asks (each at
 *  least as its longest word, the rest shared by how much more each would take), its rows as tall as their
 *  text comes to, its header in our tables' look. Taller than `maxH`, cut into parts that fit, each with
 *  the header over it. */
export function tableItems(t: MdTable, w: number, maxH: number): Array<Partial<Item>> {
  const n = t.rows[0].length, cells = t.rows.map((r) => r.map(plainCell));
  const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  // (Code's letters wider than the text's: a tenth more room for a cell with any.)
  const wide = (s: string, bold: boolean, code: boolean) => {
    if (!ctx) return s.length * CELL_FS * 0.55;
    ctx.font = font(CELL_FS, bold ? 700 : 400, 'onest');
    return ctx.measureText(s).width * (code ? 1.1 : 1);
  };
  const least = Array.from({ length: n }, (_, c) => Math.max(...cells.map((r, k) => Math.max(0, ...r[c].shown.split(/\s+/).map((word) => wide(word, k === 0, r[c].code))))) + PAD_X * 2 + 2);
  const most = Array.from({ length: n }, (_, c) => Math.max(...cells.map((r, k) => Math.max(...r[c].shown.split('\n').map((l) => wide(l, k === 0, r[c].code))))) + PAD_X * 2 + 2);
  let cols: number[];
  if (most.reduce((a, b) => a + b, 0) <= w) {
    // (All of it fits: the room left shared alike.)
    const spare = (w - most.reduce((a, b) => a + b, 0)) / n;
    cols = most.map((v) => v + spare);
  } else {
    const base = least.map((v) => Math.min(v, w / n * 1.5)), left = Math.max(0, w - base.reduce((a, b) => a + b, 0)), want = most.map((v, c) => Math.max(0, v - base[c])), all = want.reduce((a, b) => a + b, 0) || 1;
    cols = base.map((v, c) => v + (left * want[c]) / all);
    const k = w / cols.reduce((a, b) => a + b, 0);
    cols = cols.map((v) => v * k);
  }
  cols = cols.map((v) => Math.floor(v * 10) / 10);
  const rowH = cells.map((r, k) => Math.max(ROW_H, Math.ceil(Math.max(...r.map((cell, c) => measureTextHeight(cell.shown || ' ', Math.max(1, (cols[c] - PAD_X * 2) / (cell.code ? 1.1 : 1)), CELL_FS, { weight: k === 0 ? 700 : 400 }))) + PAD_Y * 2)));
  // Parts a page tall at most, each with the header over it.
  const parts: number[][] = [];
  let part: number[] = [], h = rowH[0];
  for (let k = 1; k < rowH.length; k++) {
    if (part.length && h + rowH[k] > maxH) { parts.push(part); part = []; h = rowH[0]; }
    part.push(k);
    h += rowH[k];
  }
  parts.push(part);
  return parts.map((ks) => {
    const rows = [0, ...ks], m = rows.length, look = docTableLook(n);
    const fmt = rows.flatMap((k) => cells[k].map((_, c) => {
      const f: Record<string, unknown> = k === 0 ? { ...(look.cellFmt?.[c] ?? {}) } : {};
      if (t.aligns[c]) f.ta = t.aligns[c];
      return Object.keys(f).length ? f : null;
    }));
    return {
      ...newTable(n, m), ...look, fs: CELL_FS, cols, rows: rows.map((k) => rowH[k]), w: cols.reduce((a, b) => a + b, 0), h: rows.reduce((s, k) => s + rowH[k], 0),
      cells: rows.flatMap((k) => cells[k].map((cell) => cell.text)), cellFmt: fmt.some(Boolean) ? fmt : undefined,
    };
  });
}

/** Where `fromMarkdown` put a table's place: a key in the text's runs (`o`) standing for the table to come. */
export const tableKey = (n: number): string => `md-table-${n}`;

/** The tables a document's Markdown had made our tables, put in its text where their places are (each
 *  place a table, a long one's parts one after another): the text's runs with their ids now. */
export function placeMdTables(ed: Editor, doc: Item, tables: MdTable[]): { text: string; rs: TextRun[] | undefined; links: TextLink[] | undefined } {
  const area = textArea(doc), max = objMax(doc);
  let t = { text: doc.text ?? '', rs: doc.rs as TextRun[] | undefined, links: doc.links };
  tables.forEach((table, n) => {
    const key = tableKey(n), place = t.rs?.find((r) => r.o === key);
    if (!place) return;
    const ids = tableItems(table, area.w, max.h).map((fields) => {
      const it = ed.newItem('table', doc.x + area.x, doc.y + area.y, { ...fields, inDoc: doc.id });
      ed.addItem(it);
      return it.id;
    });
    // Its first part in its place; the others, each a paragraph of its own after the one before.
    const para = t.text.slice(0, place.s).split('\n').length - 1;
    t = { ...t, rs: t.rs!.map((r) => (r.o === key ? { ...r, o: ids[0] } : r)) };
    ids.slice(1).forEach((id, k) => { t = withObject(t, id, para + k); });
  });
  return t;
}

