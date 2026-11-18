import { useLayoutEffect, useRef } from 'react';
import type { Editor } from '../editor/editor';
import { PAGE, type Item } from '../model/types';
import { fontOf, FONTS } from '../canvas/text';
import { remapLinks, setRun, type TextRun } from '../model/textLinks';
import { DOC_LINE, docLines, LIST_DEPTH, LIST_IN, PAGE_TEXT, pagesOf, pageShown } from './docPage';
import { objectsIn } from './docObjects';
import { newTable, tableLook } from '../model/table';
import { cleanPaste, cssColor, fromDom, headingStyle, toHtml } from './richDoc';
import { labOn } from './labs';

/**
 * «Документ» typed in as it looks: a field the browser edits laid over the sheet's text (scaled with the
 * board), its words bold, italic… and its headings as the page draws them, all of it at once (no pages:
 * it scrolls). Kept as text and styles (richDoc.ts) once it's done with, as a sticker's text is. The text
 * panel's buttons work on what's picked in it (richStyle, richHeading), Cmd+B, Cmd+I, Cmd+U too.
 */

/** The field being typed in, and what was last picked in it (a press on the panel keeps it). */
let active: { el: HTMLDivElement; fs: number; range: Range | null; ed: Editor; id: string } | null = null;
export const richActive = (): boolean => !!active;

/** What's picked in it, back as it was (the field focused again). */
function restore(): boolean {
  if (!active) return false;
  active.el.focus({ preventScroll: true });
  const sel = getSelection();
  if (active.range && sel) { sel.removeAllRanges(); sel.addRange(active.range); }
  return true;
}

/** Bold, italic, underlined or struck through on what's picked (off again if it's so already), or its
 *  colour (none: the text's own). */
export function richStyle(key: 'b' | 'i' | 'u' | 'x' | 'c', value?: string): boolean {
  if (!restore()) return false;
  document.execCommand('styleWithCSS', false, 'true');
  if (key === 'c') document.execCommand('foreColor', false, value ? cssColor(value) : getComputedStyle(active!.el).color);
  else document.execCommand({ b: 'bold', i: 'italic', u: 'underline', x: 'strikeThrough' }[key]);
  return true;
}

/** Where character `i` of its text is in the field: its paragraphs one each, a line break between them. */
function domAt(root: HTMLElement, i: number, forward = false): [Node, number] | null {
  // (Where two pieces meet: the end of the first, or with `forward` the start of the next, as what's
  // picked from there starts in it.)
  let left = i;
  for (const para of root.children) {
    const len = (para.textContent ?? '').length;
    if (left <= len) {
      const w = document.createTreeWalker(para, NodeFilter.SHOW_TEXT);
      let seen = 0;
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        const n = (t.textContent ?? '').length;
        if (left < n || (left === n && !(forward && seen + n < len))) return [t, left];
        left -= n;
        seen += n;
      }
      return [para, 0];
    }
    left -= len + 1;
  }
  return null;
}

/** The paragraph the caret's in (the field itself pointed at, its child there). */
function paragraphAt(root: HTMLElement): HTMLElement | null {
  const sel = getSelection();
  let n: Node | null = sel?.anchorNode ?? null;
  if (n === root) return (root.childNodes[Math.max(0, (sel?.anchorOffset ?? 1) - 1)] as HTMLElement) ?? null;
  while (n && n.parentNode !== root) n = n.parentNode;
  return n as HTMLElement | null;
}

/** The paragraphs what's picked is in (the caret's). */
function pickedParagraphs(): HTMLElement[] {
  const sel = getSelection(), root = active?.el;
  if (!root || !sel?.rangeCount) return [];
  // (A place in the field itself, between its paragraphs, as the caret put at its end is: the paragraph
  // before it, or the first.)
  const r = sel.getRangeAt(0), top = (n: Node | null, off: number) => {
    if (n === root) return (root.children[Math.max(0, Math.min(off, root.children.length) - 1)] as HTMLElement | undefined) ?? null;
    while (n && n.parentNode !== root) n = n.parentNode;
    return n as HTMLElement | null;
  };
  const a = top(r.startContainer, r.startOffset), b = top(r.endContainer, r.endOffset);
  if (!a) return root.firstElementChild ? [root.firstElementChild as HTMLElement] : [];
  const out: HTMLElement[] = [];
  for (let p: Element | null = a; p; p = p.nextElementSibling) { out.push(p as HTMLElement); if (p === b || !b) break; }
  return out;
}

