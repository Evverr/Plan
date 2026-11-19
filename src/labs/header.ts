import type { Item } from '../model/types';
import type { Board } from '../model/board';
import type { Point, Rect } from '../canvas/geometry';
import { font, LINE_HEIGHT, textBlockHeight, wrapText } from '../canvas/text';
import { labOn } from './labs';

/**
 * «Титул в объектах»: an icon, a title right of it and a description under that, one item (a
 * rectangle with `hd`; its title its text, its description `desc`, its icon `icon` in its colour). As
 * wide as it's stretched, as tall as they take: the description stands right under the title, pushed
 * down as the title takes more lines. A double click on the icon takes another, on the title or the
 * description types in it. A new timeline or kanban has one over it, its title and icon theirs, no
 * description, a line of title, tied to it (`tie`): moved, copied and deleted with it, but never picked
 * (a click or box on it picks what it's tied to), only its title typed in on a double click.
 */
export const HEADER_NAME = 'Заголовок';
export const HEADER_DESC = 'Здесь идет описание заголовка, он может оказаться длинным, в две и более строки.';
/** Its parts, as Женя's component: the icon at its top left, the title and the description right of it. */
const ICON = 36, ICON_Y = -4, TEXT_X = 40, TITLE_FS = 24, TITLE_Y = 1, DESC_GAP = 2, DESC_FS = 20;
/** Tied to a kanban, timeline or table: smaller, its icon and title, the title semibold. */
const TIED = { icon: 30, iconX: 2, iconY: -4, textX: 36, fs: 18, weight: 600 };
/** A document's name over it («Название документа»): a tied one with no icon (`icon` 'none'), its title alone,
 *  regular, 6 in from its corner and 2 higher than a kanban's (see tiedAt), no «…». */
const NAMED = { ...TIED, icon: 0, iconX: 0, textX: 6, weight: 400 };
export const DOC_NAME_ICON = 'none';
const sizes = (it: Item) => (it.tie ? (it.icon === DOC_NAME_ICON ? NAMED : TIED) : { icon: ICON, iconX: 0, iconY: ICON_Y, textX: TEXT_X, fs: TITLE_FS, weight: 700 });
export const HEADER_W = TEXT_X + 620;
/** How far over a timeline or kanban it stands. */
export const HEADER_GAP = 4;
/** Narrowest it's stretched to. */
export const HEADER_MIN_W = TEXT_X + 120;

/** What's being typed in one now, as it's typed: which part (null its title, 0 its description). */
let typing: { id: string; cell: number | null; text: string } | null = null;
export const setHeaderTyping = (id: string | null, cell: number | null = null, text = '') => { typing = id ? { id, cell, text } : null; };

const titleOf = (it: Item) => (typing?.id === it.id && typing.cell === null ? typing.text : it.text ?? '');
const descOf = (it: Item) => (typing?.id === it.id && typing.cell === 0 ? typing.text : it.desc ?? '');

/** Where its parts are, from its top left: its title as many lines as it takes, its description under it. */
export function headerLayout(it: Item, patch: Partial<Item> = {}): { icon: Rect; title: Rect; desc: Rect; h: number; fs: number; weight: number } {
  const a = { ...it, ...patch }, s = sizes(a), w = Math.max(40, a.w - s.textX);
  const th = textBlockHeight(titleOf(a) || ' ', w, s.fs, { weight: s.weight }), dy = TITLE_Y + th + DESC_GAP;
  // (Tied to a kanban, timeline or table: no description.)
  const dh = a.tie ? 0 : textBlockHeight(descOf(a) || ' ', w, DESC_FS);
  return { icon: { x: s.iconX, y: s.iconY, w: s.icon, h: s.icon }, title: { x: s.textX, y: TITLE_Y, w, h: th }, desc: { x: s.textX, y: dy, w, h: dh }, h: Math.ceil(Math.max(s.icon + s.iconY, a.tie ? TITLE_Y + th : dy + dh)), fs: s.fs, weight: s.weight };
}
export const headerHeight = (it: Item, patch: Partial<Item> = {}): number => headerLayout(it, patch).h;
/** How tall it stands: as what's in it takes, or (stretched taller by hand, `hdH`) as it's set, but no shorter. */
export const headerFit = (it: Item, patch: Partial<Item> = {}): number => Math.max(headerHeight(it, patch), it.hdH ? it.h : 0);

/** Where a header tied to `t` stands: over its top left corner (a timeline's, 1 further right and up). */
export function tiedAt(h: Item, t: Item): { x: number; y: number } {
  const k = t.tl ? 1 : 0, up = h.icon === DOC_NAME_ICON ? 2 : 0;
  return { x: t.x + k, y: t.y - HEADER_GAP - h.h - k - up };
}

/** Each header tied to a kanban or timeline put back over its corner, however that's moved, stretched or
 *  aligned (for good: undone, it's put back again). */
