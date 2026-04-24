import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';

import type {
  ReaderMode,
  ReaderRestoreTarget,
  ReaderSessionCommands,
  StoredReaderState,
} from '@shared/contracts/reader';

import {
  useReaderLayoutQueries,
  useReaderNavigationRuntime,
  useReaderPersistenceRuntime,
} from '@shared/reader-runtime';

import { getContainerProgress } from '@shared/utils/readerPosition';
import { mergeStoredReaderState } from '@shared/utils/readerStoredState';
import {
  captureReaderStateSnapshot,
  toRestoreTargetFromState,
} from '../restore/readerModeState';
import { getStoredReaderStateSnapshot } from '../store/readerSessionStore';

interface UseReaderPositionCaptureParams {
  chapterIndex: number;
  latestReaderStateRef: MutableRefObject<StoredReaderState>;
  layoutQueries: ReturnType<typeof useReaderLayoutQueries>;
  mode: ReaderMode;
  navigation: ReturnType<typeof useReaderNavigationRuntime>;
  persistence: Pick<ReturnType<typeof useReaderPersistenceRuntime>, 'registerBeforeFlush'>;
  persistReaderState: ReaderSessionCommands['persistReaderState'];
  rememberModeState: (target: ReaderRestoreTarget) => void;
  viewportContentRef: RefObject<HTMLDivElement | null>;
}

export function useReaderPositionCapture({
  chapterIndex,
  latestReaderStateRef,
  layoutQueries,
  mode,
  navigation,
  persistence,
  persistReaderState,
  rememberModeState,
  viewportContentRef,
}: UseReaderPositionCaptureParams): (options?: { flush?: boolean }) => StoredReaderState {
  const captureCurrentReaderPositionRef =
    useRef<(options?: { flush?: boolean }) => StoredReaderState>(() => ({}));
  const latestObservedScrollProgressRef = useRef<number | null>(null);

  useEffect(() => {
    if (mode !== 'scroll') {
      latestObservedScrollProgressRef.current = null;
      return;
    }

    const updateLatestObservedProgress = (element: HTMLElement | null) => {
      if (!element) {
        return;
      }
      const anchor = layoutQueries.getCurrentAnchor();
      latestObservedScrollProgressRef.current = typeof anchor?.chapterProgress === 'number'
        ? anchor.chapterProgress
        : getContainerProgress(element as HTMLDivElement);
    };

    updateLatestObservedProgress(viewportContentRef.current);
    const handleScroll = (event: Event) => {
      const { target } = event;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target !== viewportContentRef.current) {
        return;
      }
      updateLatestObservedProgress(target);
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [layoutQueries, mode, viewportContentRef]);

  const captureCurrentReaderPosition = useCallback(
    (options?: { flush?: boolean }): StoredReaderState => {
      const viewportContentElement = viewportContentRef.current;
      let nextState = captureReaderStateSnapshot({
        chapterIndex,
        currentAnchor: layoutQueries.getCurrentAnchor(),
        currentOriginalLocator: layoutQueries.getCurrentOriginalLocator(),
        currentPagedLocator: layoutQueries.getCurrentPagedLocator(),
        latestReaderState: latestReaderStateRef.current,
        mode,
        navigationSource: navigation.getChapterChangeSource(),
        storedReaderState: getStoredReaderStateSnapshot(),
        viewportContentElement,
      });
      if (
        mode === 'scroll'
        && !viewportContentElement
        && typeof latestObservedScrollProgressRef.current === 'number'
      ) {
        nextState = mergeStoredReaderState(nextState, {
          hints: {
            ...nextState.hints,
            chapterProgress: latestObservedScrollProgressRef.current,
            contentMode: 'scroll',
            pageIndex: undefined,
          },
        });
      }
      rememberModeState(toRestoreTargetFromState({
        chapterIndex,
        mode,
        state: nextState,
      }));
      persistReaderState(nextState, { flush: options?.flush });
      return mergeStoredReaderState(latestReaderStateRef.current, nextState);
    },
    [
      chapterIndex,
      latestReaderStateRef,
      layoutQueries,
      mode,
      navigation,
      persistReaderState,
      rememberModeState,
      viewportContentRef,
      latestObservedScrollProgressRef,
    ],
  );

  useEffect(() => {
    captureCurrentReaderPositionRef.current = captureCurrentReaderPosition;
  }, [captureCurrentReaderPosition]);

  useEffect(() => {
    return persistence.registerBeforeFlush(() => {
      captureCurrentReaderPositionRef.current();
    });
  }, [persistence]);

  useEffect(() => {
    const shouldGuardStrictModeProbe = import.meta.env.DEV || import.meta.env.MODE === 'test';
    let reachedStableFrame = !shouldGuardStrictModeProbe;
    const stableFrameId = shouldGuardStrictModeProbe
      ? window.requestAnimationFrame(() => {
        reachedStableFrame = true;
      })
      : null;
    return () => {
      if (
        stableFrameId !== null
        && typeof window.cancelAnimationFrame === 'function'
      ) {
        window.cancelAnimationFrame(stableFrameId);
      }
      if (!reachedStableFrame) {
        return;
      }
      captureCurrentReaderPositionRef.current();
    };
  }, []);

  return captureCurrentReaderPosition;
}
