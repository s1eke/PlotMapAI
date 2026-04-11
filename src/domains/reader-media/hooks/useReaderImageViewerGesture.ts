import type {
  GestureState,
  TapState,
  UseReaderImageViewerGestureParams,
  UseReaderImageViewerGestureResult,
} from './readerImageViewerGestureTypes';

import { useRef } from 'react';

import { useReaderImageViewerPointerHandlers } from './useReaderImageViewerPointerHandlers';
import { useReaderImageViewerStageHandlers } from './useReaderImageViewerStageHandlers';
import { useReaderImageViewerTransform } from './useReaderImageViewerTransform';

export function useReaderImageViewerGesture({
  activeEntry,
  activeIndex,
  canNavigateNext,
  canNavigatePrev,
  consumeDeferredStageClick,
  dismissProgress,
  entries,
  hasImageResource,
  isNavigationTransitionPending,
  novelId,
  onClearNavigationTransition,
  onPrepareNavigationTransition,
  onRequestClose,
  onRequestDismissClose,
  onRequestNavigate,
  suppressDeferredStageClick,
  viewportSize,
}: UseReaderImageViewerGestureParams): UseReaderImageViewerGestureResult {
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<GestureState | null>(null);
  const lastTapRef = useRef<TapState | null>(null);
  const suppressNextClickRef = useRef(false);

  const transform = useReaderImageViewerTransform({
    activeEntry,
    dismissProgress,
    novelId,
    onRequestDismissClose,
    viewportSize,
  });
  const stageHandlers = useReaderImageViewerStageHandlers({
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
  });
  const pointerHandlers = useReaderImageViewerPointerHandlers({
    activePointersRef,
    canNavigateNext,
    canNavigatePrev,
    gestureRef,
    handleNavigate: stageHandlers.handleNavigate,
    isNavigationTransitionPending,
    lastTapRef,
    onRequestClose,
    suppressDeferredStageClick,
    suppressNextClickRef,
    transform,
    viewportSize,
    zoomAtPoint: stageHandlers.zoomAtPoint,
  });

  return {
    handleImageLoad: stageHandlers.handleImageLoad,
    handlePointerCancel: pointerHandlers.handlePointerCancel,
    handlePointerDown: pointerHandlers.handlePointerDown,
    handlePointerMove: pointerHandlers.handlePointerMove,
    handlePointerUp: pointerHandlers.handlePointerUp,
    handleStageClick: stageHandlers.handleStageClick,
    handleStageDoubleClick: stageHandlers.handleStageDoubleClick,
    handleStageWheel: stageHandlers.handleStageWheel,
    scaleMotionValue: transform.scaleMotionValue,
    surfaceOpacity: transform.surfaceOpacity,
    targetRect: transform.targetRect,
    translateXMotionValue: transform.translateXMotionValue,
    translateYMotionValue: transform.translateYMotionValue,
  };
}
