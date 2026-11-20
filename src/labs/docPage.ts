import { PAGE, pageMargins, type Item, type TextAlign } from '../model/types';
import type { Point } from '../canvas/geometry';
import { font, fontOf, LINE_HEIGHT } from '../canvas/text';
import { drawIcon } from '../icons/icons';
import type { TextRun } from '../model/textLinks';
import { labOn } from './labs';
import { codeTokens } from './codeColors';

/**
 * «Документ» (src/labs): a sheet of A4 on the board, its margins as ГОСТ has them, its text typed in as a
 * sticker's, at its own size, from the top: what doesn't fit on a page goes on to the next. Words in it
 * may be bold, italic… or code (styles on parts of it, model/textLinks.ts), a paragraph a heading (1…6,
 * bigger and bold, see setHeading there), a list's item, a checklist's, a quote or a divider; its lines wrap as wide as their words come out in
 * their own styles, each as tall as its paragraph's size. The sheet shows one page at a time, the pager
 * under it («‹ 1 / 3 ›», a hundred pages at most; a click on its number, a page to go to) turning them, for whoever's looking (not for everyone).
 */

/** Where the text goes on the sheet. */
export const PAGE_TEXT = { w: PAGE.W - PAGE.LEFT - PAGE.RIGHT, h: PAGE.H - PAGE.TOP - PAGE.BOTTOM };
/** Where the text goes on a sheet of its own margins («Поля документа», src/labs): from its top left, how big. */
export function textArea(it: Pick<Item, 'pm'>): { x: number; y: number; w: number; h: number } {
  const m = pageMargins(it);
  return { x: m.left, y: m.top, w: PAGE.W - m.left - m.right, h: PAGE.H - m.top - m.bottom };
}

/** The page each sheet shows here, by id. */
const shown = new Map<string, number>();
/** Counted on as any sheet's page turns here (what's seen on its pages, as editor's inSight has it, again). */
let turned = 0;
export const pagesTurned = (): number => turned;

/** A heading's size against the text's own (1…6), and the room over one that isn't a page's first. */
export const HEADING_SIZE = [1, 1.75, 1.375, 1.125, 1, 0.875, 0.75], HEADING_GAP = 0.6;
/** The room under a heading, against its size («Markdown полностью»: as Obsidian has it, not stuck to what follows). */
export const HEADING_UNDER = 0.4;
/** The room under a heading at `size`, if any (with «Markdown полностью» on). */
export const headingUnder = (size: number): number => (labOn('mdFull') ? Math.round(size * HEADING_UNDER) : 0);
/** The room over a heading at `size` that isn't a page's first (with «Markdown полностью» on, 1.4 times as much). */
export const headingOver = (size: number): number => Math.round(size * HEADING_GAP * (labOn('mdFull') ? 1.4 : 1));
/** Its lines 20% further apart than text elsewhere on the board. */
export const DOC_LINE = LINE_HEIGHT * 1.2;

/** A list's paragraphs: how far in their lines stand (their marker in that room, at its left). */
export const LIST_IN = 28;
/** A quote's paragraphs: how far in (a bar down their left), and how faint against the rest. */
export const QUOTE_IN = 20, QUOTE_ALPHA = 0.75;
/** A checklist's box against its text's size, and how faint a ticked item's text (struck through) is. */
export const BOX_SIZE = 0.9, DONE_ALPHA = 0.7;
/** Code in a line («Markdown в документе»): its size against the text round it; a block of code's, the
 *  room inside its grey each side. */
export const CODE_SIZE = 0.9, CODE_IN = 12;
/** What's put in the text in place of a paragraph («Таблица в документе», docObjects.ts): found by its id
 *  (set by the editor, see setDocObjects), and the room over and under it. */
let objectOf: (id: string) => Item | undefined = () => undefined;
export const setDocObjects = (get: (id: string) => Item | undefined): void => { objectOf = get; };
export const docObject = (id: string): Item | undefined => objectOf(id);
/** The table `id` if it's in this document's text (`inDoc`): one gone out of it (its place left over in the
 *  text, say) takes no room there and isn't shown in it. */
