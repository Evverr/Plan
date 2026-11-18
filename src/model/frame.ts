import type { Item } from './types';

/**
 * Folding frames: a double click folds a frame into a bar the size of a mind map's central topic, its
 * title inside, with what it holds hidden (and still carried along), and unfolds the bar again.
 * `fold` keeps its unfolded size.
 */
export const FOLD_H = 72, FOLD_FS = 18, FOLD_PAD = 24, FOLD_ICON = 24, FOLD_RIGHT = 20, FOLD_TITLE_GAP = 20;
/** The widest a folded frame's title is shown, in board units. */
export const FOLD_TITLE_MAX = 320;

export type FrameButton = 'peek';

/** A frame's buttons, each as the box its icon is drawn in (board units): on a folded one, a look at
 *  what it holds, at its right end; an unfolded one has none. */
export function frameButtons(it: Item): Array<{ kind: FrameButton; icon: string; x: number; y: number; s: number }> {
  if (it.type !== 'frame' || !it.fold) return [];
  // (Its magnifier 10% bigger than the folded bar's icons, its right edge where theirs is.)
  const s = Math.round(FOLD_ICON * 1.1);
  return [{ kind: 'peek', icon: 'search', x: it.x + it.w - FOLD_RIGHT - s, y: it.y + (it.h - s) / 2, s }];
}
