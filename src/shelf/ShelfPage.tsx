import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ColorChoices } from '../ui/ColorChoices';
import { newBoardId } from '../collab/connection';
import { readText, writeText } from '../storage';
import { Folder, FolderPlaceholder, folderColor } from './Folder';
import { FolderShelf } from './FolderShelf';
import { PagePreview, PagePlaceholder, PAGE_COLORS, PAGE_COLOR_NAMES, pageColor } from './Page';
import { HomeHeader } from './HomeHeader';
import { HomePageView, PAGE_TITLES, type HomePage } from './Navigation';
import moreIcon from './assets/more.svg';
import arrowIcon from './assets/arrow-right.svg';
import {
  FOLDER_COLORS, SORTS, addFolder, arrange, boardUrl, boardsInside, folderUrl, nameOf, pathTo, placeOf, plural,
  randomColor, readFolders, readShelf, readThumb, removeEntry, removeFolder, updateEntry, updateFolder, withInside, writeFolders, writeShelf,
  type BoardEntry, type FolderEntry, type SortBy,
} from './boards';
import { loadShelf, refreshPreviews, renameBoard } from './docs';
import { openBoardFile } from '../collab/boardFile';
import { boardIdIn, bringsFiles } from '../labs/boardImport';
import { labOn, useLabs } from '../labs/labs';
import { useShelfSelection } from '../labs/useShelfSelection';
import { WishlistPage } from '../labs/WishlistPage';
import { navigate } from '../route';
import './shelf.css';

type Thing = { kind: 'board'; id: string } | { kind: 'folder'; id: string };

type Dialog =
  | { kind: 'new-board' }
  | { kind: 'folder'; folder?: FolderEntry }
  | { kind: 'rename'; board: BoardEntry }
  | { kind: 'color'; board: BoardEntry }
  | { kind: 'move'; what: Thing }
  | { kind: 'remove'; board: BoardEntry }
  | { kind: 'delete-folder'; folder: FolderEntry }
  | null;

interface Toast { text: string; undo?: () => void }

const SORT_KEY = 'planx-shelf-sort';
const MAX_FOLDERS = 5;
const UNTITLED_FOLDER = 'Без названия';
const cardDate = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' });

const folderFromUrl = () => new URLSearchParams(location.search).get('folder');
/** "Wishlist" (src/labs) is open: ?wishlist in the address. */
const wishFromUrl = () => labOn('wishlist') && new URLSearchParams(location.search).has('wishlist');

/**
 * The start page. Folders stand on shelves; inside a folder are its boards, as cards showing
 * everything on them, and the folders inside it. From here boards and folders are made, found, sorted,
 * renamed, moved (by the menu or by dragging onto a folder), starred and taken off the shelf.
 */
