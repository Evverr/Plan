import type { Item } from '../model/types';
import { boundsOf, type Point } from '../canvas/geometry';
import { kanbanOf } from '../model/types';
import { columnOf, columns, snaps } from './kanban';

/**
 * «Копия стрелками»: Alt and an arrow, a copy of what's picked that way, picked (so again, another past
 * it). Past it by its size and the gap Cmd+D leaves, and past whatever's there already. Cards of a
 * kanban: the copy in their column right under them (over them, up), the others moving down for it, or
 * in the next column that way; none past its first or last.
 */
const GAP = 24;

/** What's copied but not seen: what folded frames among it hold (their bar's all there is to them). */
export function foldedIn(copied: Item[]): Set<string> {
  const by = new Map(copied.map((i) => [i.id, i])), out = new Set<string>();
  const hide = (f: Item) => (f.members ?? []).forEach((m) => { const o = by.get(m); if (o && !out.has(m)) { out.add(m); hide(o); } });
  copied.filter((i) => i.type === 'frame' && i.fold).forEach(hide);
  return out;
}

/** Where the copy's middle goes (`copied`: what's picked, as copied, its bounds' middle), or none. */
export function arrowCopyAt(all: Item[], copied: Item[], picked: Item[], dx: number, dy: number): Point | null {
  const whole = boundsOf(copied);
  if (!whole || !picked.length) return null;
  // (Instances by what they show, not their frames, unseen and wider: the gap between what's seen.)
  // (Nor what a folded frame holds: by its bar.)
  const away = foldedIn(copied);
  const b = boundsOf(copied.filter((i) => !away.has(i.id) && !(i.inst && copied.some((c) => c.host === i.id)))) ?? whole;
  const at = (x: number, y: number): Point => ({ x: whole.x + whole.w / 2 + x - b.x, y: whole.y + whole.h / 2 + y - b.y });
  const k = picked.every(snaps) ? kanbanOf(all, picked[0].id) : undefined;
  if (k && picked.every((p) => kanbanOf(all, p.id)?.id === k.id)) {
    // (By their tops, a step off theirs: next to them as the kanban lays them out.)
    if (dy) return at(b.x, b.y + dy);
    const i = columnOf(k, b.x + b.w / 2) + dx, col = columns(k)[i];
    return col ? at(col.x, b.y) : null;
  }
  const ids = new Set(picked.map((p) => p.id));
  const others = all.filter((o) => !ids.has(o.id) && !o.host && o.type !== 'frame' && o.type !== 'ink');
  for (let n = 1; n < 100; n++) {
    const x = b.x + dx * n * (b.w + GAP), y = b.y + dy * n * (b.h + GAP);
    if (!others.some((o) => o.x < x + b.w && x < o.x + o.w && o.y < y + b.h && y < o.y + o.h)) return at(x, y);
  }
  return null;
}
