import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import type { Rect } from '../canvas/geometry';
import { cellRect, colsOf, rowsOf } from '../model/table';

/**
 * What the panels over a table go by while its cells are picked or typed in (the selection panel, the text
 * panel), so they don't fly about from cell to cell: the table, its top on the screen; else the cell first
 * picked, kept there for the next ones but for one higher up, it then.
 */
let anchor: { id: string; cell: number } | null = null;

/** Whether a table's top is on the screen, room for a panel over it. */
const topSeen = (ed: Editor, t: Item): boolean => {
  const a = ed.toScreen({ x: t.x, y: t.y }), b = ed.toScreen({ x: t.x + t.w, y: t.y });
  return a.y >= 70 && a.y <= innerHeight - 70 && b.x > 0 && a.x < innerWidth;
};

/** The box to put the panels of table `t` by, its cells `cells` picked (or typed in). */
export function cellAnchor(ed: Editor, t: Item, cells: number[]): Rect {
  if (!cells.length || topSeen(ed, t)) { anchor = null; return { x: t.x, y: t.y, w: t.w, h: t.h }; }
  // (The highest of those picked.)
  const top = cells.reduce((a, c) => (cellRect(t, c).y < cellRect(t, a).y ? c : a), cells[0]);
  if (!anchor || anchor.id !== t.id || anchor.cell >= cellCount(t) || cellRect(t, top).y < cellRect(t, anchor.cell).y) anchor = { id: t.id, cell: top };
  return cellRect(t, anchor.cell);
}

const cellCount = (t: Item): number => colsOf(t).length * rowsOf(t).length;
