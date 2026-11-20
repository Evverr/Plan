import type { Editor } from '../editor/editor';
import { FILLS, PAGE, STROKE_COLORS, TEXT_COLORS, alignOf, textPad, textPadY, type Item } from '../model/types';
import type { TextLink, TextRun } from '../model/textLinks';
import { font, fontOf, layoutText, type FontStyle } from '../canvas/text';
import { cellItem, cellRect, cellText, colsOf, rowsOf } from '../model/table';
import { lightTheme } from './exportPng';
import { BOX_SIZE, BULLETS, CODE_IN, CODE_SIZE, DOC_LINE, docLines, DONE_ALPHA, LIST_IN, pagesOf, QUOTE_ALPHA, textArea, type DocLine } from './docPage';
import { objectsIn, slotOf } from './docObjects';
import { codeTokens } from './codeColors';
import { labOn } from './labs';
import { mdCell } from './mdInline';
import { embedFont, PdfWriter, pdfText, TtfFont } from './pdfFont';

/**
 * «PDF с текстом» (src/labs): a «Документ» saved as a PDF we write ourselves, straight to a file: its text real
 * text (picked, copied, searched), its links links, its pages line for line as the sheet's. Each piece of text
 * stands where the sheet draws it, as wide as it comes out there (measured as the sheet measures it: its
 * letters stretched or squeezed by a hair if the font's file has them a little otherwise), in Onest and
 * JetBrains Mono a file each weight (public/fonts/print), put in the PDF whole; its tables, code, lists and
 * checklists drawn as the sheet draws them. In the light theme's colours whatever the board's.
 */

/** Our units to the PDF's points: a sheet 794 wide is A4's 595.5. */
const PT = 0.75;

/** The fonts' files, by family and weight, fetched once. */
const files = new Map<string, Promise<Uint8Array>>();
const fetchFont = (file: string) => {
  let f = files.get(file);
  if (!f) { f = fetch(`/fonts/print/${file}.ttf`).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)); files.set(file, f); }
  return f;
};
/** Which file a style of text is drawn from: JetBrains Mono for code, Onest (the nearest weight) for the rest. */
const fileFor = (mono: boolean, weight: number) => (mono ? `jetbrains-mono-${weight >= 600 ? 700 : 400}` : `onest-${weight >= 650 ? 700 : weight >= 550 ? 600 : weight >= 450 ? 500 : 400}`);
const ALL_FILES = ['onest-400', 'onest-500', 'onest-600', 'onest-700', 'jetbrains-mono-400', 'jetbrains-mono-700'];

/** A colour '#rrggbb' as PDF's three numbers 0…1. */
const rgb = (hex: string) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(hex);
  return m ? [m[1], m[2], m[3]].map((v) => (parseInt(v, 16) / 255).toFixed(3)).join(' ') : '0 0 0';
};
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();

