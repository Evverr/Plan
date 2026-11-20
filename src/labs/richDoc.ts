import { TEXT_COLORS, type Item } from '../model/types';
import { headingAt, paraAt, setHeading, setPara, setRun, type RunStyle, type TextRun } from '../model/textLinks';
import { FONTS } from '../canvas/text';
import { CODE_SIZE, docObjectIn, HEADING_SIZE, headingOver, headingUnder, LIST_DEPTH, OBJ_GAP } from './docPage';
import { objectPicture } from './docObjects';
import { codeTokens } from './codeColors';
import { labOn } from './labs';
import { tableAt, tableKey, type MdTable } from './mdFull';
import { inline, type Mark } from './mdInline';
import type { TextLink } from '../model/textLinks';

/**
 * «Документ» typed in as it looks (RichEditor.tsx): its text and the styles on its parts (model/textLinks.ts)
 * as the paragraphs and pieces of a field the browser edits, and back. Whatever the browser makes of it as
 * it's typed in (its own <b>, <i>, <font>, spans, line breaks), it's read back by how it looks: each piece
 * of text by its weight, slant, lines and colour as the page has them, each paragraph by its heading level.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** A colour of the text panel's as CSS ('#rrggbb' as it is). */
export const cssColor = (c: string) => (c.startsWith('#') ? c : TEXT_COLORS[c] || '');

/** Code in a line, as the field shows it (its grey round it, no room taken: as the page draws it). */
export const CODE_CSS = `font-family:${FONTS.mono.css.replace(/"/g, "'")};font-size:${CODE_SIZE}em;background:rgba(127,127,127,.14);border-radius:4px`;

/** A paragraph's look as a heading (or plain), as the page draws it. */
export function headingStyle(level: number, fs: number, first: boolean, own?: number, align?: string): string {
  // (Its own size of text, set for it alone, over its level's; its own alignment.)
  const size = own ?? Math.round(fs * HEADING_SIZE[level]), a = align ? `text-align:${align}` : '';
  // (And the room under it, «Markdown полностью»: what follows not stuck to it.)
  const under = level ? headingUnder(size) : 0;
  return [level ? `font-size:${size}px;font-weight:700;margin-top:${first ? 0 : headingOver(size)}px${under ? `;margin-bottom:${under}px` : ''}` : own ? `font-size:${own}px` : '', a].filter(Boolean).join(';');
}