/** The paragraphs what's picked is in made headings of `level` (0: plain text again). */
export function richHeading(level: number): boolean {
  if (!restore() || !active) return false;
  for (const p of pickedParagraphs()) {
    p.dataset.h = String(level);
    p.setAttribute('style', headingStyle(level, active.fs, p === active.el.firstElementChild, Number(p.dataset.z) || undefined, p.dataset.a));
  }
  return true;
}

/** The paragraphs what's picked is in given their own size of text (px), the rest as they are. */
export function richSize(size: number): boolean {
  if (!restore() || !active) return false;
  for (const p of pickedParagraphs()) {
    p.dataset.z = String(size);
    p.setAttribute('style', headingStyle(Number(p.dataset.h) || 0, active.fs, p === active.el.firstElementChild, size, p.dataset.a));
  }
  return true;
}

/** The paragraphs what's picked is in aligned on their own (left, centre or right). */
export function richAlign(a: string): boolean {
  if (!restore() || !active) return false;
  for (const p of pickedParagraphs()) {
    p.dataset.a = a;
    p.setAttribute('style', headingStyle(Number(p.dataset.h) || 0, active.fs, p === active.el.firstElementChild, Number(p.dataset.z) || undefined, a));
  }
  return true;
}

/** The paragraphs what's picked is in made a list (`kind` 'bullet', 'number' or a checklist's 'todo'),
 *  or not one any more (all of them that list already: a checklist's ticked or not). */
export function richList(kind: string): boolean {
  if (!restore() || !active) return false;
  const ps = pickedParagraphs(), has = (p: HTMLElement) => p.dataset.l === kind || (kind === 'todo' && p.dataset.l === 'done');
  const off = ps.length > 0 && ps.every(has);
  for (const p of ps) { if (off) { delete p.dataset.l; delete p.dataset.d; } else if (!has(p)) p.dataset.l = kind; }
  return true;
}

/** The paragraphs what's picked is in made a quote, or not one any more (all of them quotes already). */
export const richQuote = (): boolean => richKind('quote');
/** The paragraphs what's picked is in made a quote or a block of code (`kind`), or not any more (all of
 *  them that already). A line of code is just that: no heading, list or size of its own. */
export function richKind(kind: 'quote' | 'code'): boolean {
  if (!restore() || !active) return false;
  const ps = pickedParagraphs(), off = ps.length > 0 && ps.every((p) => p.dataset.k === kind);
  for (const p of ps) {
    if (off) { delete p.dataset.k; continue; }
    if (p.dataset.k === 'hr') continue;
    p.dataset.k = kind;
    if (kind === 'code') codeLine(p);
  }
  return true;
}
/** A paragraph made a line of code: no heading, list or size of its own. */
function codeLine(p: HTMLElement): void {
  p.dataset.h = '0';
  for (const k of ['z', 'l', 'd', 'a'] as const) delete p.dataset[k];
  p.removeAttribute('style');
}

/** The numbers of numbered lists, each at its depth, on their paragraphs (`data-m`, as their markers), as
 *  the page counts them (docLines). */
function numberLists(root: HTMLElement): void {
  let nums: number[] = [];
  for (const p of root.children as HTMLCollectionOf<HTMLElement>) {
    const l = p.dataset.k === 'code' || p.dataset.k === 'hr' ? undefined : p.dataset.l, d = Math.min(LIST_DEPTH, Number(p.dataset.d) || 0);
    if (l) { nums.length = d + 1; nums[d] = l === 'number' ? (nums[d] ?? 0) + 1 : 0; } else nums = [];
    const m = l === 'number' ? `${nums[d]}.` : undefined;
    if (m && p.dataset.m !== m) p.dataset.m = m;
    else if (!m && p.dataset.m) delete p.dataset.m;
  }
}

