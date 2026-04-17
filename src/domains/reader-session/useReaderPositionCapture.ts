import { useCallback, useEffect, useRef } from 'react';

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

import { mergeStoredReaderState } from './state';
import {
  captureReaderStateSnapshot,
  toRestoreTargetFromState,
} from './readerModeState';
import { getStoredReaderStateSnapshot } from './readerSessionStore';

interface UseReaderPositionCaptureParams {
  chapterIndex: number;
  latestReaderStateRef: React.MutableRefObject<StoredReaderState>;
  layoutQueries: ReturnType<typeof useReaderLayoutQueries>;
  mode: ReaderMode;
  navigation: ReturnType<typeof useReaderNavigationRuntime>;
  persistence: Pick<ReturnType<typeof useReaderPersistenceRuntime>, 'registerBeforeFlush'>;
  persistReaderState: ReaderSessionCommands['persistReaderState'];
  rememberModeState: (target: ReaderRestoreTarget) => void;
  viewportContentRef: React.RefObject<HTMLDivElement | null>;
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

  const captureCurrentReaderPosition = useCallback(
    (options?: { flush?: boolean }): StoredReaderState => {
      const nextState = captureReaderStateSnapshot({
        chapterIndex,
        currentAnchor: layoutQueries.getCurrentAnchor(),
        currentOriginalLocator: layoutQueries.getCurrentOriginalLocator(),
        currentPagedLocator: layoutQueries.getCurrentPagedLocator(),
        latestReaderState: latestReaderStateRef.current,
        mode,
        navigationSource: navigation.getChapterChangeSource(),
        storedReaderState: getStoredReaderStateSnapshot(),
        viewportContentElement: viewportContentRef.current,
      });
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
    return () => {
      captureCurrentReaderPositionRef.current();
    };
  }, []);

  return captureCurrentReaderPosition;
}
