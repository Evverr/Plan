import type { Item } from '../model/types';
import type { RunStyle, TextLink, TextRun } from '../model/textLinks';
import { labOn } from './labs';

/**
 * Markdown in a line (richDoc.ts's fromMarkdown, «Markdown в документе»), and in a table's cell
 * («Markdown полностью», mdFull.ts): a cell keeps the Markdown it was given (`code`, **bold**, a link…), typed
 * in as it is, drawn as what it marks (mdCell), saved back as it was.
 */

export type Mark = { s: number; e: number; key: keyof RunStyle };

/** A line's marks taken out, what they mark kept (by where it comes to stand), marks in marks too: code
 *  (`…`), bold (**…**, __…__), italic (*…*, _…_), struck through (~~…~~), underlined (<u>…</u>); a link's
 *  text (`[text](address)`, a picture's `![text](address)`, `[[a note]]`), with `links` its address too
 *  (and `<address>`, an address alone); `\*` and the like as the letter. */
export function inline(line: string, links: boolean): { t: string; marks: Mark[]; links: TextLink[] } {
  let t = '';
  const marks: Mark[] = [], found: TextLink[] = [];
  const re = /`([^`]+)`|\\([\\`*_{}[\]()#+\-.!|~>=<])|!?\[([^\]]*)\]\(<?([^)\s>]*)>?(?:\s+"[^"]*")?\)|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|<(https?:\/\/[^>\s]+)>|<u>(.+?)<\/u>|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|==(.+?)==|\*([^*\s](?:[^*]*[^*\s])?)\*|(?<![\p{L}\d])_([^_\s](?:[^_]*[^_\s])?)_(?![\p{L}\d])|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"»])|<br\s*\/?>/gu;
  let at = 0;
  for (const x of line.matchAll(re)) {
    t += line.slice(at, x.index);
    at = x.index! + x[0].length;
    const s = t.length;
    if (x[1] !== undefined) { t += x[1]; marks.push({ s, e: t.length, key: 'm' }); continue; }
    if (x[2] !== undefined) { t += x[2]; continue; }
    if (/^<br/.test(x[0])) { t += ' '; continue; }
    // (What's marked, its own marks in it too.)
    const nested = (inner: string, key?: keyof RunStyle, url?: string) => {
      const sub = inline(inner, links);
      for (const mk of sub.marks) marks.push({ ...mk, s: mk.s + s, e: mk.e + s });
      // (A link round it the one there: an address in its text not one of its own.)
      if (!url) for (const l of sub.links) found.push({ ...l, s: l.s + s, e: l.e + s });
      t += sub.t;
      if (key && t.length > s) marks.push({ s, e: t.length, key });
      if (url && links && t.length > s) found.push({ s, e: t.length, url });
    };
    if (x[3] !== undefined) nested(x[3] || x[4], undefined, x[4] || undefined);
    else if (x[5] !== undefined) nested(x[6] ?? x[5]);
    else if (x[7] !== undefined) { t += x[7]; if (links) found.push({ s, e: t.length, url: x[7] }); }
    else if (x[8] !== undefined) nested(x[8], 'u');
    else if (x[9] !== undefined || x[10] !== undefined) nested(x[9] ?? x[10], 'b');
    else if (x[11] !== undefined) nested(x[11], 'x');
    else if (x[12] !== undefined) nested(x[12]);
    else if (x[13] !== undefined || x[14] !== undefined) nested(x[13] ?? x[14], 'i');
    else if (x[15] !== undefined) { t += x[15]; if (links) found.push({ s, e: t.length, url: x[15] }); }
  }
  t += line.slice(at);
  return { t, marks, links: found };
}

/** Whether a cell's text has any Markdown in it to be drawn (a quick look before the whole of it). */
const MARKUP = /[`*_~=\\<[]|https?:\/\//;

/** A text in Markdown (a cell's) as it's shown: its marks taken out, its styles and links on what they mark. */
export function shownMarkdown(text: string): { text: string; rs: TextRun[]; links: TextLink[] } {
  let out = '';
  const rs: TextRun[] = [], links: TextLink[] = [];
  text.split('\n').forEach((line, k) => {
    if (k) out += '\n';
    const p = inline(line, true), s0 = out.length;
    for (const m of p.marks) rs.push({ s: m.s + s0, e: m.e + s0, [m.key]: true });
    for (const l of p.links) links.push({ ...l, s: l.s + s0, e: l.e + s0 });
    out += p.t;
  });
  return { text: out, rs, links };
}

/** A table's cell (as cellItem gives it) drawn as its Markdown marks it, «Markdown полностью»: its text
 *  without the marks, its styles and links on it. Kept while it's the same. */
const shown = new Map<string, { text: string; rs: TextRun[]; links: TextLink[] }>();
export function mdCell(cell: Item): Item {
  const raw = cell.text ?? '';
  if (!raw || !MARKUP.test(raw) || !labOn('mdFull')) return cell;
  let md = shown.get(raw);
  if (!md) {
    md = shownMarkdown(raw);
    if (shown.size > 2000) shown.clear();
    shown.set(raw, md);
  }
  return { ...cell, text: md.text, rs: md.rs.length ? md.rs : undefined, links: md.links.length ? md.links : undefined };
}
