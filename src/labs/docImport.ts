import type { Editor } from '../editor/editor';
import { PAGE } from '../model/types';
import { setRun, type RunStyle, type TextRun } from '../model/textLinks';
import { docLines } from './docPage';
import { cleanPaste, fromDom, fromMarkdown } from './richDoc';

/**
 * «Файлы в документ» (src/labs): a text file dropped on the board, a «Документ» of it, to be typed in at
 * once: Markdown (.md) as what it marks, plain text (.txt) a paragraph a line, a web page (.html) as it's
 * pasted from a site, and rich text (.rtf, TextEdit's or WordPad's) with its paragraphs, bold, italic,
 * underlined and struck through. Word's (.docx) as ever, a picture of its first page («Документы Word»).
 */

export type DocText = { text: string; rs: TextRun[] | undefined };

const ext = (f: File) => f.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
/** Whether a file is one made a document of. */
export const isTextDoc = (f: File): boolean => ['md', 'markdown', 'txt', 'text', 'html', 'htm', 'rtf'].includes(ext(f)) || (!ext(f) && f.type.startsWith('text/'));

/** A file's text as a document's: its name (for a title-less one) and what it says. */
export async function readTextDoc(f: File): Promise<DocText> {
  const e = ext(f);
  if (e === 'rtf') return fromRtf(new Uint8Array(await f.arrayBuffer()));
  const raw = (await f.text()).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (e === 'md' || e === 'markdown') return fromMarkdown(raw);
  if (e === 'html' || e === 'htm') return fromHtml(raw);
  return { text: raw.replace(/\n+$/, ''), rs: undefined };
}

/** A web page's text as pasted (cleanPaste), read back as the field reads it (fromDom). */
function fromHtml(html: string): DocText {
  const box = document.createElement('div');
  box.className = 'rich-edit';
  Object.assign(box.style, { position: 'fixed', left: '-100000px', top: '0', width: '600px', visibility: 'hidden' });
  box.innerHTML = cleanPaste(html, 16);
  document.body.append(box);
  try { return fromDom(box, getComputedStyle(box).color); } finally { box.remove(); }
}

/** Rich text (RTF): its text by paragraphs, bold, italic, underlined and struck through on its parts; its
 *  fonts, sizes, colours, tables and pictures left out (their text kept). Letters as \u…, or as bytes in
 *  its code page (\'hh: Cyrillic in cp1251, say). */
