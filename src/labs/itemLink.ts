import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
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

/** What an item is called after «Ссылка на» (in the accusative), with its name where it has one. */
const SHAPES: Record<string, string> = { triangle: 'треугольник', rhombus: 'ромб', star: 'звезду', pentagon: 'пятиугольник', hexagon: 'шестиугольник', parallelogram: 'параллелограмм', trapezoid: 'трапецию', arrow: 'стрелку', cross: 'крест' };
function whatItIs(it: Item, get: (id: string) => Item | undefined): string {
  const named = (what: string) => { const t = (it.text ?? '').trim().replace(/\s+/g, ' '); return t ? `${what} «${t.length > 30 ? `${t.slice(0, 30).trimEnd()}…` : t}»` : what; };
  if (it.host) { const inst = get(it.host); return inst ? `${whatItIs({ ...it, host: undefined }, get)} в экземпляре «${inst.text ?? ''}»` : 'часть экземпляра'; }
  if (it.type === 'frame') return it.tl ? named('таймлайн') : it.kb ? named('канбан') : it.comp ? named('компонент') : it.inst ? named('экземпляр компонента') : named('фрейм');
  if (it.type === 'mind') return it.parent ? named('ветку майнд-карты') : named('майнд-карту');
  if (it.type === 'task') return named('задачу');
  if (it.hd) return named('титул');
  if (it.code) return 'блок кода';
  if (it.poll) return 'голосование';
  if (it.form) return 'форму';
  if (it.type === 'polygon') return SHAPES[it.shape ?? 'triangle'] ?? 'фигуру';
  if (it.type === 'image') return it.doodle ? 'стикер-рисунок' : 'картинку';
  const plain: Record<string, string> = { sticky: 'стикер', rect: 'прямоугольник', ellipse: 'эллипс', text: 'текст', table: 'таблицу', icon: 'иконку', emoji: 'эмодзи', ink: 'рисунок', audio: 'аудиозапись', page: 'документ' };
  return plain[it.type] ?? 'объект';
}

/** The hint of a link in a text: what it leads to (something on this board, by what it is; another board;
 *  a site, by its address). */
export function linkTip(ed: Editor, url: string): string {
  try {
    const u = new URL(url, location.href), here = new URLSearchParams(location.search).get('board');
    if (labOn('itemLinks') && u.origin === location.origin && u.pathname === location.pathname && u.searchParams.get('board')) {
      if (u.searchParams.get('board') !== here) return 'Ссылка на другую доску';
      const id = u.searchParams.get('item'), it = id ? ed.board.get(id) : undefined;
      return !id ? 'Ссылка на эту доску' : it ? `Ссылка на ${whatItIs(it, (k) => ed.board.get(k))}` : 'Ссылка на удалённый объект';
    }
    return `Ссылка на ${u.host || url}`;
  } catch { return `Ссылка: ${url}`; }
}

/** The hint at the pointer over the board (`at`, on the screen), or none; shown as the panels' are (see
 *  ui/Tooltips.tsx, "planx:board-tip"). */
let tipNow: string | null = null;
export function boardTip(text: string | null, at: { x: number; y: number }): void {
  if (text === tipNow) return;
  tipNow = text;
  window.dispatchEvent(new CustomEvent('planx:board-tip', { detail: text ? { text, ...at } : null }));
}
