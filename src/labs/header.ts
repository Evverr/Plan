import type { Item } from '../model/types';
import type { Point, Rect } from '../canvas/geometry';
import { font, LINE_HEIGHT, textBlockHeight, wrapText } from '../canvas/text';

/**
 * «Титул в объектах»: an icon, a title right of it and a description under that, one item (a
 * rectangle with `hd`; its title its text, its description `desc`, its icon `icon` in its colour). As
 * wide as it's stretched, as tall as they take: the description stands right under the title, pushed
 * down as the title takes more lines. A double click on the icon takes another, on the title or the
 * description types in it. A new timeline or kanban has one over it, its title and icon theirs.
 */
export const HEADER_NAME = 'Заголовок';
export const HEADER_DESC = 'Здесь идет описание заголовка, он может оказаться длинным, в две и более строки.';
/** Its parts, as Женя's component: the icon at its top left, the title and the description right of it. */
const ICON = 36, ICON_Y = -4, TEXT_X = 40, TITLE_FS = 24, TITLE_Y = 1, DESC_GAP = 2, DESC_FS = 20;
export const HEADER_W = TEXT_X + 620;
/** How far over a timeline or kanban it stands. */
export const HEADER_GAP = 24;
/** Narrowest it's stretched to. */
export const HEADER_MIN_W = TEXT_X + 120;

/** What's being typed in one now, as it's typed: which part (null its title, 0 its description). */
let typing: { id: string; cell: number | null; text: string } | null = null;
export const setHeaderTyping = (id: string | null, cell: number | null = null, text = '') => { typing = id ? { id, cell, text } : null; };

const titleOf = (it: Item) => (typing?.id === it.id && typing.cell === null ? typing.text : it.text ?? '');
const descOf = (it: Item) => (typing?.id === it.id && typing.cell === 0 ? typing.text : it.desc ?? '');

/** Where its parts are, from its top left: its title as many lines as it takes, its description under it. */
export function headerLayout(it: Item, patch: Partial<Item> = {}): { icon: Rect; title: Rect; desc: Rect; h: number } {
  const a = { ...it, ...patch }, w = Math.max(40, a.w - TEXT_X);
  const th = textBlockHeight(titleOf(a) || ' ', w, TITLE_FS, { weight: 700 }), dy = TITLE_Y + th + DESC_GAP;
  const dh = textBlockHeight(descOf(a) || ' ', w, DESC_FS);
  return { icon: { x: 0, y: ICON_Y, w: ICON, h: ICON }, title: { x: TEXT_X, y: TITLE_Y, w, h: th }, desc: { x: TEXT_X, y: dy, w, h: dh }, h: Math.ceil(Math.max(ICON, dy + dh)) };
}
export const headerHeight = (it: Item, patch: Partial<Item> = {}): number => headerLayout(it, patch).h;
/** How tall it stands: as what's in it takes, or (stretched taller by hand, `hdH`) as it's set, but no shorter. */
export const headerFit = (it: Item, patch: Partial<Item> = {}): number => Math.max(headerHeight(it, patch), it.hdH ? it.h : 0);

/** The part of it at board point `p`: its icon, title or description. */
export function headerPartAt(it: Item, p: Point): 'icon' | 'title' | 'desc' | null {
  const l = headerLayout(it), x = p.x - it.x, y = p.y - it.y;
  const on = (r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  return on(l.icon) ? 'icon' : on(l.title) ? 'title' : y >= l.desc.y && x >= l.desc.x ? 'desc' : null;
}

/** Where a part's typed in (null its title, 0 its description), for the text overlay. */
export function headerFieldBox(it: Item, cell: number | null): Rect & { fs: number; weight: number; family: string } {
  const l = headerLayout(it), r = cell === 0 ? l.desc : l.title;
  return { x: it.x + r.x, y: it.y + r.y, w: r.w, h: r.h, fs: cell === 0 ? DESC_FS : TITLE_FS, weight: cell === 0 ? 400 : 700, family: 'onest' };
}

/** Draws it: its icon by `icon`, its title and description in `ink`, but the part being typed in (`cell`). */
export function drawHeader(ctx: CanvasRenderingContext2D, it: Item, ink: string, icon: (name: string, x: number, y: number, size: number) => void, cell?: number | null): void {
  const l = headerLayout(it);
  icon(it.icon ?? 'kanban', it.x + l.icon.x, it.y + l.icon.y, ICON);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  const lines = (text: string, r: Rect, fs: number, weight: number) => {
    ctx.font = font(fs, weight);
    const lh = fs * LINE_HEIGHT;
    wrapText(text, r.w, (t) => ctx.measureText(t).width).forEach((line, i) => ctx.fillText(line, it.x + r.x, it.y + r.y + lh * i + lh / 2));
  };
  if (cell !== null) lines(it.text ?? '', l.title, TITLE_FS, 700);
  if (cell !== 0) lines(it.desc ?? '', l.desc, DESC_FS, 400);
}
