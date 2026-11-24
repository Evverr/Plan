import type { Editor } from '../editor/editor';
import { hitItem } from '../canvas/geometry';
import { pagesOf, pageShown, turnPage } from './docPage';
import { labOn } from './labs';

/**
 * «Листать документ правой кнопкой» (src/labs): on a «Документ»'s sheet, the right button held and the
 * pointer swiped to one side, its page turns (to the left, the next; to the right, the one before): its
 * text goes out quickly and the other page's comes in. A right click with no swipe opens the menu as
 * ever (on a Mac it comes on the press: there it waits for the button to be let go).
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
    if (!it) return;
    const from = pageShown(it);
    turnPage(it, dx < 0 ? 1 : -1);
    if (pageShown(it) !== from) flips.set(it.id, { from, since: performance.now() });
    editor.requestRender();
  };
  const up = (e: PointerEvent) => {
    if (!press || e.button !== 2) return;
    const p = press;
    press = null;
    if (p.swiped) swipedAt = performance.now();
    else p.menu?.();
  };
  const cancel = () => { press = null; };
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', cancel, true);
  return () => {
    window.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true);
  };
}
