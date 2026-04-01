import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  SyntheticEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import type { ReaderImageGalleryEntry } from '../utils/readerImageGallery';
import type {
  ReaderImageViewerNaturalImageSize,
  ReaderImageViewerPoint,
  ReaderImageViewerTransformState,
  ReaderImageViewerViewportSize,
} from '../utils/readerImageViewerTypes';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { peekReaderImageDimensions } from '../utils/readerImageResourceCache';
import { createReaderImageEntryId } from '../utils/readerImageGallery';
import {
  applyScaleAroundPoint,
  applyViewerDamping,
  clampTranslate,
  computeTargetRect,
  DOUBLE_TAP_MAX_DELAY_MS,
  DOUBLE_TAP_MAX_DISTANCE_PX,
  DOUBLE_TAP_ZOOM_SCALE,
  EDGE_SWIPE_THRESHOLD_PX,
  getMaxScale,
  getPointDistance,
  getPointMidpoint,
  getTranslateBounds,
  isTapWithinThreshold,
  PINCH_CLOSE_THRESHOLD,
  SINGLE_CLICK_CLOSE_DELAY_MS,
  SWIPE_NAVIGATION_THRESHOLD_PX,
  TRANSFORM_ANIMATION_MS,
  TRANSLATE_SWIPE_DAMPING,
  TRANSLATE_VERTICAL_DAMPING,
} from '../utils/readerImageViewerTransform';

interface GestureState {
  startCenter?: ReaderImageViewerPoint;
  startDistance?: number;
  startPoint: ReaderImageViewerPoint;
  startScale: number;
  startTranslateX: number;
  startTranslateY: number;
  type: 'pan' | 'pinch';
}

interface TapState {
  point: ReaderImageViewerPoint;
  pointerType: string;
  timeStamp: number;
}

interface UseReaderImageViewerGestureParams {
  activeEntry: ReaderImageGalleryEntry;
  activeIndex: number;
  canNavigateNext: boolean;
  canNavigatePrev: boolean;
  consumeDeferredStageClick: () => boolean;
  entries: ReaderImageGalleryEntry[];
  hasImageResource: boolean;
  novelId: number;
  onClearNavigationTransition: () => void;
  onPrepareNavigationTransition: (direction: -1 | 1, targetEntryId: string) => void;
  onRequestClose: () => void;
  onRequestNavigate: (direction: 'next' | 'prev') => Promise<boolean>;
  suppressDeferredStageClick: () => void;
  viewportSize: ReaderImageViewerViewportSize;
}

interface UseReaderImageViewerGestureResult {
  handleImageLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
  handlePointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handlePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handlePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handlePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => Promise<void>;
  handleStageClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleStageDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleStageWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  isTransformAnimating: boolean;
  targetRect: DOMRect;
  transformState: ReaderImageViewerTransformState;
}

const INITIAL_TRANSFORM_STATE: ReaderImageViewerTransformState = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};

function createInitialNaturalImageSize(
  novelId: number,
  entry: ReaderImageGalleryEntry,
): ReaderImageViewerNaturalImageSize | null {
  const cachedDimensions = peekReaderImageDimensions(novelId, entry.imageKey);
  if (!cachedDimensions || cachedDimensions.width <= 0 || cachedDimensions.height <= 0) {
    return null;
  }

  return {
    height: cachedDimensions.height,
    width: cachedDimensions.width,
  };
}