export const docObjectIn = (doc: Item, id: string): Item | undefined => { const o = objectOf(id); return o?.inDoc === doc.id ? o : undefined; };
export const OBJ_GAP = 8;
/** A list in a list: how deep at most (0 the first), and its bullets at each depth. */
export const LIST_DEPTH = 4, BULLETS = ['•', '◦', '▪'];

/** A line as laid out: where it starts and ends in the text, its paragraph's size (a heading's level, 0
 *  for none), on its page how far down its top is; in a list, how far in it stands, and on its
 *  paragraph's first line, its marker («•» or its number with a dot) or a checklist's box (`box`, ticked
 *  or not); its paragraph's kind (`k`: a quote's, or a divider's). */
export interface DocLine { s: number; e: number; size: number; h: number; page: number; y: number; indent: number; mark?: string; a?: TextAlign; box?: 'todo' | 'done'; k?: string;
  /** The place of what's put in the text there (its id), as tall as it with the room over and under it. */
  o?: string; tall?: number }

let measure: CanvasRenderingContext2D | null = null;
const laidOut = new Map<string, { key: string; text: string; lines: DocLine[] }>();
/** Every sheet laid out again (fonts come in: words measured in them now, not in what stood in for them). */
export const clearDocLines = (): void => laidOut.clear();

/** The style on each character of s…e (by the runs), as pieces. */
function piecesOf(runs: TextRun[], s: number, e: number): Array<{ s: number; e: number; r?: TextRun }> {
  const cuts = [...new Set([s, e, ...runs.flatMap((r) => [r.s, r.e]).filter((c) => c > s && c < e)])].sort((a, b) => a - b);
  return cuts.slice(0, -1).map((c, i) => ({ s: c, e: cuts[i + 1], r: runs.filter((r) => r.s <= c && r.e >= cuts[i + 1] && (r.b || r.i || r.m)).reduce<TextRun | undefined>((m, r) => ({ ...m, ...r }), undefined) }));
}

/** Its lines, laid out: each paragraph wrapped at the sheet's width, its words measured in their own
 *  styles (a word too long for a line broken where it comes to), lines filling page after page. */
