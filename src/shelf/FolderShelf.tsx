import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** One actual plank per grid row: texture, rounded ends and shadow never repeat above the shelf. */
export function FolderShelf({ children }: { children: ReactNode }) {
  const grid = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(1);
  useLayoutEffect(() => {
    const el = grid.current!;
    const measure = () => {
      const style = getComputedStyle(el);
      const gap = parseFloat(style.rowGap), height = parseFloat(style.gridAutoRows);
      setRows(Math.max(1, Math.round((el.clientHeight + gap) / (height + gap))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <div className="shelf" ref={grid}>
    {Array.from({ length: rows }, (_, row) => <span key={row} className="shelf-plank" aria-hidden="true"
      style={{ top: `calc(var(--folder-height) + ${row} * var(--shelf-step))` }} />)}
    {children}
  </div>;
}