/** The list items what's picked is in one deeper (`by` 1) or one shallower (−1), as Tab and Shift+Tab. */
function deepen(ps: HTMLElement[], by: 1 | -1): void {
  for (const p of ps) {
    if (!p.dataset.l) continue;
    const d = Math.max(0, Math.min(LIST_DEPTH, (Number(p.dataset.d) || 0) + by));
    if (d) p.dataset.d = String(d); else delete p.dataset.d;
  }
}

/** A plain paragraph, empty. */
function emptyPara(): HTMLDivElement {
  const d = document.createElement('div');
  d.dataset.h = '0';
  d.appendChild(document.createElement('br'));
  return d;
}
/** The caret at the start of a paragraph. */
function caretTo(p: HTMLElement): void {
  const r = document.createRange();
  r.setStart(p, 0);
  r.collapse(true);
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(r);
}
/** A divider: `para` made one (empty), or one put after it; the caret in a paragraph after it. */
function divider(para: HTMLElement, replace: boolean): void {
  let hr: HTMLElement = para;
  if (replace) {
    para.innerHTML = '<br>';
    para.dataset.h = '0';
    para.removeAttribute('style');
    delete para.dataset.l;
  } else { hr = emptyPara(); para.after(hr); }
  hr.dataset.k = 'hr';
  const next = hr.nextElementSibling as HTMLElement | null;
  const to = next && !next.textContent && next.dataset.k !== 'hr' ? next : emptyPara();
  if (to !== next) hr.after(to);
  caretTo(to);
}

/** A divider where the caret is (its paragraph, if empty, made one). */
export function richDivider(): boolean {
  if (!restore() || !active) return false;
  const p = pickedParagraphs().pop();
  if (!p) return false;
  divider(p, !p.textContent);
  return true;
}

/** A new table put in its text after the caret's paragraph («Таблица в документе»): 3 by 3, as wide as
 *  the text, a paragraph after it to type on in; the text kept on the board as it is now, for the table
 *  to stand where its room is. */
export function richTable(): boolean {
  if (!restore() || !active) return false;
  const { ed, id, el } = active, doc = ed.board.get(id), p = pickedParagraphs().pop();
  if (!doc || !p) return false;
  const n = 3, cw = Math.floor((PAGE_TEXT.w / n) * 10) / 10, cols = Array<number>(n).fill(cw);
  const it = ed.newItem('table', doc.x + PAGE.LEFT, doc.y + PAGE.TOP, { ...newTable(n, 3), ...tableLook(n), cols, w: cw * n, inDoc: id });
  ed.addItem(it);
  const box = document.createElement('div');
  box.dataset.h = '0';
  box.dataset.o = it.id;
  p.after(box);
  // (Its look as the field has it, toHtml's: from the text with it.)
  const now = fromDom(el, getComputedStyle(el).color);
  const tpl = document.createElement('div');
  tpl.innerHTML = toHtml({ text: now.text, rs: now.rs, fs: active.fs } as Item);
  const made = [...tpl.children].find((c) => (c as HTMLElement).dataset.o === it.id);
  if (made) box.replaceWith(made);
  const placed = (made ?? box) as HTMLElement, next = placed.nextElementSibling as HTMLElement | null;
  const to = next && !next.textContent && !next.dataset.o && !next.dataset.k ? next : emptyPara();
  if (to !== next) placed.after(to);
  caretTo(to);
  const after = fromDom(el, getComputedStyle(el).color);
  ed.board.update(id, { text: after.text, rs: after.rs, links: remapLinks(doc.text ?? '', after.text, doc.links) });
  return true;
}

/** Where a place in the field is in its text (its paragraphs one each, a line break between: see fromDom). */
function indexAt(root: HTMLElement, node: Node, off: number): number {
  // (Not counting the gap put after code to type past it: see rewrite.)
  let base = 0;
  const paras = [...root.children], len = (s: string | null) => (s ?? '').replace(/\u200B/g, '').length;
  if (node === root) { for (const p of paras.slice(0, off)) base += len(p.textContent) + 1; return Math.max(0, base - (off >= paras.length ? 1 : 0)); }
  for (const para of paras) {
    if (para === node || para.contains(node)) {
      const r = document.createRange();
      r.setStart(para, 0);
      r.setEnd(node, off);
      return base + len(r.toString());
    }
    base += len(para.textContent) + 1;
  }
  return Math.max(0, base - 1);
}

