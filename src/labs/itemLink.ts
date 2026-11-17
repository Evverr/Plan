import type { Editor } from '../editor/editor';
import { cameraFor, flyTo } from '../editor/camera';
import { linkBox } from '../canvas/geometry';
import { labOn } from './labs';

/**
 * «Ссылка на объект»: an item's menu copies a link to it (this board's, `item=` its id), «Ссылка скопирована»
 * said at the top a moment. Put in a text (a sticker's, say) and clicked, or opened: the board flies to it
 * (60% of the screen, at 100% at most), picked. A link to another board opens that board there, in this tab.
 */

/** The link to item `id` on this board. */
export function itemUrl(id: string): string {
  const board = new URLSearchParams(location.search).get('board') ?? '';
  return `${location.origin}${location.pathname}?board=${encodeURIComponent(board)}&item=${encodeURIComponent(id)}`;
}

/** Copies the link to item `id`, saying so at the top (see App, "planx:say"). */
export async function copyItemLink(id: string): Promise<void> {
  const url = itemUrl(id);
  let said = 'Ссылка скопирована';
  try { await navigator.clipboard.writeText(url); } catch { said = url; }
  window.dispatchEvent(new CustomEvent('planx:say', { detail: { text: said } }));
}

/** The board flies to item `id`, and it's picked; whether it's there. */
export function goToItem(ed: Editor, id: string): boolean {
  const it = ed.board.get(id);
  if (!it) return false;
  flyTo(ed, cameraFor(ed, linkBox(it), 0.6, 1));
  ed.setSelection([id]);
  return true;
}

/** A link in a text opened: to an item of this board, the board goes to it; to another board of PlanX,
 *  that board in this tab; anything else, a new tab. */
export function openUrl(ed: Editor, url: string): void {
  if (labOn('itemLinks')) {
    try {
      const u = new URL(url, location.href), here = new URLSearchParams(location.search).get('board');
      if (u.origin === location.origin && u.pathname === location.pathname && u.searchParams.get('board')) {
        const id = u.searchParams.get('item');
        if (u.searchParams.get('board') === here && id) { if (!goToItem(ed, id)) window.dispatchEvent(new CustomEvent('planx:say', { detail: { text: 'Этого объекта на доске уже нет' } })); return; }
        location.href = u.href;
        return;
      }
    } catch { /* not an address: as any */ }
  }
  window.open(url, '_blank', 'noopener');
}