export function docLines(it: Item): DocLine[] {
  const text = it.text ?? '', fs = it.fs ?? 16, st = fontOf(it), runs = (it.rs ?? []) as Array<TextRun & { h?: number }>;
  // (And the sizes of what's put in it.)
  const objs = runs.filter((r) => r.o).map((r) => { const o = docObjectIn(it, r.o!); return o ? `${o.w}x${o.h}` : '-'; }).join();
  const area = textArea(it);
  // (Its text told apart on its own: the same string as last time (the board's, unchanged) at once, not
  // gone through letter by letter as part of a key, a hundred pages of it, each time it's drawn.)
  const key = `${fs}|${st.weight}|${st.family}|${st.italic}|${JSON.stringify(runs)}|${objs}|${area.w}x${area.h}|${labOn('mdFull')}`, was = laidOut.get(it.id);
  if (was?.key === key && was.text === text) return was.lines;
  if (typeof document !== 'undefined') measure ??= document.createElement('canvas').getContext('2d');
  // Its fonts asked for (a font not in yet measured as another: laid out again once it is, see clearDocLines).
  if (typeof document !== 'undefined' && document.fonts) {
    for (const f of [font(fs, st.weight, st.family, st.italic), font(fs, 700, st.family, st.italic), font(fs, 400, 'mono')]) if (!document.fonts.check(f)) void document.fonts.load(f);
  }
  const styled = runs.filter((r) => r.b || r.i || r.m);
  /** How wide s…e is at `size`, `bold` (a heading) or as each piece's style has it (in a block of code, all
   *  of it monospaced). */
  let block = false;
  const width = (s: number, e: number, size: number, bold: boolean) => {
    if (!measure) return (e - s) * size * 0.55;
    let w = 0;
    for (const p of piecesOf(styled, s, e)) {
      measure.font = font(p.r?.m && !block ? size * CODE_SIZE : size, bold || p.r?.b ? 700 : st.weight, p.r?.m || block ? 'mono' : st.family, !!p.r?.i || st.italic);
      w += measure.measureText(text.slice(p.s, p.e)).width;
    }
    return w;
  };
  const lines: DocLine[] = [];
  let page = 0, y = 0, at = 0, indent = 0, mark: string | undefined, a: TextAlign | undefined, box: DocLine['box'], k: string | undefined;
  // A numbered list's count at each depth, while its paragraphs follow one another.
  let nums: number[] = [];
  // (A table's place where it's first in the text: any other paragraph with it, an empty line.)
  const placed = new Set<string>();
  // (The room under the paragraph before, a heading's: over this one, as much as its own over it, not both.)
  let under = 0, carry = 0;
  const put = (s: number, e: number, size: number, h: number, first: boolean, obj?: Item) => {
    const tall = obj ? obj.h + OBJ_GAP * 2 : size * DOC_LINE, gap = first && y > 0 ? Math.max(h ? headingOver(size) : 0, under) : 0;
    // (A pixel's grace: a table stretched to the page's bottom, its rows rounded a little over, kept there.)
    if (y + gap + tall > area.h + 1 && y > 0) { page++; y = 0; }
    else y += gap;
    lines.push({ s, e, size, h, page, y, indent, ...(first && mark && { mark }), ...(first && box && { box }), ...(a && { a }), ...(k && { k }), ...(obj && { o: obj.id, tall }) });
    y += tall;
  };
  for (const para of text.split('\n')) {
    const s0 = at, e0 = at + para.length;
    at = e0 + 1;
    // (Its level and list kept on the character after it: see setPara in model/textLinks.ts.)
    // (Its own size of text, as set for it alone, over its level's.)
    // (A quote's, a block of code's, or a divider: a line across, its text if any left out.)
    k = runs.find((r) => r.k && r.s <= e0 && r.e > e0)?.k;
    block = k === 'code';
    // (A line of code: no heading, a list's or a size of its own; the text's size, a tenth smaller.)
    const own = (key: 'h' | 'z' | 'l' | 'd') => (block ? undefined : runs.find((r) => r[key] && r.s <= e0 && r.e > e0)?.[key]);
    const h = (own('h') as number | undefined) ?? 0, z = own('z') as number | undefined;
    const size = block ? fs * CODE_SIZE : z ?? Math.round(fs * HEADING_SIZE[h]);
    under = carry;
    carry = h ? headingUnder(size) : 0;
    // (Its own alignment, as set for it alone, over the whole of it's.)
    a = block ? undefined : runs.find((r) => r.a && r.s <= e0 && r.e > e0)?.a as TextAlign | undefined;
    const list = own('l') as string | undefined, depth = Math.min(LIST_DEPTH, (own('d') as number | undefined) ?? 0);
    if (k === 'hr') { nums = []; indent = 0; mark = undefined; box = undefined; put(s0, e0, size, 0, true); continue; }
    // A table put in its place: room as tall as it (on the next page whole, if not on this one).
    const oid = runs.find((r) => r.o && r.s <= e0 && r.e > e0)?.o, obj = oid && !placed.has(oid) ? docObjectIn(it, oid) : undefined;
    if (obj) placed.add(obj.id);
    if (obj) { nums = []; indent = 0; mark = undefined; box = undefined; a = undefined; k = undefined; put(s0, e0, size, 0, true, obj); continue; }
    // A numbered list counts on at its depth while its paragraphs follow one another (deeper ones, started
    // again under each of its items; a bullet's at that depth, too).
    if (list) { nums.length = depth + 1; nums[depth] = list === 'number' ? (nums[depth] ?? 0) + 1 : 0; } else nums = [];
    indent = (list ? LIST_IN * (depth + 1) : 0) + (k === 'quote' ? QUOTE_IN : 0) + (block ? CODE_IN : 0);
    box = list === 'todo' || list === 'done' ? list : undefined;
    mark = list === 'number' ? `${nums[depth]}.` : list === 'bullet' ? BULLETS[depth % BULLETS.length] : undefined;
    const room = area.w - indent - (block ? CODE_IN : 0);
    if (s0 === e0) { put(s0, e0, size, h, true); continue; }
    let ls = s0, first = true;
    while (ls < e0) {
      // As many words as fit; one alone too wide, as many of its letters.
      let end = ls, i = ls;
      while (i < e0) {
        let j = i;
        while (j < e0 && text[j] === ' ') j++;
        while (j < e0 && text[j] !== ' ') j++;
        if (width(ls, j, size, h > 0) > room && end > ls) break;
        end = j;
        i = j;
        if (width(ls, end, size, h > 0) > room) {
          // (A single word wider than the line: cut where it no longer fits.)
          let k = ls + 1;
          while (k < end && width(ls, k + 1, size, h > 0) <= room) k++;
          end = k;
          break;
        }
      }
      put(ls, end, size, h, first);
      first = false;
      ls = end;
      while (ls < e0 && text[ls] === ' ') ls++;
    }
  }
  const out = lines.filter((l) => l.page < PAGE.MAX);
  laidOut.set(it.id, { key, text, lines: out });
  return out;
}

