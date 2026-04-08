import type {
  MutableRefObject,
  MouseEvent as ReactMouseEvent,
  SyntheticEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import type {
  ReaderImageViewerPoint,
} from '../utils/readerImageViewerTypes';
import type {
  ReaderImageViewerTransformController,
} from './readerImageViewerGestureTypes';
import type { ReaderImageGalleryEntry } from '@shared/contracts/reader';

import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { createReaderImageEntryId } from '@shared/reader-content';

import {
  applyScaleAroundPoint,
  clampTranslate,
  DOUBLE_TAP_ZOOM_SCALE,
  SINGLE_CLICK_CLOSE_DELAY_MS,
} from '../utils/readerImageViewerTransform';

interface UseReaderImageViewerStageHandlersResult {
  handleImageLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
  handleNavigate: (direction: 'next' | 'prev') => Promise<boolean>;
  handleStageClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleStageDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleStageWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  zoomAtPoint: (point: ReaderImageViewerPoint) => boolean;
}

export function useReaderImageViewerStageHandlers(params: {
  activeIndex: number;
  consumeDeferredStageClick: () => boolean;
  entries: ReaderImageGalleryEntry[];
  hasImageResource: boolean;
  isNavigationTransitionPending: boolean;
  onClearNavigationTransition: () => void;
  onPrepareNavigationTransition: (direction: -1 | 1, targetEntryId: string) => void;
  onRequestClose: () => void;
  onRequestNavigate: (direction: 'next' | 'prev') => Promise<boolean>;
  suppressNextClickRef: MutableRefObject<boolean>;
  transform: ReaderImageViewerTransformController;
}): UseReaderImageViewerStageHandlersResult {
  const {
    activeIndex,
    consumeDeferredStageClick,
    entries,
    hasImageResource,
    isNavigationTransitionPending,
    onClearNavigationTransition,
    onPrepareNavigationTransition,
    onRequestClose,
    onRequestNavigate,
    suppressNextClickRef,
    transform,
  } = params;
  const {
    animateTransform,
    clearPendingClose,
    dismissProgress,
    dragDismissClosingRef,
    maxScale,
    naturalImageSize,
    readTransformState,
    setNaturalImageSize,
    setTransformState,
    stopMotionAnimations,
    surfaceOpacity,
    targetRect,
  } = transform;

  const handleImageLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    if (target.naturalWidth <= 0 || target.naturalHeight <= 0) {
      return;
    }

    setNaturalImageSize({
      height: target.naturalHeight,
      width: target.naturalWidth,
    });
  }, [setNaturalImageSize]);

  const handleNavigate = useCallback(async (direction: 'next' | 'prev'): Promise<boolean> => {
    if (isNavigationTransitionPending) {
      return true;
    }

    const candidateEntry = entries[activeIndex + (direction === 'next' ? 1 : -1)] ?? null;
    if (candidateEntry) {
      flushSync(() => {
        onPrepareNavigationTransition(
          direction === 'next' ? 1 : -1,
          createReaderImageEntryId(candidateEntry),
        );
      });
    }

    const didNavigate = await onRequestNavigate(direction);
    if (!didNavigate) {
      onClearNavigationTransition();
      const currentTransformState = readTransformState();
      const clamped = clampTranslate(
        targetRect,
        Math.max(1, currentTransformState.scale),
        0,
        0,
      );
      animateTransform({
        scale: Math.max(1, currentTransformState.scale),
        translateX: clamped.x,
        translateY: clamped.y,
      }, true);
    }

    return didNavigate;
  }, [
    activeIndex,
    animateTransform,
    entries,
    isNavigationTransitionPending,
    onClearNavigationTransition,
    onPrepareNavigationTransition,
    onRequestNavigate,
    readTransformState,
    targetRect,
  ]);

  const zoomAtPoint = useCallback((point: ReaderImageViewerPoint): boolean => {
    clearPendingClose();
    stopMotionAnimations();
    dragDismissClosingRef.current = false;
    if (!naturalImageSize) {
      return false;
    }

    dismissProgress.set(0);
    surfaceOpacity.set(1);

    const currentTransformState = readTransformState();
    const nextScale = currentTransformState.scale > 1.05
      ? 1
      : Math.min(DOUBLE_TAP_ZOOM_SCALE, maxScale);
    const nextTranslate = nextScale === 1
      ? { x: 0, y: 0 }
      : applyScaleAroundPoint({
        nextScale,
        point,
        scale: currentTransformState.scale,
        targetRect,
        translateX: currentTransformState.translateX,
        translateY: currentTransformState.translateY,
      });
    const clampedTranslate = clampTranslate(
      targetRect,
      nextScale,
      nextTranslate.x,
      nextTranslate.y,
    );
    animateTransform({
      scale: nextScale,
      translateX: clampedTranslate.x,
      translateY: clampedTranslate.y,
    }, true);
    return true;
  }, [
    animateTransform,
    clearPendingClose,
    dismissProgress,
    dragDismissClosingRef,
    maxScale,
    naturalImageSize,
    readTransformState,
    stopMotionAnimations,
    surfaceOpacity,
    targetRect,
  ]);

  const handleStageClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (isNavigationTransitionPending) {
      clearPendingClose();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (dragDismissClosingRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (suppressNextClickRef.current || consumeDeferredStageClick()) {
      suppressNextClickRef.current = false;
      clearPendingClose();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    clearPendingClose();
    transform.closeIntentTimeoutRef.current = window.setTimeout(() => {
      transform.closeIntentTimeoutRef.current = null;
      onRequestClose();
    }, SINGLE_CLICK_CLOSE_DELAY_MS);
  }, [
    clearPendingClose,
    consumeDeferredStageClick,
    dragDismissClosingRef,
    isNavigationTransitionPending,
    onRequestClose,
    suppressNextClickRef,
    transform.closeIntentTimeoutRef,
  ]);

  const handleStageWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (isNavigationTransitionPending) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    clearPendingClose();
    stopMotionAnimations();
    dismissProgress.set(0);
    surfaceOpacity.set(1);
    if (!naturalImageSize || !hasImageResource || dragDismissClosingRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const currentTransformState = readTransformState();
    const rawNextScale = event.deltaY < 0
      ? currentTransformState.scale * 1.12
      : currentTransformState.scale * 0.88;
    const nextScale = Math.min(Math.max(rawNextScale, 1), maxScale);
    const nextTranslate = applyScaleAroundPoint({
      nextScale,
      point: { x: event.clientX, y: event.clientY },
      scale: currentTransformState.scale,
      targetRect,
      translateX: currentTransformState.translateX,
      translateY: currentTransformState.translateY,
    });
    const clampedTranslate = clampTranslate(
      targetRect,
      nextScale,
      nextTranslate.x,
      nextTranslate.y,
    );
    setTransformState({
      scale: nextScale,
      translateX: clampedTranslate.x,
      translateY: clampedTranslate.y,
    });
  }, [
    clearPendingClose,
    dismissProgress,
    dragDismissClosingRef,
    hasImageResource,
    maxScale,
    naturalImageSize,
    readTransformState,
    setTransformState,
    stopMotionAnimations,
    surfaceOpacity,
    targetRect,
    isNavigationTransitionPending,
  ]);

  const handleStageDoubleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (isNavigationTransitionPending) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (dragDismissClosingRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    zoomAtPoint({ x: event.clientX, y: event.clientY });
  }, [dragDismissClosingRef, isNavigationTransitionPending, zoomAtPoint]);

  return {
    handleImageLoad,
    handleNavigate,
    handleStageClick,
    handleStageDoubleClick,
    handleStageWheel,
    zoomAtPoint,
  };
}
