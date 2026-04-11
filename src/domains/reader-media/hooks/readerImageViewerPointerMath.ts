import type { GestureState } from './readerImageViewerGestureTypes';
import type {
  ReaderImageViewerPoint,
  ReaderImageViewerTransformState,
} from '../utils/readerImageViewerTypes';

import {
  applyScaleAroundPoint,
  applyViewerDamping,
  clampTranslate,
  DRAG_DISMISS_VELOCITY_PX_PER_S,
  EDGE_SWIPE_THRESHOLD_PX,
  getDragDismissThresholdPx,
  getPointDistance,
  getPointMidpoint,
  getTranslateBounds,
  PAN_DIRECTION_LOCK_DISTANCE_PX,
  SWIPE_NAVIGATION_THRESHOLD_PX,
} from '../utils/readerImageViewerTransform';
import {
  readReleaseVelocityY,
  resolvePanIntent,
} from './readerImageViewerGestureMath';

export function createPinchGestureState(params: {
  firstPointer: ReaderImageViewerPoint;
  secondPointer: ReaderImageViewerPoint;
  timeStamp: number;
  transformState: ReaderImageViewerTransformState;
}): GestureState {
  const midpoint = getPointMidpoint(params.firstPointer, params.secondPointer);

  return {
    lastPoint: midpoint,
    lastTime: params.timeStamp,
    panIntent: 'navigate',
    startCenter: midpoint,
    startDistance: Math.max(1, getPointDistance(params.firstPointer, params.secondPointer)),
    startPoint: midpoint,
    startScale: params.transformState.scale,
    startTime: params.timeStamp,
    startTranslateX: params.transformState.translateX,
    startTranslateY: params.transformState.translateY,
    type: 'pinch',
  };
}

export function createPanGestureStateFromPoint(params: {
  point: ReaderImageViewerPoint;
  pointerType: string;
  timeStamp: number;
  transformState: ReaderImageViewerTransformState;
}): GestureState {
  return {
    lastPoint: params.point,
    lastTime: params.timeStamp,
    panIntent: params.pointerType === 'mouse' ? 'navigate' : 'undecided',
    startPoint: params.point,
    startScale: params.transformState.scale,
    startTime: params.timeStamp,
    startTranslateX: params.transformState.translateX,
    startTranslateY: params.transformState.translateY,
    type: 'pan',
  };
}

export function resolvePinchTransform(params: {
  firstPointer: ReaderImageViewerPoint;
  secondPointer: ReaderImageViewerPoint;
  gesture: GestureState;
  maxScale: number;
  targetRect: DOMRect;
  timeStamp: number;
  transformState: ReaderImageViewerTransformState;
}): {
    gesture: GestureState;
    transformState: ReaderImageViewerTransformState;
  } {
  const midpoint = getPointMidpoint(params.firstPointer, params.secondPointer);
  const nextGesture = params.gesture.type === 'pinch'
    ? {
      ...params.gesture,
      lastPoint: midpoint,
      lastTime: params.timeStamp,
    }
    : createPinchGestureState({
      firstPointer: params.firstPointer,
      secondPointer: params.secondPointer,
      timeStamp: params.timeStamp,
      transformState: params.transformState,
    });
  const pinchDistance = Math.max(1, getPointDistance(params.firstPointer, params.secondPointer));
  const rawScale =
    nextGesture.startScale * (pinchDistance / (nextGesture.startDistance ?? pinchDistance));
  const nextScale = Math.min(Math.max(rawScale, 0.82), params.maxScale);
  const anchoredTranslate = applyScaleAroundPoint({
    nextScale,
    point: midpoint,
    scale: nextGesture.startScale,
    targetRect: params.targetRect,
    translateX: nextGesture.startTranslateX,
    translateY: nextGesture.startTranslateY,
  });
  const centerDeltaX = midpoint.x - (nextGesture.startCenter?.x ?? midpoint.x);
  const centerDeltaY = midpoint.y - (nextGesture.startCenter?.y ?? midpoint.y);
  const bounds = getTranslateBounds(params.targetRect, Math.max(nextScale, 1));

  return {
    gesture: nextGesture,
    transformState: {
      scale: nextScale,
      translateX: applyViewerDamping(anchoredTranslate.x + centerDeltaX, bounds.x),
      translateY: applyViewerDamping(anchoredTranslate.y + centerDeltaY, bounds.y),
    },
  };
}

