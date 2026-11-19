import type { Editor } from '../editor/editor';
import type { Point, Rect } from '../canvas/geometry';
import { DEFAULTS, type Item } from '../model/types';
import { font } from '../canvas/text';

/**
 * «Стопка стикеров» (src/labs): a pad of stickers on the board (`pad`), in a holder of its own, as a folded
 * frame looks: «Стикеры» along its top in the middle, faint, the pad in it 24 in from its sides and bottom, 36 from its top, a
 * sticker with more under it, no text. Taken from the pad, a new sticker comes off it, its colour and size,
 * dragged along and its frame alone once let go all out of the holder (no panel: a click, it; a double click,
 * typed in), let go over it, gliding back onto the pad, gone; the pad stays where it is, for the next. Taken by its holder, moved; the holder clicked, the pad picked (its sticker clicked, nothing) (its colour
 * then set as a sticker's is, those coming off it that colour). Put on the board by the sticker's button
 * held, «Стопка стикеров».
 */

/** The holder round the pad: its room each side and under it, and over it (for its name). */
export const PAD_IN = 24, PAD_TOP = 36, PAD_NAME = 'Стикеры';

/** The pad's top sticker in its holder (the item). */
export const padSticker = (it: Item): Rect => ({ x: it.x + PAD_IN, y: it.y + PAD_TOP, w: Math.max(1, it.w - PAD_IN * 2), h: Math.max(1, it.h - PAD_TOP - PAD_IN) });

/** A new pad where the board was clicked (`at` on the board), not picked (no panel over it: a click, it). */
export function addPad(ed: Editor, at: Point): void {
  const d = DEFAULTS.sticky, w = d.w + PAD_IN * 2, h = d.h + PAD_TOP + PAD_IN;
  const it = ed.newItem('sticky', at.x - w / 2, at.y - h / 2, { pad: true, nt: true, text: '', w, h });
  ed.addItem(it);
  ed.setTool('select');
  ed.setSelection([]);
}

/** Whether a press at `w` on a pad takes a sticker off it: on its top sticker (not its holder). */
export const offPad = (_ed: Editor, it: Item, w: Point): boolean => {
  if (!it.pad) return false;
  const r = padSticker(it);
  return w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h;
};

/** A sticker off the pad, `d` from where its top one lies: its colour, size and type, no text; on the board. */
export function tearOff(ed: Editor, pad: Item, d: Point): Item {
  const look: Partial<Item> = {}, r = padSticker(pad);
  for (const k of ['color', 'fo', 'fs', 'ff', 'fw', 'fi', 'tc', 'ta', 'va', 'ly'] as const) if (pad[k] !== undefined) (look as Record<string, unknown>)[k] = pad[k];
  const it = ed.newItem('sticky', Math.round(r.x + d.x), Math.round(r.y + d.y), { ...look, w: Math.round(r.w), h: Math.round(r.h), text: '' });
  ed.addItem(it);
  return it;
}
/** Where a sticker torn off a pad starts from: its top sticker's corner. */
export const padStart = (pad: Item): Point => { const r = padSticker(pad); return { x: r.x, y: r.y }; };

/** Its holder, as a folded frame is drawn (its fill, a hairline round it, round corners), «Стикеры» along
 *  its top; then the stickers under its top one: two, lower and further right each, a shade darker. */
export function drawPadHolder(ctx: CanvasRenderingContext2D, it: Item, look: { frame: string; line: string; ink: string; z: number }, under: string): void {
  ctx.save();
  ctx.fillStyle = look.frame;
  ctx.strokeStyle = look.line;
  ctx.lineWidth = 1 / look.z;
  ctx.beginPath();
  ctx.roundRect(it.x, it.y, it.w, it.h, 16);
  ctx.fill();
  ctx.stroke();
  ctx.font = font(12, 600);
  ctx.fillStyle = look.ink;
  ctx.globalAlpha = 0.45;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(PAD_NAME, it.x + it.w / 2, it.y + PAD_TOP / 2);
  ctx.globalAlpha = 1;
  const r = padSticker(it);
  for (const [k, a] of [[2, 0.55], [1, 0.8]] as const) {
    const o = k * 4;
    ctx.fillStyle = under;
    ctx.globalAlpha = a;
    ctx.fillRect(r.x + o, r.y + o, r.w, r.h);
    ctx.fillStyle = '#000';
    ctx.globalAlpha = 0.06 * k;
    ctx.fillRect(r.x + o, r.y + o, r.w, r.h);
  }
  ctx.restore();
}
