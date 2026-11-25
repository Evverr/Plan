import { FILLS } from '../model/types';
import white from './assets/page-white.svg';
import paper from './assets/page-paper.svg';
import placeholderPaper from './assets/page-placeholder-paper.svg';
import plus from './assets/page-plus.svg';

export const PAGE_COLORS = Object.entries(FILLS).filter(([id]) => id !== 'none');
export const PAGE_COLOR_NAMES: Record<string, string> = {
  gray: 'Серый', graphite: 'Графитовый', yellow: 'Жёлтый', orange: 'Оранжевый',
  pink: 'Розовый', purple: 'Фиолетовый', blue: 'Синий', green: 'Зелёный',
};
export const pageColor = (color?: string): string => (color && (FILLS[color] ?? (/^#[\da-f]{6}$/i.test(color) ? color : null))) || FILLS.gray;

/** Figma Org / Page. The preview stays live; its coloured corner and White layer retain their geometry. */
export function PagePreview({ color, thumb }: { color?: string; thumb: string | null }) {
  return <span className="page-preview" style={{ '--page-color': pageColor(color) } as React.CSSProperties} aria-hidden="true">
    <span className="page-corner" />
    <img className="page-white" src={white} alt="" draggable={false} />
    <img className="page-paper" src={paper} alt="" draggable={false} />
    {thumb && <span className="page-thumbnail"><img src={thumb} alt="" draggable={false} /></span>}
  </span>;
}

export function PagePlaceholder() {
  return <span className="page-placeholder" aria-hidden="true">
    <span className="page-placeholder-base"><img src={placeholderPaper} alt="" draggable={false} /><span>Новая доска</span></span>
    <img className="page-placeholder-plus" src={plus} alt="" draggable={false} />
  </span>;
}
