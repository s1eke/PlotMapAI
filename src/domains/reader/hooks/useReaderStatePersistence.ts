import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  flushPersistence,
  hydrateSession,
  markUserInteracted,
  persistStoredReaderState,
  readInitialStoredReaderState,
  setSessionNovelId,
  useReaderSessionSelector,
  type StoredReaderState,
} from './sessionStore';

interface PersistReaderStateOptions {
  flush?: boolean;
}

export type { PageTarget, StoredReaderState } from './sessionStore';
export type {
  ReaderMode,
  ReaderNavigationIntent,
  ReaderRestoreTarget,
} from './sessionStore';

function buildNovelScopedInitialState(
  initialStoredState: StoredReaderState | null,
): StoredReaderState {
  const resolvedMode = initialStoredState?.mode ?? 'scroll';

  if (!initialStoredState) {
    return {
      chapterIndex: 0,
      mode: 'scroll',
      chapterProgress: undefined,
      scrollPosition: undefined,
      lastContentMode: 'scroll',
      locatorVersion: undefined,
      locator: undefined,
    };
  }

  return {
    chapterIndex: initialStoredState.chapterIndex ?? 0,
    mode: resolvedMode,
    chapterProgress: initialStoredState.chapterProgress,
    scrollPosition: initialStoredState.scrollPosition,
    lastContentMode: initialStoredState.lastContentMode ?? (resolvedMode === 'paged' ? 'paged' : 'scroll'),
    locatorVersion: initialStoredState.locator ? 1 : undefined,
    locator: initialStoredState.locator,
  };
}

export function useReaderStatePersistence(novelId: number): {
  latestReaderStateRef: React.MutableRefObject<StoredReaderState>;
  hasUserInteractedRef: React.MutableRefObject<boolean>;
  markUserInteracted: () => void;
  persistReaderState: (nextState: StoredReaderState, options?: PersistReaderStateOptions) => void;
  flushReaderState: () => Promise<void>;
  loadPersistedReaderState: () => Promise<StoredReaderState>;
  initialStoredState: StoredReaderState | null;
} {
  const sessionNovelId = useReaderSessionSelector((state) => state.novelId);
  const hasUserInteracted = useReaderSessionSelector((state) => state.hasUserInteracted);
  const chapterIndex = useReaderSessionSelector((state) => state.chapterIndex);
  const mode = useReaderSessionSelector((state) => state.mode);
  const chapterProgress = useReaderSessionSelector((state) => state.chapterProgress);
  const scrollPosition = useReaderSessionSelector((state) => state.scrollPosition);
  const lastContentMode = useReaderSessionSelector((state) => state.lastContentMode);
  const locatorVersion = useReaderSessionSelector((state) => state.locatorVersion);
  const locator = useReaderSessionSelector((state) => state.locator);
  const storedState = useMemo<StoredReaderState>(() => ({
    chapterIndex,
    mode,
    chapterProgress,
    scrollPosition,
    lastContentMode,
    locatorVersion,
    locator,
  }), [
    chapterIndex,
    chapterProgress,
    lastContentMode,
    locator,
    locatorVersion,
    mode,
    scrollPosition,
  ]);
  const snapshot = useMemo(() => ({
    novelId: sessionNovelId,
    hasUserInteracted,
    storedState,
  }), [hasUserInteracted, sessionNovelId, storedState]);

  const initialStoredState = useMemo(
    () => readInitialStoredReaderState(novelId),
    [novelId],
  );
  const novelScopedInitialState = useMemo(
    () => buildNovelScopedInitialState(initialStoredState),
    [initialStoredState],
  );
  const isSessionNovelAligned = !novelId || snapshot.novelId === novelId;
  const canPersistForCurrentNovel =
    !novelId || snapshot.novelId === novelId || snapshot.novelId === 0;
  const latestReaderStateRef = useRef<StoredReaderState>(
    isSessionNovelAligned ? snapshot.storedState : novelScopedInitialState,
  );
  const hasUserInteractedRef = useRef(snapshot.hasUserInteracted);

  useEffect(() => {
    if (!isSessionNovelAligned) {
      latestReaderStateRef.current = novelScopedInitialState;
      return;
    }

    latestReaderStateRef.current = snapshot.storedState;
  }, [isSessionNovelAligned, novelScopedInitialState, snapshot.storedState]);

  useEffect(() => {
    if (!isSessionNovelAligned) return;
    hasUserInteractedRef.current = snapshot.hasUserInteracted;
  }, [isSessionNovelAligned, snapshot.hasUserInteracted]);

  useEffect(() => {
    hasUserInteractedRef.current = false;
  }, [novelId]);

  const persistReaderState = useCallback(
    (nextState: StoredReaderState, options?: PersistReaderStateOptions) => {
      if (!canPersistForCurrentNovel) {
        return;
      }

      if (novelId) {
        setSessionNovelId(novelId);
      }
      const mergedState: StoredReaderState = {
        ...latestReaderStateRef.current,
        ...nextState,
      };
      latestReaderStateRef.current = mergedState;
      persistStoredReaderState(
        mergedState,
        { flush: options?.flush },
      );
    },
    [canPersistForCurrentNovel, novelId],
  );

  const loadPersistedReaderState = useCallback(async (): Promise<StoredReaderState> => {
    return hydrateSession(novelId);
  }, [novelId]);

  const flushReaderState = useCallback(async (): Promise<void> => {
    await flushPersistence();
  }, []);

  const handleMarkUserInteracted = useCallback(() => {
    hasUserInteractedRef.current = true;
    markUserInteracted();
  }, []);

  useEffect(() => {
    if (!novelId) return undefined;
    const handlePageHide = () => {
      flushReaderState();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushReaderState();
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushReaderState();
    };
  }, [flushReaderState, novelId]);

  return {
    latestReaderStateRef,
    hasUserInteractedRef,
    markUserInteracted: handleMarkUserInteracted,
    persistReaderState,
    flushReaderState,
    loadPersistedReaderState,
    initialStoredState,
  };
}
