import { useSyncExternalStore } from 'react';
import type { Editor } from '../editor/editor';
import type { Item, Link } from '../model/types';

/**
 * "Связи инструментом": link dots don't come with what's picked; the «Связи» button on the zoom bar (in
 * place of the theme's, now in "Настройки") or C turns on a way to see links: the picked one's dots as
 * ever, and the pointer on a line, or on something with lines, lights them blue and what they join
 * framed, as picked (see relatedAt). Pressed again, it's off.
 */
let on = false;
const fns = new Set<() => void>();
export const subscribeDots = (fn: () => void) => { fns.add(fn); return () => { fns.delete(fn); }; };
export const dotsOn = () => on;
export const useDotsOn = () => useSyncExternalStore(subscribeDots, dotsOn);

/** Whether an item shows its dots with them out, the pointer anywhere: a mind map node only if it's a
 * central topic, not picked; an instance (by its contents, see linkBox), not what's in it. */
// (Never on a header tied to a kanban or timeline, src/labs/header.ts: it's theirs, nothing led to it.)
export const dotsAlways = (it: Item, picked: Set<string>) => (it.type === 'mind' ? !it.parent && !it.host && !picked.has(it.id) : !it.host && !it.tie);
/** And under the pointer: any mind map node too, unless it's picked. */
export const dotsUnder = (it: Item, picked: Set<string>) => dotsAlways(it, picked) || (it.type === 'mind' && !it.host && !picked.has(it.id));

/** With it on: the links the pointer's on (a line, or all of an item's), and what they join. */
export function relatedAt(links: Link[], it: Item | null, link: Link | null): { links: Set<string>; items: Set<string> } | null {
  const ls = link ? [link] : it ? links.filter((l) => l.from === it.id || l.to === it.id) : [];
  if (!ls.length) return null;
  return { links: new Set(ls.map((l) => l.id)), items: new Set(ls.flatMap((l) => [l.from, l.to])) };
}

export function toggleDots(ed: Editor): void {
  on = !on;
  ed.linkDots = null;
  ed.hotDot = null;
  fns.forEach((fn) => fn());
  ed.requestRender();
}