/** Its text as the field's HTML: a <div> a paragraph (data-h its level), a <span> a styled piece. */
/** (`urls`: its links with their addresses on them, pasted Markdown's, to be kept as links: see fromDom.) */
export function toHtml(it: Item, urls = false): string {
  const text = it.text ?? '', runs = (it.rs ?? []) as TextRun[], fs = it.fs ?? 16;
  let at = 0;
  // (A table's place where it's first in the text: any other paragraph with it, an empty one.)
  const placed = new Set<string>();
  return text.split('\n').map((para, n) => {
    const s0 = at, h = headingAt(text, runs, s0), l = paraAt(text, runs, s0, 'l'), z = paraAt(text, runs, s0, 'z'), a = paraAt(text, runs, s0, 'a'), k = paraAt(text, runs, s0, 'k'), d = paraAt(text, runs, s0, 'd'), g = paraAt(text, runs, s0, 'g');
    at += para.length + 1;
    // A table put in its place («Таблица в документе»): as tall as its room on the sheet, a picture of it
    // there, not typed in (taken out whole, as a letter is).
    const oid = paraAt(text, runs, s0, 'o'), obj = oid && !placed.has(oid) ? docObjectIn(it, oid) : undefined;
    if (obj) placed.add(obj.id);
    if (obj) {
      const pic = objectPicture(obj);
      return `<div data-h="0" data-o="${oid}" contenteditable="false" class="rich-obj" style="height:${obj.h + OBJ_GAP * 2}px;background:url(${pic}) no-repeat 0 ${OBJ_GAP}px / ${obj.w}px ${obj.h}px"></div>`;
    }
    // (Its links blue in it, as on the sheet: marked, their colour not taken for one of the text's.)
    const links = it.links ?? [];
    // (A line of code coloured by what's in it, «Markdown полностью», as on the sheet: marked, not kept.)
    const tokens = k === 'code' && labOn('mdFull') ? codeTokens(para) : [];
    const cuts = [...new Set([0, para.length, ...[...[...runs, ...links].flatMap((r) => [r.s - s0, r.e - s0]), ...tokens.flatMap((t) => [t.s, t.e])].filter((c) => c > 0 && c < para.length)])].sort((a, b) => a - b);
    const inner = k === 'hr' ? '' : cuts.slice(0, -1).map((c, i) => {
      const e = cuts[i + 1], r = runs.filter((k) => !k.h && k.s <= s0 + c && k.e >= s0 + e).reduce((m, k) => ({ ...m, ...k }), {} as RunStyle);
      const link = links.find((l) => l.s <= s0 + c && l.e >= s0 + e), hl = !r.c && !link ? tokens.find((t) => t.s <= c && t.e >= e)?.c : undefined;
      const css = [r.b && 'font-weight:700', r.i && 'font-style:italic', (r.u || r.x) && `text-decoration:${[r.u && 'underline', r.x && 'line-through'].filter(Boolean).join(' ')}`,
        link ? `color:${TEXT_COLORS.blue}` : r.c ? `color:${cssColor(r.c)}` : hl && `color:${cssColor(hl)}`, r.m && k !== 'code' && CODE_CSS].filter(Boolean).join(';');
      const t = esc(para.slice(c, e)), code = r.m && k !== 'code';
      // (Code marked so as well as by its look: a document all in the monospaced font has it too.)
      // (A link with its address, for it to be kept as one when pasted.)
      return css ? `<span${code ? ' data-code=""' : ''}${link ? ` data-link=""${urls ? ` data-url="${esc(link.url).replace(/"/g, '&quot;')}"` : ''}` : ''}${link && r.c ? ` data-c="${esc(r.c)}"` : ''}${hl ? ' data-hl=""' : ''} style="${css}">${t}</span>` : t;
    }).join('');
    return `<div data-h="${h}"${l ? ` data-l="${l}"` : ''}${z ? ` data-z="${z}"` : ''}${a ? ` data-a="${a}"` : ''}${k ? ` data-k="${k}"` : ''}${d ? ` data-d="${d}"` : ''}${g ? ` data-g="${esc(g)}"` : ''} style="${headingStyle(h, fs, n === 0, z, a)}">${inner || '<br>'}</div>`;
  }).join('');
}

/** Pasted HTML (copied here, or from anywhere) as the field's own: paragraphs (a heading's level from
 *  <h1>…<h6> or a paragraph of ours; lists, checklists, quotes, dividers), and in them only what a
 *  document has, bold, italic, underlined, struck through, coloured and code, by the tags or the inline
 *  styles it comes with; the rest (fonts, sizes, backgrounds, tables, pictures) left out, their text kept. */
