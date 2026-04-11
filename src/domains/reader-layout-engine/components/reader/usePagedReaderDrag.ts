import type { ChapterContent } from '@shared/contracts/reader';
import type { MotionValue, PanInfo } from 'motion/react';
import type { ReaderPageTurnMode } from '../../constants/pageTurnMode';
import type { PageSlice, PaginatedChapterLayout } from '../../utils/readerLayout';
import type { PendingCommittedPageOverride } from '../../utils/pagedDragRenderState';

import { useCallback, useEffect, useRef, useState } from 'react';
import { animate, useMotionValue, useTransform } from 'motion/react';

import {
  getPageTurnAnimation,
  getPageTurnSettleDuration,
  type PageTurnDirection,
} from '../../animations/pageTurnAnimations';
import {
  clampDragOffset,
  getPagedDragLayerOffsets,
  shouldCommitPageTurnDrag,
} from '../../utils/pagedDrag';

const DRAG_START_THRESHOLD_PX = 8;
const PAGED_IMAGE_ACTIVATION_GUARD_MS = 280;

export interface PagePreviewTarget {
  chapter: ChapterContent;
  layout: PaginatedChapterLayout;
  pageIndex: number;
  pageSlice: PageSlice;
}

export interface CommittedDragTransition {
  current: PagePreviewTarget;
  direction: PageTurnDirection;
  mode: Extract<ReaderPageTurnMode, 'cover' | 'slide'>;
  preview: PagePreviewTarget;
}

interface UsePagedReaderDragParams {
  canDragNext: boolean;
  canDragPrev: boolean;
  currentPreviewTarget: PagePreviewTarget | null;
  disableAnimation?: boolean;
  interactionLocked?: boolean;
  nextPreviewTarget: PagePreviewTarget | null;
  onRequestNextPage?: () => void;
  onRequestPrevPage?: () => void;
  pageTurnMode: ReaderPageTurnMode;
  pageTurnToken: number;
  previousPreviewTarget: PagePreviewTarget | null;
  resolvedViewportWidth: number;
  setPendingCommittedPageOverride: React.Dispatch<
    React.SetStateAction<PendingCommittedPageOverride | null>
  >;
}

interface UsePagedReaderDragResult {
  activeDragTransition: CommittedDragTransition | null;
  currentLayerX: MotionValue<number>;
  handleClickCapture: (event: React.MouseEvent<HTMLDivElement>) => void;
  handlePan: (_event: PointerEvent, info: PanInfo) => void;
  handlePanEnd: (_event: PointerEvent, info: PanInfo) => void;
  handlePanStart: () => void;
  isDragEnabled: boolean;
  previewLayerX: MotionValue<number>;
  shouldDisableImageActivation: boolean;
}

function resolveDragDirection(offset: number): PageTurnDirection | null {
  if (offset > 0) {
    return 'prev';
  }
  if (offset < 0) {
    return 'next';
  }
  return null;
}

function resolveDragCommitOffset(
  shouldCommit: boolean,
  direction: PageTurnDirection,
  viewportWidth: number,
): number {
  if (!shouldCommit) {
    return 0;
  }

  return direction === 'next' ? -viewportWidth : viewportWidth;
}

