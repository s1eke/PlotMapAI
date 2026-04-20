import type { ReaderPageTurnMode } from '../../constants/pageTurnMode';

import type { PageTurnDirection } from '../../animations/pageTurnAnimations';

const DRAG_COMMIT_RATIO = 0.22;
const DRAG_COMMIT_VELOCITY = 420;

interface PagedDragLayerOffsets {
  currentX: number;
  previewX: number;
  isPreviewOnTop: boolean;
}

export function clampDragOffset(
  offset: number,
  viewportWidth: number,
  canDragPrev: boolean,
  canDragNext: boolean,
): number {
  const maxRight = canDragPrev ? viewportWidth : 0;
  const maxLeft = canDragNext ? -viewportWidth : 0;
  return Math.min(maxRight, Math.max(maxLeft, offset));
}

export function shouldCommitPageTurnDrag(
  offset: number,
  velocityX: number,
  viewportWidth: number,
): boolean {
  return Math.abs(offset) >= viewportWidth * DRAG_COMMIT_RATIO
    || Math.abs(velocityX) >= DRAG_COMMIT_VELOCITY;
}

export function getPagedDragLayerOffsets(
  mode: Extract<ReaderPageTurnMode, 'cover' | 'slide'>,
  direction: PageTurnDirection,
  offset: number,
  viewportWidth: number,
): PagedDragLayerOffsets {
  if (mode === 'slide') {
    return {
      currentX: offset,
      previewX: (direction === 'next' ? viewportWidth : -viewportWidth) + offset,
      isPreviewOnTop: true,
    };
  }

  if (direction === 'next') {
    return {
      currentX: offset,
      previewX: 0,
      isPreviewOnTop: false,
    };
  }

  return {
    currentX: 0,
    previewX: -viewportWidth + offset,
    isPreviewOnTop: true,
  };
}
