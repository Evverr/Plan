import { PAGE, pageMargins, type Item, type TextAlign } from '../model/types';
import type { Point } from '../canvas/geometry';
import { font, fontOf, LINE_HEIGHT } from '../canvas/text';
import type { TextRun } from '../model/textLinks';

/**
 * «Документ» (src/labs): a sheet of A4 on the board, its margins as ГОСТ has them, its text typed in as a
 * sticker's, at its own size, from the top: what doesn't fit on a page goes on to the next. Words in it
 * may be bold, italic… or code (styles on parts of it, model/textLinks.ts), a paragraph a heading (1…6,
 * bigger and bold, see setHeading there), a list's item, a checklist's, a quote or a divider; its lines wrap as wide as their words come out in
 * their own styles, each as tall as its paragraph's size. The sheet shows one page at a time, the pager
 * under it («‹ 1 / 3 ›», ten pages at most) turning them, for whoever's looking (not for everyone).
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
/** Its lines 20% further apart than text elsewhere on the board. */
export const DOC_LINE = LINE_HEIGHT * 1.2;

/** A list's paragraphs: how far in their lines stand (their marker in that room, at its left). */
export const LIST_IN = 28;
/** A quote's paragraphs: how far in (a bar down their left), and how faint against the rest. */
export const QUOTE_IN = 20, QUOTE_ALPHA = 0.75;
/** Code in a line («Markdown в документе»): its size against the text round it; a block of code's, the
 *  room inside its grey each side. */
export const CODE_SIZE = 0.9, CODE_IN = 12;
/** What's put in the text in place of a paragraph («Таблица в документе», docObjects.ts): found by its id
 *  (set by the editor, see setDocObjects), and the room over and under it. */
let objectOf: (id: string) => Item | undefined = () => undefined;
export const setDocObjects = (get: (id: string) => Item | undefined): void => { objectOf = get; };
export const docObject = (id: string): Item | undefined => objectOf(id);
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
const laidOut = new Map<string, { key: string; lines: DocLine[] }>();
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
  const objs = runs.filter((r) => r.o).map((r) => { const o = objectOf(r.o!); return o ? `${o.w}x${o.h}` : '-'; }).join();
  const area = textArea(it);
  const key = `${text}|${fs}|${st.weight}|${st.family}|${st.italic}|${JSON.stringify(runs)}|${objs}|${area.w}x${area.h}`, was = laidOut.get(it.id);
  if (was?.key === key) return was.lines;
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
  const put = (s: number, e: number, size: number, h: number, first: boolean, obj?: Item) => {
    const tall = obj ? obj.h + OBJ_GAP * 2 : size * DOC_LINE, gap = h && first && y > 0 ? size * HEADING_GAP : 0;
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
    // (Its own alignment, as set for it alone, over the whole of it's.)
    a = block ? undefined : runs.find((r) => r.a && r.s <= e0 && r.e > e0)?.a as TextAlign | undefined;
    const list = own('l') as string | undefined, depth = Math.min(LIST_DEPTH, (own('d') as number | undefined) ?? 0);
    if (k === 'hr') { nums = []; indent = 0; mark = undefined; box = undefined; put(s0, e0, size, 0, true); continue; }
    // A table put in its place: room as tall as it (on the next page whole, if not on this one).
    const oid = runs.find((r) => r.o && r.s <= e0 && r.e > e0)?.o, obj = oid && !placed.has(oid) ? objectOf(oid) : undefined;
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
  laidOut.set(it.id, { key, lines: out });
  return out;
}

/** Draws page `n` of it: each line piece by piece in its own style, a heading's bigger and bold, links
 *  blue and underlined (`onLink` noting where, to be Cmd+clicked). */
