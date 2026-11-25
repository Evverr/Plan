import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';

type Rect = { x: number; y: number; width: number; height: number };
type Gesture = {
  pointer: number; x: number; y: number; clientX: number; clientY: number; active: boolean;
  before: Set<string>; base: Set<string>; items: { key: string; rect: Rect }[];
};
const empty = new Set<string>();

/** Shelf marquee: only real cards are hit, with scroll coordinates and cancellation like the canvas. */
export function useShelfSelection(enabled: boolean, scope: string) {
  const root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Set<string>>(empty);
  const selectedNow = useRef(selected);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef(0);
  const ignoreClickUntil = useRef(0);
  const choose = (next: Set<string>) => { selectedNow.current = next; setSelected(next); };
  const finish = (cancel = false) => {
    const g = gesture.current;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    if (g) {
      if (cancel) choose(g.before);
      if (g.active) ignoreClickUntil.current = performance.now() + 200;
      if (root.current?.hasPointerCapture(g.pointer)) root.current.releasePointerCapture(g.pointer);
    }
    setMarquee(null);
  };

  useEffect(() => {
    finish(); choose(new Set());
  }, [scope, enabled]); // A different folder, search, or page starts with no selection.
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (gesture.current) finish(true); else choose(new Set());
    };
    const blur = () => { if (gesture.current) finish(true); };
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', blur);
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const update = () => {
    const el = root.current, g = gesture.current;
    if (!el || !g) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(el.clientWidth, g.clientX - r.left + el.scrollLeft));
    const y = Math.max(0, Math.min(el.scrollHeight - 1, g.clientY - r.top + el.scrollTop));
    if (!g.active && Math.hypot(x - g.x, y - g.y) < 4) return;
    g.active = true;
    const rect = { x: Math.min(x, g.x), y: Math.min(y, g.y), width: Math.abs(x - g.x), height: Math.abs(y - g.y) };
    const next = new Set(g.base);
    for (const item of g.items) {
      const b = item.rect;
      if (b.x < rect.x + rect.width && b.x + b.width > rect.x && b.y < rect.y + rect.height && b.y + b.height > rect.y) next.add(item.key);
    }
    setMarquee(rect);
    if (next.size !== selectedNow.current.size || [...next].some((key) => !selectedNow.current.has(key))) choose(next);
  };
  const scroll = () => {
    const el = root.current, g = gesture.current;
    if (!el || !g) return;
    if (g.active) {
      const r = el.getBoundingClientRect();
      const top = r.top + 74; // The fixed header is not part of the selectable shelf.
      const dy = g.clientY < top + 30 ? -Math.min(18, (top + 30 - g.clientY) / 3)
        : g.clientY > r.bottom - 30 ? Math.min(18, (g.clientY - r.bottom + 30) / 3) : 0;
      if (dy) {
        const before = el.scrollTop;
        el.scrollTop += dy;
        if (el.scrollTop !== before) update();
      }
    }
    frame.current = requestAnimationFrame(scroll);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!enabled || e.button !== 0 || !e.isPrimary || e.pointerType === 'touch' || gesture.current) return;
    const target = e.target as Element;
    if (target.closest('a, button, input, textarea, select, [role="menu"], .shelf-head, .shelf-backdrop, .page-view')) return;
    const el = e.currentTarget, r = el.getBoundingClientRect();
    if (e.clientX >= r.left + el.clientWidth) return; // Leave the scrollbar alone.
    const items = [...el.querySelectorAll<HTMLElement>('[data-shelf-item]')].map((item) => {
      const box = item.getBoundingClientRect();
      return { key: item.dataset.shelfItem!, rect: { x: box.left - r.left + el.scrollLeft, y: box.top - r.top + el.scrollTop, width: box.width, height: box.height } };
    });
    const before = new Set(selectedNow.current), base = e.shiftKey ? new Set(before) : new Set<string>();
    gesture.current = { pointer: e.pointerId, x: e.clientX - r.left + el.scrollLeft, y: e.clientY - r.top + el.scrollTop,
      clientX: e.clientX, clientY: e.clientY, active: false, before, base, items };
    choose(base);
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    frame.current = requestAnimationFrame(scroll);
  };
  const itemClick = (key: string, e: MouseEvent) => {
    if (!enabled || e.metaKey || e.ctrlKey) return false;
    if (performance.now() < ignoreClickUntil.current) { e.preventDefault(); return true; }
    if (e.shiftKey) {
      e.preventDefault();
      const next = new Set(selectedNow.current);
      if (next.has(key)) next.delete(key); else next.add(key);
      choose(next);
      return true;
    }
    if (e.detail > 0 && selectedNow.current.has(key)) { e.preventDefault(); return true; }
    return false;
  };
  const take = (key: string) => {
    if (!enabled) return [key];
    if (!selectedNow.current.has(key)) choose(new Set([key]));
    return [...selectedNow.current];
  };
  return {
    root, selected: enabled ? selected : empty, marquee: enabled ? marquee : null, itemClick, take,
    clear: () => { finish(); choose(new Set()); },
    afterDrag: () => { ignoreClickUntil.current = performance.now() + 200; },
    handlers: {
      onPointerDown,
      onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
        const g = gesture.current;
        if (g?.pointer !== e.pointerId) return;
        g.clientX = e.clientX; g.clientY = e.clientY; update();
      },
      onPointerUp: (e: PointerEvent<HTMLDivElement>) => { if (gesture.current?.pointer === e.pointerId) finish(); },
      onPointerCancel: () => finish(true),
      onLostPointerCapture: () => { if (gesture.current) finish(true); },
    },
  };
}
