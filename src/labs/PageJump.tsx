import { useEffect, useReducer, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import { endJump, jumpingIn, pagerAtMid, pagesOf, pageShown, showPage, subscribeJump } from './docPage';

/**
 * «Документ»: the page to go to typed in where its pager's number is (clicked), as a frame's name is: a
 * small white field over the number, three digits wide, the page shown now grey in it, the caret blinking
 * for another. Enter, that page shown (within those it has; none typed, as it was); Escape, or a click
 * away, as it was.
 */
export function PageJump({ editor }: { editor: Editor }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeJump(redraw), []);
  const id = jumpingIn(), it = id ? editor.board.get(id) : undefined;
  if (!it || it.type !== 'page') return null;
  return <JumpField key={it.id} editor={editor} id={it.id} />;
}

function JumpField({ editor, id }: { editor: Editor; id: string }) {
  const it = editor.board.get(id)!, of = pagesOf(it).length;
  // (Empty, the page shown now grey in it as a hint, the caret blinking: what's typed the page to go to.)
  const now = pageShown(it, of) + 1, [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  // (Picked once the click that opened it is done with: the board takes the focus back as it ends.)
  // (A press anywhere else: as it was.)
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 0);
    const away = (e: PointerEvent) => { if (e.target !== ref.current) endJump(); };
    window.addEventListener('pointerdown', away, true);
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', away, true); };
  }, []);
  const go = () => {
    const n = value ? Math.round(Number(value)) : 0;
    if (n >= 1) showPage(id, Math.min(of, n) - 1);
    endJump();
    editor.requestRender();
  };
  const at = editor.toScreen(pagerAtMid(it));
  return (
    <input ref={ref} className="page-jump" inputMode="numeric" aria-label={`Перейти к странице (1–${of})`} value={value} placeholder={String(now)} maxLength={3}
      style={{ left: at.x, top: at.y }}
      onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') go(); else if (e.key === 'Escape') endJump(); }} />
  );
}
