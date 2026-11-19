import type { Item } from '../model/types';
import type { Board } from '../model/board';
import { paraAt, setPara, type TextLink, type TextRun } from '../model/textLinks';
import { colsOf, rowsOf } from '../model/table';
import { DOC_LINE, docLines, docObject, OBJ_GAP, PAGE_TEXT, pageShown, showPage, textArea } from './docPage';
import { drawScene, readTheme } from '../canvas/renderer';

/**
 * «Таблица в документе» (src/labs): one of our tables put in a document's text. In its place there a
 * paragraph of its own, empty, holds its id (`o`, see setPara in model/textLinks.ts); the sheet leaves
 * room as tall as the table there (docLines), the text after it going down, on to the next page as it
 * must. The table itself stays a table on the board (`inDoc` the document's id), put where its room is
 * whenever anything changes (tidyDocObjects), seen only with its page; picked on its own (its cells
 * typed in as ever), moved, copied and deleted with the document (withTies in header.ts). Dragged onto a
 * sheet, it goes in its text where it's let go; dragged off it, out of it.
 */

/** Where a table put in a document stands on the board, and on which of its pages (null: not in its text). */
export function slotOf(doc: Item, id: string): { x: number; y: number; page: number } | null {
  const l = docLines(doc).find((d) => d.o === id);
  const a = textArea(doc);
  return l ? { x: doc.x + a.x, y: doc.y + a.y + l.y + OBJ_GAP, page: l.page } : null;
}

/** Whether a table put in a document is out of sight there: on a page it doesn't show. */
export function offPage(it: Item, get: (id: string) => Item | undefined): boolean {
  const doc = it.inDoc ? get(it.inDoc) : undefined;
  if (!doc) return false;
  const s = slotOf(doc, it.id);
  return !!s && s.page !== pageShown(doc);
}

/** Each table put in a document: on which page it was last, at what size (see tidyDocObjects). */
const lastSeen = new Map<string, { page: number; w: number; h: number }>();

/** Each table put in a document where its room there is (for good: undone, it's put back again). One
 *  whose document's gone, its own again. */
export function tidyDocObjects(board: Board): void {
  const moves = new Map<string, Partial<Item>>();
  for (const it of board.list()) {
    if (!it.inDoc) continue;
    const doc = board.get(it.inDoc);
    if (!doc) { moves.set(it.id, { inDoc: undefined }); continue; }
    const s = slotOf(doc, it.id), p: Partial<Item> = {}, was = lastSeen.get(it.id);
    // Its size changed and it gone on to another page for that: that page shown here, it in sight.
    if (s && was && (was.w !== it.w || was.h !== it.h) && was.page !== s.page && pageShown(doc) === was.page) showPage(doc.id, s.page);
    if (s) lastSeen.set(it.id, { page: s.page, w: it.w, h: it.h });
    if (s && (Math.abs(s.x - it.x) > 0.01 || Math.abs(s.y - it.y) > 0.01)) Object.assign(p, { x: s.x, y: s.y });
    // (Grown past its text or a page some way not held back as it was done: back within them.)
    const lim = inDocLimit(it, {}, false);
    if (lim?.cols || lim?.rows) Object.assign(p, lim);
    if (Object.keys(p).length) moves.set(it.id, p);
  }
  // A place in a document's text for a table that's out of it now (on the board on its own, or in another):
  // taken out, no room left for it there.
  for (const doc of board.list()) {
    if (doc.type !== 'page' || !doc.rs?.some((r) => r.o)) continue;
    const stale = [...new Set(objectsIn(doc))].filter((o) => { const t = board.get(o); return !!t && t.inDoc !== doc.id; });
    if (!stale.length) continue;
    const t = stale.reduce((t, o) => withoutObject(t, o), { text: doc.text ?? '', rs: doc.rs as TextRun[] | undefined, links: doc.links });
    moves.set(doc.id, { text: t.text, rs: t.rs, links: t.links });
  }
  if (moves.size) board.forGood(() => moves.forEach((p, id) => board.updateForGood(id, p)));
}

/** Runs and links (by character) with `n` characters put in at `at` (those from there on moved past them). */
const shifted = <T extends { s: number; e: number }>(list: T[] | undefined, at: number, n: number): T[] | undefined =>
  list?.map((r) => ({ ...r, s: r.s >= at ? r.s + n : r.s, e: r.e > at || (r.e === at && r.s >= at) ? r.e + n : r.e }));
