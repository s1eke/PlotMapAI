import { SCROLL_READING_ANCHOR_RATIO } from '@shared/utils/readerPosition';

export function clampAnchorRatio(anchorRatio: number): number {
  if (!Number.isFinite(anchorRatio)) {
    return SCROLL_READING_ANCHOR_RATIO;
  }

  if (anchorRatio <= 0) {
    return 0;
  }

  if (anchorRatio >= 1) {
    return 1;
  }

  return anchorRatio;
}