export function drawDocPage(ctx: CanvasRenderingContext2D, it: Item, n: number, look: {
  ink: string; link: string; tint: (c: string) => string; onLink?: (r: { x: number; y: number; w: number; h: number; url: string }) => void;
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
    const faint = (l.k === 'quote' ? QUOTE_ALPHA : 1) * (done ? 0.5 : 1);
    ctx.globalAlpha = alpha * faint;
    if (l.k === 'quote') {
      ctx.fillStyle = ink;
      ctx.globalAlpha = alpha * faint * 0.2;
      ctx.fillRect(left, top, 3, tall);
      ctx.globalAlpha = alpha * faint;
    }
    const cuts = [...new Set([l.s, l.e, ...[...runs, ...links].flatMap((r) => [r.s, r.e]).filter((c) => c > l.s && c < l.e)])].sort((a, b) => a - b);
    const pieces = cuts.slice(0, -1).map((c, i) => {
      const e = cuts[i + 1], r = runs.filter((k) => k.s <= c && k.e >= e).reduce((m, k) => ({ ...m, ...k }), {} as Partial<TextRun>);
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
    if (l.box) drawBox(ctx, markX, mid, l.size, l.box === 'done', ink);
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

/** Where the paragraph a character's in ends (its line break, or the end of the text). */
const paraEnd = (text: string, at: number) => { const n = text.indexOf('\n', at); return n < 0 ? text.length : n; };

/** A checklist's box, `size` the text's: its left at x, its middle at y; ticked, filled with a tick in it. */
function drawBox(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, ticked: boolean, ink: string): void {
  const s = Math.round(size * 0.8), top = y - s / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 0.75, top + 0.75, s - 1.5, s - 1.5, 4);
  if (ticked) {
    ctx.fillStyle = ink;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.5, s / 8);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + s * 0.27, top + s * 0.52);
    ctx.lineTo(x + s * 0.43, top + s * 0.68);
    ctx.lineTo(x + s * 0.73, top + s * 0.34);
    ctx.stroke();
  } else {
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
      const x = it.x + area.x + l.indent - LIST_IN + 4, mid = it.y + area.y + l.y + l.size * DOC_LINE / 2, s = Math.round(l.size * 0.8);
      if (w.x >= x - 3 && w.x <= x + s + 3 && Math.abs(w.y - mid) <= s / 2 + 3) return { it, at: l.s };
    }
  }
  return null;
}

/** How many pages it has (one at least). */
export const pageCount = (it: Item): number => Math.max(1, ...docLines(it).map((l) => l.page + 1));
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
export function turnPage(it: Item, dir: -1 | 1): void {
  const n = pagesOf(it).length;
  shown.set(it.id, Math.max(0, Math.min(n - 1, pageShown(it, n) + dir)));
  turned++;
}

/** Whether a point on it is under its text, on its last page shown (double-clicked there, typed on at its end). */
export function belowText(it: Item, p: Point): boolean {
  const n = pageShown(it), area = textArea(it);
  if (n !== pagesOf(it).length - 1) return false;
  const last = docLines(it).filter((l) => l.page === n).pop();
  return !last || p.y > it.y + area.y + last.y + (last.tall ?? last.size * DOC_LINE);
}

/** The pager under it: its middle, and its arrows' each side of it. */
const PAGER_Y = 22, ARROW_DX = 44;
const pagerMid = (it: Item): Point => ({ x: it.x + it.w / 2, y: it.y + it.h + PAGER_Y });

/** A sheet's pager arrow a point's on: the sheet, and which way. */
export function pagerAt(items: Item[], w: Point): { it: Item; dir: -1 | 1 } | null {
  for (const it of items) {
    if (it.type !== 'page') continue;
    const m = pagerMid(it);
    if (Math.abs(w.y - m.y) > 12) continue;
    if (Math.abs(w.x - (m.x - ARROW_DX)) <= 12) return { it, dir: -1 };
    if (Math.abs(w.x - (m.x + ARROW_DX)) <= 12) return { it, dir: 1 };
  }
  return null;
}

/** The pager arrow under the pointer, as the renderer lights it (`pager:<id>:<−1|1>`). */
export function pagerHot(items: Item[], w: Point): string | null {
  const p = pagerAt(items, w);
  return p ? `pager:${p.it.id}:${p.dir}` : null;
}

/** Draws its pager: «‹ n / of ›», small, the arrows faint where there's no page that way, lit under the pointer. */
export function drawPager(ctx: CanvasRenderingContext2D, it: Item, n: number, of: number, look: { ink: string; muted: string }, hot: string | null): void {
  const m = pagerMid(it);
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = font(13, 500);
  ctx.fillStyle = look.muted;
  ctx.fillText(`${n + 1} / ${of}`, m.x, m.y);
  ctx.font = font(18, 500);
  for (const [dir, x, can] of [[-1, m.x - ARROW_DX, n > 0], [1, m.x + ARROW_DX, n < of - 1]] as const) {
    ctx.globalAlpha = can ? 1 : 0.3;
    ctx.fillStyle = can && hot === `pager:${it.id}:${dir}` ? look.ink : look.muted;
    ctx.fillText(dir < 0 ? '‹' : '›', x, m.y - 1);
  }
  ctx.restore();
}