export function cleanPaste(html: string, fs: number): string {
  const doc = new DOMParser().parseFromString(html, 'text/html'), out: string[] = [];
  // (In a quote while `quote` is over 0: a <blockquote>, or a paragraph of ours one.)
  let line = '', level = 0, list = '', quote = 0, depth = 0;
  const flush = () => { out.push(`<div data-h="${level}"${list ? ` data-l="${list}"` : ''}${list && depth ? ` data-d="${depth}"` : ''}${quote ? ' data-k="quote"' : ''} style="${headingStyle(level, fs, !out.length)}">${line || '<br>'}</div>`); line = ''; level = 0; list = ''; depth = 0; };
  const BLOCK = /^(DIV|P|LI|H[1-6]|TR|BLOCKQUOTE|PRE|UL|OL|TABLE|SECTION|ARTICLE)$/;
  const walk = (node: Node, st: { b?: boolean; i?: boolean; u?: boolean; x?: boolean; c?: string; m?: boolean }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = esc((node.textContent ?? '').replace(/\s+/g, ' '));
      if (!t.trim() && !line) return;
      const css = [st.b && 'font-weight:700', st.i && 'font-style:italic', (st.u || st.x) && `text-decoration:${[st.u && 'underline', st.x && 'line-through'].filter(Boolean).join(' ')}`,
        st.c && `color:${st.c}`, st.m && CODE_CSS].filter(Boolean).join(';');
      line += css ? `<span${st.m ? ' data-code=""' : ''} style="${css}">${t}</span>` : t;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName, s = node.style, next = { ...st };
    if (tag === 'BR') { flush(); return; }
    // A divider (<hr>, or one of ours): a paragraph of its own.
    if (tag === 'HR' || node.dataset.k === 'hr') { if (line) flush(); out.push(`<div data-h="0" data-k="hr"><br></div>`); return; }
    // A checklist's box (as GitHub's Markdown puts one in its item): that item one of a checklist.
    if (tag === 'INPUT') { if ((node as HTMLInputElement).type === 'checkbox') list = (node as HTMLInputElement).checked ? 'done' : 'todo'; return; }
    // A block of code (<pre>, or a line of one of ours): each of its lines a paragraph of code, as it is.
    if (tag === 'PRE' || node.dataset.k === 'code') {
      if (line) flush();
      const lines = (node.textContent ?? '').replace(/\n$/, '').split('\n');
      for (const t of lines) out.push(`<div data-h="0" data-k="code">${esc(t) || '<br>'}</div>`);
      return;
    }
    if (/^(SCRIPT|STYLE|IMG|SVG|VIDEO|IFRAME|HEAD|META)$/.test(tag)) return;
    // Code in a line (not a block of it, <pre>: its text as it is).
    if ((tag === 'CODE' && !node.closest('pre')) || node.dataset.code !== undefined || (tag === 'SPAN' && s.fontFamily.includes('JetBrains Mono'))) next.m = true;
    const quoted = tag === 'BLOCKQUOTE' || node.dataset.k === 'quote';
    if (quoted && line) flush();
    if (quoted) quote++;
    if (tag === 'B' || tag === 'STRONG' || (parseInt(s.fontWeight) || (s.fontWeight === 'bold' ? 700 : 0)) >= 600) next.b = true;
    // (Not bold as its own style says: Google Docs puts all it gives in a <b style="font-weight:normal">.)
    if (s.fontWeight === 'normal' || s.fontWeight === 'lighter' || ((parseInt(s.fontWeight) || 0) > 0 && parseInt(s.fontWeight) < 600)) next.b = false;
    if (tag === 'I' || tag === 'EM' || s.fontStyle === 'italic') next.i = true;
    if (tag === 'U' || s.textDecoration.includes('underline') || s.textDecorationLine.includes('underline')) next.u = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || s.textDecoration.includes('line-through') || s.textDecorationLine.includes('line-through')) next.x = true;
    // (Its colour, but a black or dark grey one, the text's own as it's given everywhere: the document's then.)
    if (s.color) next.c = inkLike(s.color) ? undefined : s.color;
    const block = BLOCK.test(tag), h = /^H([1-6])$/.exec(tag)?.[1] ?? (node.dataset.h && node.dataset.h !== '0' ? node.dataset.h : undefined);
    if (block && line) flush();
    if (h) level = Number(h);
    // A list's item (of ours, or of a list pasted: numbered in an <ol>).
    // (In a list in a list, as deep as the items it's in: of ours, as its paragraph has it.)
    const l = tag === 'LI' ? (node.parentElement?.tagName === 'OL' ? 'number' : 'bullet') : node.dataset.l;
    if (l === 'bullet' || l === 'number' || l === 'todo' || l === 'done') {
      list = l;
      let d = 0;
      for (let e = node.parentElement?.closest('li'); e; e = e.parentElement?.closest('li')) d++;
      depth = Math.min(LIST_DEPTH, tag === 'LI' ? d : Number(node.dataset.d) || 0);
    }
    // (A heading's text bold as it is.)
    if (h) next.b = false;
    node.childNodes.forEach((c) => walk(c, next));
    // (A table's cells pasted: their texts a space apart, each row a paragraph.)
    if ((tag === 'TD' || tag === 'TH') && node.nextElementSibling && line && !line.endsWith(' ')) line += ' ';
    if (block && (line || h)) flush();
    if (quoted) quote--;
  };
  walk(doc.body, {});
  if (line) flush();
  return out.join('');
}