/** Draws page `n` of it: each line piece by piece in its own style, a heading's bigger and bold, links
 *  blue and underlined (`onLink` noting where, to be Cmd+clicked). */
export function drawDocPage(ctx: CanvasRenderingContext2D, it: Item, n: number, look: {
  ink: string; link: string; tint: (c: string) => string; onLink?: (r: { x: number; y: number; w: number; h: number; url: string }) => void;
  /** The blue of the tool picked on the rail (--fmt-on-ink): a ticked box filled with it. */
  on?: string;
}): void {
  const text = it.text ?? '', st = fontOf(it), runs = (it.rs ?? []) as TextRun[], links = it.links ?? [];
  const align = it.ta ?? 'left', alpha = it.to ?? 1, ink = it.tc ? look.tint(it.tc) : look.ink, area = textArea(it);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const all = docLines(it);
  all.forEach((l, li) => {
    if (l.page !== n) return;
    // A block of code: its lines on a grey across, rounded where it starts and ends (on this page).
    if (l.k === 'code') {
      const prev = all[li - 1], next = all[li + 1], q = l.indent - CODE_IN;
      const opens = prev?.k !== 'code' || prev.page !== n, ends = next?.k !== 'code' || next.page !== n, r = 6;
      ctx.fillStyle = ink;
      ctx.globalAlpha = alpha * 0.07;
      ctx.beginPath();
      ctx.roundRect(it.x + area.x + q, it.y + area.y + l.y, area.w - q, l.size * DOC_LINE, [opens ? r : 0, opens ? r : 0, ends ? r : 0, ends ? r : 0]);
      ctx.fill();
      ctx.globalAlpha = alpha;
    }
    drawLine(l);
  });
  ctx.restore();

  function drawLine(l: DocLine): void {
    // (A table's place: the table itself drawn there, as it is on the board.)
    if (l.o) return;
    const top = it.y + area.y + l.y, tall = l.size * DOC_LINE, rule = Math.max(1, l.size / 14), left = it.x + area.x, block = l.k === 'code';
    // A divider: a faint line across, in the middle of its line.
    if (l.k === 'hr') {
      ctx.fillStyle = ink;
      ctx.globalAlpha = alpha * 0.2;
      ctx.fillRect(left, Math.round(top + tall / 2), area.w, 1);
      ctx.globalAlpha = alpha;
      return;
    }
    // A quote: a bar down its left, its text fainter; a ticked item of a checklist fainter still.
    const pe = paraEnd(text, l.s), done = runs.find((r) => r.l && r.s <= pe && r.e > pe)?.l === 'done';
    const faint = (l.k === 'quote' ? QUOTE_ALPHA : 1) * (done ? DONE_ALPHA : 1);
    ctx.globalAlpha = alpha * faint;
    if (l.k === 'quote') {
      ctx.fillStyle = ink;
      ctx.globalAlpha = alpha * faint * 0.2;
      ctx.fillRect(left, top, 3, tall);
      ctx.globalAlpha = alpha * faint;
    }
    // (A line of code coloured by what's in it, «Markdown полностью»: its paragraph's parts, see codeColors.ts.)
    const ps = block && labOn('mdFull') ? text.lastIndexOf('\n', l.s - 1) + 1 : -1;
    const tokens = ps < 0 ? [] : codeTokens(text.slice(ps, paraEnd(text, l.s))).map((t) => ({ ...t, s: t.s + ps, e: t.e + ps }));
    const cuts = [...new Set([l.s, l.e, ...[...runs, ...links, ...tokens].flatMap((r) => [r.s, r.e]).filter((c) => c > l.s && c < l.e)])].sort((a, b) => a - b);
    const pieces = cuts.slice(0, -1).map((c, i) => {
      const e = cuts[i + 1], r = runs.filter((k) => k.s <= c && k.e >= e).reduce((m, k) => ({ ...m, ...k }), {} as Partial<TextRun>);
      if (!r.c) { const tk = tokens.find((k) => k.s <= c && k.e >= e); if (tk) r.c = tk.c; }
      // (In a block of code, all of it monospaced, at its own size: no grey of its own round code there.)
      if (block) r.m = false;
      const f = font(r.m ? l.size * CODE_SIZE : l.size, l.h || r.b ? 700 : st.weight, r.m || block ? 'mono' : st.family, !!r.i || st.italic);
      ctx.font = f;
      const t = text.slice(c, e);
      return { t, r, f, w: ctx.measureText(t).width, link: links.find((k) => k.s <= c && k.e >= e) };
    });
    const lw = pieces.reduce((s, p) => s + p.w, 0);
    const room = area.w - l.indent;
    const la = block ? 'left' : l.a ?? align;
    let x = left + l.indent + (la === 'center' ? (room - lw) / 2 : la === 'right' ? room - lw : 0);
    ctx.font = font(l.size, l.h ? 700 : st.weight, block ? 'mono' : st.family, st.italic);
    const fm = ctx.measureText('Hg'), base = top + (tall - fm.fontBoundingBoxAscent - fm.fontBoundingBoxDescent) / 2 + fm.fontBoundingBoxAscent, mid = top + tall / 2;
    // A list's marker in the room on its left (past a quote's bar); a checklist's box there.
    const markX = left + l.indent - LIST_IN + 4;
    if (l.mark) { ctx.fillStyle = ink; ctx.fillText(l.mark, markX, base); }
    // (A ticked one's box as bright as ever: only its text faint.)
    if (l.box) { const a = ctx.globalAlpha; if (l.box === 'done') ctx.globalAlpha = alpha; drawBox(ctx, markX, mid, l.size, l.box === 'done', ink, look.on ?? '#0080FF'); ctx.globalAlpha = a; }
    for (const p of pieces) {
      const color = p.link ? look.link : p.r.c ? look.tint(p.r.c) : ink;
      // Code: on a rounded grey of its own.
      if (p.r.m) {
        ctx.fillStyle = ink;
        ctx.globalAlpha = alpha * faint * 0.07;
        ctx.beginPath();
        ctx.roundRect(x - 2, mid - l.size * 0.65, p.w + 4, l.size * 1.3, 4);
        ctx.fill();
        ctx.globalAlpha = alpha * faint;
      }
      ctx.font = p.f;
      ctx.fillStyle = color;
      ctx.fillText(p.t, x, base);
      if (p.r.u || it.fu) ctx.fillRect(x, mid + l.size * 0.42, p.w, rule);
      if (p.r.x || it.fx || done) ctx.fillRect(x, mid + l.size * 0.04 - rule / 2, p.w, rule);
      if (p.link) {
        ctx.globalAlpha = alpha * faint * 0.4;
        ctx.fillRect(x, base + fm.fontBoundingBoxDescent - rule, p.w, rule);
        ctx.globalAlpha = alpha * faint;
        look.onLink?.({ x, y: top, w: p.w, h: tall, url: p.link.url });
      }
      x += p.w;
    }
    ctx.globalAlpha = alpha;
  }
  ctx.restore();
}

