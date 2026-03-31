import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  SyntheticEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import type { ReaderImageGalleryEntry, ReaderImageViewerState } from '../../utils/readerImageGallery';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';

import { cn } from '@shared/utils/cn';

import { useReaderImageResource } from '../../hooks/useReaderImageResource';
import {
  peekReaderImageDimensions,
  preloadReaderImageResources,
} from '../../utils/readerImageResourceCache';
import { createReaderImageEntryId } from '../../utils/readerImageGallery';

interface ReaderImageViewerProps {
  activeEntry: ReaderImageGalleryEntry | null;
  activeIndex: number;
  canNavigateNext: boolean;
  canNavigatePrev: boolean;
  entries: ReaderImageGalleryEntry[];
  getOriginRect: (entry: ReaderImageGalleryEntry | null) => DOMRect | null;
  isIndexResolved: boolean;
  isIndexLoading: boolean;
  isOpen: boolean;
  novelId: number;
  onRequestClose: () => void;
  onRequestNavigate: (direction: 'next' | 'prev') => Promise<boolean>;
}

interface ViewportSize {
  height: number;
  width: number;
}

interface NaturalImageSize {
  height: number;
  width: number;
}

interface Point {
  x: number;
  y: number;
}

interface GestureState {
  startPoint: Point;
  startScale: number;
  startTranslateX: number;
  startTranslateY: number;
  type: 'pan' | 'pinch';
  startDistance?: number;
  startCenter?: Point;
}

interface TransformState {
  scale: number;
  translateX: number;
  translateY: number;
}

interface TapState {
  point: Point;
  pointerType: string;
  timeStamp: number;
}

interface ReaderImageViewerSurfaceTransition {
  direction: -1 | 0 | 1;
  kind: 'idle' | 'slide';
  slideOffset: number;
  targetEntryId: string | null;
}

interface ReaderImageViewerSurfaceProps {
  activeEntry: ReaderImageGalleryEntry;
  activeIndex: number;
  canNavigateNext: boolean;
  canNavigatePrev: boolean;
  consumeDeferredStageClick: () => boolean;
  entryTransitionMode: 'anchor' | 'none';
  entries: ReaderImageGalleryEntry[];
  getOriginRect: (entry: ReaderImageGalleryEntry | null) => DOMRect | null;
  isIndexLoading: boolean;
  novelId: number;
  onClearNavigationTransition: () => void;
  onPrepareNavigationTransition: (
    direction: -1 | 1,
    targetEntryId: string,
  ) => void;
  onRequestClose: () => void;
  onRequestNavigate: (direction: 'next' | 'prev') => Promise<boolean>;
  originRect: DOMRect | null;
  suppressDeferredStageClick: () => void;
  viewportSize: ViewportSize;
}

const VIEWPORT_PADDING_PX = 24;
const PINCH_CLOSE_THRESHOLD = 0.92;
const SCALE_SAFE_MAX = 4;
const DOUBLE_TAP_ZOOM_SCALE = 2;
const DOUBLE_TAP_MAX_DELAY_MS = 320;
const DOUBLE_TAP_MAX_DISTANCE_PX = 28;
const TAP_GESTURE_TOLERANCE_PX = 10;
const SWIPE_NAVIGATION_THRESHOLD_PX = 56;
const EDGE_SWIPE_THRESHOLD_PX = 72;
const OVERDRAG_DAMPING = 0.32;
const TRANSLATE_SWIPE_DAMPING = 0.48;
const TRANSLATE_VERTICAL_DAMPING = 0.18;
const TRANSFORM_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const TRANSFORM_ANIMATION_MS = 220;
const SINGLE_CLICK_CLOSE_DELAY_MS = DOUBLE_TAP_MAX_DELAY_MS;
const IMAGE_SWITCH_ANIMATION_DURATION_S = 0.26;
const IMAGE_SWITCH_DISTANCE_RATIO = 0.58;
const IMAGE_SWITCH_MAX_OFFSET_PX = 520;
const IMAGE_SWITCH_MIN_OFFSET_PX = 180;

