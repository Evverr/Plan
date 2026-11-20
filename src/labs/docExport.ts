import type { Editor } from '../editor/editor';
import { PAGE, type Item } from '../model/types';
import { headingAt, paraAt, type TextRun } from '../model/textLinks';
import { drawScene } from '../canvas/renderer';
import { fileName, saveFile } from '../files';
import { pdfOfPages } from './exportPdf';
import { lightTheme } from './exportPng';
import { docObject, pagesOf, showPage } from './docPage';
import { objectsIn, slotOf } from './docObjects';
import { cellText, colsOf, rowsOf } from '../model/table';
import { labOn } from './labs';
import { printDoc } from './docPrint';

/**
 * «Документ» (docPage.ts) saved as a file: Markdown (its styles as Markdown has them: bold **, italic *,
 * struck through ~~, underlined as <u>, code `…`; colours left out; each line a paragraph: headings,
 * lists, checklists, quotes and dividers as Markdown has them), or a PDF of its pages,
 * each an A4 page as the sheet shows it.
 */

/** Its text in Markdown. */
export function docMarkdown(it: Item): string {
  const text = it.text ?? '', runs = (it.rs ?? []) as TextRun[];
  // (Its links as Markdown has them, «Markdown полностью»: [text](address).)
  const links = labOn('mdFull') ? it.links ?? [] : [];
  const cuts = [...new Set([0, text.length, ...[...runs, ...links].flatMap((r) => [r.s, r.e])])].filter((c) => c >= 0 && c <= text.length).sort((a, b) => a - b);
  let out = '';
  for (let i = 0; i + 1 < cuts.length; i++) {
    const piece = text.slice(cuts[i], cuts[i + 1]);
    // (The styles on it all at once: a heading's, a list's… kept on a paragraph's end, not one of them.)
    const r = runs.filter((k) => k.s <= cuts[i] && k.e >= cuts[i + 1]).reduce<TextRun | undefined>((m, k) => ({ ...m, ...k }), undefined);
    const link = links.find((l) => l.s <= cuts[i] && l.e >= cuts[i + 1]);
    // A styled piece a line at a time (the marks don't run across lines), its spaces outside them.
    out += piece.split('\n').map((line) => {
      const m = /^(\s*)(.*?)(\s*)$/.exec(line)!;
      if ((!r && !link) || !m[2]) return line;
      let core = m[2];
      if (r?.m) core = `\`${core}\``;
      if (r?.u) core = `<u>${core}</u>`;
      if (r?.x) core = `~~${core}~~`;
      if (r?.i) core = `*${core}*`;
      if (r?.b) core = `**${core}**`;
      // (An address alone as itself; else its text in [], its address in ().)
      if (link) core = core === link.url ? `<${link.url}>` : `[${core}](${link.url.replace(/\)/g, '%29').replace(/ /g, '%20')})`;
      return m[1] + core + m[3];
    }).join('\n');
  }
  // Each paragraph on its own, a heading's after its #s.
  let at = 0;
  const raw = text.split('\n');
  const paras = raw.map((p) => {
    const k = paraAt(text, runs, at, 'k'), code = k === 'code';
    const o = { h: code ? 0 : headingAt(text, runs, at), l: code ? undefined : paraAt(text, runs, at, 'l'), k, d: code ? 0 : paraAt(text, runs, at, 'd') ?? 0, o: paraAt(text, runs, at, 'o'), g: code ? paraAt(text, runs, at, 'g') : undefined };
    at += p.length + 1;
    return o;
  });
  // A list's items one under another (numbered from 1 at each depth as they follow one another, four
  // spaces in at each; a checklist's with its box, ticked or not), the rest a blank line apart; a quote's
  // after «> » (its paragraphs a «>» apart), a divider «---»; a block of code's lines as they are, between
  // «```»s.
  let nums: number[] = [];
  const marker = (l: string | undefined, d: number) => (l === 'number' ? `${nums[d]}.` : l === 'todo' ? '- [ ]' : l === 'done' ? '- [x]' : '-');
  return out.split('\n').map((p, i) => {
    const { h, l, k, d } = paras[i], q = k === 'quote' ? '> ' : '', prev = paras[i - 1], next = paras[i + 1];
    if (l) { nums.length = d + 1; nums[d] = l === 'number' ? (nums[d] ?? 0) + 1 : 0; } else nums = [];
    if (k === 'code') {
      // (Its language after the «```» it opens with, «Markdown полностью».)
      const line = `${prev?.k === 'code' ? '' : `\`\`\`${labOn('mdFull') ? paras[i].g ?? '' : ''}\n`}${raw[i]}${next?.k === 'code' ? '' : '\n```'}`;
      return i === 0 ? line : `${prev.k === 'code' ? '\n' : '\n\n'}${line}`;
    }
    // A table put in its place («Таблица в документе»): as Markdown has one, its first row the header.
    const table = paras[i].o ? docObject(paras[i].o!) : undefined;
    // (A part of a long one after the one before it, the same header: its rows go on under that one's.)
    const before = prev?.o ? docObject(prev.o) : undefined;
    if (table && before && labOn('mdFull') && sameHeader(table, before)) return rowsOf(table).length > 1 ? `\n${tableMarkdown(table, true)}` : '';
    if (table) { const line = tableMarkdown(table); return i === 0 ? line : `\n\n${line}`; }
    const line = k === 'hr' ? '---' : q + (h && p.trim() ? `${'#'.repeat(h)} ${p.replace(/^\*\*(.*)\*\*$/, '$1')}` : l ? `${'    '.repeat(d)}${marker(l, d)} ${p}` : p);
    return i === 0 ? line : `${l && prev.l && prev.k === k ? '\n' : q && prev.k === 'quote' ? '\n>\n' : '\n\n'}${line}`;
  }).join('') + '\n';
}

/** A table as Markdown has one: a row a line, its cells between «|»s (a «|» in them as «\|», their lines
 *  run together), a «---» under the first. */
export function tableMarkdown(t: Item, rowsOnly = false): string {
  const n = colsOf(t).length, m = rowsOf(t).length;
  // (Its Markdown as it is, «Markdown полностью»: a line break in it a «<br>».)
  const cell = (i: number) => cellText(t, i).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, labOn('mdFull') ? '<br>' : ' ').trim();
  const row = (r: number) => `| ${Array.from({ length: n }, (_, c) => cell(r * n + c)).join(' | ')} |`;
  // (Each column's alignment, as its header's cell has it.)
  const rule = `|${Array.from({ length: n }, (_, c) => { const a = labOn('mdFull') ? t.cellFmt?.[c]?.ta : undefined; return a === 'center' ? ' :---: |' : a === 'right' ? ' ---: |' : a === 'left' ? ' :--- |' : ' --- |'; }).join('')}`;
  const body = Array.from({ length: m - 1 }, (_, r) => row(r + 1));
  return (rowsOnly ? body : [row(0), rule, ...body]).join('\n');
}

/** Whether two tables have the same header: a long one cut into parts a page each («Markdown полностью»). */
const sameHeader = (a: Item, b: Item): boolean => {
  const n = colsOf(a).length;
  return n === colsOf(b).length && Array.from({ length: n }, (_, c) => cellText(a, c) === cellText(b, c)).every(Boolean);
};

/** Saves it as Markdown, named after its first line. */
export function saveMarkdown(ed: Editor, it: Item): void {
  saveFile(new Blob([docMarkdown(it)], { type: 'text/markdown' }), fileName(ed, 'md', titleOf(it)));
}

/** Saves it as a PDF, a page of A4 for each of its pages, at twice the board's size for sharpness. */
export async function savePdf(ed: Editor, it: Item): Promise<void> {
  // («PDF с текстом», src/labs: by the browser's printing, its text real text in it, not pictures of its pages.)
  if (labOn('pdfText')) { await printDoc(ed, it, titleOf(it)); return; }
  const scale = 2, pages = pagesOf(it), out: Array<{ jpeg: Uint8Array; w: number; h: number }> = [];
  // (A long one takes a while: how far it's got said at the top, every few pages.)
  const say = (text: string) => window.dispatchEvent(new CustomEvent('planx:say', { detail: { text } }));
  for (let n = 0; n < pages.length; n++) {
    if (pages.length > 10 && n % 5 === 0) { say(`Готовлю PDF: страница ${n + 1} из ${pages.length}`); await new Promise((r) => setTimeout(r, 0)); }
    const canvas = document.createElement('canvas');
    canvas.width = PAGE.W * scale;
    canvas.height = PAGE.H * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const sheet = { ...it, x: 0, y: 0 }, was = showPage(it.id, n);
    // (With the tables put in its text on that page, «Таблица в документе», where they stand on it.)
    const tables = objectsIn(it).map((id) => ed.board.get(id)).filter((t): t is Item => !!t && slotOf(it, t.id)?.page === n)
      .map((t) => ({ ...t, x: t.x - it.x, y: t.y - it.y, inDoc: undefined }));
    drawScene(ctx, {
      items: [sheet, ...tables], links: [], get: (id) => (id === it.id ? sheet : tables.find((t) => t.id === id) ?? ed.board.get(id)), cam: { x: 0, y: 0, z: scale }, theme: lightTheme(),
      width: canvas.width, height: canvas.height, dpr: 1, noBackground: true, selection: new Set(), editingId: null, marquee: null, linkPreview: null,
      peers: [], showHandle: false, byFinger: false, hotDot: null, hotPlus: null, plusFade: 0, mindMove: null, tableLines: [], editingCell: null,
      guides: [], pickedCells: null, stroke: null,
    });
    showPage(it.id, was);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) return;
    out.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height });
  }
  // A4 in points.
  saveFile(new Blob([pdfOfPages(out, 595.28, 841.89)], { type: 'application/pdf' }), fileName(ed, 'pdf', titleOf(it)));
  if (pages.length > 10) say(`PDF готов: ${pages.length} страниц`);
}

/** A name for its file: its first line, or «Документ». */
const titleOf = (it: Item) => (it.text ?? '').split('\n').find((l) => l.trim())?.trim().slice(0, 60) || 'Документ';
