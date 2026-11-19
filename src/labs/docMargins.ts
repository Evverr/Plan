import type { Editor } from '../editor/editor';
import { PAGE, pageMargins, type Item } from '../model/types';
import type { Point } from '../canvas/geometry';
import { font } from '../canvas/text';
import { isLocked } from './labs';

/**
 * «Поля документа» (src/labs): a document's sheet's margins changed by hand, its own (`pm`), not ГОСТ's.
 * The button on its panel puts them out: each a faint dashed line across the sheet, a small triangle on
 * the sheet's edge where it meets it (the left and right ones over its top edge, the top and bottom ones
 * by its left), to be dragged, a whole millimetre at a time, its size shown in millimetres as it's
 * dragged; the text laid out again as it goes. Put away as something else is picked, or by the button.
 */

export type MarginSide = 'top' | 'right' | 'bottom' | 'left';

/** The sheet whose margins are out (its id). */
let shownFor: string | null = null;
const fns = new Set<() => void>();
export const subscribeMargins = (fn: () => void) => { fns.add(fn); return () => { fns.delete(fn); }; };
export const marginsOn = (id: string | undefined): boolean => !!id && shownFor === id;
function show(ed: Editor, id: string | null): void {
  if (shownFor === id) return;
  shownFor = id;
  fns.forEach((f) => f());
  ed.requestRender();
}
/** The button: the picked sheet's margins out, or away. */
export function toggleMargins(ed: Editor, id: string): void { show(ed, shownFor === id ? null : id); }

/** A millimetre on the sheet (A4: 210 mm across). */
export const MM = PAGE.W / 210;
/** At least this much margin, and this much room left for the text, each way. */
const MIN = 0, ROOM = 60 * MM;

/** The sheet whose margins are out, picked alone and not typed in. */
function sheetOf(ed: Editor): Item | null {
  const one = ed.selection.size === 1 ? [...ed.selection][0] : null;
  if (shownFor && one !== shownFor) { shownFor = null; fns.forEach((f) => f()); }
  if (!shownFor || ed.editingId) return null;
  const it = ed.board.get(shownFor);
  // (Not one locked in place: its margins as they are.)
  return it?.type === 'page' && !isLocked(it) ? it : null;
}

/** The triangles' size, on the screen (as wide; a little lower, their top blunt), and how near the
 *  pointer takes one (TRI_NEAR) or its line (LINE_NEAR, each side). */
const TRI = 9, TRI_H = 0.75, TRI_NEAR = 13, LINE_NEAR = 7;

/** Where each margin's line and triangle are on the screen. */
function handles(ed: Editor, it: Item): Array<{ side: MarginSide; tip: Point; a: Point; b: Point }> {
  const m = pageMargins(it), tl = ed.toScreen({ x: it.x, y: it.y }), br = ed.toScreen({ x: it.x + it.w, y: it.y + it.h }), z = ed.cam.z;
  const lx = tl.x + m.left * z, rx = br.x - m.right * z, ty = tl.y + m.top * z, by = br.y - m.bottom * z;
  return [
    { side: 'left', tip: { x: lx, y: tl.y }, a: { x: lx, y: tl.y }, b: { x: lx, y: br.y } },
    { side: 'right', tip: { x: rx, y: tl.y }, a: { x: rx, y: tl.y }, b: { x: rx, y: br.y } },
    { side: 'top', tip: { x: tl.x, y: ty }, a: { x: tl.x, y: ty }, b: { x: br.x, y: ty } },
    { side: 'bottom', tip: { x: tl.x, y: by }, a: { x: tl.x, y: by }, b: { x: br.x, y: by } },
  ];
}

/** The margin under a point on the screen: its triangle (out past the sheet's edge) or its line. */
export function marginAt(ed: Editor, sp: Point): MarginSide | null {
  const it = sheetOf(ed);
  if (!it) return null;
  for (const h of handles(ed, it)) {
    const across = h.side === 'left' || h.side === 'right';
    // (The triangle: over the top edge, or left of the left edge.)
    const c = across ? { x: h.tip.x, y: h.tip.y - TRI / 2 } : { x: h.tip.x - TRI / 2, y: h.tip.y };
    if (Math.hypot(sp.x - c.x, sp.y - c.y) <= TRI_NEAR) return h.side;
    if (across ? Math.abs(sp.x - h.a.x) <= LINE_NEAR && sp.y >= h.a.y && sp.y <= h.b.y : Math.abs(sp.y - h.a.y) <= LINE_NEAR && sp.x >= h.a.x && sp.x <= h.b.x) return h.side;
  }
  return null;
}
export const marginCursor = (s: MarginSide): string => (s === 'left' || s === 'right' ? 'ew-resize' : 'ns-resize');

