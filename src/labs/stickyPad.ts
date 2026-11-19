import type { Editor } from '../editor/editor';
import type { Point } from '../canvas/geometry';
import { DEFAULTS, type Item } from '../model/types';

/**
 * «Стопка стикеров» (src/labs): a pad of stickers on the board, a sticker with more under it (`pad`), no
 * text of its own. Taken from inside, a new sticker comes off it, its colour and size, dragged along and
 * its frame alone once let go (no panel: a click, it; a double click, typed in); the pad stays where it is, for the next. Taken by its edge, it's moved; clicked,
 * picked (its colour then set as a sticker's is, those coming off it that colour). Put on the board by the
 * sticker's button held, «Стопка стикеров».
 */

/** How far in from its edge (on the screen) a press takes a sticker off it, not the pad itself. */
const EDGE = 12;

/** A new pad where the board was clicked (`at` on the board), picked. */
export function addPad(ed: Editor, at: Point): void {
  const d = DEFAULTS.sticky;
  const it = ed.newItem('sticky', at.x - d.w / 2, at.y - d.h / 2, { pad: true, nt: true, text: '' });
  ed.addItem(it);
  ed.setTool('select');
  ed.setSelection([it.id]);
}

/** Whether a press at `w` on a pad takes a sticker off it: inside it, past its edge. */
export const offPad = (ed: Editor, it: Item, w: Point): boolean => {
  const m = EDGE / ed.cam.z;
  return !!it.pad && w.x > it.x + m && w.x < it.x + it.w - m && w.y > it.y + m && w.y < it.y + it.h - m;
};

/** A sticker off the pad, `d` from where it lies: its colour, size and type, no text; put on the board. */
export function tearOff(ed: Editor, pad: Item, d: Point): Item {
  const look: Partial<Item> = {};
  for (const k of ['color', 'fo', 'fs', 'ff', 'fw', 'fi', 'tc', 'ta', 'va', 'ly'] as const) if (pad[k] !== undefined) (look as Record<string, unknown>)[k] = pad[k];
  const it = ed.newItem('sticky', Math.round(pad.x + d.x), Math.round(pad.y + d.y), { ...look, w: pad.w, h: pad.h, text: '' });
  ed.addItem(it);
  return it;
}

/** The stickers under a pad's top one: two, a little lower and further right each, a shade darker. */
export function drawPadUnder(ctx: CanvasRenderingContext2D, it: Item, fill: string, radius: number): void {
  ctx.save();
  for (const [k, a] of [[2, 0.55], [1, 0.8]] as const) {
    const o = k * 4;
    ctx.fillStyle = fill;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.roundRect(it.x + o, it.y + o, it.w, it.h, radius);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.globalAlpha = 0.06 * k;
    ctx.fill();
  }
  ctx.restore();
}