/** Page `n` of it zoomed out past its letters: each of its lines a faint rounded bar, as long as its text
 *  comes to (by its letters, roughly), as tall as a little over half of it, where it stands (a heading's
 *  bigger, a list's further in, a centred one in the middle); tables and dividers drawn as they are. */
export function drawDocSkeleton(ctx: CanvasRenderingContext2D, it: Item, n: number, ink: string): void {
  const area = textArea(it), text = it.text ?? '';
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  ctx.globalAlpha = (it.to ?? 1) * 0.1;
  for (const l of docLines(it)) {
    if (l.page !== n || l.o || l.k === 'hr' || !text.slice(l.s, l.e).trim()) continue;
    const room = area.w - l.indent, w = Math.min(room, (l.e - l.s) * l.size * (l.h ? 0.58 : 0.5)), h = l.size * 0.62;
    ctx.lineWidth = h;
    const la = l.a ?? it.ta ?? 'left', x = it.x + area.x + l.indent + (la === 'center' ? (room - w) / 2 : la === 'right' ? room - w : 0);
    const y = it.y + area.y + l.y + (l.size * DOC_LINE - h) / 2;
    // (Round at both ends however small it comes out: a stroke with round caps, its ends within the bar.)
    ctx.beginPath();
    ctx.moveTo(x + h / 2, y + h / 2);
    ctx.lineTo(Math.max(x + h / 2, x + w - h / 2), y + h / 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Where the paragraph a character's in ends (its line break, or the end of the text). */
const paraEnd = (text: string, at: number) => { const n = text.indexOf('\n', at); return n < 0 ? text.length : n; };

/** A checklist's box, `size` the text's: its left at x, its middle at y; ticked, a pixel bigger each side, filled
 *  in `on` (the blue of the tool picked on the rail) with a white tick in it. */
function drawBox(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, ticked: boolean, ink: string, on: string): void {
  const s = Math.round(size * BOX_SIZE), top = y - s / 2;
  ctx.save();
  ctx.beginPath();
  if (ticked) {
    const b = s + 2, bx = x - 1, by = top - 1;
    ctx.roundRect(bx, by, b, b, 5);
    ctx.fillStyle = on;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.5, b / 8);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(bx + b * 0.27, by + b * 0.52);
    ctx.lineTo(bx + b * 0.43, by + b * 0.68);
    ctx.lineTo(bx + b * 0.73, by + b * 0.34);
    ctx.stroke();
  } else {
    ctx.roundRect(x + 0.75, top + 0.75, s - 1.5, s - 1.5, 4);
    ctx.strokeStyle = ink;
    ctx.globalAlpha *= 0.5;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

/** The box of a checklist's item a point's on, on the page shown of a sheet: the sheet, and the
 *  paragraph's start in its text (to tick it, or not). */
export function docBoxAt(items: Item[], w: Point): { it: Item; at: number } | null {
  for (const it of items) {
    if (it.type !== 'page' || w.x < it.x || w.x > it.x + it.w || w.y < it.y || w.y > it.y + it.h) continue;
    const n = pageShown(it), area = textArea(it);
    for (const l of docLines(it)) {
      if (l.page !== n || !l.box) continue;
      const x = it.x + area.x + l.indent - LIST_IN + 4, mid = it.y + area.y + l.y + l.size * DOC_LINE / 2, s = Math.round(l.size * BOX_SIZE);
      // (Taken well round it, not aimed at: from the text's edge to its text's start, the line's height.)
      if (w.x >= x - 10 && w.x <= x + s + 8 && Math.abs(w.y - mid) <= (l.size * DOC_LINE) / 2) return { it, at: l.s };
    }
  }
  return null;
}

/** How many pages it has (one at least). */
export const pageCount = (it: Item): number => Math.max(1, ...docLines(it).map((l) => l.page + 1));
/** How many pages a sheet being typed in has as it's typed (its pager counting them as they come, before
 *  it's done with), by id. */
const livePages = new Map<string, number>();
export const setLivePages = (id: string, n: number | null): void => { if (n === null) livePages.delete(id); else livePages.set(id, n); };
/** How many pages its pager shows: as it's being typed, those it has then. */
export const pagerCount = (it: Item): number => livePages.get(it.id) ?? pageCount(it);
/** Its pages, for what still counts them so: one entry each. */
export const pagesOf = (it: Item): number[] => Array.from({ length: pageCount(it) }, (_, i) => i);

/** The page it shows here (within those it has). */
export const pageShown = (it: Item, count = pagesOf(it).length): number => Math.min(shown.get(it.id) ?? 0, count - 1);
/** Shows page `n` of a sheet here; the page it showed before. */
export function showPage(id: string, n: number): number {
  const was = shown.get(id) ?? 0;
  shown.set(id, n);
  if (n !== was) turned++;
  return was;
}
/** (`dir` ±2: to its first page, its last.) */
export function turnPage(it: Item, dir: -2 | -1 | 1 | 2): void {
  const n = pagesOf(it).length;
  shown.set(it.id, dir === -2 ? 0 : dir === 2 ? n - 1 : Math.max(0, Math.min(n - 1, pageShown(it, n) + dir)));
  turned++;
}

/** Whether a point on it is under its text, on its last page shown (double-clicked there, typed on at its end). */
export function belowText(it: Item, p: Point): boolean {
  const n = pageShown(it), area = textArea(it);
  if (n !== pagesOf(it).length - 1) return false;
  const last = docLines(it).filter((l) => l.page === n).pop();
  return !last || p.y > it.y + area.y + last.y + (last.tall ?? last.size * DOC_LINE);
}

/** Whether a point on it is over its text, on its first page shown (over its first line, the sheet's top
 *  margin too): double-clicked there, a plain line over all of it to type on. */
export function aboveText(it: Item, p: Point): boolean {
  if (pageShown(it) !== 0 || p.y < it.y || p.x < it.x || p.x > it.x + it.w) return false;
  const first = docLines(it)[0];
  return !!first && p.y < it.y + textArea(it).y + first.y;
}

/** The pager under it: its middle, and its arrows' each side of it. */
/** (Under its right edge: its right arrow 24 in from it.) */
const PAGER_Y = 22, ARROW_DX = 44, PAGER_RIGHT = 24 + ARROW_DX + 8;
/** Of more than JUMP_FROM pages, double arrows past the arrows, JUMP_DX further out: to the first page, to the
 *  last (the pager moved left by as much, its right end where it was). */
const JUMP_FROM = 5, JUMP_DX = 28;
const jumps = (it: Item): boolean => pagerCount(it) > JUMP_FROM;
const pagerMid = (it: Item): Point => ({ x: it.x + it.w - PAGER_RIGHT - (jumps(it) ? JUMP_DX : 0), y: it.y + it.h + PAGER_Y });

/** A sheet's pager arrow a point's on: the sheet, and which way (±2: to its first or last page). */
export function pagerAt(items: Item[], w: Point): { it: Item; dir: -2 | -1 | 0 | 1 | 2 } | null {
  for (const it of items) {
    // (One of a single page has none.)
    if (it.type !== 'page' || pagerCount(it) < 2) continue;
    const m = pagerMid(it);
    if (Math.abs(w.y - m.y) > 12) continue;
    if (Math.abs(w.x - (m.x - ARROW_DX)) <= 12) return { it, dir: -1 };
    if (Math.abs(w.x - (m.x + ARROW_DX)) <= 12) return { it, dir: 1 };
    if (jumps(it) && Math.abs(w.x - (m.x - ARROW_DX - JUMP_DX)) <= 12) return { it, dir: -2 };
    if (jumps(it) && Math.abs(w.x - (m.x + ARROW_DX + JUMP_DX)) <= 12) return { it, dir: 2 };
    // (Its number between them, of several pages: a page to go to, `dir` 0.)
    if (Math.abs(w.x - m.x) <= ARROW_DX - 14 && pagesOf(it).length > 1) return { it, dir: 0 };
  }
  return null;
}

/** «‹ n / of ›»'s number clicked: a field for the page to go to over it (PageJump.tsx), typed in there. */
let jumping: string | null = null;
const jumpFns = new Set<() => void>();
export const subscribeJump = (fn: () => void) => { jumpFns.add(fn); return () => { jumpFns.delete(fn); }; };
export const jumpingIn = (): string | null => jumping;
export function askPage(it: Item): void { jumping = it.id; jumpFns.forEach((f) => f()); }
export function endJump(): void { if (!jumping) return; jumping = null; jumpFns.forEach((f) => f()); }
/** Its pager's middle on the board (the field for a page to go to stands over it). */
export const pagerAtMid = (it: Item): Point => pagerMid(it);

/** The pager arrow under the pointer, as the renderer lights it (`pager:<id>:<−1|1>`). */
export function pagerHot(items: Item[], w: Point): string | null {
  const p = pagerAt(items, w);
  return p ? `pager:${p.it.id}:${p.dir}` : null;
}

/** Draws its pager: «‹ n / of ›», small, the arrows faint where there's no page that way, lit under the pointer. */
export function drawPager(ctx: CanvasRenderingContext2D, it: Item, n: number, of: number, look: { ink: string; muted: string }, hot: string | null, skeleton = false): void {
  // (A sheet of one page: none.)
  if (of < 2) return;
  const m = pagerMid(it);
  ctx.save();
  // Zoomed out past its letters (its sheet a skeleton, drawDocSkeleton): its number a faint bar as long as it
  // comes to, its arrows faint dots.
  if (skeleton) {
    const bar = 13 * 0.62, w = `${n + 1} / ${of}`.length * 13 * 0.5, far = jumps(it) ? [ARROW_DX + JUMP_DX] : [];
    ctx.strokeStyle = look.ink;
    ctx.lineCap = 'round';
    ctx.lineWidth = bar;
    ctx.globalAlpha = 0.1;
    ctx.beginPath();
    ctx.moveTo(m.x - w / 2 + bar / 2, m.y);
    ctx.lineTo(m.x + w / 2 - bar / 2, m.y);
    for (const dx of [ARROW_DX, ...far]) for (const x of [m.x - dx, m.x + dx]) { ctx.moveTo(x, m.y); ctx.lineTo(x, m.y); }
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = font(13, 500);
  // (Its number lit under the pointer, a page to go to by a click on it.)
  ctx.fillStyle = hot === `pager:${it.id}:0` ? look.ink : look.muted;
  ctx.fillText(`${n + 1} / ${of}`, m.x, m.y);
  const far = jumps(it) ? [[-2, m.x - ARROW_DX - JUMP_DX, n > 0], [2, m.x + ARROW_DX + JUMP_DX, n < of - 1]] as const : [];
  for (const [dir, x, can] of [[-1, m.x - ARROW_DX, n > 0], [1, m.x + ARROW_DX, n < of - 1], ...far] as const) {
    // (The set's chevrons; under the pointer, 1.4 times as big. A double one two of them a third apart.)
    const on = can && hot === `pager:${it.id}:${dir}`, size = on ? 22 : 16, icon = dir < 0 ? 'chevron-to-the-left-l' : 'chevron-to-the-right-l';
    ctx.globalAlpha = can ? 1 : 0.3;
    for (const dx of Math.abs(dir) === 2 ? [-size * 0.17, size * 0.17] : [0]) drawIcon(ctx, icon, x + dx - size / 2, m.y - size / 2, size, on ? look.ink : look.muted);
  }
  ctx.restore();
}