/** Whether a CSS colour is the text's own as it's pasted from anywhere: black, or a dark grey (not a colour). */
function inkLike(css: string): boolean {
  const probe = document.createElement('span');
  probe.style.color = css;
  document.body.append(probe);
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(probe).color);
  probe.remove();
  if (!m) return /^(windowtext|inherit|initial|currentcolor)$/i.test(css.trim());
  const [r, g, b] = [m[1], m[2], m[3]].map(Number);
  return Math.max(r, g, b) - Math.min(r, g, b) < 24 && (r + g + b) / 3 < 100;
}

/** '#rrggbb' of a CSS colour ('rgb(…)'), a key of TEXT_COLORS when it's one of them. */
function colorKey(css: string): string {
  // (Or as a colour mixed has it, `color(srgb r g b / a)`, 0…1: a ticked item's text, faint, its own colour still.)
  const s = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(css);
  const m = s ? [s[0], ...[s[1], s[2], s[3]].map((v) => String(Math.round(parseFloat(v) * 255)))] : /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
  if (!m) return css;
  const hex = `#${[m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  return Object.entries(TEXT_COLORS).find(([, v]) => v.toUpperCase() === hex)?.[0] ?? hex;
}

/** The text and its styles as the field has them now: `ink` the text's own colour (no colour of its own). */
export function fromDom(root: HTMLElement, ink: string): { text: string; rs: TextRun[] | undefined; urls: TextLink[] } {
  let text = '';
  // (The links shown with their addresses, «Markdown полностью»: where they are now, one after another of
  // the same address one.)
  const urls: TextLink[] = [];
  const marks: Array<{ s: number; e: number; st: RunStyle }> = [], heads: Array<[number, number]> = [], lists: Array<[number, string]> = [], sizes: Array<[number, number]> = [], aligns: Array<[number, string]> = [], kinds: Array<[number, string]> = [], depths: Array<[number, number]> = [], objs: Array<[number, string]> = [], langs: Array<[number, string]> = [];
  const own = colorKey(ink);
  /** The look of a piece of text by the element it's in, up to its paragraph. */
  const look = (el: Element, para: Element, heading: boolean): RunStyle => {
    const cs = getComputedStyle(el), st: RunStyle = {};
    // (A heading's text is bold as it is: bold in it only beyond that.)
    if (!heading && (parseInt(cs.fontWeight) || 400) >= 600) st.b = true;
    if (cs.fontStyle === 'italic') st.i = true;
    // Code: in the monospaced font, the paragraph not.
    if (el.closest('[data-code]') && para.contains(el.closest('[data-code]')) || (cs.fontFamily.includes('JetBrains Mono') && !getComputedStyle(para).fontFamily.includes('JetBrains Mono'))) st.m = true;
    // (A ticked item of a checklist is struck through as it is: its text by that alone, not.)
    for (let e: Element | null = el; e && e !== ((para as HTMLElement).dataset.l === 'done' ? para : para.parentElement); e = e.parentElement) {
      const d = getComputedStyle(e).textDecorationLine;
      if (d.includes('underline') || e.tagName === 'U') st.u = true;
      if (d.includes('line-through') || e.tagName === 'S' || e.tagName === 'STRIKE') st.x = true;
    }
    // (A link's blue its own, not the text's: the colour it had under it kept, if any.)
    const link = el.closest('[data-link]') as HTMLElement | null;
    // (Nor code's colours, «Markdown полностью»: they're drawn by what's in it, not kept.)
    const hl = el.closest('[data-hl]');
    const c = link && para.contains(link) ? link.dataset.c : hl && para.contains(hl) ? undefined : colorKey(cs.color);
    if (c && c !== own) st.c = c;
    return st;
  };
  const paras: Element[] = [];
  // (Text straight in the field, as when all of it was taken away and typed again: a paragraph of its own.)
  if ([...root.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent)) {
    const div = document.createElement('div');
    while (root.firstChild) div.appendChild(root.firstChild);
    root.appendChild(div);
  }
  for (const el of root.children) paras.push(el);
  paras.forEach((para, n) => {
    if (n > 0) text += '\n';
    const h = Number((para as HTMLElement).dataset.h) || 0, start = text.length;
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent ?? '').replace(/ /g, ' ');
        // (Not the gap put after code to type past it, RichEditor.tsx.)
        const bare = t.replace(/\u200B/g, '');
        if (!bare) return;
        const st = look(node.parentElement ?? para, para, h > 0);
        if (Object.keys(st).length) marks.push({ s: text.length, e: text.length + bare.length, st });
        const url = (node.parentElement?.closest('[data-url]') as HTMLElement | null)?.dataset.url, last = urls[urls.length - 1];
        if (url && last?.url === url && last.e === text.length) last.e += bare.length;
        else if (url) urls.push({ s: text.length, e: text.length + bare.length, url });
        text += bare;
      } else if (node.nodeName === 'BR') {
        // A line break inside a paragraph (Shift+Enter): a paragraph of its own; one at its end, nothing.
        if (node.nextSibling || (node.parentNode !== para && node.parentNode?.nextSibling)) text += '\n';
      } else if (node.nodeName === 'DIV' || node.nodeName === 'P') {
        if (text.length > start && !text.endsWith('\n')) text += '\n';
        node.childNodes.forEach(walk);
      } else node.childNodes.forEach(walk);
    };
    para.childNodes.forEach(walk);
    if (h) heads.push([start, h]);
    const l = (para as HTMLElement).dataset.l;
    if (l === 'bullet' || l === 'number' || l === 'todo' || l === 'done') lists.push([start, l]);
    const k = (para as HTMLElement).dataset.k;
    if (k === 'quote' || k === 'hr' || k === 'code') kinds.push([start, k]);
    const d = Number((para as HTMLElement).dataset.d) || 0;
    if (d) depths.push([start, d]);
    const g = (para as HTMLElement).dataset.g;
    if (g && k === 'code') langs.push([start, g]);
    const o = (para as HTMLElement).dataset.o;
    if (o && !objs.some(([, x]) => x === o)) objs.push([start, o]);
    const z = Number((para as HTMLElement).dataset.z) || 0;
    if (z) sizes.push([start, z]);
    const al = (para as HTMLElement).dataset.a;
    if (al === 'left' || al === 'center' || al === 'right') aligns.push([start, al]);
  });
  let rs: TextRun[] | undefined;
  for (const m of marks) for (const [k, v] of Object.entries(m.st)) rs = setRun(rs, m.s, m.e, k as keyof RunStyle, true, v as string | number);
  for (const [at, h] of heads) rs = setHeading(text, rs, at, at, h);
  for (const [at, l] of lists) rs = setPara(text, rs, at, at, 'l', l);
  for (const [at, z] of sizes) rs = setPara(text, rs, at, at, 'z', z);
  for (const [at, a] of aligns) rs = setPara(text, rs, at, at, 'a', a);
  for (const [at, k] of kinds) rs = setPara(text, rs, at, at, 'k', k);
  for (const [at, d] of depths) rs = setPara(text, rs, at, at, 'd', d);
  for (const [at, g] of langs) rs = setPara(text, rs, at, at, 'g', g);
  for (const [at, o] of objs) rs = setPara(text, rs, at, at, 'o', o);
  return { text, rs, urls };
}

/** Whether plain text pasted is written in Markdown («Markdown в документе»): a heading, a list, a quote, a
 *  block of code or a divider on a line of its own, or bold or code in a line. */
export function looksLikeMarkdown(text: string): boolean {
  return /^(#{1,6}\s|>\s?|\s*[-*+]\s|\s*\d+[.)]\s|\s*```|(-{3,}|\*{3,}|_{3,})\s*$)/m.test(text) || /\*\*[^*\n]+\*\*|`[^`\n]+`/.test(text)
    // (A table, or a link with its address, «Markdown полностью».)
    || (labOn('mdFull') && (/^\s*\|?.*\|.*\n\s*\|?\s*:?-+:?\s*\|/m.test(text) || /\[[^\]\n]+\]\([^)\s]+\)/.test(text)));
}

/** Text in Markdown as a document's: its paragraphs, each a heading (#…######), a list's item (-, *, +,
 *  1.; deeper as it's further in), a checklist's ([ ], [x]), a quote (>), a line of a block of code
 *  (between ```s), a divider (---); in them bold (**…**, __…__), italic (*…*, _…_), struck through (~~…~~)
 *  and code (`…`), a link's text alone ([…](…)). */
