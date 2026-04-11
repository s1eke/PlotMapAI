import { useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ReaderPageTurnMode } from '@shared/contracts/reader/preferences';
import {
  createPersistedRuntime,
} from '@shared/stores/persistence/createPersistedRuntime';
import {
  resetReaderPreferenceStoreForTests,
} from '@shared/stores/readerPreferenceStore';
import {
  createRestoreTargetFromPersistedState,
} from '@shared/utils/readerPosition';
import {
  resolveContentModeFromPageTurnMode,
  resolveLastContentMode,
} from '@shared/utils/readerMode';
import type {
  ReaderLifecycleEvent,
  ReaderMode,
  ReaderRestoreResult,
  ReaderRestoreTarget,
  ReaderSessionSnapshot,
  ReaderSessionState,
  StoredReaderState,
} from '@shared/contracts/reader';
import {
  clearReaderBootstrapSnapshot,
} from '@infra/storage/readerStateCache';
import {
  buildStoredReaderState,
  clampChapterProgress,
  createDefaultStoredReaderState,
  getStoredChapterIndex,
  mergeStoredReaderState,
  toReaderLocatorFromCanonical,
} from './state';
import {
  readReadingProgress,
  replaceReadingProgress,
  toReadingProgress,
} from './repository';
import { reduceReaderLifecycleState } from './lifecycleStateMachine';
import { writeReaderLifecycleDebugSnapshot } from './readerLifecycleDebugSnapshot';
import { debugLog, setDebugSnapshot } from '@shared/debug';
import {
  createInitialReaderSessionState,
  getRemoteProgressSnapshot,
  readLocalSessionState,
  shouldMaskRestore,
  toPersistenceFailure,
  toRemoteProgress,
  toStoredReaderState,
  writeReaderSessionCache,
} from './sessionPersistenceHelpers';

interface ReaderSessionInternalState extends ReaderSessionState {}

export interface ReaderSessionActions {
  dispatchLifecycleEvent: (event: ReaderLifecycleEvent) => void;
  hydrateSession: (
    novelId: number,
    options?: ReaderSessionHydrationOptions,
  ) => Promise<StoredReaderState>;
  setMode: (mode: ReaderMode, options?: SessionUpdateOptions) => void;
  setChapterIndex: (chapterIndex: number, options?: SessionUpdateOptions) => void;
  setReadingPosition: (state: StoredReaderState, options?: SessionUpdateOptions) => void;
  beginRestore: (target: ReaderRestoreTarget | null | undefined) => void;
  completeRestore: () => void;
  failRestore: () => void;
  setLastRestoreResult: (result: ReaderRestoreResult | null) => void;
  flushPersistence: () => Promise<void>;
}

interface SessionUpdateOptions {
  flush?: boolean;
  persistRemote?: boolean;
  markUserInteracted?: boolean;
}

export interface ReaderSessionHydrationOptions {
  hasConfiguredPageTurnMode?: boolean;
  pageTurnMode?: ReaderPageTurnMode;
}

type ReaderSessionStore = StoreApi<ReaderSessionInternalState>;

const READER_STATE_SYNC_DELAY_MS = 400;

let lastSyncedRemoteSnapshot = '';
let sessionHydrationEpoch = 0;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function setLastSyncedRemoteSnapshot(snapshot: string): void {
  lastSyncedRemoteSnapshot = snapshot;
}

export function createReaderSessionStore(): ReaderSessionStore {
  return createStore<ReaderSessionInternalState>()(
    subscribeWithSelector(() => createInitialReaderSessionState()),
  );
}

export const readerSessionStore = createReaderSessionStore();

function patchReaderSessionState(
  partial: Partial<ReaderSessionInternalState>,
  options?: {
    flush?: boolean;
    persist?: boolean;
    bumpRevision?: boolean;
    writeCache?: boolean;
  },
): void {
  readerSessionRuntime.patch(partial, options);
}

