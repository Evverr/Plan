import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { hitItem, type Point } from '../canvas/geometry';
import { pagesOf, pageShown, showPage, textArea, turnPage } from './docPage';
import { labOn } from './labs';

/**
 * «Листать документ правой кнопкой» (src/labs): on a «Документ»'s sheet, the right button held and the
 * pointer swiped to one side, its page turns (to the left, the next; to the right, the one before): its
 * text goes out quickly and the other page's comes in. A right click with no swipe opens the menu as
 * ever (on a Mac it comes on the press: there it waits for the button to be let go).
 * A click on the side margin of a sheet already picked turns it too: on the left, to the page before; on
 * the right, to the next.
 */

/** How far on the screen it's swiped for the page to turn, px; how long its text goes out, and comes in, ms. */
const SWIPE = 40, HALF = 100;

/** Sheets turning here: the page each showed, since when. */
const flips = new Map<string, { from: number; since: number }>();

/** What a sheet turning shows: the page it showed going out (`page`), then its own coming in (`page`
 *  null), `k` how much of it; null, as ever. */
export function pageFlip(id: string, now = performance.now()): { page: number | null; k: number } | null {
  const f = flips.get(id);
  if (!f) return null;
  const t = (now - f.since) / HALF;
  if (t >= 2) { flips.delete(id); return null; }
  return t < 1 ? { page: f.from, k: 1 - t } : { page: null, k: t - 1 };
}
/** Whether any sheet is turning (drawn again till it's done). */
export const flipping = (): boolean => flips.size > 0;

/** The right button held on a sheet of several pages: where, which, the menu waiting for it, whether it's swiped. */
let press: { x: number; y: number; id: string; menu: (() => void) | null; swiped: boolean } | null = null;
/** When the last swipe was let go (the menu not to come after it, as it does on Windows). */
let swipedAt = 0;

/** The right click's menu: whether it waits (shown by `show` once the button's let go unswiped) or doesn't come. */
export function holdMenu(show: () => void): boolean {
  if (press) { press.menu = show; return true; }
  return performance.now() - swipedAt < 400;
}

/** Turns a sheet's page one way, its text going out and the other page's coming in. */
function turnFading(editor: Editor, it: Item, dir: -1 | 1): void {
  const from = pageShown(it);
  turnPage(it, dir);
  if (pageShown(it) !== from) flips.set(it.id, { from, since: performance.now() });
  editor.requestRender();
}

/** The side margin of the one sheet picked (of several pages) a press is in: -1 its left (the page
 *  before), 1 its right (the next); 0, none (or not so). Clicked there, not dragged, its page turns
 *  (`marginClick`); pressed twice, as ever (the turn undone, `marginDouble`). */
export function marginSide(ed: Editor, it: Item, w: Point): -1 | 0 | 1 {
  if (it.type !== 'page' || it.rot || !labOn('pageSwipe') || ed.selection.size !== 1 || !ed.selection.has(it.id) || ed.editingId === it.id || pagesOf(it).length < 2) return 0;
  if (w.y < it.y || w.y > it.y + it.h) return 0;
  const a = textArea(it);
  return w.x >= it.x && w.x < it.x + a.x ? -1 : w.x > it.x + a.x + a.w && w.x <= it.x + it.w ? 1 : 0;
}
/** The last margin turn, tied to its press so holding the second press cannot expire it. */
let clicked: { id: string; from: number; tap: number } | null = null;
export function marginClick(ed: Editor, it: Item, dir: -1 | 1): void {
  clicked = { id: it.id, from: pageShown(it), tap: ed.lastTap.t };
  turnFading(ed, it, dir);
}
/** Pressed twice on it: the page the first press turned back as it was. */
export function marginDouble(ed: Editor, id: string, firstTap: number | undefined): void {
  if (!clicked || clicked.id !== id || clicked.tap !== firstTap) return;
  showPage(id, clicked.from);
  flips.delete(id);
  clicked = null;
  ed.requestRender();
}

export function attachPageSwipe(editor: Editor): () => void {
  const down = (e: PointerEvent) => {
    const canvas = editor.canvas;
    if (e.button !== 2 || !canvas || e.target !== canvas || !labOn('pageSwipe') || editor.looking) return;
    const r = canvas.getBoundingClientRect(), hit = hitItem(editor.shown(), editor.toWorld(e.clientX - r.left, e.clientY - r.top), editor.cam.z);
    if (hit?.type === 'page' && pagesOf(hit).length > 1) press = { x: e.clientX, y: e.clientY, id: hit.id, menu: null, swiped: false };
  };
  const move = (e: PointerEvent) => {
    if (!press || press.swiped) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(dy)) return;
    press.swiped = true;
    const it = editor.board.get(press.id);
    if (it) turnFading(editor, it, dx < 0 ? 1 : -1);
  };
  const up = (e: PointerEvent) => {
    if (!press || e.button !== 2) return;
    const p = press;
    press = null;
    if (p.swiped) swipedAt = performance.now();
    else p.menu?.();
  };
  const cancel = () => { press = null; };
  // Pointer events always have detail 0 here; mousedown carries the system double-click count.
  const systemDouble = (e: MouseEvent) => {
    const g = editor.gesture;
    if (e.detail >= 2 && g?.type === 'drag' && g.pageMargin && g.pageDouble !== undefined) g.dbl = true;
  };
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', cancel, true);
  window.addEventListener('mousedown', systemDouble, true);
  return () => {
    window.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true);
    window.removeEventListener('mousedown', systemDouble, true);
  };
}