/** Runs and links with the character at `at` taken out (those on it alone gone). */
const cut = <T extends { s: number; e: number }>(list: T[] | undefined, at: number): T[] | undefined => {
  const out = list?.map((r) => ({ ...r, s: r.s > at ? r.s - 1 : r.s, e: r.e > at ? r.e - 1 : r.e })).filter((r) => r.e > r.s);
  return out?.length ? out : undefined;
};

type Text = { text: string; rs: TextRun[] | undefined; links: TextLink[] | undefined };

/** Its text with a paragraph for a table (`id`) after paragraph number `after` (−1: before the first). */
export function withObject(t: Text, id: string, after: number): Text {
  const paras = t.text.split('\n');
  if (after >= paras.length - 1) {
    // (After the last: its end a line break now, the new paragraph's place past it.)
    const text = `${t.text}\n`, rs = setPara(text, t.rs, text.length, text.length, 'o', id);
    return { text, rs, links: t.links };
  }
  // (Before what follows: a line break put in where that starts, the new paragraph's place.)
  const at = after < 0 ? 0 : paras.slice(0, after + 1).reduce((n, p) => n + p.length + 1, 0);
  const text = `${t.text.slice(0, at)}\n${t.text.slice(at)}`;
  return { text, rs: setPara(text, shifted(t.rs, at, 1), at, at, 'o', id), links: shifted(t.links, at, 1) };
}

/** Its text with the paragraph a table (`id`) was put in taken out. */
export function withoutObject(t: Text, id: string): Text {
  const a = t.rs?.find((r) => r.o === id);
  if (!a) return t;
  // (Each place it has: any copied by a slip, one left over after the first taken out would keep its room.)
  const t2 = withoutPlace(t, a.s);
  return (t2.rs?.filter((r) => r.o === id).length ?? 0) < (t.rs?.filter((r) => r.o === id).length ?? 0) ? withoutObject(t2, id) : t2;
}
function withoutPlace(t: Text, at: number): Text {
  const rs = setPara(t.text, t.rs, at, at, 'o', undefined);
  // (Its paragraph's empty: its line break goes, or, the last, the one before it, that paragraph's keys
  // kept on its end.)
  if (at < t.text.length) return { text: t.text.slice(0, at) + t.text.slice(at + 1), rs: cut(rs, at), links: cut(t.links, at) };
  if (at === 0) return { text: '', rs: undefined, links: t.links };
  return { text: t.text.slice(0, at - 1), rs: rs?.filter((r) => r.s < at), links: t.links };
}

/** The ids of the tables put in a document's text. */
export const objectsIn = (doc: Item): string[] => ((doc.rs ?? []) as TextRun[]).filter((r) => r.o).map((r) => r.o!);

/** The paragraph a point on a sheet's page shown is over or under the middle of (−1: over the first): the
 *  one a table let go there goes after. */
function paragraphAt(doc: Item, y: number, skip?: string): number {
  const text = doc.text ?? '', n = pageShown(doc), lines = docLines(doc).filter((l) => l.page === n && l.o !== skip);
  let after = -1;
  for (const l of lines) {
    const mid = doc.y + textArea(doc).y + l.y + (l.tall ?? l.size * DOC_LINE) / 2;
    if (y < mid) break;
    after = text.slice(0, l.s).split('\n').length - 1;
  }
  // (Over all of this page: after what's on the pages before it.)
  if (after < 0 && n > 0 && lines.length) after = text.slice(0, lines[0].s).split('\n').length - 2;
  return after;
}

/** A table fitted to a sheet: as wide as its text at most, as tall as a page (see inDocLimit). */
const fitted = (it: Item, doc: string): Partial<Item> => inDocLimit({ ...it, inDoc: doc }, {}) ?? {};

/** How big a table put in a document may be: as wide as its text, as tall as a page of it (ГОСТ's margins;
 *  a sheet's own, objMax). */
export const DOC_OBJ_MAX = { w: PAGE_TEXT.w, h: PAGE_TEXT.h - OBJ_GAP * 2 };
export const objMax = (doc: Item | undefined): { w: number; h: number } => {
  if (!doc) return DOC_OBJ_MAX;
  const a = textArea(doc);
  return { w: a.w, h: a.h - OBJ_GAP * 2 };
};

/** The room a table put in a document has where it is: as wide as the text; as tall as what's left of its
 *  page under where it stands (a page, at a page's top), so it's never made to go past the sheet's bottom. */
export function roomFor(it: Item): { w: number; h: number } {
  const doc = it.inDoc ? docObject(it.inDoc) : undefined, l = doc && docLines(doc).find((d) => d.o === it.id), max = objMax(doc);
  return { w: max.w, h: l ? max.h - l.y : max.h };
}