/** A page's drawing: what's done on it in our units (y down), its links where they are. */
class Page {
  ops: string[] = [];
  links: Array<{ x: number; y: number; w: number; h: number; url: string }> = [];
  constructor(private readonly doc: Doc) {}
  private paint(alpha: number, body: string) { this.ops.push(`q ${this.doc.gs(alpha)} ${body} Q`); }
  rect(x: number, y: number, w: number, h: number, color: string, alpha = 1, r = 0) {
    this.paint(alpha, `${rgb(color)} rg ${r ? roundRect(x, y, w, h, r) : `${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re`} f`);
  }
  /** Rounded at its four corners each its own (top left, top right, bottom right, bottom left). */
  rects(x: number, y: number, w: number, h: number, color: string, alpha: number, r: [number, number, number, number]) {
    this.paint(alpha, `${rgb(color)} rg ${roundRect(x, y, w, h, r)} f`);
  }
  stroke(path: string, color: string, width: number, alpha = 1) {
    this.paint(alpha, `${rgb(color)} RG ${n2(width)} w 1 J 1 j ${path} S`);
  }
  /** Text from `x` on its baseline `base`, as wide as `w` (as the sheet measures it). */
  text(t: string, x: number, base: number, size: number, f: TtfFont, color: string, alpha: number, italic: boolean, w: number) {
    if (!t) return;
    const own = f.width(t, size), tz = own > 0 && w > 0 ? (w / own) * 100 : 100;
    this.paint(alpha, `${rgb(color)} rg BT /${this.doc.fontName(f)} ${n2(size)} Tf ${n2(tz)} Tz 1 0 ${italic ? 0.2 : 0} -1 ${n2(x)} ${n2(base)} Tm <${f.encode(t)}> Tj ET`);
  }
}

/** A path round a rectangle with round corners (one radius, or each its own). */
function roundRect(x: number, y: number, w: number, h: number, r: number | [number, number, number, number]): string {
  const [a, b, c, d] = (typeof r === 'number' ? [r, r, r, r] : r).map((v) => Math.min(v, w / 2, h / 2)), k = 0.5523;
  return [`${n2(x + a)} ${n2(y)} m`, `${n2(x + w - b)} ${n2(y)} l`, b ? `${n2(x + w - b + b * k)} ${n2(y)} ${n2(x + w)} ${n2(y + b - b * k)} ${n2(x + w)} ${n2(y + b)} c` : '',
    `${n2(x + w)} ${n2(y + h - c)} l`, c ? `${n2(x + w)} ${n2(y + h - c + c * k)} ${n2(x + w - c + c * k)} ${n2(y + h)} ${n2(x + w - c)} ${n2(y + h)} c` : '',
    `${n2(x + d)} ${n2(y + h)} l`, d ? `${n2(x + d - d * k)} ${n2(y + h)} ${n2(x)} ${n2(y + h - d + d * k)} ${n2(x)} ${n2(y + h - d)} c` : '',
    `${n2(x)} ${n2(y + a)} l`, a ? `${n2(x)} ${n2(y + a - a * k)} ${n2(x + a - a * k)} ${n2(y)} ${n2(x + a)} ${n2(y)} c` : '', 'h'].filter(Boolean).join(' ');
}

/** What the pages share: their fonts and the opacities drawn in. */
class Doc {
  fonts = new Map<string, TtfFont>();
  alphas = new Map<string, string>();
  constructor(readonly loaded: Map<string, TtfFont>) {}
  font(mono: boolean, weight: number): TtfFont { return this.loaded.get(fileFor(mono, weight))!; }
  fontName(f: TtfFont): string { for (const [k, v] of this.loaded) if (v === f) { this.fonts.set(k, f); return `F${ALL_FILES.indexOf(k)}`; } return 'F0'; }
  gs(alpha: number): string {
    const a = Math.max(0, Math.min(1, alpha)).toFixed(3);
    if (!this.alphas.has(a)) this.alphas.set(a, `GS${this.alphas.size}`);
    return `/${this.alphas.get(a)} gs`;
  }
}

let measure: CanvasRenderingContext2D | null = null;
const ctx = () => (measure ??= document.createElement('canvas').getContext('2d')!);

/** A piece of text in its style, measured as the sheet measures it. */
interface Piece { t: string; w: number; size: number; bold: boolean; mono: boolean; italic: boolean; color: string; under: boolean; strike: boolean; code: boolean; link?: string }

/** Draws pieces from `x` on a line, `mid` its middle and `base` its baseline: code on its grey, links noted. */
function drawPieces(pg: Page, doc: Doc, pieces: Piece[], x: number, base: number, mid: number, size: number, descent: number, alpha: number, ink: string): void {
  const rule = Math.max(1, size / 14);
  for (const p of pieces) {
    if (p.code) pg.rect(x - 2, mid - size * 0.65, p.w + 4, size * 1.3, ink, alpha * 0.07, 4);
    const f = doc.font(p.mono, p.bold ? 700 : 400);
    // (A letter the font hasn't, the other's.)
    const g = f.has(p.t) ? f : doc.font(!p.mono, p.bold ? 700 : 400);
    pg.text(p.t, x, base, p.size, g, p.color, alpha, p.italic, p.w);
    if (p.under) pg.rect(x, mid + size * 0.42, p.w, rule, p.color, alpha);
    if (p.strike) pg.rect(x, mid + size * 0.04 - rule / 2, p.w, rule, p.color, alpha);
    if (p.link) {
      pg.rect(x, base + descent - rule, p.w, rule, p.color, alpha * 0.4);
      pg.links.push({ x, y: mid - size * 0.65, w: p.w, h: size * 1.3, url: p.link });
    }
    x += p.w;
  }
}

/** The pieces of s…e of a text, by its styles, links and code's colours, each measured. */
function piecesOf(text: string, s: number, e: number, runs: TextRun[], links: TextLink[], tokens: Array<{ s: number; e: number; c: string }>, o: {
  size: number; bold: boolean; block: boolean; italic: boolean; family?: string; weight: number; ink: string; tint: (c: string) => string; strike: boolean; under: boolean;
}): Piece[] {
  const cuts = [...new Set([s, e, ...[...runs, ...links, ...tokens].flatMap((r) => [r.s, r.e]).filter((c) => c > s && c < e)])].sort((a, b) => a - b), m = ctx();
  return cuts.slice(0, -1).map((c, i) => {
    const end = cuts[i + 1], r = runs.filter((k) => k.s <= c && k.e >= end).reduce((acc, k) => ({ ...acc, ...k }), {} as Partial<TextRun>);
    const link = links.find((k) => k.s <= c && k.e >= end), tk = !r.c ? tokens.find((k) => k.s <= c && k.e >= end) : undefined;
    const code = !!r.m && !o.block, mono = code || o.block, size = code ? o.size * CODE_SIZE : o.size, bold = o.bold || !!r.b, italic = o.italic || !!r.i;
    m.font = font(size, bold ? 700 : o.weight, mono ? 'mono' : o.family, italic);
    const t = text.slice(c, end);
    return { t, w: m.measureText(t).width, size, bold: bold || o.weight >= 600, mono, italic, code, color: link ? TEXT_COLORS.blue : r.c ? o.tint(r.c) : tk ? o.tint(tk.c) : o.ink,
      under: !!r.u || o.under, strike: !!r.x || o.strike, ...(link && { link: link.url }) };
  });
}

/** Page `n` of a document: its lines where the sheet has them, its tables where they stand on it. */
function drawPage(ed: Editor, pg: Page, doc: Doc, it: Item, n: number, all: DocLine[]): void {
  const theme = lightTheme(), text = it.text ?? '', runs = (it.rs ?? []) as TextRun[], links = it.links ?? [], st = fontOf(it), area = textArea(it), m = ctx();
  const tint = (c: string) => (c.startsWith('#') ? c : TEXT_COLORS[c] || theme.ink), ink = it.tc ? tint(it.tc) : theme.ink, align = it.ta ?? 'left', alpha0 = it.to ?? 1;
  all.forEach((l, li) => {
    if (l.page !== n || l.o) return;
    const top = area.y + l.y, tall = l.size * DOC_LINE, left = area.x, block = l.k === 'code';
    // A block of code: its lines on a grey across, rounded where it starts and ends (on this page).
    if (block) {
      const prev = all[li - 1], next = all[li + 1], q = l.indent - CODE_IN, opens = prev?.k !== 'code' || prev.page !== n, ends = next?.k !== 'code' || next.page !== n;
      pg.rects(left + q, top, area.w - q, tall, ink, alpha0 * 0.07, [opens ? 6 : 0, opens ? 6 : 0, ends ? 6 : 0, ends ? 6 : 0]);
    }
    if (l.k === 'hr') { pg.rect(left, Math.round(top + tall / 2), area.w, 1, ink, alpha0 * 0.2); return; }
    const pe = text.indexOf('\n', l.s) < 0 ? text.length : text.indexOf('\n', l.s), done = runs.find((r) => r.l && r.s <= pe && r.e > pe)?.l === 'done';
    const faint = (l.k === 'quote' ? QUOTE_ALPHA : 1) * (done ? DONE_ALPHA : 1), alpha = alpha0 * faint;
    if (l.k === 'quote') pg.rect(left, top, 3, tall, ink, alpha * 0.2);
    const weight = l.h ? 700 : st.weight ?? 400;
    m.font = font(l.size, weight, block ? 'mono' : st.family, st.italic);
    const fm = m.measureText('Hg'), base = top + (tall - fm.fontBoundingBoxAscent - fm.fontBoundingBoxDescent) / 2 + fm.fontBoundingBoxAscent, mid = top + tall / 2;
    // A list's marker in the room on its left: a number as text, a bullet drawn (as its letter is on the sheet).
    const markX = left + l.indent - LIST_IN + 4;
    if (l.mark && /^\d/.test(l.mark)) piecesOf(l.mark, 0, l.mark.length, [], [], [], { size: l.size, bold: false, block: false, italic: !!st.italic, family: st.family, weight, ink, tint, strike: false, under: false })
      .forEach((p) => pg.text(p.t, markX, base, p.size, doc.font(false, weight), ink, alpha, p.italic, p.w));
    else if (l.mark) bullet(pg, l.mark, markX, mid, l.size, ink, alpha);
    if (l.box) box(pg, markX, mid, l.size, l.box === 'done', ink, theme.pick, alpha0);
    const ps = block && labOn('mdFull') ? text.lastIndexOf('\n', l.s - 1) + 1 : -1;
    const tokens = ps < 0 ? [] : codeTokens(text.slice(ps, pe)).map((t) => ({ ...t, s: t.s + ps, e: t.e + ps }));
    const pieces = piecesOf(text, l.s, l.e, block ? runs.map((r) => ({ ...r, m: false })) : runs, links, tokens,
      { size: l.size, bold: !!l.h, block, italic: !!st.italic, family: st.family, weight, ink, tint, strike: done || !!it.fx, under: !!it.fu });
    const lw = pieces.reduce((s, p) => s + p.w, 0), room = area.w - l.indent, la = block ? 'left' : l.a ?? align;
    drawPieces(pg, doc, pieces, left + l.indent + (la === 'center' ? (room - lw) / 2 : la === 'right' ? room - lw : 0), base, mid, l.size, fm.fontBoundingBoxDescent, alpha, ink);
  });
  // Its tables on this page, as they stand on it.
  for (const id of objectsIn(it)) {
    const t = ed.board.get(id), s = slotOf(it, id);
    if (t && s && s.page === n) drawTable(pg, doc, t, s.x - it.x, s.y - it.y, theme.ink, theme.line, theme.surface, tint);
  }
}

/** A list's bullet as the sheet's letter shows it: •, ◦ or ▪, its middle on the line's. */
function bullet(pg: Page, mark: string, x: number, mid: number, size: number, ink: string, alpha: number): void {
  const r = size * 0.13, cx = x + size * 0.18, cy = mid + size * 0.02;
  if (mark === BULLETS[1]) pg.stroke(roundRect(cx - r, cy - r, r * 2, r * 2, r), ink, Math.max(1, size / 16), alpha);
  else if (mark === BULLETS[2]) pg.rect(cx - r, cy - r, r * 2, r * 2, ink, alpha);
  else pg.rect(cx - r, cy - r, r * 2, r * 2, ink, alpha, r);
}

/** A checklist's box as the sheet draws it (docPage.ts's drawBox): ticked, a pixel bigger, blue, a white tick. */
function box(pg: Page, x: number, mid: number, size: number, ticked: boolean, ink: string, on: string, alpha: number): void {
  const s = Math.round(size * BOX_SIZE), top = mid - s / 2;
  if (!ticked) { pg.stroke(roundRect(x + 0.75, top + 0.75, s - 1.5, s - 1.5, 4), ink, 1.5, alpha * 0.5); return; }
  const b = s + 2, bx = x - 1, by = top - 1;
  pg.rect(bx, by, b, b, on, alpha, 5);
  pg.stroke(`${n2(bx + b * 0.27)} ${n2(by + b * 0.52)} m ${n2(bx + b * 0.43)} ${n2(by + b * 0.68)} l ${n2(bx + b * 0.73)} ${n2(by + b * 0.34)} l`, '#ffffff', Math.max(1.5, b / 8), alpha);
}

/** A table at `x`, `y` on its page: its cells filled as theirs, their text as they mark it, its lines. */
function drawTable(pg: Page, doc: Doc, t: Item, x: number, y: number, ink: string, line0: string, paper: string, tint: (c: string) => string): void {
  const lineOf = (c?: string) => (c === 'none' ? null : c ? (c === 'ink' ? ink : c.startsWith('#') ? c : STROKE_COLORS[c] || line0) : line0);
  const line = lineOf(t.sc), down = t.vc !== undefined ? lineOf(t.vc) : line, cols = colsOf(t), rows = rowsOf(t), r8 = Math.min(8, t.w / 2, t.h / 2), m = ctx();
  pg.rect(x, y, t.w, t.h, paper, 1, r8);
  const n = cols.length * rows.length, dx = x - t.x, dy = y - t.y;
  for (let i = 0; i < n; i++) {
    const c = cellItem(t, i), r = cellRect(t, i), f = t.cellFmt?.[i] as { bg?: unknown; bgo?: unknown } | null | undefined, bg = f?.bg;
    const rx = r.x + dx, ry = r.y + dy, cols0 = i % cols.length, row = Math.floor(i / cols.length);
    if (typeof bg === 'string') {
      const fill = bg === 'doc' || bg.toUpperCase() === '#EEF0F7' ? '#EEF0F7' : bg.startsWith('#') ? bg : FILLS[bg] ?? FILLS.blue;
      // (Rounded with the table where it's at its corners.)
      const rr: [number, number, number, number] = [row === 0 && cols0 === 0 ? r8 : 0, row === 0 && cols0 === cols.length - 1 ? r8 : 0, row === rows.length - 1 && cols0 === cols.length - 1 ? r8 : 0, row === rows.length - 1 && cols0 === 0 ? r8 : 0];
      pg.rects(rx, ry, r.w, r.h, fill, typeof f?.bgo === 'number' ? f.bgo : 1, rr);
    }
    if (!cellText(t, i)) continue;
    // Its text as the board lays it out (drawText): its lines in the cell, its Markdown as it marks it.
    const shown = mdCell(c), st: FontStyle = fontOf(c), size = c.fs ?? 16, padX = textPad(t), padY = textPadY(t), al = alignOf(c), text = shown.text ?? '';
    const lay = layoutText(m, text, r.w - padX * 2, r.h - padY * 2, size, st);
    m.font = font(lay.size, st.weight, st.family, st.italic);
    const fm = m.measureText('Hg'), total = lay.lines.length * lay.lineHeight;
    let ly = c.va === 'top' ? ry + padY : c.va === 'bottom' ? ry + r.h - padY - total : ry + r.h / 2 - total / 2, from = 0;
    const color = c.tc ? tint(c.tc) : ink;
    for (const ln of lay.lines) {
      const at = text.indexOf(ln, from);
      from = at + ln.length;
      const base = ly + (lay.lineHeight - fm.fontBoundingBoxAscent - fm.fontBoundingBoxDescent) / 2 + fm.fontBoundingBoxAscent, mid = ly + lay.lineHeight / 2;
      const pieces = piecesOf(text, at, at + ln.length, (shown.rs ?? []) as TextRun[], shown.links ?? [], [], { size: lay.size, bold: false, block: false, italic: !!st.italic, family: st.family, weight: st.weight ?? 400, ink: color, tint, strike: !!c.fx, under: !!c.fu });
      const lw = pieces.reduce((s, p) => s + p.w, 0), room = r.w - padX * 2;
      drawPieces(pg, doc, pieces, rx + padX + (al === 'center' ? (room - lw) / 2 : al === 'right' ? room - lw : 0), base, mid, lay.size, fm.fontBoundingBoxDescent, t.to ?? 1, color);
      ly += lay.lineHeight;
    }
  }
  // Its lines: down between columns, across between rows, and round it.
  let lx = x, ly = y;
  if (down) for (const w of cols.slice(0, -1)) { lx += w; pg.stroke(`${n2(lx)} ${n2(y)} m ${n2(lx)} ${n2(y + t.h)} l`, down, 1, t.vo ?? t.so ?? 1); }
  if (line) for (const h of rows.slice(0, -1)) { ly += h; pg.stroke(`${n2(x)} ${n2(ly)} m ${n2(x + t.w)} ${n2(ly)} l`, line, 1, t.so ?? 1); }
  if (line) pg.stroke(roundRect(x, y, t.w, t.h, r8), line, 1, t.so ?? 1);
}

/** A document as the bytes of a PDF of its pages, titled `name`. */
export async function docPdfBytes(ed: Editor, it: Item, name: string): Promise<Uint8Array> {
  // (Fonts fresh for each file, their files fetched once: the letters each uses noted anew.)
  const loaded = new Map<string, TtfFont>();
  await Promise.all(ALL_FILES.map(async (f) => loaded.set(f, new TtfFont(await fetchFont(f), f))));
  const doc = new Doc(loaded), all = docLines(it);
  const pages = pagesOf(it).map((n) => { const pg = new Page(doc); drawPage(ed, pg, doc, it, n, all); return pg; });
  const pdf = new PdfWriter(), W = PAGE.W * PT, H = PAGE.H * PT;
  const catalog = pdf.reserve(), tree = pdf.reserve(), resources = pdf.reserve();
  const kids: number[] = [];
  for (const pg of pages) {
    // (Our units, y down: a sheet's top left its corner.)
    const content = await pdf.addStream('', `${PT} 0 0 ${-PT} 0 ${n2(H)} cm\n${pg.ops.join('\n')}`);
    const annots = pg.links.map((l) => pdf.add(`<< /Type /Annot /Subtype /Link /Rect [${n2(l.x * PT)} ${n2(H - (l.y + l.h) * PT)} ${n2((l.x + l.w) * PT)} ${n2(H - l.y * PT)}] /Border [0 0 0] /A << /Type /Action /S /URI /URI (${l.url.replace(/[()\\]/g, (c) => `\\${c}`)}) >> >>`));
    kids.push(pdf.add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${n2(W)} ${n2(H)}] /Resources ${resources} 0 R /Contents ${content} 0 R${annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(' ')}]` : ''} >>`));
  }
  // Only the fonts drawn in, each put in whole.
  const fonts: string[] = [];
  for (const [k, f] of doc.fonts) fonts.push(`/F${ALL_FILES.indexOf(k)} ${await embedFont(pdf, f)} 0 R`);
  const gs = [...doc.alphas].map(([a, name]) => `/${name} << /Type /ExtGState /ca ${a} /CA ${a} >>`).join(' ');
  pdf.set(resources, `<< /Font << ${fonts.join(' ')} >> /ExtGState << ${gs} >> >>`);
  pdf.set(tree, `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${tree} 0 R >>`);
  const info = pdf.add(`<< /Title ${pdfText(name)} /Producer (PlanX) >>`);
  return pdf.build(catalog, info);
}

/** Saves a document as a PDF: where to, asked first (the system's window to save a file, where the browser
 *  has one; else as a download); then written. */
export async function saveDocPdf(ed: Editor, it: Item, name: string, fileName: string): Promise<void> {
  type Picker = (o: object) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;
  const pick = (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker;
  let handle: Awaited<ReturnType<Picker>> | null = null;
  if (pick) {
    try { handle = await pick({ suggestedName: fileName, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] }); } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  const blob = new Blob([(await docPdfBytes(ed, it, name)) as BlobPart], { type: 'application/pdf' });
  if (handle) { const w = await handle.createWritable(); await w.write(blob); await w.close(); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
