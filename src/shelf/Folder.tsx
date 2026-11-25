import shade from './assets/folder-shade.svg';
import frontEffect from './assets/folder-front-effect.svg';
import placeholder from './assets/folder-placeholder.svg';
import plus from './assets/folder-plus.svg';

// Keep saved folder colours; display the old palette in the new Figma shades.
const LEGACY_COLORS: Record<string, string> = {
  '#3C9A72': '#3D9A72', '#5B6271': '#686F7E', '#B38B5D': '#BC8A4F',
  '#4A7FC1': '#4786D4', '#E0A93A': '#E6A72D', '#8A68C4': '#8666BD', '#D46A8A': '#DE587F',
};
export const folderColor = (color: string): string => LEGACY_COLORS[color.toUpperCase()] ?? color;

/** Figma Org / Folder: separate back, animated sheets and front, with a dynamic colour and title. */
export function Folder({ color, sheets, count }: { color: string; sheets: (string | null)[]; count: string }) {
  return (
    <span className="fd" style={{ '--folder': folderColor(color) } as React.CSSProperties}>
      <span className="fd-back" />
      <img className="fd-shade" src={shade} alt="" draggable={false} />
      <span className="fd-sheets">
        {(sheets.length ? sheets.slice(0, 3) : [null, null, null]).map((url, i) => (
          <span key={i} className="fd-sheet">{url && <img src={url} alt="" draggable={false} />}</span>
        ))}
      </span>
      <span className="fd-front"><img className="fd-front-effect" src={frontEffect} alt="" draggable={false} /><span className="fd-count">{count}</span></span>
    </span>
  );
}

export function FolderPlaceholder() {
  return <span className="fd fd-new" aria-hidden="true">
    <img className="fd-placeholder" src={placeholder} alt="" draggable={false} />
    <img className="fd-plus" src={plus} alt="" draggable={false} />
    <span className="fd-new-label">Новая папка</span>
  </span>;
}
