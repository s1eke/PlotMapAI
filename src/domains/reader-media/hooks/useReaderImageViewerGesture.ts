import type { AnimationPlaybackControls, MotionValue } from 'motion/react';
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
import { flushSync } from 'react-dom';
import { animate, useMotionValue } from 'motion/react';

import { peekReaderImageDimensions } from '../utils/readerImageResourceCache';
import { createReaderImageEntryId } from '../utils/readerImageGallery';
import {
  applyScaleAroundPoint,
  applyViewerDamping,
  buildDragDismissTransform,
  clampTranslate,
  computeTargetRect,
  DOUBLE_TAP_MAX_DELAY_MS,
  DOUBLE_TAP_MAX_DISTANCE_PX,
  DOUBLE_TAP_ZOOM_SCALE,
  DRAG_DISMISS_EXIT_DURATION_S,
  DRAG_DISMISS_EXIT_SCALE,
  DRAG_DISMISS_VELOCITY_PX_PER_S,
  EDGE_SWIPE_THRESHOLD_PX,
  getDragDismissExitTranslateY,
  getDragDismissThresholdPx,
  getMaxScale,
  getPointDistance,
  getPointMidpoint,
  getTranslateBounds,
  isTapWithinThreshold,
  PAN_DIRECTION_LOCK_DISTANCE_PX,
  PAN_DIRECTION_LOCK_RATIO,
  PINCH_CLOSE_THRESHOLD,
  SINGLE_CLICK_CLOSE_DELAY_MS,
  SWIPE_NAVIGATION_THRESHOLD_PX,
  TRANSLATE_SWIPE_DAMPING,
  TRANSLATE_VERTICAL_DAMPING,
} from '../utils/readerImageViewerTransform';

type PanGestureIntent = 'dismiss' | 'navigate' | 'undecided';

interface GestureState {
  lastPoint: ReaderImageViewerPoint;
  lastTime: number;
  panIntent: PanGestureIntent;
  startCenter?: ReaderImageViewerPoint;
  startDistance?: number;
  startPoint: ReaderImageViewerPoint;
  startScale: number;
  startTime: number;
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
  dismissProgress: MotionValue<number>;
  entries: ReaderImageGalleryEntry[];
  hasImageResource: boolean;
  isNavigationTransitionPending: boolean;
  novelId: number;
  onClearNavigationTransition: () => void;
  onPrepareNavigationTransition: (direction: -1 | 1, targetEntryId: string) => void;
  onRequestClose: () => void;
  onRequestDismissClose: () => void;
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
  scaleMotionValue: MotionValue<number>;
  surfaceOpacity: MotionValue<number>;
  targetRect: DOMRect;
  translateXMotionValue: MotionValue<number>;
  translateYMotionValue: MotionValue<number>;
}

const INITIAL_TRANSFORM_STATE: ReaderImageViewerTransformState = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};

const TRANSFORM_SPRING = {
  damping: 38,
  mass: 0.92,
  stiffness: 440,
  type: 'spring',
} as const;

const DRAG_DISMISS_EXIT_TRANSITION = {
  duration: DRAG_DISMISS_EXIT_DURATION_S,
  ease: [0.22, 1, 0.36, 1],
} as const;

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

function createGestureState(
  point: ReaderImageViewerPoint,
  pointerType: string,
  startTransformState: ReaderImageViewerTransformState,
  timeStamp: number,
): GestureState {
  return {
    lastPoint: point,
    lastTime: timeStamp,
    panIntent: pointerType === 'mouse' ? 'navigate' : 'undecided',
    startPoint: point,
    startScale: startTransformState.scale,
    startTime: timeStamp,
    startTranslateX: startTransformState.translateX,
    startTranslateY: startTransformState.translateY,
    type: 'pan',
  };
}