export async function finalizeSinglePointerGesture(params: {
  animateBackToCenter: () => void;
  animateTransform: (
    nextTransformState: ReaderImageViewerTransformState,
    resetDismissPreview: boolean,
  ) => void;
  beginDragDismissClose: (rawDeltaX: number, rawDeltaY: number) => void;
  canNavigateNext: boolean;
  canNavigatePrev: boolean;
  gesture: GestureState;
  handleNavigate: (direction: 'next' | 'prev') => Promise<boolean>;
  pointerPosition: ReaderImageViewerPoint;
  pointerType: string;
  readTransformState: () => ReaderImageViewerTransformState;
  suppressDeferredStageClick: () => void;
  targetRect: DOMRect;
  timeStamp: number;
  viewportSize: import('../utils/readerImageViewerTypes').ReaderImageViewerViewportSize;
}): Promise<void> {
  const rawDeltaX = params.pointerPosition.x - params.gesture.startPoint.x;
  const rawDeltaY = params.pointerPosition.y - params.gesture.startPoint.y;
  const nextDirection = rawDeltaX < 0 ? 'next' : 'prev';

  if (params.gesture.startScale <= 1.01) {
    const distanceTravelled = Math.hypot(rawDeltaX, rawDeltaY);
    let { panIntent } = params.gesture;
    if (panIntent === 'undecided' && distanceTravelled >= PAN_DIRECTION_LOCK_DISTANCE_PX) {
      panIntent = resolvePanIntent(rawDeltaX, rawDeltaY, params.pointerType);
    }

    if (panIntent === 'dismiss') {
      const shouldDismiss =
        Math.max(0, rawDeltaY) >= getDragDismissThresholdPx(params.viewportSize)
        || readReleaseVelocityY(params.gesture, params.pointerPosition, params.timeStamp)
          >= DRAG_DISMISS_VELOCITY_PX_PER_S;
      if (shouldDismiss) {
        params.suppressDeferredStageClick();
        params.beginDragDismissClose(rawDeltaX, rawDeltaY);
        return;
      }

      params.animateBackToCenter();
      return;
    }

    if (panIntent === 'navigate' && Math.abs(rawDeltaX) >= SWIPE_NAVIGATION_THRESHOLD_PX) {
      params.suppressDeferredStageClick();
      const didNavigate = await params.handleNavigate(nextDirection);
      if (didNavigate) {
        return;
      }
    }

    params.animateBackToCenter();
    return;
  }

  const currentTransformState = params.readTransformState();
  const bounds = getTranslateBounds(params.targetRect, currentTransformState.scale);
  const clamped = clampTranslate(
    params.targetRect,
    Math.max(1, currentTransformState.scale),
    currentTransformState.translateX,
    currentTransformState.translateY,
  );
  const horizontalIntent = Math.abs(rawDeltaX) > Math.abs(rawDeltaY);
  const isAtHorizontalEdge = nextDirection === 'next'
    ? clamped.x <= -bounds.x + 0.5
    : clamped.x >= bounds.x - 0.5;
  if (horizontalIntent && isAtHorizontalEdge && Math.abs(rawDeltaX) >= EDGE_SWIPE_THRESHOLD_PX) {
    const canNavigate = nextDirection === 'next' ? params.canNavigateNext : params.canNavigatePrev;
    if (canNavigate) {
      params.suppressDeferredStageClick();
      const didNavigate = await params.handleNavigate(nextDirection);
      if (didNavigate) {
        return;
      }
    }
  }

  params.animateTransform({
    scale: Math.max(1, currentTransformState.scale),
    translateX: clamped.x,
    translateY: clamped.y,
  }, true);
}