export function useReaderImageViewerGesture({
  activeEntry,
  activeIndex,
  canNavigateNext,
  canNavigatePrev,
  consumeDeferredStageClick,
  entries,
  hasImageResource,
  novelId,
  onClearNavigationTransition,
  onPrepareNavigationTransition,
  onRequestClose,
  onRequestNavigate,
  suppressDeferredStageClick,
  viewportSize,
}: UseReaderImageViewerGestureParams): UseReaderImageViewerGestureResult {
  const [isTransformAnimating, setIsTransformAnimating] = useState(false);
  const [naturalImageSize, setNaturalImageSize] = useState<
    ReaderImageViewerNaturalImageSize | null
  >(
    () => createInitialNaturalImageSize(novelId, activeEntry),
  );
  const [transformState, setTransformState] = useState<ReaderImageViewerTransformState>(
    INITIAL_TRANSFORM_STATE,
  );
  const animationTimeoutRef = useRef<number | null>(null);
  const closeIntentTimeoutRef = useRef<number | null>(null);
  const activePointersRef = useRef<Map<number, ReaderImageViewerPoint>>(new Map());
  const gestureRef = useRef<GestureState | null>(null);
  const lastTapRef = useRef<TapState | null>(null);
  const suppressNextClickRef = useRef(false);
  const transformStateRef = useRef(transformState);
  const targetRect = useMemo(
    () => computeTargetRect(viewportSize, naturalImageSize),
    [naturalImageSize, viewportSize],
  );
  const maxScale = useMemo(
    () => getMaxScale(targetRect, naturalImageSize),
    [naturalImageSize, targetRect],
  );

  useEffect(() => {
    transformStateRef.current = transformState;
  }, [transformState]);

  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current !== null) {
        window.clearTimeout(animationTimeoutRef.current);
      }
      if (closeIntentTimeoutRef.current !== null) {
        window.clearTimeout(closeIntentTimeoutRef.current);
      }
    };
  }, []);

  const cancelPendingClose = useCallback(() => {
    if (closeIntentTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(closeIntentTimeoutRef.current);
    closeIntentTimeoutRef.current = null;
  }, []);

  const schedulePendingClose = useCallback(() => {
    cancelPendingClose();
    closeIntentTimeoutRef.current = window.setTimeout(() => {
      closeIntentTimeoutRef.current = null;
      onRequestClose();
    }, SINGLE_CLICK_CLOSE_DELAY_MS);
  }, [cancelPendingClose, onRequestClose]);

  const setTransform = useCallback((nextState: ReaderImageViewerTransformState) => {
    setTransformState(nextState);
  }, []);

  const animateTransformTo = useCallback(
    (nextScale: number, nextTranslateX: number, nextTranslateY: number) => {
      if (animationTimeoutRef.current !== null) {
        window.clearTimeout(animationTimeoutRef.current);
      }

      setIsTransformAnimating(true);
      setTransform({
        scale: nextScale,
        translateX: nextTranslateX,
        translateY: nextTranslateY,
      });

      animationTimeoutRef.current = window.setTimeout(() => {
        setIsTransformAnimating(false);
        animationTimeoutRef.current = null;
      }, TRANSFORM_ANIMATION_MS);
    },
    [setTransform],
  );

  const handleImageLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    if (target.naturalWidth <= 0 || target.naturalHeight <= 0) {
      return;
    }

    setNaturalImageSize({
      height: target.naturalHeight,
      width: target.naturalWidth,
    });
  }, []);

  const handleNavigate = useCallback(async (direction: 'next' | 'prev'): Promise<boolean> => {
    const candidateEntry = entries[activeIndex + (direction === 'next' ? 1 : -1)] ?? null;
    if (candidateEntry) {
      onPrepareNavigationTransition(
        direction === 'next' ? 1 : -1,
        createReaderImageEntryId(candidateEntry),
      );
    }

    const didNavigate = await onRequestNavigate(direction);
    if (!didNavigate) {
      onClearNavigationTransition();
      const clamped = clampTranslate(
        targetRect,
        Math.max(1, transformStateRef.current.scale),
        0,
        0,
      );
      animateTransformTo(Math.max(1, transformStateRef.current.scale), clamped.x, clamped.y);
    }

    return didNavigate;
  }, [
    activeIndex,
    animateTransformTo,
    entries,
    onClearNavigationTransition,
    onPrepareNavigationTransition,
    onRequestNavigate,
    targetRect,
  ]);

  const zoomAtPoint = useCallback((point: ReaderImageViewerPoint): boolean => {
    cancelPendingClose();
    if (!naturalImageSize) {
      return false;
    }

    const currentScale = transformStateRef.current.scale;
    const nextScale = currentScale > 1.05 ? 1 : Math.min(DOUBLE_TAP_ZOOM_SCALE, maxScale);
    const nextTranslate = nextScale === 1
      ? { x: 0, y: 0 }
      : applyScaleAroundPoint({
        nextScale,
        point,
        scale: currentScale,
        targetRect,
        translateX: transformStateRef.current.translateX,
        translateY: transformStateRef.current.translateY,
      });
    const clampedTranslate = clampTranslate(
      targetRect,
      nextScale,
      nextTranslate.x,
      nextTranslate.y,
    );
    animateTransformTo(nextScale, clampedTranslate.x, clampedTranslate.y);
    return true;
  }, [animateTransformTo, cancelPendingClose, maxScale, naturalImageSize, targetRect]);

  const handleStageClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressNextClickRef.current || consumeDeferredStageClick()) {
      suppressNextClickRef.current = false;
      cancelPendingClose();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    schedulePendingClose();
  }, [cancelPendingClose, consumeDeferredStageClick, schedulePendingClose]);

  const handleStageWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    cancelPendingClose();
    if (!naturalImageSize || !hasImageResource) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const currentScale = transformStateRef.current.scale;
    const rawNextScale = event.deltaY < 0 ? currentScale * 1.12 : currentScale * 0.88;
    const nextScale = Math.min(Math.max(rawNextScale, 1), maxScale);
    const nextTranslate = applyScaleAroundPoint({
      nextScale,
      point: { x: event.clientX, y: event.clientY },
      scale: currentScale,
      targetRect,
      translateX: transformStateRef.current.translateX,
      translateY: transformStateRef.current.translateY,
    });
    const clampedTranslate = clampTranslate(
      targetRect,
      nextScale,
      nextTranslate.x,
      nextTranslate.y,
    );
    setIsTransformAnimating(false);
    setTransform({
      scale: nextScale,
      translateX: clampedTranslate.x,
      translateY: clampedTranslate.y,
    });
  }, [cancelPendingClose, hasImageResource, maxScale, naturalImageSize, setTransform, targetRect]);

  const handleStageDoubleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    zoomAtPoint({ x: event.clientX, y: event.clientY });
  }, [zoomAtPoint]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    cancelPendingClose();
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    setIsTransformAnimating(false);
    suppressNextClickRef.current = false;

    if (activePointersRef.current.size >= 2) {
      lastTapRef.current = null;
      const [firstPointer, secondPointer] = Array.from(activePointersRef.current.values());
      gestureRef.current = {
        startCenter: getPointMidpoint(firstPointer, secondPointer),
        startDistance: Math.max(1, getPointDistance(firstPointer, secondPointer)),
        startPoint: getPointMidpoint(firstPointer, secondPointer),
        startScale: transformStateRef.current.scale,
        startTranslateX: transformStateRef.current.translateX,
        startTranslateY: transformStateRef.current.translateY,
        type: 'pinch',
      };
      return;
    }

    gestureRef.current = {
      startPoint: {
        x: event.clientX,
        y: event.clientY,
      },
      startScale: transformStateRef.current.scale,
      startTranslateX: transformStateRef.current.translateX,
      startTranslateY: transformStateRef.current.translateY,
      type: 'pan',
    };
  }, [cancelPendingClose]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = activePointersRef.current.get(event.pointerId);
    if (!pointer) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (activePointersRef.current.size >= 2) {
      const [firstPointer, secondPointer] = Array.from(activePointersRef.current.values());
      const midpoint = getPointMidpoint(firstPointer, secondPointer);
      const gesture = gestureRef.current?.type === 'pinch'
        ? gestureRef.current
        : {
          startCenter: midpoint,
          startDistance: Math.max(1, getPointDistance(firstPointer, secondPointer)),
          startPoint: midpoint,
          startScale: transformStateRef.current.scale,
          startTranslateX: transformStateRef.current.translateX,
          startTranslateY: transformStateRef.current.translateY,
          type: 'pinch' as const,
        };
      gestureRef.current = gesture;

      const pinchDistance = Math.max(1, getPointDistance(firstPointer, secondPointer));
      const rawScale =
        gesture.startScale * (pinchDistance / (gesture.startDistance ?? pinchDistance));
      const nextScale = Math.min(Math.max(rawScale, 0.82), maxScale);
      const anchoredTranslate = applyScaleAroundPoint({
        nextScale,
        point: midpoint,
        scale: gesture.startScale,
        targetRect,
        translateX: gesture.startTranslateX,
        translateY: gesture.startTranslateY,
      });
      const centerDeltaX = midpoint.x - (gesture.startCenter?.x ?? midpoint.x);
      const centerDeltaY = midpoint.y - (gesture.startCenter?.y ?? midpoint.y);
      const bounds = getTranslateBounds(targetRect, Math.max(nextScale, 1));
      setTransform({
        scale: nextScale,
        translateX: applyViewerDamping(anchoredTranslate.x + centerDeltaX, bounds.x),
        translateY: applyViewerDamping(anchoredTranslate.y + centerDeltaY, bounds.y),
      });
      return;
    }

    if (gestureRef.current?.type !== 'pan') {
      return;
    }

    const gesture = gestureRef.current;
    const rawDeltaX = event.clientX - gesture.startPoint.x;
    const rawDeltaY = event.clientY - gesture.startPoint.y;
    if (Math.abs(rawDeltaX) > 6 || Math.abs(rawDeltaY) > 6) {
      suppressNextClickRef.current = true;
    }

    if (gesture.startScale <= 1.01) {
      setTransform({
        scale: 1,
        translateX: rawDeltaX * TRANSLATE_SWIPE_DAMPING,
        translateY: rawDeltaY * TRANSLATE_VERTICAL_DAMPING,
      });
      return;
    }

    const bounds = getTranslateBounds(targetRect, gesture.startScale);
    setTransform({
      scale: gesture.startScale,
      translateX: applyViewerDamping(gesture.startTranslateX + rawDeltaX, bounds.x),
      translateY: applyViewerDamping(gesture.startTranslateY + rawDeltaY, bounds.y),
    });
  }, [maxScale, setTransform, targetRect]);

  const finalizeSinglePointerGesture = useCallback(async (
    gesture: GestureState,
    pointerPosition: ReaderImageViewerPoint,
  ) => {
    const rawDeltaX = pointerPosition.x - gesture.startPoint.x;
    const rawDeltaY = pointerPosition.y - gesture.startPoint.y;
    const horizontalIntent = Math.abs(rawDeltaX) > Math.abs(rawDeltaY);
    const nextDirection = rawDeltaX < 0 ? 'next' : 'prev';

    if (gesture.startScale <= 1.01) {
      if (horizontalIntent && Math.abs(rawDeltaX) >= SWIPE_NAVIGATION_THRESHOLD_PX) {
        suppressDeferredStageClick();
        const didNavigate = await handleNavigate(nextDirection);
        if (didNavigate) {
          return;
        }
      }

      animateTransformTo(1, 0, 0);
      return;
    }

    const bounds = getTranslateBounds(targetRect, transformStateRef.current.scale);
    const clamped = clampTranslate(
      targetRect,
      Math.max(1, transformStateRef.current.scale),
      transformStateRef.current.translateX,
      transformStateRef.current.translateY,
    );
    const isAtHorizontalEdge = nextDirection === 'next'
      ? clamped.x <= -bounds.x + 0.5
      : clamped.x >= bounds.x - 0.5;
    if (horizontalIntent && isAtHorizontalEdge && Math.abs(rawDeltaX) >= EDGE_SWIPE_THRESHOLD_PX) {
      const canNavigate = nextDirection === 'next' ? canNavigateNext : canNavigatePrev;
      if (canNavigate) {
        suppressDeferredStageClick();
        const didNavigate = await handleNavigate(nextDirection);
        if (didNavigate) {
          return;
        }
      }
    }

    animateTransformTo(Math.max(1, transformStateRef.current.scale), clamped.x, clamped.y);
  }, [
    animateTransformTo,
    canNavigateNext,
    canNavigatePrev,
    handleNavigate,
    suppressDeferredStageClick,
    targetRect,
  ]);

  const handlePointerUp = useCallback(async (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(event.pointerId)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const previousGesture = gestureRef.current;
    activePointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    if (activePointersRef.current.size >= 2) {
      const [firstPointer, secondPointer] = Array.from(activePointersRef.current.values());
      gestureRef.current = {
        startCenter: getPointMidpoint(firstPointer, secondPointer),
        startDistance: Math.max(1, getPointDistance(firstPointer, secondPointer)),
        startPoint: getPointMidpoint(firstPointer, secondPointer),
        startScale: transformStateRef.current.scale,
        startTranslateX: transformStateRef.current.translateX,
        startTranslateY: transformStateRef.current.translateY,
        type: 'pinch',
      };
      return;
    }

    if (activePointersRef.current.size === 1) {
      if (
        previousGesture?.type === 'pinch'
        && transformStateRef.current.scale < PINCH_CLOSE_THRESHOLD
      ) {
        gestureRef.current = null;
        onRequestClose();
        return;
      }

      const [remainingPointer] = Array.from(activePointersRef.current.values());
      gestureRef.current = {
        startPoint: remainingPointer,
        startScale: transformStateRef.current.scale,
        startTranslateX: transformStateRef.current.translateX,
        startTranslateY: transformStateRef.current.translateY,
        type: 'pan',
      };
      return;
    }

    const gesture = gestureRef.current;
    gestureRef.current = null;
    const pointerPosition = {
      x: event.clientX,
      y: event.clientY,
    };
    const didPanBeyondTapThreshold = gesture?.type === 'pan'
      && !isTapWithinThreshold(gesture.startPoint, pointerPosition);

    if (gesture?.type === 'pinch') {
      lastTapRef.current = null;
      suppressNextClickRef.current = true;
      if (transformStateRef.current.scale < PINCH_CLOSE_THRESHOLD) {
        onRequestClose();
        return;
      }

      const clamped = clampTranslate(
        targetRect,
        Math.max(1, transformStateRef.current.scale),
        transformStateRef.current.translateX,
        transformStateRef.current.translateY,
      );
      animateTransformTo(Math.max(1, transformStateRef.current.scale), clamped.x, clamped.y);
      return;
    }

    if (didPanBeyondTapThreshold) {
      suppressNextClickRef.current = true;
      lastTapRef.current = null;
    }

    if (
      gesture?.type === 'pan'
      && event.pointerType !== 'mouse'
      && isTapWithinThreshold(gesture.startPoint, pointerPosition)
    ) {
      const previousTap = lastTapRef.current;
      const currentTapTime = event.timeStamp > 0 ? event.timeStamp : Date.now();
      if (
        previousTap
        && previousTap.pointerType === event.pointerType
        && currentTapTime - previousTap.timeStamp <= DOUBLE_TAP_MAX_DELAY_MS
        && getPointDistance(previousTap.point, pointerPosition) <= DOUBLE_TAP_MAX_DISTANCE_PX
      ) {
        lastTapRef.current = null;
        suppressNextClickRef.current = true;
        if (zoomAtPoint(pointerPosition)) {
          return;
        }
      } else {
        lastTapRef.current = {
          point: pointerPosition,
          pointerType: event.pointerType,
          timeStamp: currentTapTime,
        };
      }
    } else {
      lastTapRef.current = null;
    }

    if (gesture?.type === 'pan') {
      await finalizeSinglePointerGesture(gesture, pointerPosition);
    }
  }, [
    animateTransformTo,
    finalizeSinglePointerGesture,
    onRequestClose,
    targetRect,
    zoomAtPoint,
  ]);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);
    lastTapRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    if (activePointersRef.current.size === 0) {
      gestureRef.current = null;
      const clamped = clampTranslate(
        targetRect,
        Math.max(1, transformStateRef.current.scale),
        transformStateRef.current.translateX,
        transformStateRef.current.translateY,
      );
      animateTransformTo(Math.max(1, transformStateRef.current.scale), clamped.x, clamped.y);
    }
  }, [animateTransformTo, targetRect]);

  return {
    handleImageLoad,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleStageClick,
    handleStageDoubleClick,
    handleStageWheel,
    isTransformAnimating,
    targetRect,
    transformState,
  };
}