export function usePagedReaderDrag({
  canDragNext,
  canDragPrev,
  currentPreviewTarget,
  disableAnimation = false,
  interactionLocked = false,
  nextPreviewTarget,
  onRequestNextPage,
  onRequestPrevPage,
  pageTurnMode,
  pageTurnToken,
  previousPreviewTarget,
  resolvedViewportWidth,
  setPendingCommittedPageOverride,
}: UsePagedReaderDragParams): UsePagedReaderDragResult {
  const [isDragGestureActive, setIsDragGestureActive] = useState(false);
  const [isDragSettling, setIsDragSettling] = useState(false);
  const [isImageActivationGuardActive, setIsImageActivationGuardActive] = useState(false);
  const [dragDirection, setDragDirection] = useState<PageTurnDirection | null>(null);
  const [committedDragTransition, setCommittedDragTransition] =
    useState<CommittedDragTransition | null>(null);
  const dragAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
  const imageActivationGuardTimeoutRef = useRef<number | null>(null);
  const imageActivationGuardUntilRef = useRef(0);
  const pageTurnTokenRef = useRef(pageTurnToken);
  const suppressNextClickRef = useRef(false);
  const dragOffset = useMotionValue(0);

  const activeDragMode = committedDragTransition?.mode
    ?? (pageTurnMode === 'cover' || pageTurnMode === 'slide' ? pageTurnMode : null);
  const activeDragDirection = committedDragTransition?.direction ?? dragDirection;
  const isDragEnabled = committedDragTransition === null
    && !disableAnimation
    && !interactionLocked
    && (pageTurnMode === 'cover' || pageTurnMode === 'slide')
    && resolvedViewportWidth > 0
    && (canDragPrev || canDragNext);

  const currentLayerX = useTransform(dragOffset, (offset) => {
    if (!activeDragDirection || !activeDragMode) {
      return 0;
    }

    return getPagedDragLayerOffsets(
      activeDragMode,
      activeDragDirection,
      offset,
      resolvedViewportWidth,
    ).currentX;
  });
  const previewLayerX = useTransform(dragOffset, (offset) => {
    if (!activeDragDirection || !activeDragMode) {
      return 0;
    }

    return getPagedDragLayerOffsets(
      activeDragMode,
      activeDragDirection,
      offset,
      resolvedViewportWidth,
    ).previewX;
  });

  const clearImageActivationGuardTimeout = useCallback(() => {
    if (imageActivationGuardTimeoutRef.current !== null) {
      window.clearTimeout(imageActivationGuardTimeoutRef.current);
      imageActivationGuardTimeoutRef.current = null;
    }
  }, []);

  const syncImageActivationGuardTimeout = useCallback(() => {
    clearImageActivationGuardTimeout();
    const remainingMs = imageActivationGuardUntilRef.current - Date.now();
    if (remainingMs <= 0) {
      imageActivationGuardUntilRef.current = 0;
      setIsImageActivationGuardActive(false);
      return;
    }

    setIsImageActivationGuardActive(true);
    imageActivationGuardTimeoutRef.current = window.setTimeout(() => {
      imageActivationGuardTimeoutRef.current = null;
      const nextRemainingMs = imageActivationGuardUntilRef.current - Date.now();
      if (nextRemainingMs > 0) {
        syncImageActivationGuardTimeout();
        return;
      }

      imageActivationGuardUntilRef.current = 0;
      setIsImageActivationGuardActive(false);
    }, remainingMs);
  }, [clearImageActivationGuardTimeout]);

  const scheduleImageActivationGuard = useCallback(
    (durationMs: number = PAGED_IMAGE_ACTIVATION_GUARD_MS) => {
      imageActivationGuardUntilRef.current = Math.max(
        imageActivationGuardUntilRef.current,
        Date.now() + durationMs,
      );
      syncImageActivationGuardTimeout();
    },
    [syncImageActivationGuardTimeout],
  );

  const stopDragAnimation = useCallback(() => {
    dragAnimationRef.current?.stop();
    dragAnimationRef.current = null;
  }, []);

  const resetDragState = useCallback(() => {
    stopDragAnimation();
    dragOffset.set(0);
    setIsDragGestureActive(false);
    setIsDragSettling(false);
    setDragDirection(null);
  }, [dragOffset, stopDragAnimation]);

  useEffect(() => {
    return () => {
      stopDragAnimation();
    };
  }, [stopDragAnimation]);

  useEffect(() => {
    return () => {
      clearImageActivationGuardTimeout();
    };
  }, [clearImageActivationGuardTimeout]);

  useEffect(() => {
    if (pageTurnToken === pageTurnTokenRef.current) {
      return;
    }

    pageTurnTokenRef.current = pageTurnToken;
    scheduleImageActivationGuard();
  }, [pageTurnToken, scheduleImageActivationGuard]);

  const handlePanStart = useCallback(() => {
    if (!isDragEnabled) {
      return;
    }

    stopDragAnimation();
    setIsDragGestureActive(true);
    setIsDragSettling(false);
  }, [isDragEnabled, stopDragAnimation]);

  const handlePan = useCallback((_event: PointerEvent, info: PanInfo) => {
    if (!isDragEnabled) {
      return;
    }

    const nextOffset = clampDragOffset(
      info.offset.x,
      resolvedViewportWidth,
      canDragPrev,
      canDragNext,
    );
    if (Math.abs(nextOffset) < DRAG_START_THRESHOLD_PX) {
      dragOffset.set(0);
      setDragDirection(null);
      return;
    }

    dragOffset.set(nextOffset);
    setDragDirection(nextOffset > 0 ? 'prev' : 'next');
    suppressNextClickRef.current = true;
  }, [canDragNext, canDragPrev, dragOffset, isDragEnabled, resolvedViewportWidth]);

  const handlePanEnd = useCallback((_event: PointerEvent, info: PanInfo) => {
    if (!isDragEnabled) {
      return;
    }

    setIsDragGestureActive(false);
    const nextOffset = clampDragOffset(
      info.offset.x,
      resolvedViewportWidth,
      canDragPrev,
      canDragNext,
    );
    const nextDirection = resolveDragDirection(nextOffset);
    if (!nextDirection || Math.abs(nextOffset) < DRAG_START_THRESHOLD_PX) {
      suppressNextClickRef.current = false;
      resetDragState();
      return;
    }

    const shouldCommit = shouldCommitPageTurnDrag(
      nextOffset,
      info.velocity.x,
      resolvedViewportWidth,
    );
    const commitPreviewTarget = nextDirection === 'prev' ? previousPreviewTarget : nextPreviewTarget;
    if (!commitPreviewTarget || !currentPreviewTarget) {
      suppressNextClickRef.current = false;
      resetDragState();
      return;
    }

    const targetOffset = resolveDragCommitOffset(
      shouldCommit,
      nextDirection,
      resolvedViewportWidth,
    );
    const animation = getPageTurnAnimation(pageTurnMode);
    const settleDuration = getPageTurnSettleDuration(
      pageTurnMode,
      nextOffset,
      targetOffset,
      resolvedViewportWidth,
      info.velocity.x,
    );

    setIsDragSettling(true);
    dragAnimationRef.current = animate(dragOffset, targetOffset, {
      ...animation.transition,
      duration: settleDuration,
      onComplete: () => {
        dragAnimationRef.current = null;
        suppressNextClickRef.current = false;
        setCommittedDragTransition(null);
        dragOffset.set(0);
        setIsDragSettling(false);
        setDragDirection(null);
      },
    });

    if (!shouldCommit) {
      return;
    }

    scheduleImageActivationGuard();
    setPendingCommittedPageOverride(
      commitPreviewTarget.chapter.index !== currentPreviewTarget.chapter.index
        ? {
          chapterIndex: commitPreviewTarget.chapter.index,
          pageIndex: commitPreviewTarget.pageIndex,
        }
        : null,
    );
    setCommittedDragTransition({
      current: currentPreviewTarget,
      direction: nextDirection,
      mode: pageTurnMode,
      preview: commitPreviewTarget,
    });
    setDragDirection(null);
    if (nextDirection === 'next') {
      onRequestNextPage?.();
    } else {
      onRequestPrevPage?.();
    }
  }, [
    canDragNext,
    canDragPrev,
    currentPreviewTarget,
    dragOffset,
    isDragEnabled,
    nextPreviewTarget,
    onRequestNextPage,
    onRequestPrevPage,
    pageTurnMode,
    previousPreviewTarget,
    resetDragState,
    resolvedViewportWidth,
    scheduleImageActivationGuard,
    setPendingCommittedPageOverride,
  ]);

  const handleClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressNextClickRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressNextClickRef.current = false;
  }, []);

  let livePreviewTarget = null;
  if (dragDirection === 'prev') {
    livePreviewTarget = previousPreviewTarget;
  } else if (dragDirection === 'next') {
    livePreviewTarget = nextPreviewTarget;
  }
  const activeDragTransition = !committedDragTransition
    && dragDirection
    && livePreviewTarget
    && (pageTurnMode === 'cover' || pageTurnMode === 'slide')
    && currentPreviewTarget
    ? {
      current: currentPreviewTarget,
      direction: dragDirection,
      mode: pageTurnMode,
      preview: livePreviewTarget,
    }
    : committedDragTransition;

  return {
    activeDragTransition,
    currentLayerX,
    handleClickCapture,
    handlePan,
    handlePanEnd,
    handlePanStart,
    isDragEnabled,
    previewLayerX,
    shouldDisableImageActivation: isDragGestureActive
      || isDragSettling
      || committedDragTransition !== null
      || isImageActivationGuardActive,
  };
}
