import { useEffect, useRef, useState, type RefObject } from 'react';
import { PanelIcon } from '../ui/PanelIcon';
import { Glyph } from '../ui/glyphs';
import { navigate } from '../route';
import { toWork } from './Navigation';
import { SORTS, type SortBy } from './boards';
import searchIcon from './assets/search.svg';
import menuIcon from './assets/menu.svg';

export function HomeHeader({ query, onQuery, onHome, searchRef, dark, onDark, feedback, sort, onSort }: {
  query: string; onQuery: (value: string) => void; searchRef: RefObject<HTMLInputElement>;
  dark: boolean; onDark: () => void; onHome: () => void; feedback: boolean;
  sort: SortBy; onSort: (value: SortBy) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const sortItem = useRef<HTMLDivElement>(null), sortTrigger = useRef<HTMLButtonElement>(null);
  const focusSort = useRef(false);
  const wrap = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!open) setSortOpen(false); }, [open]);
  useEffect(() => {
    if (sortOpen && focusSort.current) {
      focusSort.current = false;
      sortItem.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    }
  }, [sortOpen]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    const close = () => setOpen(false);
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    window.addEventListener('popstate', close);
    wrap.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('popstate', close);
    };
  }, [open]);
  const go = (page: string) => { setOpen(false); navigate(`${location.pathname}?page=${page}`); };
  return <header className="shelf-head">
    <div className="shelf-head-inner">
      <a className="home-logo" href={location.pathname} aria-label="На главную" onClick={(e) => {
        if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); setOpen(false); onHome(); }
      }}>Plan</a>
      <div className="shelf-tools">
        <label className="shelf-search">
          <input ref={searchRef} type="search" aria-label="Найти доску или папку" value={query} onChange={(e) => onQuery(e.target.value)} />
          <img src={searchIcon} alt="" />
        </label>
        <div className="home-menu-wrap" ref={wrap} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
          <button ref={trigger} className="home-menu-button" aria-label="Меню" title="Меню" aria-expanded={open} aria-haspopup="menu"
            onClick={() => setOpen(!open)} onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }}><img src={menuIcon} alt="" /></button>
          {open && <div className="home-menu board-menu" role="menu" aria-label="Главное меню" onPointerOver={(e) => {
            if (!sortItem.current?.contains(e.target as Node)) setSortOpen(false);
          }} onKeyDown={(e) => {
            const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>(':scope > .menu-item > button'));
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(index + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
          }}>
            <div className="menu-item"><button className="menu-row" role="menuitem" onClick={() => { setOpen(false); toWork(); }}><Glyph id="board" className="menu-icon" /><span>В работе</span></button></div>
            <div className="menu-item" ref={sortItem} onPointerEnter={() => setSortOpen(true)}>
              <button ref={sortTrigger} className="menu-row" role="menuitem" aria-haspopup="menu" aria-expanded={sortOpen}
                onClick={() => setSortOpen(true)} onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault(); e.stopPropagation();
                    if (sortOpen) sortItem.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
                    else { focusSort.current = true; setSortOpen(true); }
                  }
                }}><PanelIcon name="list" className="menu-icon" /><span>Сортировка</span><i className="menu-more" aria-hidden="true" /></button>
              {sortOpen && <div className="board-menu sub leftward plain" role="menu" aria-label="Сортировка" onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape' || e.key === 'ArrowLeft') { e.preventDefault(); setSortOpen(false); sortTrigger.current?.focus(); }
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
                  const index = items.indexOf(document.activeElement as HTMLButtonElement);
                  items[(index + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
                }
              }}>
                {SORTS.map((item) => <div className="menu-item" key={item.id}><button className="menu-row" role="menuitemradio" aria-checked={sort === item.id}
                  onClick={() => { onSort(item.id); setOpen(false); trigger.current?.focus(); }}><span>{item.label}</span>
                  {sort === item.id && <PanelIcon name="check-m" className="menu-icon home-sort-check" />}
                </button></div>)}
              </div>}
            </div>
            <div className="menu-item"><button className="menu-row" role="menuitem" onClick={() => go('profile')}><Glyph id="user-profile" className="menu-icon" /><span>Профиль</span></button></div>
            <div className="menu-item"><button className="menu-row" role="menuitem" onClick={() => go('settings')}><PanelIcon name="settings" className="menu-icon" /><span>Настройки</span></button></div>
            <div className="menu-item"><button className="menu-row" role="menuitem" onClick={() => go('help')}><PanelIcon name="question" className="menu-icon" /><span>Помощь</span></button></div>
            {feedback && <div className="menu-item"><button className="menu-row" role="menuitem" onClick={() => { setOpen(false); navigate(`${location.pathname}?wishlist`); }}><PanelIcon name="message" className="menu-icon" /><span>Фидбек</span></button></div>}
            <div className="menu-line" role="separator" />
            <div className="menu-item"><button className="menu-row" role="menuitemcheckbox" aria-checked={dark} onClick={onDark}><PanelIcon name="moon" className="menu-icon" /><span>Тёмная тема</span><span className={`menu-switch ${dark ? 'on' : ''}`} aria-hidden="true"><i /></span></button></div>
          </div>}
        </div>
      </div>
    </div>
  </header>;
}
