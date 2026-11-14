import type { Item } from '../model/types';

/**
 * «Заголовок в объектах»: an icon, a title right of it and a description under that, a component of the
 * board's own (made on the board the first time one's put there, put away), each one an instance of it:
 * its icon (a double click on it to take another), title and description each its own. A new timeline or
 * kanban has one over it, its title and icon theirs.
 */
export const HEADER_LIB = 'planx:header';
export const HEADER_NAME = 'Заголовок';
/** Its parts: the icon at its top left, the title and the description right of it, as Женя's component. */
const ICON = 36, TEXT_X = 40, TITLE_FS = 24, TITLE_H = 31, DESC_Y = 34, DESC_FS = 20, DESC_H = 88, TEXT_W = 620;
export const HEADER_W = TEXT_X + TEXT_W, HEADER_H = DESC_Y + DESC_H;
/** How far over a timeline or kanban it stands. */
export const HEADER_GAP = 24;

type Make = (type: Item['type'], x: number, y: number, extra: Partial<Item>) => Item;

/** The component's parts at x, y (its frame first): what to put on the board the first time. */
export function headerParts(make: Make, x: number, y: number): Item[] {
  const icon = make('icon', x, y, { w: ICON, h: ICON, icon: 'kanban', color: 'blue' });
  const title = make('text', x + TEXT_X, y + 1, { w: TEXT_W, h: TITLE_H, fs: TITLE_FS, fw: 700, tb: true, text: HEADER_NAME });
  const desc = make('text', x + TEXT_X, y + DESC_Y, { w: TEXT_W, h: DESC_H, fs: DESC_FS, tb: true,
    text: 'Здесь идет описание заголовка, он может оказаться длинным, в две и более строки.' });
  // (Not one of the board's objects, `obj`: it's in «Объекты» already.)
  const frame = make('frame', x, y, { w: HEADER_W, h: HEADER_H, text: HEADER_NAME, comp: true, stowed: true, lib: HEADER_LIB,
    members: [icon.id, title.id, desc.id] });
  return [frame, icon, title, desc];
}

/** Its parts in the component: the icon and the title (the bold text). */
export const headerIcon = (parts: Item[]) => parts.find((i) => i.type === 'icon');
export const headerTitle = (parts: Item[]) => parts.find((i) => i.type === 'text' && i.fw === 700);