/** The field remade from its text and styles changed by `fn` (on what's picked, s…e), what it gives back
 *  picked then. */
function rewrite(fn: (text: string, rs: TextRun[] | undefined, s: number, e: number) => { text: string; rs: TextRun[] | undefined; s: number; e: number } | null): boolean {
  if (!active) return false;
  const el = active.el, sel = getSelection();
  if (!sel?.rangeCount || !el.contains(sel.anchorNode)) return false;
  const r = sel.getRangeAt(0), s = indexAt(el, r.startContainer, r.startOffset), e = indexAt(el, r.endContainer, r.endOffset);
  const was = fromDom(el, getComputedStyle(el).color), out = fn(was.text, was.rs, s, e);
  if (!out) return false;
  el.innerHTML = toHtml({ text: out.text, rs: out.rs, fs: active.fs } as Item);
  const a = domAt(el, out.s, out.e > out.s), b = domAt(el, out.e);
  if (a && b) {
    const q = document.createRange();
    q.setStart(a[0], a[1]);
    q.setEnd(b[0], b[1]);
    // (The caret at the end of code: past it, what's typed next not code.)
    const code = out.s === out.e && a[0].nodeType === Node.TEXT_NODE && a[1] === (a[0].textContent ?? '').length ? (a[0].parentElement as HTMLElement | null) : null;
    if (code && code !== el && code.style.fontFamily.includes('JetBrains Mono')) {
      const gap = document.createTextNode('\u200B');
      code.after(gap);
      q.setStart(gap, 1);
      q.collapse(true);
    }
    sel.removeAllRanges();
    sel.addRange(q);
  }
  return true;
}

/** Code on what's picked (off again if it's code already). */
export function richCode(): boolean {
  if (!restore()) return false;
  // (Any of it code already: none of it code any more.)
  return rewrite((text, rs, s, e) => (e > s ? { text, rs: setRun(rs, s, e, 'm', !(rs ?? []).some((r) => r.m && r.s < e && r.e > s)), s, e } : null));
}

/** Whether the caret (or what's picked) is in code. */
function inCode(root: HTMLElement): boolean {
  const n = getSelection()?.anchorNode, el = n?.nodeType === Node.TEXT_NODE ? n.parentElement : (n as Element | null);
  return !!el && el !== root && root.contains(el) && !!el.closest('span')?.style.fontFamily.includes('JetBrains Mono');
}

/** What's on what's picked: bold, italic, underlined, struck through, code; the caret's paragraph's level,
 *  list, size, alignment and kind. */
export function richState(): { b: boolean; i: boolean; u: boolean; x: boolean; m: boolean; h: number; l: string | undefined; z: number | undefined; a: string | undefined; k: string | undefined; d: number } | null {
  if (!active) return null;
  const q = (c: string) => { try { return document.queryCommandState(c); } catch { return false; } };
  const p = pickedParagraphs()[0], h = Number(p?.dataset.h) || 0;
  return { b: h ? false : q('bold'), i: q('italic'), u: q('underline'), x: q('strikeThrough'), m: inCode(active.el), h, l: p?.dataset.l, z: Number(p?.dataset.z) || undefined, a: p?.dataset.a, k: p?.dataset.k, d: Number(p?.dataset.d) || 0 };
}