let drag: { id: string; side: MarginSide; from: Point; was: number } | null = null, hot: MarginSide | null = null;
export const marginDragging = (): boolean => !!drag;
export const setHotMargin = (ed: Editor, s: MarginSide | null) => { if (hot !== s) { hot = s; ed.requestRender(); } };

/** Taken by its triangle or line (`sp` on the screen). */
export function startMargin(ed: Editor, side: MarginSide, sp: Point): void {
  const it = sheetOf(ed);
  if (!it) return;
  drag = { id: it.id, side, from: sp, was: pageMargins(it)[side] };
  ed.board.beginGesture();
}
/** Dragged on: that margin as far as it's gone, in whole millimetres, room left for the text. */
export function moveMargin(ed: Editor, sp: Point): void {
  const it = drag && ed.board.get(drag.id);
  if (!drag || !it) return;
  const m = pageMargins(it), z = ed.cam.z, s = drag.side;
  const d = (s === 'left' ? sp.x - drag.from.x : s === 'right' ? drag.from.x - sp.x : s === 'top' ? sp.y - drag.from.y : drag.from.y - sp.y) / z;
  const other = s === 'left' ? m.right : s === 'right' ? m.left : s === 'top' ? m.bottom : m.top, size = s === 'left' || s === 'right' ? PAGE.W : PAGE.H;
  const v = Math.round(Math.max(MIN, Math.min(size - other - ROOM, drag.was + d)) / MM) * MM;
  const next = { ...m, [s]: Math.round(v * 100) / 100 };
  if (next[s] === m[s]) return;
  ed.board.update(it.id, { pm: [next.top, next.right, next.bottom, next.left] });
}
export function endMargin(ed: Editor): void {
  if (!drag) return;
  drag = null;
  ed.board.endGesture();
  ed.requestRender();
}

/** Its margins drawn out: the lines faint and dashed, the triangles blue, the one under the pointer (or
 *  dragged) bolder, its size in millimetres by it as it's dragged. */
export function drawMargins(ctx: CanvasRenderingContext2D, ed: Editor): void {
  const it = sheetOf(ed);
  if (!it) return;
  const m = pageMargins(it), color = '#4DA3FF';
  ctx.save();
  for (const h of handles(ed, it)) {
    const on = drag?.side === h.side || (!drag && hot === h.side), across = h.side === 'left' || h.side === 'right';
    ctx.strokeStyle = color;
    ctx.globalAlpha = on ? 0.9 : 0.5;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(Math.round(h.a.x) + 0.5, Math.round(h.a.y) + 0.5);
    ctx.lineTo(Math.round(h.b.x) + 0.5, Math.round(h.b.y) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    // The triangle, its tip on the sheet's edge, pointing in: lower than it's wide (its tip blunt), its
    // corners rounded (a round-joined edge of its own colour round it).
    const k = on ? 1.2 : 1, t = TRI * k, d = t * TRI_H, r = 1.5, { x, y } = h.tip;
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (across) { ctx.moveTo(x, y - r); ctx.lineTo(x - t * 0.6 + r, y - d); ctx.lineTo(x + t * 0.6 - r, y - d); }
    else { ctx.moveTo(x - r, y); ctx.lineTo(x - d, y - t * 0.6 + r); ctx.lineTo(x - d, y + t * 0.6 - r); }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (drag?.side === h.side) {
      const label = `${Math.round(m[h.side] / MM)} мм`;
      ctx.font = font(12, 500);
      // (Inside the sheet by its triangle: clear of the panels round the screen's edges.)
      const w = ctx.measureText(label).width + 12, lx = across ? x - w / 2 : x + 6, ly = across ? y + 6 : y - 26;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(lx, ly, w, 20, 6);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx + 6, ly + 10);
    }
  }
  ctx.restore();
}