export function tidyTies(board: Board): void {
  const items = board.list(), moves = new Map<string, { x: number; y: number; h: number }>(), gone: string[] = [];
  for (const h of items) {
    const t = h.tie ? board.get(h.tie) : undefined;
    if (!t) continue;
    // (A table's, as tables had for a day: tables have none.)
    if (t.type === 'table') { gone.push(h.id); continue; }
    // (As tall as it takes, its sizes changed since, say.)
    const hh = headerHeight(h), at = tiedAt({ ...h, h: hh }, t);
    if (at.x !== h.x || at.y !== h.y || hh !== h.h) moves.set(h.id, { ...at, h: hh });
  }
  if (moves.size) board.forGood(() => moves.forEach((p, id) => board.updateForGood(id, p)));
  if (gone.length) board.forGood(() => board.remove(gone));
}

/** These ids, a header tied to a kanban or timeline among them (`tie`) for that: it's never picked. */
export function pickedTies(items: Item[], ids: Set<string>): Set<string> {
  if (!items.some((i) => i.tie)) return ids;
  return new Set([...ids].map((id) => items.find((i) => i.id === id)?.tie ?? id));
}

/** These ids with what each is tied to (a header and its kanban or timeline, `tie`). */
export function withTies(items: Item[], ids: Set<string>): Set<string> {
  if (!items.some((i) => i.tie || i.inDoc)) return ids;
  const out = new Set(ids);
  for (const i of items) if (i.tie && (ids.has(i.id) || ids.has(i.tie))) { out.add(i.id); out.add(i.tie); }
  // (And a document with the tables put in its text, «Таблица в документе»: those not without it.)
  for (const i of items) if (i.inDoc && ids.has(i.inDoc)) out.add(i.id);
  return out;
}

/** The part of it at board point `p`: its icon, title or description. */
export function headerPartAt(it: Item, p: Point): 'icon' | 'title' | 'desc' | 'more' | null {
  const l = headerLayout(it), x = p.x - it.x, y = p.y - it.y;
  const on = (r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  const more = moreBox(it);
  // (Its «…» a little bigger to take than it's drawn.)
  if (more && x >= more.x - 4 && x <= more.x + more.w + 4 && y >= more.y - 4 && y <= more.y + more.h + 4) return 'more';
  return on(l.icon) ? 'icon' : on(l.title) ? 'title' : !it.tie && y >= l.desc.y && x >= l.desc.x ? 'desc' : null;
}

/** «Троеточие у титула» (src/labs): a «…» after a kanban's or timeline's title (from its top left), opening its panel. */
const MORE = 20, MORE_GAP = 7;
export const MORE_ICON = 'more-l';
let measure: CanvasRenderingContext2D | null = null;
export function moreBox(it: Item): Rect | null {
  if (!it.tie || it.icon === DOC_NAME_ICON || !labOn('headerMore')) return null;
  measure ??= document.createElement('canvas').getContext('2d');
  if (!measure) return null;
  const s = sizes(it);
  measure.font = font(s.fs, s.weight);
  const tw = Math.min(measure.measureText(titleOf(it)).width, Math.max(40, it.w - s.textX - MORE - MORE_GAP)), lh = s.fs * LINE_HEIGHT;
  return { x: s.textX + tw + MORE_GAP, y: TITLE_Y + (lh - MORE) / 2, w: MORE, h: MORE };
}

/** Where a part's typed in (null its title, 0 its description), for the text overlay. */
export function headerFieldBox(it: Item, cell: number | null): Rect & { fs: number; weight: number; family: string } {
  const l = headerLayout(it), r = cell === 0 ? l.desc : l.title;
  return { x: it.x + r.x, y: it.y + r.y, w: r.w, h: r.h, fs: cell === 0 ? DESC_FS : l.fs, weight: cell === 0 ? 400 : l.weight, family: 'onest' };
}

/** Draws it: its icon by `icon`, its title and description in `ink`, but the part being typed in (`cell`). */
export function drawHeader(ctx: CanvasRenderingContext2D, it: Item, ink: string, icon: (name: string, x: number, y: number, size: number) => void, cell?: number | null): void {
  // (Its «…» drawn by `icon` as MORE_ICON: half seen, all of it under the pointer, as its caller has it.)
  const l = headerLayout(it);
  if (it.icon !== DOC_NAME_ICON) icon(it.icon ?? 'kanban', it.x + l.icon.x, it.y + l.icon.y, l.icon.w);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  const lines = (text: string, r: Rect, fs: number, weight: number) => {
    ctx.font = font(fs, weight);
    const lh = fs * LINE_HEIGHT;
    wrapText(text, r.w, (t) => ctx.measureText(t).width).forEach((line, i) => ctx.fillText(line, it.x + r.x, it.y + r.y + lh * i + lh / 2));
  };
  if (cell !== null) lines(it.text ?? '', l.title, l.fs, l.weight);
  if (cell !== 0 && !it.tie) lines(it.desc ?? '', l.desc, DESC_FS, 400);
  // Its «…» («Троеточие у титула»), but while its title's typed in.
  const more = cell === null ? null : moreBox(it);
  if (more) icon(MORE_ICON, it.x + more.x, it.y + more.y, MORE);
}
