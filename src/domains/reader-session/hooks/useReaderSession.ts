import type { ReaderSessionSnapshot as SessionStoreSnapshot } from '@shared/contracts/reader';
import type {
  ReaderMode,
  ReaderRestoreResult,
  ReaderRestoreTarget,
  RestoreStatus,
  ReaderSessionCommands,
} from '@shared/contracts/reader';

import { useCallback, useMemo } from 'react';

import {
  getReaderSessionSnapshot,
  setChapterIndex as setSessionChapterIndex,
  setLastContentMode as setSessionLastContentMode,
  setMode as setSessionMode,
  useReaderSessionSelector,
} from '../store/readerSessionStore';
import { useReaderStatePersistence } from './useReaderStatePersistence';
import { getReaderViewMode, isPagedReaderMode } from '@shared/utils/readerMode';

export interface ReaderSessionSnapshot {
  novelId: number;
  chapterIndex: number;
  mode: ReaderMode;
  viewMode: 'original' | 'summary';
  contentMode: 'scroll' | 'paged';
  isPagedMode: boolean;
  restoreStatus: RestoreStatus;
  lastRestoreResult: ReaderRestoreResult | null;
  pendingRestoreTarget: ReaderRestoreTarget | null;
  lastContentMode: 'scroll' | 'paged';
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
  const lastRestoreResult = useReaderSessionSelector((state) => state.lastRestoreResult);
  const pendingRestoreTarget = useReaderSessionSelector((state) => state.pendingRestoreTarget);
  const lastContentMode = useReaderSessionSelector((state) => state.lastContentMode);
  const storeNovelId = useReaderSessionSelector((state) => state.novelId);
  const readerStatePersistence = useReaderStatePersistence(novelId);
  const viewMode = getReaderViewMode(mode);
  const isPagedMode = isPagedReaderMode(mode);
  const contentMode = mode === 'summary' ? lastContentMode : mode;

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
  const setLastContentMode = useCallback((nextMode: 'scroll' | 'paged') => {
    setSessionLastContentMode(nextMode);
  }, []);

  const snapshot = useMemo<ReaderSessionSnapshot>(() => ({
    novelId: storeNovelId || novelId,
    chapterIndex,
    mode,
    viewMode,
    contentMode,
    isPagedMode,
    restoreStatus,
    lastRestoreResult,
    pendingRestoreTarget,
    lastContentMode,
  }), [
    chapterIndex,
    contentMode,
    isPagedMode,
    lastRestoreResult,
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
    setLastContentMode,
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
    setLastContentMode,
    setMode,
  ]);

  return {
    snapshot,
    commands,
    storeSnapshot: useReaderSessionSelector((state) => state),
  };
}
