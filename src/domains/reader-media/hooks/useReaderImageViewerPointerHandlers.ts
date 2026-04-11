import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react';
import type {
  GestureState,
  ReaderImageViewerTransformController,
  TapState,
} from './readerImageViewerGestureTypes';

import { useCallback } from 'react';

import {
  applyViewerDamping,
  buildDragDismissTransform,
  clampTranslate,
  DOUBLE_TAP_MAX_DELAY_MS,
  DOUBLE_TAP_MAX_DISTANCE_PX,
  getPointDistance,
  getTranslateBounds,
  isTapWithinThreshold,
  PAN_DIRECTION_LOCK_DISTANCE_PX,
  PINCH_CLOSE_THRESHOLD,
  TRANSLATE_SWIPE_DAMPING,
  TRANSLATE_VERTICAL_DAMPING,
} from '../utils/readerImageViewerTransform';
import {
  createGestureState,
  resolvePanIntent,
  resolvePointerTimeStamp,
  updateGestureVelocityState,
} from './readerImageViewerGestureMath';
import {
  createPanGestureStateFromPoint,
  createPinchGestureState,
  finalizeSinglePointerGesture as finalizePointerGesture,
  resolvePinchTransform,
} from './readerImageViewerPointerMath';

interface UseReaderImageViewerPointerHandlersResult {
  handlePointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handlePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handlePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handlePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => Promise<void>;
}

export function useReaderImageViewerPointerHandlers(params: {
  activePointersRef: MutableRefObject<Map<number, { x: number; y: number }>>;
  canNavigateNext: boolean;
  canNavigatePrev: boolean;
  gestureRef: MutableRefObject<GestureState | null>;
  handleNavigate: (direction: 'next' | 'prev') => Promise<boolean>;
  isNavigationTransitionPending: boolean;
  lastTapRef: MutableRefObject<TapState | null>;
  onRequestClose: () => void;
  suppressDeferredStageClick: () => void;
  suppressNextClickRef: MutableRefObject<boolean>;
  transform: ReaderImageViewerTransformController;
  viewportSize: import('../utils/readerImageViewerTypes').ReaderImageViewerViewportSize;
  zoomAtPoint: (point: { x: number; y: number }) => boolean;
}): UseReaderImageViewerPointerHandlersResult {
  const {
    activePointersRef,
    canNavigateNext,
    canNavigatePrev,
    gestureRef,
    handleNavigate,
    isNavigationTransitionPending,
    lastTapRef,
    onRequestClose,
    suppressDeferredStageClick,
    suppressNextClickRef,
    transform,
    viewportSize,
    zoomAtPoint,
  } = params;
  const {
    animateBackToCenter,
    animateTransform,
    beginDragDismissClose,
    clearPendingClose,
    dismissProgress,
    dragDismissClosingRef,
    maxScale,
    readTransformState,
    setTransformState,
    stopMotionAnimations,
    surfaceOpacity,
    targetRect,
  } = transform;

  const finalizeSinglePointerGesture = useCallback((
    gesture: GestureState,
    pointerPosition: { x: number; y: number },
    pointerType: string,
    timeStamp: number,
  ) => {
    return finalizePointerGesture({
      animateBackToCenter,
      animateTransform,
      beginDragDismissClose,
      canNavigateNext,
      canNavigatePrev,
      gesture,
      handleNavigate,
      pointerPosition,
      pointerType,
      readTransformState,
      suppressDeferredStageClick,
      targetRect,
      timeStamp,
      viewportSize,
    });
  }, [
    animateBackToCenter,
    animateTransform,
    beginDragDismissClose,
    canNavigateNext,
    canNavigatePrev,
    handleNavigate,
    readTransformState,
    suppressDeferredStageClick,
    targetRect,
    viewportSize,
  ]);

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
      gestureRef.current = createPinchGestureState({
        firstPointer,
        secondPointer,
        timeStamp,
        transformState: currentTransformState,
      });
      return;
    }

    gestureRef.current = createGestureState({
      x: event.clientX,
      y: event.clientY,
    }, event.pointerType, currentTransformState, timeStamp);
  }, [
    activePointersRef,
    clearPendingClose,
    dismissProgress,
    dragDismissClosingRef,
    gestureRef,
    isNavigationTransitionPending,
    lastTapRef,
    readTransformState,
    stopMotionAnimations,
    surfaceOpacity,
    suppressNextClickRef,
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
      const currentTransformState = readTransformState();
      const pinch = resolvePinchTransform({
        firstPointer,
        secondPointer,
        gesture: gestureRef.current ?? createPinchGestureState({
          firstPointer,
          secondPointer,
          timeStamp,
          transformState: currentTransformState,
        }),
        maxScale,
        targetRect,
        timeStamp,
        transformState: currentTransformState,
      });
      gestureRef.current = pinch.gesture;
      setTransformState(pinch.transformState);
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

      setTransformState({
        scale: 1,
        translateX: 0,
        translateY: 0,
      });
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
    activePointersRef,
    clearPendingClose,
    dismissProgress,
    dragDismissClosingRef,
    gestureRef,
    maxScale,
    readTransformState,
    setTransformState,
    surfaceOpacity,
    suppressNextClickRef,
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
      gestureRef.current = createPinchGestureState({
        firstPointer,
        secondPointer,
        timeStamp,
        transformState: currentTransformState,
      });
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
      gestureRef.current = createPanGestureStateFromPoint({
        point: remainingPointer,
        pointerType: event.pointerType,
        timeStamp,
        transformState: readTransformState(),
      });
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
    activePointersRef,
    animateTransform,
    dragDismissClosingRef,
    finalizeSinglePointerGesture,
    gestureRef,
    lastTapRef,
    onRequestClose,
    readTransformState,
    suppressNextClickRef,
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
  }, [activePointersRef, animateBackToCenter, dragDismissClosingRef, gestureRef, lastTapRef]);

  return {
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
