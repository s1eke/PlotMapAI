import type { MotionValue } from 'motion/react';
import type { ReaderImageGalleryEntry } from '@shared/contracts/reader';
import type {
  ReaderImageViewerTransformController,
} from './readerImageViewerGestureTypes';
import type {
  ReaderImageViewerTransformState,
  ReaderImageViewerViewportSize,
} from '../utils/readerImageViewerTypes';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, useMotionValue } from 'motion/react';

import {
  buildDragDismissTransform,
  computeTargetRect,
  DRAG_DISMISS_EXIT_DURATION_S,
  DRAG_DISMISS_EXIT_SCALE,
  getDragDismissExitTranslateY,
  getMaxScale,
} from '../utils/readerImageViewerTransform';
import { createInitialNaturalImageSize } from './readerImageViewerGestureMath';

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

export function useReaderImageViewerTransform(params: {
  activeEntry: ReaderImageGalleryEntry;
  dismissProgress: MotionValue<number>;
  novelId: number;
  onRequestDismissClose: () => void;
  viewportSize: ReaderImageViewerViewportSize;
}): ReaderImageViewerTransformController {
  const {
    activeEntry,
    dismissProgress,
    novelId,
    onRequestDismissClose,
    viewportSize,
  } = params;
  const [naturalImageSize, setNaturalImageSize] = useState(
    () => createInitialNaturalImageSize(novelId, activeEntry),
  );
  const animationControlsRef = useRef<Array<ReturnType<typeof animate>>>([]);
  const closeIntentTimeoutRef = useRef<number | null>(null);
  const dismissCloseTimeoutRef = useRef<number | null>(null);
  const dragDismissClosingRef = useRef(false);
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
  ) => {
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

  return {
    animateBackToCenter,
    animateTransform,
    beginDragDismissClose,
    clearPendingClose,
    clearPendingDismissClose,
    closeIntentTimeoutRef,
    dismissProgress,
    dragDismissClosingRef,
    maxScale,
    naturalImageSize,
    readTransformState,
    scaleMotionValue,
    setNaturalImageSize,
    setTransformState,
    stopMotionAnimations,
    surfaceOpacity,
    targetRect,
    translateXMotionValue,
    translateYMotionValue,
  };
}
