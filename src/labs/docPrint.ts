import type { Editor } from '../editor/editor';
import { FILLS, PAGE, STROKE_COLORS, TEXT_COLORS, alignOf, textPad, textPadY, type Item } from '../model/types';
import type { TextRun } from '../model/textLinks';
import { FONTS, fontOf } from '../canvas/text';
import { cellItem, cellRect, cellText, colsOf, rowsOf } from '../model/table';
import { lightTheme } from './exportPng';
import { BOX_SIZE, CODE_IN, CODE_SIZE, DOC_LINE, DONE_ALPHA, docLines, LIST_IN, pagesOf, QUOTE_ALPHA, textArea, type DocLine } from './docPage';
import { objectsIn, slotOf } from './docObjects';
import { codeTokens } from './codeColors';
import { labOn } from './labs';
import { mdCell } from './mdInline';

/**
 * «PDF с текстом» (src/labs): a «Документ» saved as a PDF by the browser's printing («Сохранить как PDF»), its
 * text real text in it (picked, copied, searched; its links followed), not a picture of each page. Each of its
 * lines is put where the sheet has it, as it's laid out there (docLines), whole: the browser lays out nothing
 * of its own, so the pages come out as the sheet's, page for page and line for line; its tables as they
 * stand on them. In the light theme's colours whatever the board's.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fam = (f?: string) => (FONTS[f ?? 'onest']?.css ?? FONTS.onest.css).replace(/"/g, "'");
/** A colour at some opacity, as CSS. */
const faint = (hex: string, a: number) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(hex);
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : hex;
};

/** The pieces of text s…e in their styles, as HTML (code a mono grey, links as links, colours its own). */
function pieces(text: string, s: number, e: number, runs: TextRun[], links: Array<{ s: number; e: number; url: string }>, o: {
  size: number; bold: boolean; block: boolean; ink: string; tint: (c: string) => string; tokens: Array<{ s: number; e: number; c: string }>; strike: boolean; italic: boolean;
}): string {
  const cuts = [...new Set([s, e, ...[...runs, ...links, ...o.tokens].flatMap((r) => [r.s, r.e]).filter((c) => c > s && c < e)])].sort((a, b) => a - b);
  return cuts.slice(0, -1).map((c, i) => {
    const end = cuts[i + 1], r = runs.filter((k) => k.s <= c && k.e >= end).reduce((m, k) => ({ ...m, ...k }), {} as Partial<TextRun>);
    const link = links.find((k) => k.s <= c && k.e >= end), tk = !r.c ? o.tokens.find((k) => k.s <= c && k.e >= end) : undefined;
    const code = !!r.m && !o.block, color = link ? TEXT_COLORS.blue : r.c ? o.tint(r.c) : tk ? o.tint(tk.c) : '';
    const deco = [r.u && 'underline', (r.x || o.strike) && 'line-through'].filter(Boolean).join(' ');
    const css = [r.b && !o.bold && 'font-weight:700', (r.i || o.italic) && 'font-style:italic', color && `color:${color}`, deco && `text-decoration:${deco}`,
      code && `font-family:${fam('mono')};font-size:${o.size * CODE_SIZE}px;background:${faint(o.ink, 0.07)};border-radius:4px;padding:0 2px;margin:0 -2px`].filter(Boolean).join(';');
    const t = esc(text.slice(c, end));
    const span = css ? `<span style="${css}">${t}</span>` : t;
    return link ? `<a href="${esc(link.url)}" style="color:inherit;text-decoration:underline;text-decoration-color:${faint(TEXT_COLORS.blue, 0.4)}">${span}</a>` : span;
  }).join('');
}

