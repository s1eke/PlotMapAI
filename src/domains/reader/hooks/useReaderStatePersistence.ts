import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  ensureReaderPreferencesHydrated,
  getReaderPreferencesSnapshot,
  hasConfiguredReaderPageTurnMode,
} from './readerPreferencesStore';
import {
  flushPersistence,
  getStoredReaderStateSnapshot,
  hydrateSession,
  markUserInteracted,
  mergeStoredReaderState,
  persistStoredReaderState,
  readInitialStoredReaderState,
  setSessionNovelId,
  useReaderSessionSelector,
  type StoredReaderState,
} from './sessionStore';
import { createDefaultStoredReaderState } from '../reader-session/state';

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
    return createDefaultStoredReaderState();
  }

  return {
    chapterIndex: initialStoredState.chapterIndex ?? 0,
    mode: resolvedMode,
    chapterProgress: initialStoredState.chapterProgress,
    lastContentMode: initialStoredState.lastContentMode ?? (resolvedMode === 'paged' ? 'paged' : 'scroll'),
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
  const lastContentMode = useReaderSessionSelector((state) => state.lastContentMode);
  const locator = useReaderSessionSelector((state) => state.locator);
  const storedState = useMemo<StoredReaderState>(() => ({
    chapterIndex,
    mode,
    chapterProgress,
    lastContentMode,
    locator,
  }), [
    chapterIndex,
    chapterProgress,
    lastContentMode,
    locator,
    mode,
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
      const mergedState = mergeStoredReaderState(
        latestReaderStateRef.current,
        nextState,
      );
      persistStoredReaderState(
        mergedState,
        { flush: options?.flush },
      );
      latestReaderStateRef.current = getStoredReaderStateSnapshot();
    },
    [canPersistForCurrentNovel, novelId],
  );

  const loadPersistedReaderState = useCallback(async (): Promise<StoredReaderState> => {
    await ensureReaderPreferencesHydrated();
    const preferences = getReaderPreferencesSnapshot();
    return hydrateSession(novelId, {
      hasConfiguredPageTurnMode: hasConfiguredReaderPageTurnMode(),
      pageTurnMode: preferences.pageTurnMode,
    });
  }, [novelId]);

  const flushReaderState = useCallback(async (): Promise<void> => {
    await flushPersistence();
  }, []);

  const handleMarkUserInteracted = useCallback(() => {
    hasUserInteractedRef.current = true;
    markUserInteracted();
  }, []);

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