export function ShelfPage({ page }: { page: HomePage | null }) {
  const labs = useLabs();
  const [boards, setBoards] = useState<BoardEntry[] | null>(null);
  const [folders, setFolders] = useState<FolderEntry[]>(readFolders);
  const [here, setHere] = useState<string | null>(folderFromUrl);
  const [wish, setWish] = useState(wishFromUrl);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortBy>(() => (SORTS.some((s) => s.id === readText(SORT_KEY)) ? readText(SORT_KEY) as SortBy : 'opened'));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  // Bumped as the tiles' pictures are drawn afresh, to show them.
  const [, pictured] = useReducer((n: number) => n + 1, 0);
  const search = useRef<HTMLInputElement>(null);
  const selection = useShelfSelection(labs.shelfSelection && !page && !wish && !dialog, `${here ?? ''}|${query}|${sort}|${page ?? ''}|${wish}`);

  const reread = () => { setBoards(readShelf() ?? []); setFolders(readFolders()); };

  useEffect(() => {
    void loadShelf().then((list) => {
      setBoards(list);
      setFolders(readFolders());
      void refreshPreviews(list.filter((b) => b.items > 0).map((b) => b.id), pictured);
    });
    // Another tab (a board open next to this page) changes the shelf: show it here too.
    const storage = (e: StorageEvent) => { if (e.key === 'planx-boards' || e.key === 'planx-folders') reread(); };
    const back = () => {
      setHere(folderFromUrl()); setWish(wishFromUrl()); setMenu(null); setDialog(null);
      document.querySelector('.shelf-page')?.scrollTo(0, 0);
    };
    window.addEventListener('planx:shelf', reread);
    window.addEventListener('storage', storage);
    window.addEventListener('focus', reread);
    window.addEventListener('popstate', back);
    return () => {
      window.removeEventListener('planx:shelf', reread);
      window.removeEventListener('storage', storage);
      window.removeEventListener('focus', reread);
      window.removeEventListener('popstate', back);
    };
  }, []);

  useEffect(() => writeText(SORT_KEY, sort), [sort]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 2400);
    return () => clearTimeout(t);
  }, [toast]);

  // "/" goes to the search, Escape closes what's open.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as Element | null)?.closest?.('input, textarea');
      if (e.key === '/' && !typing && !dialog) { e.preventDefault(); search.current?.focus(); }
      if (e.key === 'Escape') { setMenu(null); setDialog(null); }
    };
    const away = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.('.tile-menu, .tile-more')) setMenu(null); };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', away, true);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', away, true); };
  }, [dialog]);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = readText('planx-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    writeText('planx-theme', next);
  };

  // A folder that's gone (deleted in another tab) leaves you at the top.
  const current = folders.find((f) => f.id === here) ?? null;
  const path = useMemo(() => pathTo(current?.id ?? null, folders), [current, folders]);
  useEffect(() => { document.title = page ? `${PAGE_TITLES[page]} · PlanX` : wish ? 'Фидбек · PlanX' : current ? `${nameOf(current, UNTITLED_FOLDER)} · PlanX` : 'Мои доски · PlanX'; }, [current, wish, page]);
  const go = (id: string | null) => {
    setMenu(null);
    setQuery('');
    if (id) updateFolder(id, { opened: Date.now() });
    navigate(folderUrl(id));
    document.querySelector('.shelf-page')?.scrollTo(0, 0);
  };

  const all = boards ?? [];
  const where = (b: BoardEntry) => placeOf(b.folder, folders);
  const parentOf = (f: FolderEntry) => placeOf(f.parent, folders);
  const inside = (f: FolderEntry) => ({ boards: boardsInside(f.id, all, folders), own: all.filter((b) => b.folder === f.id), folders: folders.filter((x) => x.parent === f.id) });
  const boardTime = (b: BoardEntry, by: Exclude<SortBy, 'title'>) => b[by];
  const folderTime = (f: FolderEntry, by: Exclude<SortBy, 'title'>) =>
    by === 'edited' ? Math.max(f.created, ...inside(f).boards.map((b) => b.edited)) : f[by];

  const searching = query.trim() !== '';
  const shownFolders = arrange(searching ? folders : folders.filter((f) => parentOf(f) === (current?.id ?? null)), query, sort, folderTime);
  const scopeBoards = current ? all.filter((b) => where(b) === current.id) : all;
  const shownBoards = arrange(searching ? all : scopeBoards, query, sort, boardTime);
  const recentBoards = arrange(scopeBoards, '', 'opened', boardTime).slice(0, 4);
  const folderLimit = () => setToast({ text: 'На одном уровне можно разместить не больше пяти папок' });

  const placeName = (id: string | null) => (id ? nameOf(folders.find((f) => f.id === id) ?? { title: '' }, UNTITLED_FOLDER) : 'Мои доски');
  const pathText = (id: string | null) => ['Мои доски', ...pathTo(id, folders).map((f) => nameOf(f, UNTITLED_FOLDER))].join(' › ');

  const changeBoard = (id: string, patch: Partial<BoardEntry>) => { updateEntry(id, patch); reread(); };

  // A .plnt file ("Доски извне", src/labs), picked or dropped from the Finder: opened as a new board.
  const [dropping, setDropping] = useState(false);
  const loadFile = async (f: File) => {
    setDialog(null);
    const why = await openBoardFile(f);
    if (why) setToast({ text: why });
  };
  const dropZone = labOn('boardImport') ? {
    onDragOver: (e: React.DragEvent) => { if (bringsFiles(e)) { e.preventDefault(); setDropping(true); } },
    onDragLeave: (e: React.DragEvent) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false); },
    onDrop: (e: React.DragEvent) => {
      if (!bringsFiles(e)) return;
      e.preventDefault();
      setDropping(false);
      const f = [...e.dataTransfer.files].find((x) => x.name.toLowerCase().endsWith('.plnt'));
      if (f) void loadFile(f); else setToast({ text: 'Это не файл доски PlanX (.plnt)' });
    },
  } : {};

  const createBoard = (title: string) => {
    const id = newBoardId();
    updateEntry(id, { title, folder: current?.id ?? null });
    navigate(`${boardUrl(id)}${title ? `&title=${encodeURIComponent(title)}` : ''}`);
  };

  /** Puts a board or folder into a folder (or at the top); a folder can't go into itself. */
  const move = (what: Thing, to: string | null) => {
    if (what.kind === 'folder') {
      if (to && withInside(what.id, folders).has(to)) return;
      const fs = readFolders();
      if (fs.some((f) => f.id === what.id && placeOf(f.parent, fs) !== to)
        && fs.filter((f) => placeOf(f.parent, fs) === to).length >= MAX_FOLDERS) { folderLimit(); return; }
      updateFolder(what.id, { parent: to });
    } else {
      updateEntry(what.id, { folder: to });
    }
    reread();
    setToast({ text: `Перемещено в «${placeName(to)}»` });
  };

  const copyLink = async (b: BoardEntry) => {
    const url = `${location.origin}${boardUrl(b.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast({ text: 'Ссылка на доску скопирована' });
    } catch {
      setToast({ text: url });
    }
  };

  const removeBoard = (b: BoardEntry) => {
    const before = readShelf() ?? [];
    removeEntry(b.id);
    reread();
    setToast({ text: `«${nameOf(b)}» убрана с полки`, undo: () => { writeShelf(before); reread(); setToast(null); } });
  };

  const deleteFolder = (f: FolderEntry) => {
    const beforeBoards = readShelf() ?? [], beforeFolders = readFolders();
    removeFolder(f.id);
    reread();
    setToast({ text: `Папка «${nameOf(f, UNTITLED_FOLDER)}» удалена`, undo: () => { writeShelf(beforeBoards); writeFolders(beforeFolders); reread(); setToast(null); } });
  };

  // Move the selected roots together; their descendants travel inside them, not beside them.
  const dragging = useRef<Thing[]>([]);
  const [dragKeys, setDragKeys] = useState<Set<string>>(new Set());
  const dragImage = useRef<HTMLElement | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  useEffect(() => () => dragImage.current?.remove(), []);
  const keyOf = (what: Thing) => `${what.kind}:${what.id}`;
  const canDrop = (to: string | null) => {
    const items = dragging.current;
    if (!items.length || (to && !folders.some((f) => f.id === to))) return false;
    if (items.some((d) => d.kind === 'folder' && to && withInside(d.id, folders).has(to))) return false;
    return items.some((d) => d.kind === 'folder'
      ? folders.some((f) => f.id === d.id && parentOf(f) !== to)
      : all.some((b) => b.id === d.id && where(b) !== to));
  };
  const moveGroup = (to: string | null) => {
    const fs = readFolders(), bs = readShelf() ?? [], items = dragging.current;
    if (to && !fs.some((f) => f.id === to)) return;
    if (items.some((d) => d.kind === 'folder' && to && withInside(d.id, fs).has(to))) return;
    const folderIds = new Set(items.filter((d) => d.kind === 'folder').map((d) => d.id));
    const boardIds = new Set(items.filter((d) => d.kind === 'board').map((d) => d.id));
    // Re-read before committing so a change in another tab is not overwritten.
    const carried = (parent: string | null | undefined) => pathTo(placeOf(parent, fs), fs).some((f) => folderIds.has(f.id));
    let moved = 0;
    const nextFolders = fs.map((f) => {
      if (!folderIds.has(f.id) || carried(f.parent) || placeOf(f.parent, fs) === to) return f;
      moved++; return { ...f, parent: to };
    });
    const nextBoards = bs.map((b) => {
      if (!boardIds.has(b.id) || carried(b.folder) || placeOf(b.folder, fs) === to) return b;
      moved++; return { ...b, folder: to };
    });
    if (nextFolders.some((f, i) => f !== fs[i]) && nextFolders.filter((f) => placeOf(f.parent, nextFolders) === to).length > MAX_FOLDERS) {
      folderLimit(); return;
    }
    if (nextFolders.some((f, i) => f !== fs[i])) writeFolders(nextFolders);
    if (nextBoards.some((b, i) => b !== bs[i])) writeShelf(nextBoards);
    if (moved) { selection.clear(); setToast({ text: `Перемещено в «${placeName(to)}»` }); }
  };
  const endDrag = () => {
    dragging.current = []; setDragKeys(new Set()); setDropOn(null);
    dragImage.current?.remove(); dragImage.current = null;
    selection.afterDrag();
  };
  const dragFrom = (what: Thing) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent<HTMLAnchorElement>) => {
      const keys = new Set(selection.take(keyOf(what)));
      const items: Thing[] = [
        ...folders.filter((f) => keys.has(`folder:${f.id}`)).map((f): Thing => ({ kind: 'folder', id: f.id })),
        ...all.filter((b) => keys.has(`board:${b.id}`)).map((b): Thing => ({ kind: 'board', id: b.id })),
      ];
      const selectedFolders = new Set(items.filter((d) => d.kind === 'folder').map((d) => d.id));
      dragging.current = items.filter((d) => {
        const parent = d.kind === 'folder' ? folders.find((f) => f.id === d.id)?.parent : all.find((b) => b.id === d.id)?.folder;
        return !pathTo(placeOf(parent, folders), folders).some((f) => selectedFolders.has(f.id));
      });
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', what.id);
      // The cursor carries an opaque copy while every source remains on its shelf at 50%.
      const preview = document.createElement('div');
      preview.className = 'shelf-drag-preview';
      const copy = e.currentTarget.cloneNode(true) as HTMLElement;
      copy.removeAttribute('data-shelf-item'); copy.removeAttribute('href');
      preview.append(copy);
      if (items.length > 1) {
        const count = document.createElement('span'); count.className = 'shelf-drag-count'; count.textContent = String(items.length); preview.append(count);
      }
      selection.root.current?.append(preview);
      dragImage.current = preview;
      e.dataTransfer.setDragImage(preview, 35, 35);
      setDragKeys(keys); setMenu(null);
    },
    onDragEnd: endDrag,
  });
  const dropInto = (to: string | null) => ({
    onDragOver: (e: React.DragEvent) => { if (canDrop(to)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setDropOn(to ?? 'top'); } },
    onDragLeave: (e: React.DragEvent) => {
      if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
      setDropOn((cur) => cur === (to ?? 'top') ? null : cur);
    },
    onDrop: (e: React.DragEvent) => {
      if (!dragging.current.length) return;
      e.preventDefault(); e.stopPropagation();
      if (canDrop(to)) moveGroup(to);
      endDrag();
    },
  });

  const moreButton = (key: string) => (
    <button className={`tile-more ${menu === key ? 'on' : ''}`} title="Действия" aria-label="Действия" aria-expanded={menu === key}
      onClick={(e) => { e.preventDefault(); setMenu(menu === key ? null : key); }}><img src={moreIcon} alt="" /></button>
  );

  const folderTile = (f: FolderEntry) => {
    const key = `folder:${f.id}`, inner = inside(f);
    const sheets = arrange(inner.own, '', 'edited', boardTime).slice(0, 3).map((b) => readThumb(b.id));
    const parts = [
      inner.own.length ? `${inner.own.length} ${plural(inner.own.length, 'доска', 'доски', 'досок')}` : '',
      inner.folders.length ? `${inner.folders.length} ${plural(inner.folders.length, 'папка', 'папки', 'папок')}` : '',
    ].filter(Boolean);
    return (
      <div className={`book ${dropOn === f.id ? 'drop' : ''} ${selection.selected.has(key) ? 'selected' : ''} ${dragKeys.has(key) ? 'is-dragging' : ''}`} key={key} {...dropInto(f.id)}>
        <a className="book-cover" data-shelf-item={key} href={folderUrl(f.id)} title={`Открыть папку «${nameOf(f, UNTITLED_FOLDER)}»: ${parts.join(", ") || "пустая"}`} {...dragFrom({ kind: 'folder', id: f.id })}
          onClick={(e) => { if (selection.itemClick(key, e)) return; if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); go(f.id); } }}
          onDoubleClick={(e) => { if (selection.selected.has(key) && !e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(f.id); } }}>
          <Folder color={f.color} sheets={sheets} count={nameOf(f, UNTITLED_FOLDER)} />
        </a>
        {searching && <div className="folder-location">{pathText(parentOf(f))}</div>}
        {moreButton(key)}
        {menu === key && (
          <div className="tile-menu" role="menu">
            <button role="menuitem" onClick={() => go(f.id)}>Открыть</button>
            <hr />
            <button role="menuitem" onClick={() => { setMenu(null); setDialog({ kind: 'folder', folder: f }); }}>Название и цвет…</button>
            <button role="menuitem" onClick={() => { setMenu(null); setDialog({ kind: 'move', what: { kind: 'folder', id: f.id } }); }}>Переместить…</button>
            <hr />
            <button role="menuitem" className="danger" onClick={() => { setMenu(null); setDialog({ kind: 'delete-folder', folder: f }); }}>Удалить папку</button>
          </div>
        )}
      </div>
    );
  };

  // Recent boards also appear in the full list; each menu opens on its own tile.
  const boardTile = (shelf: string) => (b: BoardEntry) => {
    const key = `${shelf}:${b.id}`, itemKey = `board:${b.id}`, thumb = readThumb(b.id);
    return (
      <div className={`card ${selection.selected.has(itemKey) ? 'selected' : ''} ${dragKeys.has(itemKey) ? 'is-dragging' : ''}`} key={key}>
        <a className="card-cover" data-shelf-item={itemKey} onClick={(e) => selection.itemClick(itemKey, e)}
          onDoubleClick={(e) => { if (selection.selected.has(itemKey) && !e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); navigate(boardUrl(b.id)); } }} href={boardUrl(b.id)} title={`Открыть «${nameOf(b)}»`} {...dragFrom({ kind: 'board', id: b.id })}>
          <PagePreview color={b.color} thumb={thumb} />
          {b.pinned && <span className="card-star" title="В избранном">★</span>}
          <span className="book-name" title={nameOf(b)}>{nameOf(b)}</span>
          <span className="book-meta">
            {searching ? pathText(where(b)) : <>
              {b.edited || b.created || b.opened ? `${cardDate.format(b.edited || b.created || b.opened)} · ` : ''}
              {`${b.items} ${plural(b.items, 'элемент', 'элемента', 'элементов')}`}
            </>}
          </span>
        </a>
        {moreButton(key)}
        {menu === key && (
          <div className="tile-menu" role="menu">
            <a role="menuitem" href={boardUrl(b.id)}>Открыть</a>
            <a role="menuitem" href={boardUrl(b.id)} target="_blank" rel="noreferrer" onClick={() => setMenu(null)}>Открыть в новой вкладке</a>
            <hr />
            <button role="menuitem" onClick={() => { setMenu(null); setDialog({ kind: 'rename', board: b }); }}>Переименовать</button>
            <button role="menuitem" onClick={() => { setMenu(null); setDialog({ kind: 'color', board: b }); }}>Цвет уголка…</button>
            <button role="menuitem" onClick={() => { setMenu(null); setDialog({ kind: 'move', what: { kind: 'board', id: b.id } }); }}>Переместить…</button>
            <button role="menuitem" onClick={() => { setMenu(null); changeBoard(b.id, { pinned: !b.pinned }); }}>{b.pinned ? 'Убрать из избранного' : 'В избранное'}</button>
            <button role="menuitem" onClick={() => { setMenu(null); void copyLink(b); }}>Скопировать ссылку</button>
            <hr />
            <button role="menuitem" className="danger" onClick={() => { setMenu(null); setDialog({ kind: 'remove', board: b }); }}>Убрать с полки</button>
          </div>
        )}
      </div>
    );
  };

  const newFolderTile = (
    <div className="book" key="new-folder">
      <button className="book-cover" onClick={() => setDialog({ kind: 'folder' })} aria-label="Новая папка" title="Новая папка"><FolderPlaceholder /></button>
    </div>
  );
  const newBoardTile = (
    <div className="card card-placeholder" key="new-board">
      <button className="card-cover card-new" onClick={() => setDialog({ kind: 'new-board' })} aria-label="Новая доска" title="Новая доска"><PagePlaceholder /></button>
    </div>
  );

  return (
    <div ref={selection.root} className={`shelf-page ${selection.marquee ? 'is-selecting' : ''}`} {...dropZone} {...selection.handlers}>
      {selection.marquee && <div className="shelf-marquee" aria-hidden="true" style={{ left: selection.marquee.x, top: selection.marquee.y, width: selection.marquee.width, height: selection.marquee.height }} />}
      {dropping && <div className="shelf-drop" aria-hidden="true"><span>Отпустите, чтобы открыть доску</span></div>}
      <HomeHeader query={query} searchRef={search} onHome={() => go(null)} dark={theme === 'dark'} onDark={toggleTheme} feedback={labs.wishlist}
        sort={sort} onSort={setSort}
        onQuery={(value) => { setQuery(value); if (page || wish) navigate(location.pathname); }} />
      {page ? <HomePageView page={page} dark={theme === 'dark'} onDark={toggleTheme} />
        : wish ? <main className="shelf-main"><h1 className="home-page-title">Фидбек</h1><WishlistPage /></main>
        : <main className="shelf-main" aria-label="Мои доски">
          {searching ? <>
            <div className="shelf-section-head"><h1 className="shelf-title">Результаты поиска</h1></div>
            {boards !== null && !shownFolders.length && !shownBoards.length && <p className="shelf-none">Ничего не нашлось по «{query.trim()}»</p>}
            {shownFolders.length > 0 && <section><h2 className="shelf-title">Папки: {shownFolders.length}</h2><FolderShelf>{shownFolders.map(folderTile)}</FolderShelf></section>}
            {shownBoards.length > 0 && <section><h2 className="shelf-title">Доски: {shownBoards.length}</h2><div className="cards">{shownBoards.map(boardTile('found'))}</div></section>}
          </> : <>
            <section>
              <nav className="crumbs" aria-label="Путь к папке">
                <a href={folderUrl(null)} className={dropOn === 'top' ? 'drop' : ''} onClick={(e) => { e.preventDefault(); go(null); }} {...dropInto(null)}>Папки</a>
                {path.map((f, i) => <span key={f.id}>
                  <img src={arrowIcon} alt="" />
                  {i === path.length - 1 ? <b aria-current="page">{nameOf(f, UNTITLED_FOLDER)}</b>
                    : <a href={folderUrl(f.id)} className={dropOn === f.id ? 'drop' : ''} onClick={(e) => { e.preventDefault(); go(f.id); }} {...dropInto(f.id)}>{nameOf(f, UNTITLED_FOLDER)}</a>}
                </span>)}
              </nav>
              <FolderShelf>{shownFolders.map(folderTile)}{!current && shownFolders.length < MAX_FOLDERS && newFolderTile}</FolderShelf>
            </section>
            <section className="shelf-recent">
              <h2 className="shelf-title">Недавние</h2>
              {boards === null ? <p className="shelf-none" role="status">Загружаем доски…</p>
                : <div className="cards">{recentBoards.map(boardTile('recent'))}{!current && newBoardTile}</div>}
            </section>
            <section className="shelf-all-boards">
              <h2 className="shelf-title">Все доски</h2>
              <div className="cards">{shownBoards.map(boardTile('here'))}</div>
            </section>
          </>}
        </main>}

      {dialog?.kind === 'new-board' && <NameDialog heading={current ? `Доска в «${nameOf(current, UNTITLED_FOLDER)}»` : 'Доска'}
        placeholder="Название, например «Работа»" action="Создать" onClose={() => setDialog(null)} onSave={createBoard}
        more={labOn('boardImport') ? <FromElsewhere onFile={(f) => void loadFile(f)} /> : undefined} />}
      {dialog?.kind === 'folder' && <FolderDialog folder={dialog.folder} inside={dialog.folder ? undefined : current} onClose={() => setDialog(null)} onSave={(title, color) => {
        if (dialog.folder) updateFolder(dialog.folder.id, { title, color });
        else {
          const fs = readFolders(), parent = current?.id ?? null;
          if (fs.filter((f) => placeOf(f.parent, fs) === parent).length >= MAX_FOLDERS) {
            reread(); setDialog(null); folderLimit(); return;
          }
          addFolder(newBoardId(), { title, color, parent });
        }
        reread();
        setDialog(null);
      }} />}
      {dialog?.kind === 'rename' && <NameDialog heading="Переименовать доску" initial={dialog.board.title} placeholder="Без названия" action="Сохранить"
        onClose={() => setDialog(null)} onSave={(title) => {
          changeBoard(dialog.board.id, { title });
          setDialog(null);
          void renameBoard(dialog.board.id, title).catch(() => setToast({ text: 'Не удалось переименовать саму доску, только на полке' }));
        }} />}
      {dialog?.kind === 'color' && <Modal label="Цвет уголка доски" onClose={() => setDialog(null)}>
        <h3>Цвет уголка доски</h3>
        <ColorChoices choices={PAGE_COLORS.map(([id, color]) => ({ color, name: PAGE_COLOR_NAMES[id] }))} value={pageColor(dialog.board.color)}
          label="Цвет уголка" onChange={(color) => { changeBoard(dialog.board.id, { color }); setDialog({ ...dialog, board: { ...dialog.board, color } }); }} />
        <div className="row"><button className="btn primary" onClick={() => setDialog(null)}>Готово</button></div>
      </Modal>}
      {dialog?.kind === 'move' && <MoveDialog what={dialog.what} folders={folders}
        from={dialog.what.kind === 'board' ? where(all.find((b) => b.id === dialog.what.id)!) : parentOf(folders.find((f) => f.id === dialog.what.id)!)}
        onClose={() => setDialog(null)} onMove={(to) => { move(dialog.what, to); setDialog(null); }} />}
      {dialog?.kind === 'remove' && (
        <Modal label="Убрать доску с полки" onClose={() => setDialog(null)}>
          <h3>Убрать «{nameOf(dialog.board)}» с полки?</h3>
          <p>Доска пропадёт из списка, но не удалится: по ссылке её можно открыть снова, и она вернётся на полку.</p>
          <div className="row">
            <button className="btn" onClick={() => setDialog(null)}>Отмена</button>
            <button className="btn primary danger" onClick={() => { removeBoard(dialog.board); setDialog(null); }}>Убрать</button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'delete-folder' && (
        <Modal label="Удалить папку" onClose={() => setDialog(null)}>
          <h3>Удалить папку «{nameOf(dialog.folder, UNTITLED_FOLDER)}»?</h3>
          <p>Доски и папки из неё не удалятся, а переедут в «{placeName(parentOf(dialog.folder))}».</p>
          <div className="row">
            <button className="btn" onClick={() => setDialog(null)}>Отмена</button>
            <button className="btn primary danger" onClick={() => { const f = dialog.folder; setDialog(null); if (here === f.id) go(parentOf(f)); deleteFolder(f); }}>Удалить</button>
          </div>
        </Modal>
      )}

      {toast && (
        <div className="pop toast shelf-toast" role="status">
          {toast.text}
          {toast.undo && <button className="toast-undo" onClick={toast.undo}>Вернуть</button>}
        </div>
      )}
    </div>
  );
}

function Modal({ label, onClose, children, className = '' }: { label: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  return (
    <div className="shelf-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`shelf-dialog ${className}`} role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </div>
  );
}

function NameDialog({ heading, initial = '', placeholder, action, onClose, onSave, more }:
  { heading: string; initial?: string; placeholder: string; action: string; onClose: () => void; onSave: (title: string) => void; more?: React.ReactNode }) {
  const [title, setTitle] = useState(initial);
  return (
    <Modal label={heading} onClose={onClose} className="name-dialog">
      <form onSubmit={(e) => { e.preventDefault(); onSave(title.trim()); }}>
        <h3>{heading}</h3>
        <input className="shelf-input" autoFocus placeholder={placeholder} aria-label="Название" maxLength={30}
          value={title} onChange={(e) => setTitle(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
        <div className="row">
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn primary">{action}</button>
        </div>
      </form>
      {more}
    </Modal>
  );
}

/** Under the new board's name ("Доски извне", src/labs): a board from a file, or by the address of
 *  one shared with you. */
function FromElsewhere({ onFile }: { onFile: (f: File) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [address, setAddress] = useState('');
  const id = boardIdIn(address);
  return (
    <div className="from-elsewhere">
      <div className="from-line"><span>или</span></div>
      {!pasting ? (
        <div className="row from-row">
          <button type="button" className="btn" onClick={() => file.current?.click()}>Загрузить доску из файла</button>
          <button type="button" className="btn" onClick={() => setPasting(true)}>Вставить адрес доски</button>
        </div>
      ) : (
        <form className="from-address" onSubmit={(e) => { e.preventDefault(); if (id) navigate(boardUrl(id)); }}>
          <input className="shelf-input" autoFocus placeholder="Адрес доски, которой поделились" aria-label="Адрес доски"
            value={address} onChange={(e) => setAddress(e.target.value)} />
          {address.trim() && !id && <p className="from-hint">Не похоже на адрес доски PlanX</p>}
          <div className="row">
            <button type="button" className="btn" onClick={() => setPasting(false)}>Назад</button>
            <button type="submit" className="btn primary" disabled={!id}>Открыть</button>
          </div>
        </form>
      )}
      <input ref={file} type="file" accept=".plnt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </div>
  );
}

/** A new folder, or a folder's name and colour, next to the folder as it'll look. */
function FolderDialog({ folder, inside, onClose, onSave }: { folder?: FolderEntry; inside?: FolderEntry | null; onClose: () => void; onSave: (title: string, color: string) => void }) {
  const [title, setTitle] = useState(folder?.title ?? '');
  const [color, setColor] = useState(() => folder?.color ? folderColor(folder.color) : randomColor());
  const heading = folder ? 'Папка' : inside ? `Новая папка в «${nameOf(inside, UNTITLED_FOLDER)}»` : 'Новая папка';
  return (
    <Modal label={heading} onClose={onClose} className="folder-dialog">
      <form onSubmit={(e) => { e.preventDefault(); onSave(title.trim(), color); }}>
        <h3>{heading}</h3>
        <input className="shelf-input" autoFocus placeholder="Название, например «Работа»" aria-label="Название папки" maxLength={30}
          value={title} onChange={(e) => setTitle(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
        <div className="folder-edit">
          <div className="folder-preview"><Folder color={color} sheets={[]} count={title.trim() || 'Пустая'} /></div>
          <div className="folder-fields">
            <div className="cover-label">Цвет</div>
            <ColorChoices choices={FOLDER_COLORS} value={color} onChange={setColor} />
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn primary">{folder ? 'Сохранить' : 'Создать'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Where to move a board or folder: the folders as a tree, with the top of the shelf first. */
function MoveDialog({ what, folders, from, onClose, onMove }:
  { what: Thing; folders: FolderEntry[]; from: string | null; onClose: () => void; onMove: (to: string | null) => void }) {
  const barred = what.kind === 'folder' ? withInside(what.id, folders) : new Set<string>();
  const rows: { f: FolderEntry; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of arrange(folders.filter((x) => placeOf(x.parent, folders) === parent), '', 'title', () => 0)) {
      rows.push({ f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 1);
  return (
    <Modal label="Переместить" onClose={onClose}>
      <h3>Переместить {what.kind === 'folder' ? 'папку' : 'доску'}</h3>
      <div className="move-list">
        <button className="move-row" disabled={from === null} onClick={() => onMove(null)}>Мои доски (верхняя полка)</button>
        {rows.map(({ f, depth }) => (
          <button key={f.id} className="move-row" style={{ paddingLeft: 12 + depth * 18 }} disabled={barred.has(f.id) || from === f.id} onClick={() => onMove(f.id)}>
            <i className="crumb-dot" style={{ background: f.color }} />{nameOf(f, UNTITLED_FOLDER)}
          </button>
        ))}
        {!rows.length && <p className="move-none">Папок пока нет: создайте папку, и сюда можно будет перемещать.</p>}
      </div>
      <div className="row"><button className="btn" onClick={onClose}>Отмена</button></div>
    </Modal>
  );
}

