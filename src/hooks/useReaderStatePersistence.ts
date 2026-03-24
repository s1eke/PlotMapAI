import { useCallback, useEffect, useRef } from 'react';
import {
  flushPersistence,
  getReaderSessionSnapshot,
  getStoredReaderStateSnapshot,
  hydrateSession,
  markUserInteracted,
  persistStoredReaderState,
  readInitialStoredReaderState,
  setHasHydratedReaderState,
  setSessionNovelId,
  useReaderSessionSelector,
  type StoredReaderState,
} from './sessionStore';

interface PersistReaderStateOptions {
  flush?: boolean;
}

export type { PageTarget, StoredReaderState } from './sessionStore';

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
  const snapshot = useReaderSessionSelector(state => ({
    novelId: state.novelId,
    restoreStatus: state.restoreStatus,
    hasUserInteracted: state.hasUserInteracted,
    storedState: getStoredReaderStateSnapshot(),
  }));

  const initialStoredState = readInitialStoredReaderState(novelId);
  const latestReaderStateRef = useRef<StoredReaderState>(
    initialStoredState
      ? {
          chapterIndex: initialStoredState.chapterIndex ?? 0,
          mode: initialStoredState.mode ?? (initialStoredState.viewMode === 'summary'
            ? 'summary'
            : initialStoredState.isTwoColumn
              ? 'paged'
              : 'scroll'),
          viewMode: initialStoredState.viewMode ?? (initialStoredState.mode === 'summary' ? 'summary' : 'original'),
          isTwoColumn: initialStoredState.isTwoColumn ?? (initialStoredState.mode === 'paged'),
          chapterProgress: initialStoredState.chapterProgress,
          scrollPosition: initialStoredState.scrollPosition,
          lastContentMode: initialStoredState.lastContentMode ?? (initialStoredState.mode === 'paged' ? 'paged' : 'scroll'),
        }
      : snapshot.storedState,
  );
  const hasUserInteractedRef = useRef(snapshot.hasUserInteracted);

  useEffect(() => {
    if (novelId && snapshot.novelId !== novelId) {
      return;
    }
    latestReaderStateRef.current = snapshot.storedState;
  }, [novelId, snapshot.novelId, snapshot.storedState]);

  useEffect(() => {
    hasUserInteractedRef.current = snapshot.hasUserInteracted;
  }, [snapshot.hasUserInteracted]);

  const handleSetHasHydratedReaderState = useCallback((nextState: React.SetStateAction<boolean>) => {
    const currentValue = getReaderSessionSnapshot().restoreStatus !== 'hydrating';
    const resolved = typeof nextState === 'function'
      ? nextState(currentValue)
      : nextState;
    setHasHydratedReaderState(resolved);
  }, []);

  const persistReaderState = useCallback((nextState: StoredReaderState, options?: PersistReaderStateOptions) => {
    if (novelId) {
      setSessionNovelId(novelId);
    }
    const inferredMode = nextState.viewMode === 'summary'
      ? 'summary'
      : nextState.isTwoColumn === true
        ? 'paged'
        : nextState.viewMode === 'original' || nextState.isTwoColumn === false
          ? 'scroll'
          : undefined;
    const shouldRecomputeMode = inferredMode !== undefined && nextState.mode !== inferredMode;
    const mergedState: StoredReaderState = {
      ...latestReaderStateRef.current,
      ...nextState,
      ...(shouldRecomputeMode ? { mode: undefined } : {}),
    };
    latestReaderStateRef.current = mergedState;
    persistStoredReaderState(
      mergedState,
      { flush: options?.flush },
    );
  }, [novelId]);

  const loadPersistedReaderState = useCallback(async (): Promise<StoredReaderState> => {
    return hydrateSession(novelId);
  }, [novelId]);

  const flushReaderState = useCallback(async (): Promise<void> => {
    await flushPersistence();
  }, []);

  const handleMarkUserInteracted = useCallback(() => {
    markUserInteracted();
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
    hasHydratedReaderState: snapshot.restoreStatus !== 'hydrating',
    setHasHydratedReaderState: handleSetHasHydratedReaderState,
    latestReaderStateRef,
    hasUserInteractedRef,
    markUserInteracted: handleMarkUserInteracted,
    persistReaderState,
    flushReaderState,
    loadPersistedReaderState,
    initialStoredState,
  };
}
