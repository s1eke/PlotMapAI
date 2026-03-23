import { useCallback, useEffect, useRef, useState } from 'react';
import { readerApi } from '../api/reader';

export type PageTarget = 'start' | 'end';

const READER_STATE_SYNC_DELAY_MS = 400;

export interface StoredReaderState {
  chapterIndex?: number;
  viewMode?: 'original' | 'summary';
  isTwoColumn?: boolean;
  chapterProgress?: number;
  scrollPosition?: number;
}

interface PersistReaderStateOptions {
  flush?: boolean;
}

function clampChapterProgress(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function sanitizeStoredReaderState(raw: unknown): StoredReaderState | null {
  if (!raw || typeof raw !== 'object') return null;

  const parsed = raw as Record<string, unknown>;
  const chapterProgress = clampChapterProgress(
    typeof parsed.chapterProgress === 'number' ? parsed.chapterProgress : undefined,
  );

  return {
    chapterIndex: typeof parsed.chapterIndex === 'number' ? parsed.chapterIndex : undefined,
    viewMode: parsed.viewMode === 'summary' || parsed.viewMode === 'original' ? parsed.viewMode : undefined,
    isTwoColumn: typeof parsed.isTwoColumn === 'boolean' ? parsed.isTwoColumn : undefined,
    chapterProgress,
    scrollPosition: typeof parsed.scrollPosition === 'number' && Number.isFinite(parsed.scrollPosition)
      ? parsed.scrollPosition
      : undefined,
  };
}

function buildStoredReaderState(state: StoredReaderState | null | undefined): StoredReaderState {
  return {
    chapterIndex: state?.chapterIndex ?? 0,
    viewMode: state?.viewMode ?? 'original',
    isTwoColumn: state?.isTwoColumn ?? false,
    chapterProgress: clampChapterProgress(state?.chapterProgress),
    scrollPosition: typeof state?.scrollPosition === 'number' && Number.isFinite(state.scrollPosition)
      ? state.scrollPosition
      : undefined,
  };
}

function mergeStoredReaderState(
  baseState: StoredReaderState | null | undefined,
  overrideState: StoredReaderState | null | undefined,
): StoredReaderState {
  const prefersLegacyScrollPosition = overrideState?.chapterProgress === undefined
    && typeof overrideState?.scrollPosition === 'number'
    && Number.isFinite(overrideState.scrollPosition);

  return buildStoredReaderState({
    chapterIndex: overrideState?.chapterIndex ?? baseState?.chapterIndex,
    viewMode: overrideState?.viewMode ?? baseState?.viewMode,
    isTwoColumn: overrideState?.isTwoColumn ?? baseState?.isTwoColumn,
    chapterProgress: prefersLegacyScrollPosition
      ? undefined
      : overrideState?.chapterProgress ?? baseState?.chapterProgress,
    scrollPosition: overrideState?.scrollPosition ?? baseState?.scrollPosition,
  });
}

function getSerializedReaderState(state: StoredReaderState): StoredReaderState {
  const serializedState: StoredReaderState = {
    chapterIndex: state.chapterIndex ?? 0,
    viewMode: state.viewMode ?? 'original',
    isTwoColumn: state.isTwoColumn ?? false,
  };

  const chapterProgress = clampChapterProgress(state.chapterProgress);
  if (chapterProgress !== undefined) {
    serializedState.chapterProgress = chapterProgress;
    return serializedState;
  }

  if (typeof state.scrollPosition === 'number' && Number.isFinite(state.scrollPosition)) {
    serializedState.scrollPosition = state.scrollPosition;
  }

  return serializedState;
}

function getProgressSnapshot(state: StoredReaderState): string {
  return JSON.stringify({
    chapterIndex: state.chapterIndex ?? 0,
    scrollPosition: typeof state.scrollPosition === 'number' && Number.isFinite(state.scrollPosition)
      ? state.scrollPosition
      : 0,
    viewMode: state.viewMode ?? 'original',
    chapterProgress: clampChapterProgress(state.chapterProgress) ?? 0,
    isTwoColumn: state.isTwoColumn ?? false,
  });
}

function readStoredReaderState(novelId: number): StoredReaderState | null {
  if (!novelId) return null;

  try {
    const raw = localStorage.getItem(`reader-state:${novelId}`);
    if (!raw) return null;

    return sanitizeStoredReaderState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStoredReaderState(novelId: number, state: StoredReaderState) {
  if (!novelId) return;

  localStorage.setItem(`reader-state:${novelId}`, JSON.stringify(getSerializedReaderState(state)));
}

export function useReaderStatePersistence(novelId: number): {
  hasHydratedReaderState: boolean;
  setHasHydratedReaderState: React.Dispatch<React.SetStateAction<boolean>>;
  latestReaderStateRef: React.MutableRefObject<StoredReaderState>;
  hasUserInteractedRef: React.MutableRefObject<boolean>;
  markUserInteracted: () => void;
  persistReaderState: (nextState: StoredReaderState, options?: PersistReaderStateOptions) => void;
  flushReaderState: () => Promise<void>;
  loadPersistedReaderState: () => Promise<StoredReaderState>;
  initialStoredState: StoredReaderState | null;
} {
  const initialStoredState = readStoredReaderState(novelId);

  const [hasHydratedReaderState, setHasHydratedReaderState] = useState(false);

  const latestReaderStateRef = useRef<StoredReaderState>(buildStoredReaderState(initialStoredState));
  const hasUserInteractedRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const lastSyncedSnapshotRef = useRef('');
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());

  const enqueueReaderStateSync = useCallback((state: StoredReaderState): Promise<void> => {
    if (!novelId) return Promise.resolve();

    const normalizedState = buildStoredReaderState(state);
    const snapshot = getProgressSnapshot(normalizedState);
    if (snapshot === lastSyncedSnapshotRef.current) {
      return syncQueueRef.current;
    }

    syncQueueRef.current = syncQueueRef.current
      .then(async () => {
        if (snapshot === lastSyncedSnapshotRef.current) return;
        await readerApi.saveProgress(novelId, {
          chapterIndex: normalizedState.chapterIndex ?? 0,
          scrollPosition: typeof normalizedState.scrollPosition === 'number' && Number.isFinite(normalizedState.scrollPosition)
            ? normalizedState.scrollPosition
            : 0,
          viewMode: normalizedState.viewMode ?? 'original',
          chapterProgress: normalizedState.chapterProgress ?? 0,
          isTwoColumn: normalizedState.isTwoColumn ?? false,
        });
        lastSyncedSnapshotRef.current = snapshot;
      })
      .catch(() => undefined);

    return syncQueueRef.current;
  }, [novelId]);

  const flushReaderState = useCallback(async (): Promise<void> => {
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    await enqueueReaderStateSync(latestReaderStateRef.current);
  }, [enqueueReaderStateSync]);

  const scheduleReaderStateSync = useCallback((): void => {
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      void enqueueReaderStateSync(latestReaderStateRef.current);
    }, READER_STATE_SYNC_DELAY_MS);
  }, [enqueueReaderStateSync]);

  const persistReaderState = useCallback((nextState: StoredReaderState, options?: PersistReaderStateOptions): void => {
    const mergedState = mergeStoredReaderState(latestReaderStateRef.current, nextState);
    latestReaderStateRef.current = mergedState;
    writeStoredReaderState(novelId, mergedState);

    if (options?.flush) {
      void flushReaderState();
      return;
    }

    scheduleReaderStateSync();
  }, [flushReaderState, novelId, scheduleReaderStateSync]);

  const loadPersistedReaderState = useCallback(async (): Promise<StoredReaderState> => {
    const localState = readStoredReaderState(novelId);
    let remoteState: StoredReaderState | null = null;

    if (novelId) {
      try {
        remoteState = sanitizeStoredReaderState(await readerApi.getProgress(novelId));
        if (remoteState) {
          lastSyncedSnapshotRef.current = getProgressSnapshot(buildStoredReaderState(remoteState));
        }
      } catch {
        remoteState = null;
      }
    }

    const mergedState = mergeStoredReaderState(remoteState, localState);
    latestReaderStateRef.current = mergedState;
    writeStoredReaderState(novelId, mergedState);
    return mergedState;
  }, [novelId]);

  const markUserInteracted = useCallback(() => {
    hasUserInteractedRef.current = true;
  }, []);

  useEffect(() => {
    if (!novelId) return undefined;

    const handlePageHide = () => {
      void flushReaderState();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flushReaderState();
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void flushReaderState();
    };
  }, [flushReaderState, novelId]);

  return {
    hasHydratedReaderState,
    setHasHydratedReaderState,
    latestReaderStateRef,
    hasUserInteractedRef,
    markUserInteracted,
    persistReaderState,
    flushReaderState,
    loadPersistedReaderState,
    initialStoredState,
  };
}