function applyReaderLifecycleEvent(
  event: ReaderLifecycleEvent,
  partial: Partial<ReaderSessionInternalState> = {},
): void {
  const currentState = readerSessionStore.getState();
  const nextLifecycle = reduceReaderLifecycleState({
    lifecycleLoadKey: currentState.lifecycleLoadKey,
    restoreStatus: currentState.restoreStatus,
  }, event);

  patchReaderSessionState({
    ...partial,
    restoreStatus: nextLifecycle.restoreStatus,
    lifecycleLastEvent: event.type,
    lifecycleLoadKey: nextLifecycle.lifecycleLoadKey,
  }, {
    persist: false,
    writeCache: false,
  });
}

async function persistRemoteReaderSession(state: ReaderSessionInternalState): Promise<void> {
  const { novelId } = state;
  if (!novelId) {
    return;
  }

  const progress = toRemoteProgress(state);
  if (!progress) {
    return;
  }

  const snapshot = getRemoteProgressSnapshot(progress);
  if (snapshot === lastSyncedRemoteSnapshot) {
    return;
  }

  await replaceReadingProgress(novelId, {
    canonical: progress.canonical,
  });
  setLastSyncedRemoteSnapshot(snapshot);
}

const readerSessionRuntime = createPersistedRuntime<ReaderSessionInternalState>({
  cacheWritePolicy: 'afterPersist',
  createInitialState: createInitialReaderSessionState,
  isEnabled: isBrowser,
  onPersistError: (error) => {
    patchReaderSessionState({
      persistenceStatus: 'degraded',
      lastPersistenceFailure: toPersistenceFailure(error, {
        message: 'failed to persist reader progress',
      }),
    }, {
      persist: false,
      writeCache: false,
    });
  },
  onPersistSuccess: () => {
    const currentState = readerSessionStore.getState();
    if (currentState.persistenceStatus === 'healthy' && !currentState.lastPersistenceFailure) {
      return;
    }

    patchReaderSessionState({
      persistenceStatus: 'healthy',
      lastPersistenceFailure: null,
    }, {
      persist: false,
      writeCache: false,
    });
  },
  onReset: () => {
    sessionHydrationEpoch += 1;
    lastSyncedRemoteSnapshot = '';
    resetReaderPreferenceStoreForTests();
  },
  onStateChange: (state) => {
    writeReaderLifecycleDebugSnapshot(state);
  },
  persist: persistRemoteReaderSession,
  persistDelayMs: READER_STATE_SYNC_DELAY_MS,
  store: readerSessionStore,
  writeCache: writeReaderSessionCache,
});

function updateStoredReaderState(
  nextState: StoredReaderState,
  options: SessionUpdateOptions = {},
): StoredReaderState {
  const currentState = readerSessionStore.getState();
  const merged = mergeStoredReaderState(toStoredReaderState(currentState), nextState);
  const nextCanonical = merged.canonical;
  const nextChapterIndex = getStoredChapterIndex(merged);
  const nextLocator = toReaderLocatorFromCanonical(nextCanonical, merged.hints?.pageIndex);
  const shouldPersistRemote = options.persistRemote ?? true;

  readerSessionRuntime.patch({
    canonical: nextCanonical,
    chapterIndex: nextChapterIndex,
    chapterProgress: clampChapterProgress(merged.hints?.chapterProgress),
    locator: nextLocator,
    hasUserInteracted: options.markUserInteracted ?? currentState.hasUserInteracted,
  }, {
    bumpRevision: shouldPersistRemote,
    flush: options.flush,
    persist: shouldPersistRemote,
  });

  return merged;
}