/** Page `n` of a document as HTML: its lines where the sheet has them, its tables where they stand. */
function pageHtml(ed: Editor, it: Item, n: number, all: DocLine[]): string {
  const theme = lightTheme(), text = it.text ?? '', runs = (it.rs ?? []) as TextRun[], links = it.links ?? [], st = fontOf(it), area = textArea(it);
  const tint = (c: string) => (c.startsWith('#') ? c : TEXT_COLORS[c] || theme.ink), ink = it.tc ? tint(it.tc) : theme.ink, align = it.ta ?? 'left';
  const out: string[] = [];
  all.forEach((l, li) => {
    if (l.page !== n || l.o) return;
    const top = area.y + l.y, tall = l.size * DOC_LINE, left = area.x, block = l.k === 'code';
    // A block of code: its lines on a grey across, rounded where it starts and ends (on this page).
    if (block) {
      const prev = all[li - 1], next = all[li + 1], q = l.indent - CODE_IN, opens = prev?.k !== 'code' || prev.page !== n, ends = next?.k !== 'code' || next.page !== n;
      out.push(`<div style="position:absolute;left:${left + q}px;top:${top}px;width:${area.w - q}px;height:${tall}px;background:${faint(ink, 0.07)};border-radius:${opens ? 6 : 0}px ${opens ? 6 : 0}px ${ends ? 6 : 0}px ${ends ? 6 : 0}px"></div>`);
    }
    if (l.k === 'hr') { out.push(`<div style="position:absolute;left:${left}px;top:${Math.round(top + tall / 2)}px;width:${area.w}px;height:1px;background:${faint(ink, 0.2)}"></div>`); return; }
    const pe = text.indexOf('\n', l.s) < 0 ? text.length : text.indexOf('\n', l.s), done = runs.find((r) => r.l && r.s <= pe && r.e > pe)?.l === 'done';
    const alpha = (it.to ?? 1) * (l.k === 'quote' ? QUOTE_ALPHA : 1) * (done ? DONE_ALPHA : 1);
    if (l.k === 'quote') out.push(`<div style="position:absolute;left:${left}px;top:${top}px;width:3px;height:${tall}px;background:${faint(ink, 0.2 * alpha)}"></div>`);
    const font = `font:${l.h ? 700 : st.weight ?? 400} ${l.size}px/${tall}px ${block ? fam('mono') : fam(st.family)}${st.italic ? ';font-style:italic' : ''}`;
    const markX = left + l.indent - LIST_IN + 4;
    if (l.mark) out.push(`<div style="position:absolute;left:${markX}px;top:${top}px;height:${tall}px;white-space:pre;${font};color:${ink};opacity:${alpha}">${esc(l.mark)}</div>`);
    if (l.box) {
      const s = Math.round(l.size * BOX_SIZE), y = top + tall / 2 - s / 2;
      // (Ticked: a pixel bigger each side, in the blue of the tool picked on the rail, as bright as ever.)
      const b = s + 2;
      out.push(l.box === 'done'
        ? `<svg style="position:absolute;left:${markX - 1}px;top:${y - 1}px;opacity:${it.to ?? 1}" width="${b}" height="${b}"><rect width="${b}" height="${b}" rx="5" fill="${lightTheme().pick}"/><path d="M${b * 0.27} ${b * 0.52}L${b * 0.43} ${b * 0.68}L${b * 0.73} ${b * 0.34}" stroke="#fff" stroke-width="${Math.max(1.5, b / 8)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : `<svg style="position:absolute;left:${markX}px;top:${y}px;opacity:${alpha * 0.5}" width="${s}" height="${s}"><rect x="0.75" y="0.75" width="${s - 1.5}" height="${s - 1.5}" rx="4" fill="none" stroke="${ink}" stroke-width="1.5"/></svg>`);
    }
    const ps = block && labOn('mdFull') ? text.lastIndexOf('\n', l.s - 1) + 1 : -1;
    const tokens = ps < 0 ? [] : codeTokens(text.slice(ps, pe)).map((t) => ({ ...t, s: t.s + ps, e: t.e + ps }));
    const la = block ? 'left' : l.a ?? align, room = area.w - l.indent;
    const inner = pieces(text, l.s, l.e, block ? runs.map((r) => ({ ...r, m: false })) : runs, links, { size: l.size, bold: !!l.h, block, ink, tint, tokens, strike: done || !!it.fx, italic: false });
    out.push(`<div style="position:absolute;left:${left + l.indent}px;top:${top}px;width:${room}px;height:${tall}px;white-space:pre;text-align:${la};${font};color:${ink};opacity:${alpha}${it.fu ? ';text-decoration:underline' : ''}">${inner}</div>`);
  });
  // Its tables on this page, as they stand on it.
  for (const id of objectsIn(it)) {
    const t = ed.board.get(id), s = slotOf(it, id);
    if (!t || !s || s.page !== n) continue;
    out.push(tableHtml(t, s.x - it.x, s.y - it.y, theme.ink, theme.line, theme.surface, tint));
  }
  return `<section class="page">${out.join('')}</section>`;
}

/** A table as HTML at `x`, `y` on its page: its cells filled as theirs, their text as they mark it, its lines. */
function tableHtml(t: Item, x: number, y: number, ink: string, line0: string, paper: string, tint: (c: string) => string): string {
  const lineOf = (c?: string) => (c === 'none' ? null : c ? (c === 'ink' ? ink : c.startsWith('#') ? c : STROKE_COLORS[c] || line0) : line0);
  const line = lineOf(t.sc), down = t.vc !== undefined ? lineOf(t.vc) : line, cols = colsOf(t), rows = rowsOf(t), out: string[] = [];
  const n = cols.length * rows.length;
  for (let i = 0; i < n; i++) {
    // (Its fill as the board's renderer has it: the cell's own, a document's header grey light.)
    const c = cellItem(t, i), r = cellRect(t, i), f = t.cellFmt?.[i] as { bg?: unknown; bgo?: unknown } | null | undefined, bg = f?.bg;
    const fill = typeof bg === 'string' ? (bg === 'doc' || bg.toUpperCase() === '#EEF0F7' ? '#EEF0F7' : bg.startsWith('#') ? bg : FILLS[bg] ?? FILLS.blue) : '';
    const bgo = typeof f?.bgo === 'number' ? f.bgo : 1;
    const shown = cellText(t, i) ? mdCell(c) : c, st = fontOf(c), size = c.fs ?? 16, padX = textPad(t), padY = textPadY(t);
    const va = c.va === 'top' ? 'flex-start' : c.va === 'bottom' ? 'flex-end' : 'center';
    const inner = shown.text ? pieces(shown.text, 0, shown.text.length, (shown.rs ?? []) as TextRun[], shown.links ?? [], { size, bold: false, block: false, ink, tint, tokens: [], strike: !!c.fx, italic: !!st.italic }) : '';
    out.push(`<div style="position:absolute;left:${r.x - t.x}px;top:${r.y - t.y}px;width:${r.w}px;height:${r.h}px;box-sizing:border-box;padding:${padY}px ${padX}px;display:flex;align-items:${va};${fill ? `background:${faint(fill, bgo)};` : ''}">`
      + `<div style="width:100%;white-space:pre-wrap;overflow-wrap:anywhere;text-align:${alignOf(c)};font:${st.weight ?? 400} ${size}px/1.28 ${fam(st.family)};color:${c.tc ? tint(c.tc) : ink}${c.fu ? ';text-decoration:underline' : ''}">${inner}</div></div>`);
  }
  // Its lines: down between columns, across between rows, and round it.
  let lx = 0, ly = 0;
  if (down) for (const w of cols.slice(0, -1)) { lx += w; out.push(`<div style="position:absolute;left:${lx}px;top:0;width:1px;height:${t.h}px;background:${faint(down, t.vo ?? t.so ?? 1)}"></div>`); }
  if (line) for (const h of rows.slice(0, -1)) { ly += h; out.push(`<div style="position:absolute;left:0;top:${ly}px;width:${t.w}px;height:1px;background:${faint(line, t.so ?? 1)}"></div>`); }
  const edge = line ? `border:1px solid ${faint(line, t.so ?? 1)};` : '';
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${t.w}px;height:${t.h}px;box-sizing:border-box;${edge}border-radius:8px;overflow:hidden;background:${paper}"><div style="position:absolute;left:-1px;top:-1px;width:${t.w}px;height:${t.h}px">${out.join('')}</div></div>`;
}

/** Onest and JetBrains Mono a file for each weight (public/fonts/print), for the page printed: the board's own,
 *  one file for all its weights (a variable font), the browser puts in a PDF in a way its text isn't read
 *  back right from (letters copied apart from their words). */
const PRINT_FONTS: Array<[string, number, string]> = [
  ['Onest', 400, 'onest-400'], ['Onest', 500, 'onest-500'], ['Onest', 600, 'onest-600'], ['Onest', 700, 'onest-700'],
  ['JetBrains Mono', 400, 'jetbrains-mono-400'], ['JetBrains Mono', 700, 'jetbrains-mono-700'],
];
/** The fonts for the page printed: those, and the board's own others (fetched as they're needed). */
function fontFaces(): string {
  const out = PRINT_FONTS.map(([family, weight, file]) => `@font-face { font-family: '${family}'; font-style: normal; font-weight: ${weight}; src: url(/fonts/print/${file}.ttf) format('truetype'); }`);
  for (const sheet of [...document.styleSheets]) {
    try { for (const r of [...sheet.cssRules]) if (r instanceof CSSFontFaceRule && !/Onest|JetBrains Mono/.test(r.style.getPropertyValue('font-family'))) out.push(r.cssText); } catch { /* another site's: not read */ }
  }
  return out.join('\n');
}

/** Its pages as a page of HTML to be printed, a printed page each, titled `name`. */
export function docPrintHtml(ed: Editor, it: Item, name: string): string {
  const all = docLines(it), pages = pagesOf(it).map((n) => pageHtml(ed, it, n, all)).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)}</title><style>${fontFaces()}
    @page { size: ${PAGE.W}px ${PAGE.H}px; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* (Letters as they are, none swapped for another form: a swapped one is copied out of the PDF apart from its word.) */
    body { font-variant-ligatures: none; font-feature-settings: "calt" 0, "liga" 0, "clig" 0, "dlig" 0; }
    .page { position: relative; width: ${PAGE.W}px; height: ${PAGE.H}px; overflow: hidden; break-after: page; }
    .page:last-child { break-after: auto; }
  </style></head><body>${pages}</body></html>`;
}

/** Its pages printed as they are on the sheet, to be saved as a PDF («Сохранить как PDF» in the browser's
 *  window for printing), named after its first line. */
export async function printDoc(ed: Editor, it: Item, name: string): Promise<void> {
  const html = docPrintHtml(ed, it, name);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.append(frame);
  const doc = frame.contentDocument!, win = frame.contentWindow!;
  doc.open();
  doc.write(html);
  doc.close();
  // (Its fonts in before it's printed: else what stood in for them would be.)
  await doc.fonts?.ready;
  await new Promise((r) => setTimeout(r, 50));
  // (The file's name the page's title, as the browser offers it: the board's own for as long.)
  const was = document.title;
  document.title = name;
  const done = () => { document.title = was; frame.remove(); };
  win.addEventListener('afterprint', () => setTimeout(done, 0), { once: true });
  win.focus();
  win.print();
  // (A browser that doesn't say when it's done: gone a while after.)
  setTimeout(() => { if (frame.isConnected) done(); }, 60_000);
}
