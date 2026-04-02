import type { ReaderMode, ReaderRestoreTarget, RestoreStatus, StoredReaderState } from '../hooks/readerSessionTypes';

import { useCallback, useEffect, useMemo } from 'react';

import {
  getReaderSessionSnapshot,
  setChapterIndex as setSessionChapterIndex,
  setMode as setSessionMode,
  useReaderSessionSelector,
  type ReaderSessionSnapshot as SessionStoreSnapshot,
} from '../hooks/sessionStore';
import { useReaderStatePersistence } from '../hooks/useReaderStatePersistence';
import { getReaderViewMode, isPagedReaderMode } from '../utils/readerMode';
import { setReaderPreferencesNovelId } from '../hooks/readerPreferencesStore';
import { setAppThemeNovelId } from '@app/stores/appThemeStore';

export interface ReaderSessionSnapshot {
  novelId: number;
  chapterIndex: number;
  mode: ReaderMode;
  viewMode: 'original' | 'summary';
  contentMode: 'scroll' | 'paged';
  isPagedMode: boolean;
  restoreStatus: RestoreStatus;
  pendingRestoreTarget: ReaderRestoreTarget | null;
  lastContentMode: 'scroll' | 'paged';
}

export interface ReaderSessionCommands {
  setChapterIndex: React.Dispatch<React.SetStateAction<number>>;
  setMode: React.Dispatch<React.SetStateAction<ReaderMode>>;
  latestReaderStateRef: React.MutableRefObject<StoredReaderState>;
  hasUserInteractedRef: React.MutableRefObject<boolean>;
  markUserInteracted: () => void;
  persistReaderState: (
    nextState: StoredReaderState,
    options?: { flush?: boolean },
  ) => void;
  flushReaderState: () => Promise<void>;
  loadPersistedReaderState: () => Promise<StoredReaderState>;
}

export interface UseReaderSessionResult {
  snapshot: ReaderSessionSnapshot;
  commands: ReaderSessionCommands;
  storeSnapshot: SessionStoreSnapshot;
}

export function useReaderSession(novelId: number): UseReaderSessionResult {
  const chapterIndex = useReaderSessionSelector((state) => state.chapterIndex);
  const mode = useReaderSessionSelector((state) => state.mode);
  const restoreStatus = useReaderSessionSelector((state) => state.restoreStatus);
  const pendingRestoreTarget = useReaderSessionSelector((state) => state.pendingRestoreTarget);
  const lastContentMode = useReaderSessionSelector((state) => state.lastContentMode);
  const storeNovelId = useReaderSessionSelector((state) => state.novelId);
  const readerStatePersistence = useReaderStatePersistence(novelId);
  const viewMode = getReaderViewMode(mode);
  const isPagedMode = isPagedReaderMode(mode);
  const contentMode = mode === 'summary' ? lastContentMode : mode;

  useEffect(() => {
    setReaderPreferencesNovelId(novelId);
    setAppThemeNovelId(novelId);
  }, [novelId]);

  const setChapterIndex = useCallback((nextState: React.SetStateAction<number>) => {
    const current = getReaderSessionSnapshot().chapterIndex;
    const nextValue = typeof nextState === 'function'
      ? nextState(current)
      : nextState;
    setSessionChapterIndex(nextValue, { persistRemote: false });
  }, []);

  const setMode = useCallback((nextState: React.SetStateAction<ReaderMode>) => {
    const currentMode = getReaderSessionSnapshot().mode;
    const nextValue = typeof nextState === 'function'
      ? nextState(currentMode)
      : nextState;
    setSessionMode(nextValue, { persistRemote: false });
  }, []);

  const snapshot = useMemo<ReaderSessionSnapshot>(() => ({
    novelId: storeNovelId || novelId,
    chapterIndex,
    mode,
    viewMode,
    contentMode,
    isPagedMode,
    restoreStatus,
    pendingRestoreTarget,
    lastContentMode,
  }), [
    chapterIndex,
    contentMode,
    isPagedMode,
    lastContentMode,
    mode,
    novelId,
    pendingRestoreTarget,
    restoreStatus,
    storeNovelId,
    viewMode,
  ]);

  const commands = useMemo<ReaderSessionCommands>(() => ({
    setChapterIndex,
    setMode,
    latestReaderStateRef: readerStatePersistence.latestReaderStateRef,
    hasUserInteractedRef: readerStatePersistence.hasUserInteractedRef,
    markUserInteracted: readerStatePersistence.markUserInteracted,
    persistReaderState: readerStatePersistence.persistReaderState,
    flushReaderState: readerStatePersistence.flushReaderState,
    loadPersistedReaderState: readerStatePersistence.loadPersistedReaderState,
  }), [
    readerStatePersistence.flushReaderState,
    readerStatePersistence.hasUserInteractedRef,
    readerStatePersistence.latestReaderStateRef,
    readerStatePersistence.loadPersistedReaderState,
    readerStatePersistence.markUserInteracted,
    readerStatePersistence.persistReaderState,
    setChapterIndex,
    setMode,
  ]);

  return {
    snapshot,
    commands,
    storeSnapshot: useReaderSessionSelector((state) => state),
  };
}