export async function hydrateSession(
  novelId: number,
  options: ReaderSessionHydrationOptions = {},
): Promise<StoredReaderState> {
  await readerSessionRuntime.flush();
  sessionHydrationEpoch += 1;
  const epochAtStart = sessionHydrationEpoch;
  const initialStoredState = createDefaultStoredReaderState();

  applyReaderLifecycleEvent({ type: 'NOVEL_OPEN_STARTED' }, {
    novelId,
    lastRestoreResult: null,
    pendingRestoreTarget: null,
    hasUserInteracted: false,
    canonical: initialStoredState.canonical,
    chapterIndex: getStoredChapterIndex(initialStoredState),
    chapterProgress: undefined,
    locator: toReaderLocatorFromCanonical(initialStoredState.canonical),
    mode: 'scroll',
    lastContentMode: 'scroll',
    persistenceStatus: 'healthy',
    lastPersistenceFailure: null,
  });

  let remoteState: StoredReaderState | null = null;
  try {
    remoteState = await readReadingProgress(novelId);
    if (remoteState) {
      setLastSyncedRemoteSnapshot(getRemoteProgressSnapshot(toReadingProgress(remoteState)));
    } else {
      setLastSyncedRemoteSnapshot('null');
    }
  } catch (error) {
    if (epochAtStart !== sessionHydrationEpoch) {
      return buildStoredReaderState(initialStoredState);
    }

    patchReaderSessionState({
      persistenceStatus: 'degraded',
      lastPersistenceFailure: toPersistenceFailure(error, {
        message: 'failed to read reader progress',
      }),
    }, {
      persist: false,
      writeCache: false,
    });
    applyReaderLifecycleEvent({ type: 'HYDRATE_FAILED' });
    throw error;
  }

  if (epochAtStart !== sessionHydrationEpoch) {
    return buildStoredReaderState(remoteState ?? initialStoredState);
  }

  if (!remoteState) {
    clearReaderBootstrapSnapshot(novelId);
  }

  const baseState = buildStoredReaderState(remoteState ?? initialStoredState);
  const resolvedPageTurnMode = options.pageTurnMode ?? 'scroll';
  const mode = resolveContentModeFromPageTurnMode(resolvedPageTurnMode);
  const nextLastContentMode = resolveLastContentMode(
    mode,
    mode === 'paged' ? 'paged' : 'scroll',
  );
  const pendingRestoreTarget = createRestoreTargetFromPersistedState(baseState, mode);
  const modeHydrationSnapshot = {
    source: 'readerSessionStore.hydrateSession',
    novelId,
    hasConfiguredPageTurnMode: options.hasConfiguredPageTurnMode ?? false,
    resolvedPageTurnMode,
    modeFromPageTurnPreference: mode,
    hasRemoteProgress: Boolean(remoteState),
    persistedHintContentMode: baseState.hints?.contentMode ?? null,
    pendingRestoreTargetMode: pendingRestoreTarget?.mode ?? null,
  };
  setDebugSnapshot('reader-mode-hydration', modeHydrationSnapshot);
  debugLog('Reader', 'reader session hydration mode snapshot', modeHydrationSnapshot);
  const positionHydrationSnapshot = {
    source: 'readerSessionStore.hydrateSession',
    novelId,
    hasRemoteProgress: Boolean(remoteState),
    canonical: baseState.canonical ?? null,
    hints: baseState.hints ?? null,
    pendingRestoreTarget: pendingRestoreTarget
      ? {
        mode: pendingRestoreTarget.mode,
        chapterIndex: pendingRestoreTarget.chapterIndex,
        hasLocator: Boolean(pendingRestoreTarget.locator),
        locatorBoundary: pendingRestoreTarget.locatorBoundary ?? null,
        chapterProgress: pendingRestoreTarget.chapterProgress ?? null,
      }
      : null,
  };
  setDebugSnapshot('reader-position-hydration', positionHydrationSnapshot);
  debugLog('Reader', 'reader session hydration position snapshot', positionHydrationSnapshot);
  readerSessionRuntime.patch({
    novelId,
    canonical: baseState.canonical,
    mode,
    chapterIndex: getStoredChapterIndex(baseState),
    chapterProgress: clampChapterProgress(baseState.hints?.chapterProgress),
    locator: toReaderLocatorFromCanonical(baseState.canonical, baseState.hints?.pageIndex),
    lastContentMode: nextLastContentMode,
    pendingRestoreTarget,
    lastRestoreResult: null,
  }, {
    persist: false,
  });

  return baseState;
}

export function setMode(mode: ReaderMode, options: SessionUpdateOptions = {}): void {
  const currentState = readerSessionStore.getState();
  readerSessionRuntime.patch({
    mode,
    lastContentMode: resolveLastContentMode(mode, currentState.lastContentMode),
    hasUserInteracted: options.markUserInteracted ?? currentState.hasUserInteracted,
  }, {
    flush: options.flush,
    persist: false,
  });
}