export function fromMarkdown(md: string): { text: string; rs: TextRun[] | undefined; links?: TextLink[]; tables?: MdTable[] } {
  // («Markdown полностью»: its links kept as links, its tables made tables, see mdFull.ts.)
  const full = labOn('mdFull');
  const lines = md.replace(/\r/g, '').replace(/\n+$/, '').split('\n');
  // (How far in a list in a list goes: the least any item's in.)
  const ins = lines.map((l) => /^(\s+)(?:[-*+]|\d+[.)])\s/.exec(l)?.[1].replace(/\t/g, '    ').length ?? 0).filter((n) => n > 0);
  const unit = ins.length ? Math.min(...ins) : 2;
  type Keys = Partial<Record<'h' | 'l' | 'k' | 'd' | 'o' | 'g', string | number>>;
  const paras: Array<{ t: string; keys: Keys; marks: Mark[]; links: TextLink[] }> = [], tables: MdTable[] = [];
  // (A block of code's language, on its first line, «Markdown полностью»: given back when it's saved.)
  let code = false, lang = '';
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*```/.test(raw)) { code = !code; lang = code && full ? raw.replace(/^\s*```/, '').trim() : ''; continue; }
    if (code) { paras.push({ t: raw, keys: { k: 'code', ...(lang && { g: lang }) }, marks: [], links: [] }); lang = ''; continue; }
    // (A blank line between paragraphs only parts them, as Markdown has it: no line of its own.)
    if (!raw.trim()) continue;
    // A table: its place, a paragraph of its own (made one of ours once the document's there, mdFull.ts).
    const tb = full ? tableAt(lines, i) : null;
    if (tb) { paras.push({ t: '', keys: { o: tableKey(tables.length) }, marks: [], links: [] }); tables.push(tb.table); i += tb.n - 1; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) { paras.push({ t: '', keys: { k: 'hr' }, marks: [], links: [] }); continue; }
    let line = raw, m: RegExpExecArray | null;
    const keys: Keys = {};
    if ((m = /^>\s?(.*)$/.exec(line))) { keys.k = 'quote'; line = m[1]; }
    if ((m = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line))) { keys.h = m[1].length; line = m[2]; }
    else if ((m = /^(\s*)[-*+]\s+\[([ xXх])\]\s+(.*)$/.exec(line))) { keys.l = m[2] === ' ' ? 'todo' : 'done'; keys.d = Math.round(m[1].length / unit); line = m[3]; }
    else if ((m = /^(\s*)[-*+]\s+(.*)$/.exec(line))) { keys.l = 'bullet'; keys.d = Math.round(m[1].length / unit); line = m[2]; }
    else if ((m = /^(\s*)\d+[.)]\s+(.*)$/.exec(line))) { keys.l = 'number'; keys.d = Math.round(m[1].length / unit); line = m[2]; }
    if (keys.d !== undefined) keys.d = Math.min(LIST_DEPTH, Number(keys.d)) || undefined;
    paras.push({ ...inline(line, full), keys });
  }
  const text = paras.map((p) => p.t).join('\n'), links: TextLink[] = [];
  let rs: TextRun[] | undefined, s0 = 0;
  for (const p of paras) {
    for (const mk of p.marks) rs = setRun(rs, s0 + mk.s, s0 + mk.e, mk.key, true);
    for (const [key, v] of Object.entries(p.keys)) if (v !== undefined) rs = setPara(text, rs, s0, s0, key as 'h' | 'l' | 'k' | 'd' | 'o' | 'g', v);
    for (const l of p.links) links.push({ ...l, s: l.s + s0, e: l.e + s0 });
    s0 += p.t.length + 1;
  }
  return { text, rs, ...(links.length && { links }), ...(tables.length && { tables }) };
}
