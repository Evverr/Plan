import type { Board } from '../model/board';
import type { Item } from '../model/types';
import { dayKey, dayOf, tlStart, TL_PAD } from '../canvas/timeline';

/** How far clear of a copy its timeline's edge then stands; how far under its top what's on it starts. */
const PAD = 24, TOP = 44;

/**
 * «Таймлайн растёт» (src/labs): a copy of what's on a timeline (made by its half circle, Alt and an arrow,
 * «Дублировать») that comes out past its edge stays on it, the timeline grown to take it in with a little
 * room round it (as a kanban grows): wider by whole days (to the left, starting earlier), taller.
 * `src`: what was copied, `map` its copies' ids.
 */
export function growTimelines(board: Board, src: Item[], map: Map<string, string>): void {
  for (const o of src) {
    const t = board.list().find((f) => f.tl && f.members?.includes(o.id)), c = board.get(map.get(o.id) ?? '');
    if (!t || !c) continue;
    const day = dayOf(t);
    let { x, y, w, h } = t, tl = t.tl;
    if (c.x + c.w + PAD > x + w) w = TL_PAD * 2 + Math.ceil((c.x + c.w + PAD - x - TL_PAD * 2) / day) * day;
    if (c.x - PAD < x) { const n = Math.ceil((x - c.x + PAD) / day); x -= n * day; w += n * day; tl = dayKey(tlStart(t), -n); }
    if (c.y + c.h + PAD > y + h) h = c.y + c.h + PAD - y;
    if (c.y - TOP < y) { const d = y - c.y + TOP; y -= d; h += d; }
    if (x !== t.x || y !== t.y || w !== t.w || h !== t.h) board.update(t.id, { x, y, w: Math.round(w), h: Math.round(h), tl });
  }
}