export function setChapterIndex(chapterIndex: number, options: SessionUpdateOptions = {}): void {
  const currentState = readerSessionStore.getState();
  const shouldPersistRemote = options.persistRemote ?? false;

  readerSessionRuntime.patch({
    chapterIndex,
    chapterProgress:
      currentState.chapterIndex === chapterIndex ? currentState.chapterProgress : undefined,
    locator:
      currentState.locator?.chapterIndex === chapterIndex ? currentState.locator : undefined,
    hasUserInteracted: options.markUserInteracted ?? currentState.hasUserInteracted,
  }, {
    bumpRevision: shouldPersistRemote,
    flush: options.flush,
    persist: shouldPersistRemote,
  });
}

export function setReadingPosition(
  nextState: StoredReaderState,
  options: SessionUpdateOptions = {},
): void {
  updateStoredReaderState(nextState, {
    persistRemote: options.persistRemote ?? true,
    markUserInteracted: options.markUserInteracted,
    flush: options.flush,
  });
}

export function setPendingRestoreTarget(nextTarget: ReaderRestoreTarget | null): void {
  patchReaderSessionState({ pendingRestoreTarget: nextTarget }, {
    persist: false,
    writeCache: false,
  });
}

export function setLastRestoreResult(
  lastRestoreResult: ReaderRestoreResult | null,
): void {
  patchReaderSessionState({ lastRestoreResult }, {
    persist: false,
    writeCache: false,
  });
}

export function dispatchReaderLifecycleEvent(event: ReaderLifecycleEvent): void {
  applyReaderLifecycleEvent(event);
}

export function setSessionNovelId(novelId: number): void {
  if (readerSessionStore.getState().novelId === novelId) {
    return;
  }

  patchReaderSessionState({ novelId }, {
    persist: false,
    writeCache: false,
  });
}

export function beginRestore(nextTarget: ReaderRestoreTarget | null | undefined): void {
  const nextEvent: ReaderLifecycleEvent = shouldMaskRestore(nextTarget)
    ? { type: 'RESTORE_STARTED' }
    : { type: 'RESTORE_CLEARED' };
  applyReaderLifecycleEvent(nextEvent, {
    pendingRestoreTarget: nextTarget ?? null,
    lastRestoreResult: null,
  });
}

export function completeRestore(): void {
  applyReaderLifecycleEvent({ type: 'RESTORE_CLEARED' }, {
    pendingRestoreTarget: null,
  });
}

export function failRestore(): void {
  applyReaderLifecycleEvent({
    type: 'RESTORE_SETTLED',
    result: 'failed',
    awaitingPagedLayout: false,
  });
}

export function markUserInteracted(): void {
  patchReaderSessionState({ hasUserInteracted: true }, {
    persist: false,
    writeCache: false,
  });
}

export function getReaderSessionSnapshot(): ReaderSessionSnapshot {
  return readerSessionStore.getState();
}

export function getStoredReaderStateSnapshot(): StoredReaderState {
  return toStoredReaderState(readerSessionStore.getState());
}

export function readInitialStoredReaderState(novelId: number): StoredReaderState | null {
  const localState = readLocalSessionState(novelId);
  return localState ? buildStoredReaderState(localState) : null;
}

export function persistStoredReaderState(
  nextState: StoredReaderState,
  options?: { flush?: boolean; persistRemote?: boolean },
): void {
  updateStoredReaderState(nextState, {
    persistRemote: options?.persistRemote ?? true,
    flush: options?.flush,
  });
}

export async function flushPersistence(): Promise<void> {
  await readerSessionRuntime.flush();
}

export function useReaderSessionSelector<T>(
  selector: (state: ReaderSessionSnapshot) => T,
): T {
  return useStore(readerSessionStore, selector);
}

export function useReaderSessionActions(): ReaderSessionActions {
  return {
    dispatchLifecycleEvent: dispatchReaderLifecycleEvent,
    hydrateSession,
    setMode,
    setChapterIndex,
    setReadingPosition,
    beginRestore,
    completeRestore,
    failRestore,
    setLastRestoreResult,
    flushPersistence,
  };
}

export function resetReaderSessionStoreForTests(): void {
  readerSessionRuntime.reset();
}