/** A change to a table's size, as one put in a document may have it (any other's as it is): no wider than
 *  its text (its columns narrowed alike to fit), no taller than its room (`here`, see roomFor; or a page:
 *  rows that would make it so not added, null; taller rows, made shorter alike to fit). */
export function inDocLimit(it: Item, patch: Partial<Item>, here = true): Partial<Item> | null {
  if (!it.inDoc || it.type !== 'table') return patch;
  const room = here ? roomFor(it) : objMax(it.inDoc ? docObject(it.inDoc) : undefined);
  const out = { ...patch }, cols = out.cols ?? colsOf(it), rows = out.rows ?? rowsOf(it), w = cols.reduce((a, b) => a + b, 0), h = rows.reduce((a, b) => a + b, 0);
  if (w > room.w + 0.5) {
    const k = room.w / w;
    out.cols = cols.map((v) => Math.floor(v * k * 10) / 10);
    out.w = out.cols.reduce((a, b) => a + b, 0);
  }
  if (h > room.h + 0.5 && h > it.h) {
    if (rows.length > rowsOf(it).length) return null;
    const k = Math.max(room.h, it.h) / h;
    out.rows = rows.map((v) => Math.floor(v * k * 10) / 10);
    out.h = out.rows.reduce((a, b) => a + b, 0);
  }
  return out;
}

/** Tables let go after being dragged: onto a sheet (its middle on one), into its text there (out of the
 *  one they were in, if another); off one they were in, out of its text, tables of their own again. */
export function dropTables(board: Board, ids: Iterable<string>): void {
  const sheets = board.list().filter((i) => i.type === 'page');
  for (const id of ids) {
    const it = board.get(id);
    if (it?.type !== 'table' || it.host) continue;
    const cx = it.x + Math.min(it.w, PAGE_TEXT.w) / 2, cy = it.y + 10;
    const doc = [...sheets].reverse().find((d) => cx >= d.x && cx <= d.x + d.w && cy >= d.y && cy <= d.y + d.h);
    const was = it.inDoc ? board.get(it.inDoc) : undefined;
    if (!doc && !was) continue;
    board.transact(() => {
      if (was) {
        const t = withoutObject({ text: was.text ?? '', rs: was.rs as TextRun[] | undefined, links: was.links }, id);
        board.update(was.id, { text: t.text, rs: t.rs, links: t.links });
      }
      if (doc) {
        const now = board.get(doc.id)!, after = paragraphAt(now, cy, id);
        const t = withObject({ text: now.text ?? '', rs: now.rs as TextRun[] | undefined, links: now.links }, id, after);
        board.update(doc.id, { text: t.text, rs: t.rs, links: t.links });
        board.update(id, { inDoc: doc.id, ...fitted(it, doc.id), ...(it.z <= now.z && { z: board.maxZ() + 1 }) });
      } else board.update(id, { inDoc: undefined });
    });
  }
}

/** A table as a picture (its data URL), for the field a document's typed in (which covers the sheet and
 *  what's on it): drawn as the board draws it, at twice the size, kept while it's the same. */
const pictures = new Map<string, { key: string; url: string }>();
export function objectPicture(it: Item): string {
  const key = JSON.stringify(it), was = pictures.get(it.id);
  if (was?.key === key) return was.url;
  const scale = 2, canvas = document.createElement('canvas');
  canvas.width = Math.ceil(it.w * scale) + 2;
  canvas.height = Math.ceil(it.h * scale) + 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const one = { ...it, x: 0, y: 0, inDoc: undefined };
  drawScene(ctx, {
    items: [one], links: [], get: (id) => (id === it.id ? one : undefined), cam: { x: 0, y: 0, z: scale }, theme: readTheme(),
    width: canvas.width, height: canvas.height, dpr: 1, noBackground: true, selection: new Set(), editingId: null, marquee: null, linkPreview: null,
    peers: [], showHandle: false, byFinger: false, hotDot: null, hotPlus: null, plusFade: 0, mindMove: null, tableLines: [], editingCell: null,
    guides: [], pickedCells: null, stroke: null,
  });
  const url = canvas.toDataURL('image/png');
  pictures.set(it.id, { key, url });
  return url;
}

/** Whether the paragraph a character's in holds a table. */
export const objectAt = (text: string, rs: TextRun[] | undefined, at: number): string | undefined => paraAt(text, rs, at, 'o');