/** Markdown typed at a paragraph's start, before a space («Markdown в документе»): what it makes it. */
function markdownStart(before: string): { h?: number; l?: string; k?: string } | null {
  if (/^#{1,6}$/.test(before)) return { h: before.length };
  if (before === '>') return { k: 'quote' };
  if (/^[-*+–•]$/.test(before)) return { l: 'bullet' };
  if (/^\d+\.$/.test(before)) return { l: 'number' };
  // (As GitHub has it too, «- [ ] »; «[х]» typed in Russian.)
  if (/^([-*+–] ?)?\[ ?\]$/.test(before)) return { l: 'todo' };
  if (/^([-*+–] ?)?\[[xх]\]$/i.test(before)) return { l: 'done' };
  return null;
}

/** Typed in a paragraph alone, made so at once: «[]» a checklist's item, «---» a divider (dashes the Mac
 *  joins as they're typed, «–-», «—-», as well; one «—» alone a dash: a divider by Enter, see dashLine). */
function markdownWhole(t: string): { l?: string; hr?: boolean; code?: boolean } | null {
  if (t === '```') return { code: true };
  if (/^\[ ?\]$/.test(t)) return { l: 'todo' };
  if (/^\[[xх]\]$/i.test(t)) return { l: 'done' };
  if (t.length >= 2 && /^[-–—]+$/.test(t) && [...t].reduce((n, c) => n + (c === '—' ? 3 : c === '–' ? 2 : 1), 0) >= 3) return { hr: true };
  if (/^(\*{3,}|_{3,})$/.test(t)) return { hr: true };
  return null;
}
/** A paragraph that's a divider by Enter: dashes, stars or underscores, two or more (or one long dash). */
const dashLine = (t: string) => /^([-–—]{2,}|—|\*{3,}|_{3,})$/.test(t);

export function RichEditor({ editor, item }: { editor: Editor; item: Item }) {
  const ref = useRef<HTMLDivElement>(null), done = useRef(false), plain = useRef(false), id = item.id, fs = item.fs ?? 16;

  /** Done with it: its text and styles kept (as typed text is, see commitText). */
  const commit = () => {
    const el = ref.current;
    if (done.current || !el) return;
    done.current = true;
    const { text, rs } = fromDom(el, getComputedStyle(el).color);
    // (A table put in it whose place was taken out as it was typed in: gone with it, «Таблица в документе».)
    const was = editor.board.get(id), kept = new Set((rs ?? []).filter((r) => r.o).map((r) => r.o));
    const gone = was ? objectsIn(was).filter((o) => !kept.has(o)) : [];
    editor.board.update(id, { text, rs });
    if (gone.length) editor.board.remove(gone);
    editor.commitText(id, text);
  };

  useLayoutEffect(() => {
    const el = ref.current!;
    el.innerHTML = toHtml(item);
    active = { el, fs, range: null, ed: editor, id };
    document.execCommand('defaultParagraphSeparator', false, 'div');
    // (Not scrolled by the browser to what's picked: to where its page starts, see below.)
    el.focus({ preventScroll: true });
    // The caret at its end (or all of the page shown picked, as text opened for typing has all of it: of
    // several pages, that one's alone).
    const sel = getSelection(), r = document.createRange(), page = pageShown(item);
    r.selectNodeContents(el);
    if (editor.editCaret === 'end') r.collapse(false);
    else {
      const on = docLines(item).filter((l) => l.page === page), a = on.length ? domAt(el, on[0].s) : null, b = on.length ? domAt(el, on[on.length - 1].e) : null;
      if (a && b) { r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); }
    }
    sel?.removeAllRanges();
    sel?.addRange(r);
    // Opened on a page past the first (its pager turned): scrolled to where that page starts, not the top,
    // its first line at the top; again a frame on, past anything the browser did to show what's picked.
    const toPage = () => {
      const first = docLines(item).find((l) => l.page === page), at = first && domAt(el, first.s);
      if (!at) return;
      // (Its first letter's box: where a line wraps, the place before it is the end of the line above.)
      const q = document.createRange();
      q.setStart(at[0], at[1]);
      if (at[0].nodeType === Node.TEXT_NODE && at[1] < (at[0].textContent ?? '').length) q.setEnd(at[0], at[1] + 1);
      const top = (q.getClientRects()[0] ?? (at[0].nodeType === Node.TEXT_NODE ? at[0].parentElement : at[0] as Element)?.getBoundingClientRect())?.top;
      if (top !== undefined) el.scrollTop += (top - el.getBoundingClientRect().top) / editor.cam.z;
    };
    // Kept on its page while it's typed in: scrolled back there whatever scrolls it (the browser bringing
    // what's picked into sight, a selection dragged past its top or bottom, a wheel).
    // (Of several pages only: one alone scrolls on as it's typed past its end.)
    const paged = pagesOf(item).length > 1, last = page === pagesOf(item).length - 1;
    let target = 0;
    const settle = () => { if (paged && Math.abs(el.scrollTop - target) > 1) el.scrollTop = target; };
    if (page > 0) {
      toPage();
      target = el.scrollTop;
      requestAnimationFrame(() => { toPage(); target = el.scrollTop; });
    }
    el.addEventListener('scroll', settle);
    // Numbered lists counted at each depth as they're changed (numberLists).
    numberLists(el);
    const counted = new MutationObserver(() => numberLists(el));
    counted.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-l', 'data-d', 'data-k'] });
    // And a selection dragged with the mouse past its first or last line held there (`span` follows the text
    // as it's typed in, see Range; the last page's to the end of it all).
    const span = document.createRange(), on = docLines(item).filter((l) => l.page === page);
    const a0 = on.length ? domAt(el, on[0].s) : null, b0 = on.length ? domAt(el, on[on.length - 1].e) : null;
    if (a0 && b0) { span.setStart(a0[0], a0[1]); span.setEnd(b0[0], b0[1]); }
    let dragging = false;
    const down = () => { dragging = true; }, up = () => { dragging = false; };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    const clamp = () => {
      const s = getSelection();
      if (!paged || !dragging || !a0 || !b0 || !s?.rangeCount || !el.contains(s.anchorNode) || !s.focusNode) return;
      if (last) span.setEnd(el, el.childNodes.length);
      const fit = (n: Node, o: number): [Node, number] => { const c = span.comparePoint(n, o); return c < 0 ? [span.startContainer, span.startOffset] : c > 0 ? [span.endContainer, span.endOffset] : [n, o]; };
      const [an, ao] = fit(s.anchorNode!, s.anchorOffset), [fn, fo] = fit(s.focusNode, s.focusOffset);
      if (an !== s.anchorNode || ao !== s.anchorOffset || fn !== s.focusNode || fo !== s.focusOffset) s.setBaseAndExtent(an, ao, fn, fo);
    };
    document.addEventListener('selectionchange', clamp);
    // What's picked in it kept, for the panel's buttons to work on after a press there.
    const keep = () => { const s = getSelection(); if (active && s?.rangeCount && el.contains(s.anchorNode)) active.range = s.getRangeAt(0).cloneRange(); };
    document.addEventListener('selectionchange', keep);
    // Typed over what's picked with a table in it («Таблица в документе»): the text taken out and typed
    // in anew, the table kept (after what's typed). Taken out by Backspace or Delete, it goes as ever.
    const typedOver = (e: InputEvent) => {
      const s = getSelection();
      if ((e.inputType !== 'insertText' && e.inputType !== 'insertParagraph' && e.inputType !== 'insertLineBreak') || !s?.rangeCount || s.isCollapsed) return;
      const r = s.getRangeAt(0), objs = [...el.querySelectorAll<HTMLElement>('.rich-obj')].filter((o) => r.intersectsNode(o));
      if (!objs.length) return;
      e.preventDefault();
      const kept = objs.map((o) => o.cloneNode(true) as HTMLElement);
      document.execCommand('delete');
      if (e.inputType === 'insertText') document.execCommand('insertText', false, e.data ?? '');
      else document.execCommand('insertParagraph');
      const at = paragraphAt(el);
      if (at) at.after(...kept);
      else el.append(...kept);
    };
    el.addEventListener('beforeinput', typedOver);
    const onCommit = () => commit();
    window.addEventListener('planx:commit-edit', onCommit);
    return () => {
      el.removeEventListener('beforeinput', typedOver);
      el.removeEventListener('scroll', settle);
      counted.disconnect();
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      document.removeEventListener('selectionchange', clamp);
      document.removeEventListener('selectionchange', keep);
      window.removeEventListener('planx:commit-edit', onCommit);
      commit();
      if (active?.el === el) active = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const z = editor.cam.z, p = editor.toScreen({ x: item.x + PAGE.LEFT, y: item.y + PAGE.TOP }), st = fontOf(item);
  return (
    <div ref={ref} className="rich-edit" contentEditable suppressContentEditableWarning spellCheck={false} role="textbox" aria-multiline aria-label="Текст документа"
      style={{
        // (Room under its text a page tall: a last page half full scrolled to its first line at the top too.)
        left: p.x, top: p.y, width: PAGE_TEXT.w, height: PAGE_TEXT.h, paddingBottom: PAGE_TEXT.h, transform: `scale(${z})`,
        fontSize: fs, lineHeight: DOC_LINE, fontWeight: st.weight, fontStyle: st.italic ? 'italic' : undefined,
        fontFamily: FONTS[st.family ?? 'onest']?.css, color: item.tc ? cssColor(item.tc) : undefined, textAlign: item.ta ?? 'left',
      }}
      onBlur={commit}
      onPaste={(e) => {
        // Pasted with what a document has of its styling (cleanPaste); Cmd+Shift+V (or nothing but text
        // copied) as plain text.
        // (Taken here alone: not on to the board, which would paste it there too.)
        e.preventDefault();
        e.stopPropagation();
        const html = plain.current ? '' : e.clipboardData.getData('text/html');
        plain.current = false;
        const clean = html && cleanPaste(html, fs), tpl = document.createElement('div');
        tpl.innerHTML = clean || '';
        const blocks = [...tpl.children] as HTMLElement[];
        if (blocks.length === 1 && blocks[0].dataset.h === '0' && !blocks[0].dataset.l && !blocks[0].dataset.k) document.execCommand('insertHTML', false, blocks[0].innerHTML);
        else if (blocks.length && ref.current) {
          // Paragraphs, or a heading: put in as paragraphs of their own where the caret is (the paragraph
          // it's in split there), the caret after them.
          const root = ref.current;
          if (!getSelection()?.isCollapsed) document.execCommand('delete');
          document.execCommand('insertParagraph');
          const after = paragraphAt(root), before = after?.previousElementSibling;
          blocks.forEach((b) => root.insertBefore(b, after ?? null));
          if (before && !before.textContent) before.remove();
          if (after && !after.textContent) after.remove();
          const last = blocks[blocks.length - 1], r = document.createRange();
          r.selectNodeContents(last);
          r.collapse(false);
          getSelection()?.removeAllRanges();
          getSelection()?.addRange(r);
        }
        else document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }}
      onInput={() => {
        // A new paragraph after a heading (Enter at its end): plain text.
        const s = getSelection(), el = ref.current;
        let n: Node | null = s?.anchorNode ?? null;
        while (n && n.parentNode !== el) n = n.parentNode;
        const para = n as HTMLElement | null;
        if (!para?.dataset) return;
        const prev = para.previousElementSibling as HTMLElement | null;
        if (para.dataset.h !== '0' && !para.textContent && prev) { para.dataset.h = '0'; para.removeAttribute('style'); }
        // Typed in a divider: text again. A new paragraph after one (Enter on it): plain, and after a ticked
        // item of a checklist, one not ticked.
        if (para.dataset.k === 'hr' && (para.textContent || prev?.dataset.k === 'hr')) delete para.dataset.k;
        if (para.dataset.l === 'done' && !para.textContent && prev?.dataset.l) para.dataset.l = 'todo';
        // «[]» or «---» typed in a paragraph alone («Markdown в документе»): a checklist's item, a divider, at once.
        const md = labOn('docMd') && para.dataset.k !== 'hr' ? markdownWhole((para.textContent ?? '').replace(/\u200B/g, '')) : null;
        if (md?.hr) divider(para, true);
        else if (md?.l) { para.innerHTML = '<br>'; para.dataset.l = md.l; caretTo(para); }
        // («```»: a block of code started there.)
        else if (md?.code) { para.innerHTML = '<br>'; para.dataset.k = 'code'; codeLine(para); caretTo(para); }
      }}
      onPointerDown={(e) => {
        // A checklist's box clicked: ticked, or not any more (the caret where it was).
        const el = ref.current, t = e.target as HTMLElement;
        const para = el && t.parentElement === el ? t : null;
        if (!para || (para.dataset.l !== 'todo' && para.dataset.l !== 'done')) return;
        const box = parseFloat(getComputedStyle(para).paddingLeft) * editor.cam.z, x = e.clientX - para.getBoundingClientRect().left;
        if (x < box - 4 * editor.cam.z && x > box - LIST_IN * editor.cam.z) {
          e.preventDefault();
          para.dataset.l = para.dataset.l === 'done' ? 'todo' : 'done';
        }
      }}
      onKeyDown={(e) => {
        // In a list: Enter in an empty item ends the list there, Backspace at an item's start takes it out
        // of the list (as in Word). In a quote, the same: out of the quote.
        const para = ref.current && paragraphAt(ref.current), sel = getSelection();
        const atStart = !!para && !!sel?.isCollapsed && (() => { const r = document.createRange(); r.selectNodeContents(para); r.setEnd(sel.anchorNode!, sel.anchorOffset); return !r.toString(); })();
        const out = (e.key === 'Enter' && !e.shiftKey && !para?.textContent) || (e.key === 'Backspace' && atStart);
        if (para?.dataset.l && out) {
          e.preventDefault();
          // (An item of a list in a list: one shallower first.)
          if (e.key === 'Enter' && Number(para.dataset.d) > 0) { deepen([para], -1); return; }
          delete para.dataset.l;
          delete para.dataset.d;
          return;
        }
        if (para?.dataset.k === 'quote' && out) {
          e.preventDefault();
          delete para.dataset.k;
          return;
        }
        // A block of code: Enter in an empty line at its end, or Backspace at its first line's start, out of it.
        const next = para?.nextElementSibling as HTMLElement | null, before0 = para?.previousElementSibling as HTMLElement | null;
        if (para?.dataset.k === 'code' && ((e.key === 'Enter' && out && next?.dataset.k !== 'code') || (e.key === 'Backspace' && atStart && before0?.dataset.k !== 'code'))) {
          e.preventDefault();
          delete para.dataset.k;
          return;
        }
        // Tab in a block of code: two spaces; in a list, its items one deeper (Shift+Tab, one shallower).
        if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey && labOn('docMd') && para) {
          const ps = pickedParagraphs();
          if (para.dataset.k === 'code') { e.preventDefault(); if (!e.shiftKey) document.execCommand('insertText', false, '  '); return; }
          if (ps.some((p) => p.dataset.l)) { e.preventDefault(); deepen(ps, e.shiftKey ? -1 : 1); return; }
        }
        // Backspace just after a divider: the divider gone.
        const prev = para?.previousElementSibling as HTMLElement | null;
        if (e.key === 'Backspace' && atStart && prev?.dataset.k === 'hr') {
          e.preventDefault();
          prev.remove();
          return;
        }
        // Markdown as it's typed («Markdown в документе»): at a paragraph's start «# » a heading (to six
        // #s), «> » a quote, «- » a list, «1. » a numbered one, «[] » a checklist; «---» and Enter a
        // divider; `code` in a line.
        if (labOn('docMd') && para && sel?.isCollapsed && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const r = document.createRange();
          r.selectNodeContents(para);
          r.setEnd(sel.anchorNode!, sel.anchorOffset);
          const before = r.toString().replace(/\u200B/g, '');
          // (A space after «[]», which made it a checklist's item at once: nothing.)
          if (e.key === ' ' && para.dataset.l && !before) { e.preventDefault(); return; }
          const md = e.key === ' ' ? markdownStart(before) : null;
          if (md) {
            e.preventDefault();
            getSelection()?.removeAllRanges();
            getSelection()?.addRange(r);
            document.execCommand('delete');
            if (md.h) { para.dataset.h = String(md.h); para.setAttribute('style', headingStyle(md.h, fs, para === ref.current!.firstElementChild, Number(para.dataset.z) || undefined, para.dataset.a)); }
            if (md.l) para.dataset.l = md.l;
            if (md.k) para.dataset.k = md.k;
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey && dashLine((para.textContent ?? '').replace(/\u200B/g, '').trim())) {
            e.preventDefault();
            divider(para, true);
            return;
          }
          // (The closing `: what's between it and the one before it, code; the two of them gone.)
          const open = before.lastIndexOf('`');
          if (e.key === '`' && open >= 0 && open < before.length - 1) {
            e.preventDefault();
            rewrite((text, rs, s) => {
              const o = s - before.length + open;
              const t = text.slice(0, o) + text.slice(o + 1);
              return { text: t, rs: setRun(remapLinks(text, t, rs), o, s - 1, 'm', true), s: s - 1, e: s - 1 };
            });
            return;
          }
        }
        if (e.key === 'Escape') { e.preventDefault(); commit(); }
        else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); editor.setSelection([]); }
        else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyX') { e.preventDefault(); richStyle('x'); }
        // (Cmd+Shift+V: the paste that comes next as plain text.)
        else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyV') plain.current = true;
      }}
    />
  );
}