function resolvePointerTimeStamp(timeStamp: number): number {
  return timeStamp > 0 ? timeStamp : Date.now();
}

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
  const [naturalImageSize, setNaturalImageSize] = useState<
    ReaderImageViewerNaturalImageSize | null
  >(
    () => createInitialNaturalImageSize(novelId, activeEntry),
  );
  const activePointersRef = useRef<Map<number, ReaderImageViewerPoint>>(new Map());
  const animationControlsRef = useRef<AnimationPlaybackControls[]>([]);
  const closeIntentTimeoutRef = useRef<number | null>(null);
  const dismissCloseTimeoutRef = useRef<number | null>(null);
  const dragDismissClosingRef = useRef(false);
  const gestureRef = useRef<GestureState | null>(null);
  const lastTapRef = useRef<TapState | null>(null);
  const suppressNextClickRef = useRef(false);
  const scaleMotionValue = useMotionValue(1);
  const surfaceOpacity = useMotionValue(1);
  const targetRect = useMemo(
    () => computeTargetRect(viewportSize, naturalImageSize),
    [naturalImageSize, viewportSize],
  );
  const translateXMotionValue = useMotionValue(0);
  const translateYMotionValue = useMotionValue(0);
  const maxScale = useMemo(
    () => getMaxScale(targetRect, naturalImageSize),
    [naturalImageSize, targetRect],
  );

  const stopMotionAnimations = useCallback((): void => {
    for (const control of animationControlsRef.current) {
      control.stop();
    }
    animationControlsRef.current = [];
  }, []);

  const startMotionAnimation = useCallback((
    value: MotionValue<number>,
    nextValue: number,
    transition: typeof TRANSFORM_SPRING | typeof DRAG_DISMISS_EXIT_TRANSITION,
  ): AnimationPlaybackControls => {
    const control = animate(value, nextValue, transition);
    animationControlsRef.current.push(control);
    return control;
  }, []);

  const readTransformState = useCallback((): ReaderImageViewerTransformState => ({
    scale: scaleMotionValue.get(),
    translateX: translateXMotionValue.get(),
    translateY: translateYMotionValue.get(),
  }), [scaleMotionValue, translateXMotionValue, translateYMotionValue]);

  const setTransformState = useCallback(
    (nextTransformState: ReaderImageViewerTransformState): void => {
      scaleMotionValue.set(nextTransformState.scale);
      translateXMotionValue.set(nextTransformState.translateX);
      translateYMotionValue.set(nextTransformState.translateY);
    },
    [scaleMotionValue, translateXMotionValue, translateYMotionValue],
  );

  const clearPendingClose = useCallback((): void => {
    if (closeIntentTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(closeIntentTimeoutRef.current);
    closeIntentTimeoutRef.current = null;
  }, []);

  const clearPendingDismissClose = useCallback((): void => {
    if (dismissCloseTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(dismissCloseTimeoutRef.current);
    dismissCloseTimeoutRef.current = null;
  }, []);

  const animateTransform = useCallback((
    nextTransformState: ReaderImageViewerTransformState,
    resetDismissPreview: boolean,
  ): void => {
    stopMotionAnimations();
    startMotionAnimation(scaleMotionValue, nextTransformState.scale, TRANSFORM_SPRING);
    startMotionAnimation(translateXMotionValue, nextTransformState.translateX, TRANSFORM_SPRING);
    startMotionAnimation(translateYMotionValue, nextTransformState.translateY, TRANSFORM_SPRING);

    if (resetDismissPreview) {
      dragDismissClosingRef.current = false;
      startMotionAnimation(dismissProgress, 0, TRANSFORM_SPRING);
      startMotionAnimation(surfaceOpacity, 1, TRANSFORM_SPRING);
    }
  }, [
    dismissProgress,
    scaleMotionValue,
    startMotionAnimation,
    stopMotionAnimations,
    surfaceOpacity,
    translateXMotionValue,
    translateYMotionValue,
  ]);

  const animateBackToCenter = useCallback((): void => {
    animateTransform(INITIAL_TRANSFORM_STATE, true);
  }, [animateTransform]);

  const beginDragDismissClose = useCallback((rawDeltaX: number, rawDeltaY: number): void => {
    stopMotionAnimations();
    clearPendingClose();
    clearPendingDismissClose();
    suppressNextClickRef.current = true;
    dragDismissClosingRef.current = true;

    const previewTransform = buildDragDismissTransform(rawDeltaX, rawDeltaY, viewportSize);
    const exitScale = Math.min(previewTransform.scale, DRAG_DISMISS_EXIT_SCALE);
    const exitTranslateY = getDragDismissExitTranslateY(previewTransform.translateY, viewportSize);

    scaleMotionValue.set(previewTransform.scale);
    translateXMotionValue.set(previewTransform.translateX);
    translateYMotionValue.set(previewTransform.translateY);
    dismissProgress.set(previewTransform.progress);
    surfaceOpacity.set(1);

    startMotionAnimation(dismissProgress, 1, DRAG_DISMISS_EXIT_TRANSITION);
    startMotionAnimation(scaleMotionValue, exitScale, DRAG_DISMISS_EXIT_TRANSITION);
    startMotionAnimation(
      translateXMotionValue,
      previewTransform.translateX * 1.12,
      DRAG_DISMISS_EXIT_TRANSITION,
    );
    startMotionAnimation(surfaceOpacity, 0, DRAG_DISMISS_EXIT_TRANSITION);
    startMotionAnimation(translateYMotionValue, exitTranslateY, DRAG_DISMISS_EXIT_TRANSITION);
    dismissCloseTimeoutRef.current = window.setTimeout(() => {
      dismissCloseTimeoutRef.current = null;
      dragDismissClosingRef.current = false;
      onRequestDismissClose();
    }, Math.ceil(DRAG_DISMISS_EXIT_DURATION_S * 1000));
  }, [
    clearPendingClose,
    clearPendingDismissClose,
    dismissProgress,
    onRequestDismissClose,
    scaleMotionValue,
    startMotionAnimation,
    stopMotionAnimations,
    surfaceOpacity,
    translateXMotionValue,
    translateYMotionValue,
    viewportSize,
  ]);

  useEffect(() => {
    return () => {
      clearPendingClose();
      clearPendingDismissClose();
      stopMotionAnimations();
    };
  }, [clearPendingClose, clearPendingDismissClose, stopMotionAnimations]);

  const updateGestureVelocityState = useCallback((
    gesture: GestureState,
    point: ReaderImageViewerPoint,
    timeStamp: number,
  ): GestureState => ({
    ...gesture,
    lastPoint: point,
    lastTime: timeStamp,
  }), []);

  const readReleaseVelocityY = useCallback((
    gesture: GestureState,
    point: ReaderImageViewerPoint,
    timeStamp: number,
  ): number => {
    const elapsedFromLastMove = Math.max(1, timeStamp - gesture.lastTime);
    if (elapsedFromLastMove <= 48) {
      return ((point.y - gesture.lastPoint.y) / elapsedFromLastMove) * 1000;
    }

    return ((point.y - gesture.startPoint.y) / Math.max(1, timeStamp - gesture.startTime)) * 1000;
  }, []);

  const resolvePanIntent = useCallback((
    rawDeltaX: number,
    rawDeltaY: number,
    pointerType: string,
  ): PanGestureIntent => {
    if (
      pointerType !== 'mouse'
      && rawDeltaY > 0
      && Math.abs(rawDeltaY) > Math.abs(rawDeltaX) * PAN_DIRECTION_LOCK_RATIO
    ) {
      return 'dismiss';
    }

    if (Math.abs(rawDeltaX) > Math.abs(rawDeltaY) * PAN_DIRECTION_LOCK_RATIO) {
      return 'navigate';
    }

    return 'undecided';
  }, []);

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
    onClearNavigationTransition,
    onPrepareNavigationTransition,
    onRequestNavigate,
    readTransformState,
    targetRect,
    isNavigationTransitionPending,
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
    closeIntentTimeoutRef.current = window.setTimeout(() => {
      closeIntentTimeoutRef.current = null;
      onRequestClose();
    }, SINGLE_CLICK_CLOSE_DELAY_MS);
  }, [clearPendingClose, consumeDeferredStageClick, isNavigationTransitionPending, onRequestClose]);

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
  }, [isNavigationTransitionPending, zoomAtPoint]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (isNavigationTransitionPending) {
      suppressNextClickRef.current = true;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (dragDismissClosingRef.current) {
      return;
    }

    clearPendingClose();
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const currentTransformState = readTransformState();
    stopMotionAnimations();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    suppressNextClickRef.current = false;

    const timeStamp = resolvePointerTimeStamp(event.timeStamp);
    if (activePointersRef.current.size >= 2) {
      lastTapRef.current = null;
      dismissProgress.set(0);
      surfaceOpacity.set(1);
      const [firstPointer, secondPointer] = Array.from(activePointersRef.current.values());
      gestureRef.current = {
        lastPoint: getPointMidpoint(firstPointer, secondPointer),
        lastTime: timeStamp,
        panIntent: 'navigate',
        startCenter: getPointMidpoint(firstPointer, secondPointer),
        startDistance: Math.max(1, getPointDistance(firstPointer, secondPointer)),
        startPoint: getPointMidpoint(firstPointer, secondPointer),
        startScale: currentTransformState.scale,
        startTime: timeStamp,
        startTranslateX: currentTransformState.translateX,
        startTranslateY: currentTransformState.translateY,
        type: 'pinch',
      };
      return;
    }

    gestureRef.current = createGestureState({
      x: event.clientX,
      y: event.clientY,
    }, event.pointerType, currentTransformState, timeStamp);
  }, [
    clearPendingClose,
    dismissProgress,
    readTransformState,
    stopMotionAnimations,
    surfaceOpacity,
    isNavigationTransitionPending,
  ]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragDismissClosingRef.current) {
      return;
    }

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

    const timeStamp = resolvePointerTimeStamp(event.timeStamp);
    if (activePointersRef.current.size >= 2) {
      dismissProgress.set(0);
      surfaceOpacity.set(1);

      const [firstPointer, secondPointer] = Array.from(activePointersRef.current.values());
      const midpoint = getPointMidpoint(firstPointer, secondPointer);
      const currentTransformState = readTransformState();
      const gesture = gestureRef.current?.type === 'pinch'
        ? gestureRef.current
        : {
          lastPoint: midpoint,
          lastTime: timeStamp,
          panIntent: 'navigate' as const,
          startCenter: midpoint,
          startDistance: Math.max(1, getPointDistance(firstPointer, secondPointer)),
          startPoint: midpoint,
          startScale: currentTransformState.scale,
          startTime: timeStamp,
          startTranslateX: currentTransformState.translateX,
          startTranslateY: currentTransformState.translateY,
          type: 'pinch' as const,
        };
      const nextGesture = updateGestureVelocityState(gesture, midpoint, timeStamp);
      gestureRef.current = nextGesture;

      const pinchDistance = Math.max(1, getPointDistance(firstPointer, secondPointer));
      const rawScale =
        nextGesture.startScale * (pinchDistance / (nextGesture.startDistance ?? pinchDistance));
      const nextScale = Math.min(Math.max(rawScale, 0.82), maxScale);
      const anchoredTranslate = applyScaleAroundPoint({
        nextScale,
        point: midpoint,
        scale: nextGesture.startScale,
        targetRect,
        translateX: nextGesture.startTranslateX,
        translateY: nextGesture.startTranslateY,
      });
      const centerDeltaX = midpoint.x - (nextGesture.startCenter?.x ?? midpoint.x);
      const centerDeltaY = midpoint.y - (nextGesture.startCenter?.y ?? midpoint.y);
      const bounds = getTranslateBounds(targetRect, Math.max(nextScale, 1));
      setTransformState({
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

    const nextGesture = updateGestureVelocityState(
      gesture,
      { x: event.clientX, y: event.clientY },
      timeStamp,
    );
    gestureRef.current = nextGesture;

    if (nextGesture.startScale <= 1.01) {
      const distanceTravelled = Math.hypot(rawDeltaX, rawDeltaY);
      if (
        nextGesture.panIntent === 'undecided'
        && distanceTravelled >= PAN_DIRECTION_LOCK_DISTANCE_PX
      ) {
        gestureRef.current = {
          ...nextGesture,
          panIntent: resolvePanIntent(rawDeltaX, rawDeltaY, event.pointerType),
        };
      }
      const currentPanGesture = gestureRef.current ?? nextGesture;

      if (currentPanGesture.panIntent === 'dismiss') {
        clearPendingClose();
        const dismissTransform = buildDragDismissTransform(rawDeltaX, rawDeltaY, viewportSize);
        dismissProgress.set(dismissTransform.progress);
        surfaceOpacity.set(1);
        setTransformState({
          scale: dismissTransform.scale,
          translateX: dismissTransform.translateX,
          translateY: dismissTransform.translateY,
        });
        return;
      }

      dismissProgress.set(0);
      surfaceOpacity.set(1);

      if (currentPanGesture.panIntent === 'navigate') {
        setTransformState({
          scale: 1,
          translateX: rawDeltaX * TRANSLATE_SWIPE_DAMPING,
          translateY: rawDeltaY * TRANSLATE_VERTICAL_DAMPING,
        });
        return;
      }

      setTransformState(INITIAL_TRANSFORM_STATE);
      return;
    }

    dismissProgress.set(0);
    surfaceOpacity.set(1);
    const bounds = getTranslateBounds(targetRect, gesture.startScale);
    setTransformState({
      scale: gesture.startScale,
      translateX: applyViewerDamping(gesture.startTranslateX + rawDeltaX, bounds.x),
      translateY: applyViewerDamping(gesture.startTranslateY + rawDeltaY, bounds.y),
    });
  }, [
    clearPendingClose,
    dismissProgress,
    maxScale,
    readTransformState,
    resolvePanIntent,
    setTransformState,
    surfaceOpacity,
    targetRect,
    updateGestureVelocityState,
    viewportSize,
  ]);

  const finalizeSinglePointerGesture = useCallback(async (
    gesture: GestureState,
    pointerPosition: ReaderImageViewerPoint,
    pointerType: string,
    timeStamp: number,
  ) => {
    const rawDeltaX = pointerPosition.x - gesture.startPoint.x;
    const rawDeltaY = pointerPosition.y - gesture.startPoint.y;
    const nextDirection = rawDeltaX < 0 ? 'next' : 'prev';

    if (gesture.startScale <= 1.01) {
      const distanceTravelled = Math.hypot(rawDeltaX, rawDeltaY);
      let { panIntent } = gesture;
      if (panIntent === 'undecided' && distanceTravelled >= PAN_DIRECTION_LOCK_DISTANCE_PX) {
        panIntent = resolvePanIntent(rawDeltaX, rawDeltaY, pointerType);
      }

      if (panIntent === 'dismiss') {
        const shouldDismiss =
          Math.max(0, rawDeltaY) >= getDragDismissThresholdPx(viewportSize)
          || readReleaseVelocityY(gesture, pointerPosition, timeStamp)
            >= DRAG_DISMISS_VELOCITY_PX_PER_S;
        if (shouldDismiss) {
          suppressDeferredStageClick();
          beginDragDismissClose(rawDeltaX, rawDeltaY);
          return;
        }

        animateBackToCenter();
        return;
      }

      if (panIntent === 'navigate' && Math.abs(rawDeltaX) >= SWIPE_NAVIGATION_THRESHOLD_PX) {
        suppressDeferredStageClick();
        const didNavigate = await handleNavigate(nextDirection);
        if (didNavigate) {
          return;
        }
      }

      animateBackToCenter();
      return;
    }

    const currentTransformState = readTransformState();
    const bounds = getTranslateBounds(targetRect, currentTransformState.scale);
    const clamped = clampTranslate(
      targetRect,
      Math.max(1, currentTransformState.scale),
      currentTransformState.translateX,
      currentTransformState.translateY,
    );
    const horizontalIntent = Math.abs(rawDeltaX) > Math.abs(rawDeltaY);
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

    animateTransform({
      scale: Math.max(1, currentTransformState.scale),
      translateX: clamped.x,
      translateY: clamped.y,
    }, true);
  }, [
    animateBackToCenter,
    animateTransform,
    beginDragDismissClose,
    canNavigateNext,
    canNavigatePrev,
    handleNavigate,
    readReleaseVelocityY,
    readTransformState,
    resolvePanIntent,
    suppressDeferredStageClick,
    targetRect,
    viewportSize,
  ]);

  const handlePointerUp = useCallback(async (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragDismissClosingRef.current || !activePointersRef.current.has(event.pointerId)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const previousGesture = gestureRef.current;
    activePointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    const timeStamp = resolvePointerTimeStamp(event.timeStamp);
    if (activePointersRef.current.size >= 2) {
      const [firstPointer, secondPointer] = Array.from(activePointersRef.current.values());
      const currentTransformState = readTransformState();
      gestureRef.current = {
        lastPoint: getPointMidpoint(firstPointer, secondPointer),
        lastTime: timeStamp,
        panIntent: 'navigate',
        startCenter: getPointMidpoint(firstPointer, secondPointer),
        startDistance: Math.max(1, getPointDistance(firstPointer, secondPointer)),
        startPoint: getPointMidpoint(firstPointer, secondPointer),
        startScale: currentTransformState.scale,
        startTime: timeStamp,
        startTranslateX: currentTransformState.translateX,
        startTranslateY: currentTransformState.translateY,
        type: 'pinch',
      };
      return;
    }

    if (activePointersRef.current.size === 1) {
      if (
        previousGesture?.type === 'pinch'
        && readTransformState().scale < PINCH_CLOSE_THRESHOLD
      ) {
        gestureRef.current = null;
        onRequestClose();
        return;
      }

      const [remainingPointer] = Array.from(activePointersRef.current.values());
      const currentTransformState = readTransformState();
      gestureRef.current = {
        lastPoint: remainingPointer,
        lastTime: timeStamp,
        panIntent: event.pointerType === 'mouse' ? 'navigate' : 'undecided',
        startPoint: remainingPointer,
        startScale: currentTransformState.scale,
        startTime: timeStamp,
        startTranslateX: currentTransformState.translateX,
        startTranslateY: currentTransformState.translateY,
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
      if (readTransformState().scale < PINCH_CLOSE_THRESHOLD) {
        onRequestClose();
        return;
      }

      const currentTransformState = readTransformState();
      const clamped = clampTranslate(
        targetRect,
        Math.max(1, currentTransformState.scale),
        currentTransformState.translateX,
        currentTransformState.translateY,
      );
      animateTransform({
        scale: Math.max(1, currentTransformState.scale),
        translateX: clamped.x,
        translateY: clamped.y,
      }, true);
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
      if (
        previousTap
        && previousTap.pointerType === event.pointerType
        && timeStamp - previousTap.timeStamp <= DOUBLE_TAP_MAX_DELAY_MS
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
          timeStamp,
        };
      }
    } else {
      lastTapRef.current = null;
    }

    if (gesture?.type === 'pan') {
      await finalizeSinglePointerGesture(gesture, pointerPosition, event.pointerType, timeStamp);
    }
  }, [
    animateTransform,
    finalizeSinglePointerGesture,
    onRequestClose,
    readTransformState,
    targetRect,
    zoomAtPoint,
  ]);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragDismissClosingRef.current) {
      return;
    }

    activePointersRef.current.delete(event.pointerId);
    lastTapRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    if (activePointersRef.current.size === 0) {
      gestureRef.current = null;
      animateBackToCenter();
    }
  }, [animateBackToCenter]);

  return {
    handleImageLoad,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleStageClick,
    handleStageDoubleClick,
    handleStageWheel,
    scaleMotionValue,
    surfaceOpacity,
    targetRect,
    translateXMotionValue,
    translateYMotionValue,
  };
}