export function fromRtf(bytes: Uint8Array): DocText {
  const src = new TextDecoder('latin1').decode(bytes);
  let text = '';
  const marks: Array<{ s: number; e: number; key: keyof RunStyle }> = [];
  type State = { b: boolean; i: boolean; u: boolean; x: boolean; skip: boolean; uc: number };
  const stack: State[] = [];
  let st: State = { b: false, i: false, u: false, x: false, skip: false, uc: 1 };
  let page = 'windows-1252', pendingBytes: number[] = [], skipChars = 0;
  // (Where each style was switched on, to close as it's switched off.)
  const open: Partial<Record<'b' | 'i' | 'u' | 'x', number>> = {};
  const flushBytes = () => {
    if (!pendingBytes.length) return;
    let out: string;
    try { out = new TextDecoder(page).decode(new Uint8Array(pendingBytes)); } catch { out = new TextDecoder('windows-1252').decode(new Uint8Array(pendingBytes)); }
    pendingBytes = [];
    add(out);
  };
  const add = (t: string) => { if (!st.skip) text += t; };
  const set = (key: 'b' | 'i' | 'u' | 'x', on: boolean) => {
    flushBytes();
    if (st.skip || st[key] === on) { st[key] = on; return; }
    if (on) open[key] = text.length;
    else if (open[key] !== undefined) { marks.push({ s: open[key]!, e: text.length, key }); delete open[key]; }
    st[key] = on;
  };
  const DEST = /^(fonttbl|colortbl|stylesheet|info|pict|object|header|footer|headerl|headerr|footerl|footerr|footnote|fldinst|themedata|colorschememapping|latentstyles|datastore|xmlnstbl|listtable|listoverridetable|rsidtbl|generator|mmathPr|filetbl|revtbl|pgdsctbl|nonshppict|shp|bkmkstart|bkmkend)$/;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (skipChars > 0 && c !== '{' && c !== '}' && c !== '\\') { skipChars--; continue; }
    if (c === '{') { flushBytes(); stack.push({ ...st }); continue; }
    if (c === '}') {
      flushBytes();
      const back = stack.pop();
      if (back) for (const k of ['b', 'i', 'u', 'x'] as const) if (back[k] !== st[k]) set(k, back[k]);
      if (back) st = back;
      continue;
    }
    if (c === '\\') {
      const n = src[i + 1];
      if (n === "'") { const h = parseInt(src.slice(i + 2, i + 4), 16); i += 3; if (skipChars > 0) { skipChars--; continue; } if (!st.skip && !Number.isNaN(h)) pendingBytes.push(h); continue; }
      if (n === '\\' || n === '{' || n === '}') { flushBytes(); add(n); i++; continue; }
      if (n === '*') { st.skip = true; i++; continue; }
      if (n === '~') { flushBytes(); add(' '); i++; continue; }
      if (n === '-' || n === '_') { i++; continue; }
      if (n === '\n' || n === '\r') { flushBytes(); add('\n'); i++; continue; }
      const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i + 1, i + 40));
      if (!m) continue;
      i += m[0].length;
      const word = m[1], arg = m[2] === undefined ? undefined : Number(m[2]);
      if (DEST.test(word)) { st.skip = true; continue; }
      switch (word) {
        case 'ansicpg': if (arg) page = `windows-${arg}`; break;
        case 'par': case 'line': case 'sect': flushBytes(); add('\n'); break;
        case 'tab': flushBytes(); add('\t'); break;
        case 'cell': flushBytes(); add(' '); break;
        // (A row's last cell's space not kept: its cells a space apart.)
        case 'row': flushBytes(); if (!st.skip && text.endsWith(' ')) text = text.slice(0, -1); add('\n'); break;
        case 'u': flushBytes(); if (arg !== undefined) add(String.fromCharCode(arg < 0 ? arg + 65536 : arg)); skipChars = st.uc; break;
        case 'uc': st.uc = arg ?? 1; break;
        case 'b': set('b', arg !== 0); break;
        case 'i': set('i', arg !== 0); break;
        case 'ul': set('u', arg !== 0); break;
        case 'ulnone': set('u', false); break;
        case 'strike': set('x', arg !== 0); break;
        case 'plain': for (const k of ['b', 'i', 'u', 'x'] as const) set(k, false); break;
        case 'emdash': flushBytes(); add('—'); break;
        case 'endash': flushBytes(); add('–'); break;
        case 'bullet': flushBytes(); add('•'); break;
        case 'lquote': flushBytes(); add('‘'); break;
        case 'rquote': flushBytes(); add('’'); break;
        case 'ldblquote': flushBytes(); add('“'); break;
        case 'rdblquote': flushBytes(); add('”'); break;
        default: break;
      }
      continue;
    }
    if (c === '\n' || c === '\r') continue;
    pendingBytes.push(c.charCodeAt(0) & 0xff);
  }
  flushBytes();
  for (const k of ['b', 'i', 'u', 'x'] as const) if (open[k] !== undefined) marks.push({ s: open[k]!, e: text.length, key: k });
  // (Its trailing line breaks left out: the marks kept within what's left.)
  const out = text.replace(/\n+$/, '');
  let rs: TextRun[] | undefined;
  for (const m of marks) if (m.e > m.s && m.s < out.length) rs = setRun(rs, m.s, Math.min(m.e, out.length), m.key, true);
  return { text: out, rs };
}

/** The text files dropped at `at` (on the screen), each a «Документ» there, side by side, picked: the
 *  names of those longer than its hundred pages (what's past them kept, not shown). */
export async function placeTextDocs(ed: Editor, files: File[], at: { x: number; y: number }): Promise<string[]> {
  const read = await Promise.allSettled(files.map(readTextDoc));
  const w = ed.toWorld(at.x, at.y), ids: string[] = [], long: string[] = [], GAP = 40;
  ed.board.beginGesture();
  read.forEach((r, k) => {
    if (r.status !== 'fulfilled') return;
    const x = w.x - PAGE.W / 2 + ids.length * (PAGE.W + GAP), y = w.y - PAGE.H / 4;
    const it = ed.newItem('page', x, y, { text: r.value.text, ...(r.value.rs && { rs: r.value.rs }) });
    ed.addItem(it);
    ids.push(it.id);
    const lines = docLines(it);
    if (lines.length && lines[lines.length - 1].e < r.value.text.length) long.push(files[k].name);
  });
  ed.board.endGesture();
  if (ids.length) ed.setSelection(ids);
  return long;
}