function readViewportSize(): ViewportSize {
  if (typeof window === 'undefined') {
    return { height: 800, width: 600 };
  }

  return {
    height: window.innerHeight,
    width: window.innerWidth,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function applyDamping(value: number, limit: number): number {
  if (limit <= 0) {
    return value * TRANSLATE_SWIPE_DAMPING;
  }

  if (value > limit) {
    return limit + (value - limit) * OVERDRAG_DAMPING;
  }
  if (value < -limit) {
    return -limit + (value + limit) * OVERDRAG_DAMPING;
  }
  return value;
}

function getDistance(first: Point, second: Point): number {
  const deltaX = second.x - first.x;
  const deltaY = second.y - first.y;
  return Math.hypot(deltaX, deltaY);
}

function getMidpoint(first: Point, second: Point): Point {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function computeTargetRect(viewport: ViewportSize, naturalSize: NaturalImageSize | null): DOMRect {
  const paddedWidth = Math.max(1, viewport.width - VIEWPORT_PADDING_PX * 2);
  const paddedHeight = Math.max(1, viewport.height - VIEWPORT_PADDING_PX * 2);
  const aspectRatio = naturalSize && naturalSize.width > 0 && naturalSize.height > 0
    ? naturalSize.width / naturalSize.height
    : 1;

  let width = paddedWidth;
  let height = width / aspectRatio;
  if (height > paddedHeight) {
    height = paddedHeight;
    width = height * aspectRatio;
  }

  const left = (viewport.width - width) / 2;
  const top = (viewport.height - height) / 2;
  return new DOMRect(left, top, width, height);
}

function getMaxScale(targetRect: DOMRect, naturalSize: NaturalImageSize | null): number {
  if (!naturalSize || targetRect.width <= 0 || targetRect.height <= 0) {
    return 1;
  }

  const widthScale = naturalSize.width / targetRect.width;
  const heightScale = naturalSize.height / targetRect.height;
  const pixelPerfectScale = Math.max(widthScale, heightScale);
  return clamp(Math.max(DOUBLE_TAP_ZOOM_SCALE, pixelPerfectScale), 1, SCALE_SAFE_MAX);
}

function isTapWithinThreshold(startPoint: Point, endPoint: Point): boolean {
  return Math.abs(endPoint.x - startPoint.x) <= TAP_GESTURE_TOLERANCE_PX
    && Math.abs(endPoint.y - startPoint.y) <= TAP_GESTURE_TOLERANCE_PX;
}

function getTranslateBounds(targetRect: DOMRect, scale: number): Point {
  const extraWidth = Math.max(0, targetRect.width * scale - targetRect.width);
  const extraHeight = Math.max(0, targetRect.height * scale - targetRect.height);
  return {
    x: extraWidth / 2,
    y: extraHeight / 2,
  };
}

function clampTranslate(
  targetRect: DOMRect,
  scale: number,
  translateX: number,
  translateY: number,
): Point {
  const bounds = getTranslateBounds(targetRect, scale);
  return {
    x: clamp(translateX, -bounds.x, bounds.x),
    y: clamp(translateY, -bounds.y, bounds.y),
  };
}

function applyScaleAroundPoint(params: {
  nextScale: number;
  point: Point;
  scale: number;
  targetRect: DOMRect;
  translateX: number;
  translateY: number;
}): Point {
  const rectCenterX = params.targetRect.left + params.targetRect.width / 2;
  const rectCenterY = params.targetRect.top + params.targetRect.height / 2;
  const localPoint = {
    x: params.point.x - rectCenterX,
    y: params.point.y - rectCenterY,
  };

  if (params.scale <= 0) {
    return {
      x: params.translateX,
      y: params.translateY,
    };
  }

  const scaleRatio = params.nextScale / params.scale;
  return {
    x: params.translateX * scaleRatio + localPoint.x * (1 - scaleRatio),
    y: params.translateY * scaleRatio + localPoint.y * (1 - scaleRatio),
  };
}

function buildAnchoredTransform(originRect: DOMRect | null, targetRect: DOMRect) {
  if (!originRect || originRect.width <= 0 || originRect.height <= 0) {
    return {
      opacity: 0,
      scale: 0.96,
      scaleX: 1,
      scaleY: 1,
      x: 0,
      y: 0,
    };
  }

  return {
    opacity: 1,
    scale: 1,
    scaleX: originRect.width / targetRect.width,
    scaleY: originRect.height / targetRect.height,
    x: originRect.left + originRect.width / 2 - (targetRect.left + targetRect.width / 2),
    y: originRect.top + originRect.height / 2 - (targetRect.top + targetRect.height / 2),
  };
}

function getImageSwitchOffset(viewport: ViewportSize): number {
  return clamp(
    viewport.width * IMAGE_SWITCH_DISTANCE_RATIO,
    IMAGE_SWITCH_MIN_OFFSET_PX,
    IMAGE_SWITCH_MAX_OFFSET_PX,
  );
}

function buildImageSwitchTransform(
  transition: ReaderImageViewerSurfaceTransition,
  directionMultiplier: 1 | -1,
) {
  if (transition.kind !== 'slide' || transition.direction === 0) {
    return {
      opacity: 1,
      x: 0,
    };
  }

  return {
    opacity: 1,
    x: transition.direction * transition.slideOffset * directionMultiplier,
  };
}

const IMAGE_SWITCH_VARIANTS = {
  animate: {
    opacity: 1,
    x: 0,
  },
  exit: (transition: ReaderImageViewerSurfaceTransition) => (
    buildImageSwitchTransform(transition, -1)
  ),
  initial: (transition: ReaderImageViewerSurfaceTransition) => (
    buildImageSwitchTransform(transition, 1)
  ),
} as const;

function createInitialNaturalImageSize(
  novelId: number,
  entry: ReaderImageGalleryEntry,
): NaturalImageSize | null {
  const cachedDimensions = peekReaderImageDimensions(novelId, entry.imageKey);
  if (!cachedDimensions || cachedDimensions.width <= 0 || cachedDimensions.height <= 0) {
    return null;
  }

  return {
    height: cachedDimensions.height,
    width: cachedDimensions.width,
  };
}

function ReaderImageViewerSurface({
  activeEntry,
  activeIndex,
  canNavigateNext,
  canNavigatePrev,
  consumeDeferredStageClick,
  entryTransitionMode,
  entries,
  getOriginRect,
  isIndexLoading,
  novelId,
  onClearNavigationTransition,
  onPrepareNavigationTransition,
  onRequestClose,
  onRequestNavigate,
  originRect,
  suppressDeferredStageClick,
  viewportSize,
}: ReaderImageViewerSurfaceProps) {
  const imageUrl = useReaderImageResource(novelId, activeEntry.imageKey);
  const [isTransformAnimating, setIsTransformAnimating] = useState(false);
  const [naturalImageSize, setNaturalImageSize] = useState<NaturalImageSize | null>(() => (
    createInitialNaturalImageSize(novelId, activeEntry)
  ));
  const [transformState, setTransformState] = useState<TransformState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
  const animationTimeoutRef = useRef<number | null>(null);
  const closeIntentTimeoutRef = useRef<number | null>(null);
  const activePointersRef = useRef<Map<number, Point>>(new Map());
  const gestureRef = useRef<GestureState | null>(null);
  const lastTapRef = useRef<TapState | null>(null);
  const suppressNextClickRef = useRef(false);
  const targetRect = useMemo(
    () => computeTargetRect(viewportSize, naturalImageSize),
    [naturalImageSize, viewportSize],
  );
  const maxScale = useMemo(
    () => getMaxScale(targetRect, naturalImageSize),
    [naturalImageSize, targetRect],
  );
  const viewerState = useMemo<ReaderImageViewerState>(() => ({
    activeEntry,
    isIndexLoading,
    isOpen: true,
    originRect,
    scale: transformState.scale,
    translateX: transformState.translateX,
    translateY: transformState.translateY,
  }), [
    activeEntry,
    isIndexLoading,
    originRect,
    transformState.scale,
    transformState.translateX,
    transformState.translateY,
  ]);
  const viewerStateRef = useRef(viewerState);

  useEffect(() => {
    viewerStateRef.current = viewerState;
  }, [viewerState]);

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

  const setTransform = useCallback((nextState: TransformState) => {
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
        Math.max(1, viewerStateRef.current.scale),
        0,
        0,
      );
      animateTransformTo(Math.max(1, viewerStateRef.current.scale), clamped.x, clamped.y);
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

  const handleStageWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    cancelPendingClose();
    if (!naturalImageSize || !imageUrl) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const currentScale = viewerStateRef.current.scale;
    const rawNextScale = event.deltaY < 0 ? currentScale * 1.12 : currentScale * 0.88;
    const nextScale = clamp(rawNextScale, 1, maxScale);
    const nextTranslate = applyScaleAroundPoint({
      nextScale,
      point: { x: event.clientX, y: event.clientY },
      scale: currentScale,
      targetRect,
      translateX: viewerStateRef.current.translateX,
      translateY: viewerStateRef.current.translateY,
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
  }, [cancelPendingClose, imageUrl, maxScale, naturalImageSize, setTransform, targetRect]);

  const handleStageDoubleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    cancelPendingClose();
    if (!naturalImageSize) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const currentScale = viewerStateRef.current.scale;
    const nextScale = currentScale > 1.05 ? 1 : Math.min(DOUBLE_TAP_ZOOM_SCALE, maxScale);
    const nextTranslate = nextScale === 1
      ? { x: 0, y: 0 }
      : applyScaleAroundPoint({
        nextScale,
        point: { x: event.clientX, y: event.clientY },
        scale: currentScale,
        targetRect,
        translateX: viewerStateRef.current.translateX,
        translateY: viewerStateRef.current.translateY,
      });
    const clampedTranslate = clampTranslate(
      targetRect,
      nextScale,
      nextTranslate.x,
      nextTranslate.y,
    );
    animateTransformTo(nextScale, clampedTranslate.x, clampedTranslate.y);
  }, [animateTransformTo, cancelPendingClose, maxScale, naturalImageSize, targetRect]);

  const toggleZoomAtPoint = useCallback((point: Point): boolean => {
    cancelPendingClose();
    if (!naturalImageSize) {
      return false;
    }

    const currentScale = viewerStateRef.current.scale;
    const nextScale = currentScale > 1.05 ? 1 : Math.min(DOUBLE_TAP_ZOOM_SCALE, maxScale);
    const nextTranslate = nextScale === 1
      ? { x: 0, y: 0 }
      : applyScaleAroundPoint({
        nextScale,
        point,
        scale: currentScale,
        targetRect,
        translateX: viewerStateRef.current.translateX,
        translateY: viewerStateRef.current.translateY,
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
        startCenter: getMidpoint(firstPointer, secondPointer),
        startDistance: Math.max(1, getDistance(firstPointer, secondPointer)),
        startPoint: getMidpoint(firstPointer, secondPointer),
        startScale: viewerStateRef.current.scale,
        startTranslateX: viewerStateRef.current.translateX,
        startTranslateY: viewerStateRef.current.translateY,
        type: 'pinch',
      };
      return;
    }

    gestureRef.current = {
      startPoint: {
        x: event.clientX,
        y: event.clientY,
      },
      startScale: viewerStateRef.current.scale,
      startTranslateX: viewerStateRef.current.translateX,
      startTranslateY: viewerStateRef.current.translateY,
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
      const midpoint = getMidpoint(firstPointer, secondPointer);
      const gesture = gestureRef.current?.type === 'pinch'
        ? gestureRef.current
        : {
          startCenter: midpoint,
          startDistance: Math.max(1, getDistance(firstPointer, secondPointer)),
          startPoint: midpoint,
          startScale: viewerStateRef.current.scale,
          startTranslateX: viewerStateRef.current.translateX,
          startTranslateY: viewerStateRef.current.translateY,
          type: 'pinch' as const,
        };
      gestureRef.current = gesture;

      const pinchDistance = Math.max(1, getDistance(firstPointer, secondPointer));
      const rawScale =
        gesture.startScale * (pinchDistance / (gesture.startDistance ?? pinchDistance));
      const nextScale = clamp(rawScale, 0.82, maxScale);
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
        translateX: applyDamping(anchoredTranslate.x + centerDeltaX, bounds.x),
        translateY: applyDamping(anchoredTranslate.y + centerDeltaY, bounds.y),
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
      translateX: applyDamping(gesture.startTranslateX + rawDeltaX, bounds.x),
      translateY: applyDamping(gesture.startTranslateY + rawDeltaY, bounds.y),
    });
  }, [maxScale, setTransform, targetRect]);

  const finalizeSinglePointerGesture = useCallback(async (
    gesture: GestureState,
    pointerPosition: Point,
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

    const bounds = getTranslateBounds(targetRect, viewerStateRef.current.scale);
    const clamped = clampTranslate(
      targetRect,
      Math.max(1, viewerStateRef.current.scale),
      viewerStateRef.current.translateX,
      viewerStateRef.current.translateY,
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

    animateTransformTo(Math.max(1, viewerStateRef.current.scale), clamped.x, clamped.y);
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
    activePointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    if (activePointersRef.current.size >= 2) {
      const [firstPointer, secondPointer] = Array.from(activePointersRef.current.values());
      gestureRef.current = {
        startCenter: getMidpoint(firstPointer, secondPointer),
        startDistance: Math.max(1, getDistance(firstPointer, secondPointer)),
        startPoint: getMidpoint(firstPointer, secondPointer),
        startScale: viewerStateRef.current.scale,
        startTranslateX: viewerStateRef.current.translateX,
        startTranslateY: viewerStateRef.current.translateY,
        type: 'pinch',
      };
      return;
    }

    if (activePointersRef.current.size === 1) {
      const [remainingPointer] = Array.from(activePointersRef.current.values());
      gestureRef.current = {
        startPoint: remainingPointer,
        startScale: viewerStateRef.current.scale,
        startTranslateX: viewerStateRef.current.translateX,
        startTranslateY: viewerStateRef.current.translateY,
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
      if (viewerStateRef.current.scale < PINCH_CLOSE_THRESHOLD) {
        onRequestClose();
        return;
      }

      const clamped = clampTranslate(
        targetRect,
        Math.max(1, viewerStateRef.current.scale),
        viewerStateRef.current.translateX,
        viewerStateRef.current.translateY,
      );
      animateTransformTo(Math.max(1, viewerStateRef.current.scale), clamped.x, clamped.y);
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
        && getDistance(previousTap.point, pointerPosition) <= DOUBLE_TAP_MAX_DISTANCE_PX
      ) {
        lastTapRef.current = null;
        suppressNextClickRef.current = true;
        if (toggleZoomAtPoint(pointerPosition)) {
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
    toggleZoomAtPoint,
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
        Math.max(1, viewerStateRef.current.scale),
        viewerStateRef.current.translateX,
        viewerStateRef.current.translateY,
      );
      animateTransformTo(Math.max(1, viewerStateRef.current.scale), clamped.x, clamped.y);
    }
  }, [animateTransformTo, targetRect]);

  return (
    <div
      data-reader-image-stage=""
      className="absolute inset-0 touch-none"
      onClick={(event) => {
        if (suppressNextClickRef.current || consumeDeferredStageClick()) {
          suppressNextClickRef.current = false;
          cancelPendingClose();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        schedulePendingClose();
      }}
      onDoubleClick={handleStageDoubleClick}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => {
        handlePointerUp(event);
      }}
      onWheel={handleStageWheel}
    >
      <motion.div
        className="absolute inset-0"
        data-reader-image-transition-mode={entryTransitionMode}
        initial={entryTransitionMode === 'anchor' ? buildAnchoredTransform(originRect, targetRect) : false}
        animate={{
          opacity: 1,
          scale: 1,
          scaleX: 1,
          scaleY: 1,
          x: 0,
          y: 0,
        }}
        exit={entryTransitionMode === 'anchor'
          ? buildAnchoredTransform(getOriginRect(activeEntry), targetRect)
          : {
            opacity: 1,
            scale: 1,
            scaleX: 1,
            scaleY: 1,
            x: 0,
            y: 0,
          }}
        transition={{
          duration: 0.24,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <div
          data-reader-image-surface=""
          className="absolute"
          style={{
            height: targetRect.height,
            left: targetRect.left,
            top: targetRect.top,
            width: targetRect.width,
          }}
        >
          <div
            className={cn(
              'relative h-full w-full origin-center',
              isTransformAnimating && 'transition-transform',
            )}
            style={{
              transform: `translate3d(${viewerState.translateX}px, ${viewerState.translateY}px, 0) scale(${viewerState.scale})`,
              transitionDuration: isTransformAnimating ? `${TRANSFORM_ANIMATION_MS}ms` : undefined,
              transitionProperty: isTransformAnimating ? 'transform' : undefined,
              transitionTimingFunction: isTransformAnimating ? TRANSFORM_EASE : undefined,
            }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                className="h-full w-full select-none object-contain"
                draggable={false}
                onLoad={handleImageLoad}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-2xl bg-white/6 text-white/75">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            )}
          </div>
        </div>
      </motion.div>

    </div>
  );
}

export default function ReaderImageViewer({
  activeEntry,
  activeIndex,
  canNavigateNext,
  canNavigatePrev,
  entries,
  getOriginRect,
  isIndexResolved,
  isIndexLoading,
  isOpen,
  novelId,
  onRequestClose,
  onRequestNavigate,
}: ReaderImageViewerProps) {
  const { t } = useTranslation();
  const [viewportSize, setViewportSize] = useState<ViewportSize>(() => readViewportSize());
  const [surfaceTransition, setSurfaceTransition] = useState<ReaderImageViewerSurfaceTransition>({
    direction: 0,
    kind: 'idle',
    slideOffset: getImageSwitchOffset(readViewportSize()),
    targetEntryId: null,
  });
  const deferredStageClickUntilRef = useRef(0);
  const originRect = useMemo(() => getOriginRect(activeEntry), [activeEntry, getOriginRect]);
  const activeEntryId = useMemo(
    () => (activeEntry ? createReaderImageEntryId(activeEntry) : null),
    [activeEntry],
  );
  const imageSwitchOffset = useMemo(
    () => getImageSwitchOffset(viewportSize),
    [viewportSize],
  );
  const resolvedSurfaceTransition = useMemo<ReaderImageViewerSurfaceTransition>(() => (
    surfaceTransition.kind === 'slide'
      && activeEntryId !== null
      && surfaceTransition.targetEntryId === activeEntryId
      ? {
        ...surfaceTransition,
        slideOffset: imageSwitchOffset,
      }
      : {
        direction: 0,
        kind: 'idle',
        slideOffset: imageSwitchOffset,
        targetEntryId: activeEntryId,
      }
  ), [activeEntryId, imageSwitchOffset, surfaceTransition]);

  const suppressDeferredStageClick = useCallback(() => {
    deferredStageClickUntilRef.current = Date.now() + DOUBLE_TAP_MAX_DELAY_MS;
  }, []);

  const clearNavigationTransition = useCallback(() => {
    setSurfaceTransition((previousTransition) => (
      previousTransition.kind === 'idle'
        ? previousTransition
        : {
          direction: 0,
          kind: 'idle',
          slideOffset: previousTransition.slideOffset,
          targetEntryId: null,
        }
    ));
  }, []);

  const prepareNavigationTransition = useCallback((direction: -1 | 1, targetEntryId: string) => {
    setSurfaceTransition({
      direction,
      kind: 'slide',
      slideOffset: imageSwitchOffset,
      targetEntryId,
    });
  }, [imageSwitchOffset]);

  const handleRequestClose = useCallback(() => {
    clearNavigationTransition();
    onRequestClose();
  }, [clearNavigationTransition, onRequestClose]);

  const consumeDeferredStageClick = useCallback((): boolean => {
    if (deferredStageClickUntilRef.current === 0) {
      return false;
    }

    const shouldSuppress = Date.now() <= deferredStageClickUntilRef.current;
    deferredStageClickUntilRef.current = 0;
    return shouldSuppress;
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleResize = () => {
      setViewportSize(readViewportSize());
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = 'unset';
      return;
    }

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onRequestClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onRequestClose]);

  useEffect(() => {
    if (!isOpen || !activeEntry) {
      return;
    }

    const neighborKeys = new Set<string>([activeEntry.imageKey]);
    const previousEntry = activeIndex > 0 ? entries[activeIndex - 1] : null;
    const nextEntry = activeIndex < entries.length - 1 ? entries[activeIndex + 1] : null;
    if (previousEntry) {
      neighborKeys.add(previousEntry.imageKey);
    }
    if (nextEntry) {
      neighborKeys.add(nextEntry.imageKey);
    }

    preloadReaderImageResources(novelId, neighborKeys);
  }, [activeEntry, activeIndex, entries, isOpen, novelId]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence initial={false}>
      {isOpen && activeEntry ? (
        <div
          className="fixed inset-0 z-[90]"
          role="dialog"
          aria-modal="true"
          aria-label={t('reader.imageViewer.title')}
        >
          <motion.div
            className="absolute inset-0 bg-black/88 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          />

          <div className="absolute inset-0 overflow-hidden">
            <AnimatePresence initial={false} custom={resolvedSurfaceTransition}>
              <motion.div
                key={`${novelId}:${createReaderImageEntryId(activeEntry)}`}
                data-reader-image-transition-direction={resolvedSurfaceTransition.direction}
                data-reader-image-transition-kind={resolvedSurfaceTransition.kind}
                className="absolute inset-0"
                custom={resolvedSurfaceTransition}
                variants={IMAGE_SWITCH_VARIANTS}
                initial="initial"
                animate="animate"
                exit="exit"
                onAnimationComplete={clearNavigationTransition}
                transition={{
                  duration: IMAGE_SWITCH_ANIMATION_DURATION_S,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <ReaderImageViewerSurface
                  activeEntry={activeEntry}
                  activeIndex={activeIndex}
                  canNavigateNext={canNavigateNext}
                  canNavigatePrev={canNavigatePrev}
                  consumeDeferredStageClick={consumeDeferredStageClick}
                  entries={entries}
                  entryTransitionMode={resolvedSurfaceTransition.kind === 'slide' ? 'none' : 'anchor'}
                  getOriginRect={getOriginRect}
                  isIndexLoading={isIndexLoading}
                  novelId={novelId}
                  onClearNavigationTransition={clearNavigationTransition}
                  onPrepareNavigationTransition={prepareNavigationTransition}
                  onRequestClose={handleRequestClose}
                  onRequestNavigate={onRequestNavigate}
                  originRect={originRect}
                  suppressDeferredStageClick={suppressDeferredStageClick}
                  viewportSize={viewportSize}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          <div
            data-reader-image-index=""
            className="pointer-events-none absolute inset-x-0 bottom-5 z-[2] flex justify-center"
          >
            <div className="rounded-full bg-black/45 px-4 py-2 text-xs font-medium tracking-wide text-white/85 backdrop-blur-sm">
              {isIndexResolved || !isIndexLoading
                ? (
                  <>
                    {Math.max(activeIndex + 1, 1)} / {Math.max(entries.length, activeIndex + 1, 1)}
                    {isIndexLoading ? ` · ${t('reader.imageViewer.loadingMore')}` : ''}
                  </>
                )
                : t('reader.imageViewer.loadingMore')}
            </div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
