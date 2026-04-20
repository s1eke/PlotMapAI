import type { ReaderImageGalleryEntry } from '@shared/contracts/reader';
import type {
  ReaderImageViewerSurfaceTransition,
  ReaderImageViewerViewportSize,
} from '../utils/readerImageViewerTypes';

import { useCallback, useMemo, useRef, useState } from 'react';
import { createReaderImageEntryId } from '@shared/reader-rendering';

import {
  DOUBLE_TAP_MAX_DELAY_MS,
  getImageSwitchOffset,
} from '../utils/readerImageViewerTransform';

interface UseReaderImageViewerTransitionParams {
  activeEntry: ReaderImageGalleryEntry | null;
  viewportSize: ReaderImageViewerViewportSize;
}

interface UseReaderImageViewerTransitionResult {
  clearNavigationTransition: () => void;
  consumeDeferredStageClick: () => boolean;
  isNavigationTransitionPending: boolean;
  prepareNavigationTransition: (direction: -1 | 1, targetEntryId: string) => void;
  resolvedSurfaceTransition: ReaderImageViewerSurfaceTransition;
  suppressDeferredStageClick: () => void;
}

export function useReaderImageViewerTransition({
  activeEntry,
  viewportSize,
}: UseReaderImageViewerTransitionParams): UseReaderImageViewerTransitionResult {
  const [surfaceTransition, setSurfaceTransition] = useState<ReaderImageViewerSurfaceTransition>({
    direction: 0,
    kind: 'idle',
    slideOffset: getImageSwitchOffset(viewportSize),
    targetEntryId: null,
  });
  const deferredStageClickUntilRef = useRef(0);
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

  const consumeDeferredStageClick = useCallback((): boolean => {
    if (deferredStageClickUntilRef.current === 0) {
      return false;
    }

    const shouldSuppress = Date.now() <= deferredStageClickUntilRef.current;
    deferredStageClickUntilRef.current = 0;
    return shouldSuppress;
  }, []);

  return {
    clearNavigationTransition,
    consumeDeferredStageClick,
    isNavigationTransitionPending: surfaceTransition.kind === 'slide',
    prepareNavigationTransition,
    resolvedSurfaceTransition,
    suppressDeferredStageClick,
  };
}
