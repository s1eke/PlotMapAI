import {
  resetAppThemeStoreForTests,
} from '@app/stores/appThemeStore';
import { migrateLegacyReaderStateCacheSnapshot } from '@infra/migrations';
import { mergeReaderStateCacheSnapshot, readReaderStateCacheSnapshot } from '@infra/storage/readerStateCache';
import { useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { ReaderPageTurnMode } from '../constants/pageTurnMode';
import { isPagedPageTurnMode } from '../constants/pageTurnMode';
import { resetReaderPreferencesStoreForTests } from './readerPreferencesStore';
import {
  createRestoreTargetFromPersistedState,
  shouldKeepReaderRestoreMask,
} from '../utils/readerPosition';
import {
  resolveContentModeFromPageTurnMode,
  resolveLastContentMode,
} from '../utils/readerMode';
import type {
  ReaderMode,
  ReaderRestoreTarget,
  ReaderSessionSnapshot,
  ReaderSessionState,
  RestoreStatus,
  StoredReaderState,
} from './readerSessionTypes';
import {
  buildStoredReaderState,
  clampChapterProgress,
  mergeStoredReaderState,
  resolveModeFromStoredState,
  sanitizeStoredReaderState,
} from '../reader-session/state';
import {
  readReadingProgress,
  replaceReadingProgress,
  toReadingProgress,
  type ReadingProgress,
} from '../reader-session/repository';

interface ReaderSessionInternalState extends ReaderSessionState {}

export interface ReaderSessionActions {
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

let syncTimerId: number | null = null;
let syncQueue: Promise<void> = Promise.resolve();
let lastSyncedRemoteSnapshot = '';
let storeEpoch = 0;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function setLastSyncedRemoteSnapshot(snapshot: string): void {
  lastSyncedRemoteSnapshot = snapshot;
}

function readLocalSessionState(novelId: number): StoredReaderState | null {
  if (!isBrowser() || !novelId) {
    return null;
  }

  migrateLegacyReaderStateCacheSnapshot(novelId);
  const parsed = readReaderStateCacheSnapshot(novelId);
  if (!parsed) {
    return null;
  }

  return sanitizeStoredReaderState(parsed);
}

function shouldMaskRestore(target: ReaderRestoreTarget | null | undefined): boolean {
  return shouldKeepReaderRestoreMask(target);
}

function toStoredReaderState(state: ReaderSessionInternalState): StoredReaderState {
  return buildStoredReaderState({
    chapterIndex: state.chapterIndex,
    mode: state.mode,
    chapterProgress: state.chapterProgress,
    lastContentMode: state.lastContentMode,
    locator: state.locator,
  });
}

function getRemoteProgressSnapshot(progress: ReadingProgress): string {
  return JSON.stringify({
    chapterIndex: progress.chapterIndex,
    mode: progress.mode,
    chapterProgress: clampChapterProgress(progress.chapterProgress) ?? null,
    locator: progress.locator ?? null,
  });
}

function toRemoteProgress(state: ReaderSessionInternalState): ReadingProgress {
  return toReadingProgress(toStoredReaderState(state));
}

function inferPageTurnModeFromPersistedState(
  state: StoredReaderState | null | undefined,
): ReaderPageTurnMode {
  return state?.mode === 'paged' || state?.lastContentMode === 'paged'
    ? 'cover'
    : 'scroll';
}

function createInitialReaderSessionState(): ReaderSessionInternalState {
  const mode: ReaderMode = 'scroll';
  return {
    novelId: 0,
    mode,
    chapterIndex: 0,
    chapterProgress: undefined,
    locator: undefined,
    restoreStatus: 'hydrating',
    lastContentMode: 'scroll',
    pendingRestoreTarget: null,
    hasUserInteracted: false,
  };
}

export function createReaderSessionStore(): ReaderSessionStore {
  return createStore<ReaderSessionInternalState>()(
    subscribeWithSelector(() => createInitialReaderSessionState()),
  );
}

export const readerSessionStore = createReaderSessionStore();

function writeReaderSessionCache(state: ReaderSessionInternalState): void {
  if (!isBrowser() || !state.novelId) {
    return;
  }

  mergeReaderStateCacheSnapshot(state.novelId, toStoredReaderState(state));
}

function setReaderSessionStoreState(
  partial: Partial<ReaderSessionInternalState>,
  options: { writeCache?: boolean } = {},
): void {
  const nextState = {
    ...readerSessionStore.getState(),
    ...partial,
  };

  readerSessionStore.setState(nextState);
  if (options.writeCache !== false) {
    writeReaderSessionCache(nextState);
  }
}

function enqueueRemotePersistence(
  progress: ReadingProgress,
  novelId = readerSessionStore.getState().novelId,
): Promise<void> {
  if (!novelId) return Promise.resolve();
  const snapshot = getRemoteProgressSnapshot(progress);
  if (snapshot === lastSyncedRemoteSnapshot) return syncQueue;

  syncQueue = syncQueue
    .then(async () => {
      if (snapshot === lastSyncedRemoteSnapshot) return;
      await replaceReadingProgress(novelId, {
        chapterIndex: progress.chapterIndex,
        mode: progress.mode,
        chapterProgress: progress.chapterProgress,
        locator: progress.locator,
      });
      setLastSyncedRemoteSnapshot(snapshot);
    })
    .catch(() => undefined);

  return syncQueue;
}

function scheduleRemotePersistence(): void {
  const state = readerSessionStore.getState();
  if (!isBrowser() || !state.novelId) return;
  if (syncTimerId !== null) {
    window.clearTimeout(syncTimerId);
  }

  syncTimerId = window.setTimeout(() => {
    syncTimerId = null;
    enqueueRemotePersistence(toRemoteProgress(readerSessionStore.getState()));
  }, READER_STATE_SYNC_DELAY_MS);
}

function updateStoredReaderState(
  nextState: StoredReaderState,
  options: SessionUpdateOptions = {},
): StoredReaderState {
  const currentState = readerSessionStore.getState();
  const merged = mergeStoredReaderState(toStoredReaderState(currentState), nextState);
  const mode = resolveModeFromStoredState(merged);
  const nextLastContentMode = merged.lastContentMode
    ?? resolveLastContentMode(mode, currentState.lastContentMode);

  setReaderSessionStoreState({
    mode,
    chapterIndex: merged.chapterIndex ?? 0,
    chapterProgress: clampChapterProgress(merged.chapterProgress),
    locator: merged.locator,
    lastContentMode: resolveLastContentMode(mode, nextLastContentMode),
    hasUserInteracted: options.markUserInteracted ?? currentState.hasUserInteracted,
  });

  if (options.persistRemote) {
    if (options.flush) {
      enqueueRemotePersistence(toRemoteProgress(readerSessionStore.getState()));
    } else {
      scheduleRemotePersistence();
    }
  }

  return merged;
}

export async function hydrateSession(
  novelId: number,
  options: ReaderSessionHydrationOptions = {},
): Promise<StoredReaderState> {
  storeEpoch += 1;
  const epochAtStart = storeEpoch;
  const localState = readLocalSessionState(novelId);

  setReaderSessionStoreState({
    novelId,
    restoreStatus: 'hydrating',
    pendingRestoreTarget: null,
    hasUserInteracted: false,
    chapterIndex: 0,
    chapterProgress: undefined,
    locator: undefined,
    mode: 'scroll',
    lastContentMode: 'scroll',
  }, { writeCache: false });

  let remoteState: StoredReaderState | null = null;
  try {
    remoteState = await readReadingProgress(novelId);
    if (remoteState) {
      setLastSyncedRemoteSnapshot(getRemoteProgressSnapshot(toReadingProgress(remoteState)));
    }
  } catch {
    remoteState = null;
  }

  if (epochAtStart !== storeEpoch) {
    return buildStoredReaderState(remoteState ?? localState);
  }

  const baseState = remoteState ?? localState;
  const resolvedPageTurnMode = options.hasConfiguredPageTurnMode && options.pageTurnMode
    ? options.pageTurnMode
    : inferPageTurnModeFromPersistedState(baseState);
  const resolvedContentMode = resolveContentModeFromPageTurnMode(resolvedPageTurnMode);
  const mode = baseState?.mode === 'summary'
    ? 'summary'
    : resolvedContentMode;
  const nextLastContentMode = resolveLastContentMode(
    mode,
    isPagedPageTurnMode(resolvedPageTurnMode) ? 'paged' : 'scroll',
  );
  const hydratedState = buildStoredReaderState({
    ...baseState,
    mode,
    lastContentMode: nextLastContentMode,
  });
  const pendingRestoreTarget = createRestoreTargetFromPersistedState(hydratedState);

  setReaderSessionStoreState({
    novelId,
    mode,
    chapterIndex: hydratedState.chapterIndex ?? 0,
    chapterProgress: clampChapterProgress(hydratedState.chapterProgress),
    locator: hydratedState.locator,
    lastContentMode: nextLastContentMode,
    pendingRestoreTarget,
    restoreStatus: shouldMaskRestore(pendingRestoreTarget) ? 'restoring' : 'ready',
  });

  return hydratedState;
}

export function setMode(mode: ReaderMode, options: SessionUpdateOptions = {}): void {
  const currentState = readerSessionStore.getState();
  updateStoredReaderState(
    {
      chapterIndex: currentState.chapterIndex,
      chapterProgress: currentState.chapterProgress,
      mode,
      lastContentMode: resolveLastContentMode(mode, currentState.lastContentMode),
    },
    { persistRemote: true, markUserInteracted: options.markUserInteracted, flush: options.flush },
  );
}

export function setChapterIndex(chapterIndex: number, options: SessionUpdateOptions = {}): void {
  updateStoredReaderState(
    { chapterIndex },
    { persistRemote: true, markUserInteracted: options.markUserInteracted, flush: options.flush },
  );
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
  setReaderSessionStoreState({ pendingRestoreTarget: nextTarget }, { writeCache: false });
}

export function setRestoreStatus(restoreStatus: RestoreStatus): void {
  setReaderSessionStoreState({ restoreStatus }, { writeCache: false });
}

export function setSessionNovelId(novelId: number): void {
  if (readerSessionStore.getState().novelId === novelId) {
    return;
  }

  setReaderSessionStoreState({ novelId }, { writeCache: false });
}

export function beginRestore(nextTarget: ReaderRestoreTarget | null | undefined): void {
  setReaderSessionStoreState({
    pendingRestoreTarget: nextTarget ?? null,
    restoreStatus: shouldMaskRestore(nextTarget) ? 'restoring' : 'ready',
  }, { writeCache: false });
}

export function completeRestore(): void {
  setReaderSessionStoreState({
    pendingRestoreTarget: null,
    restoreStatus: 'ready',
  }, { writeCache: false });
}

export function failRestore(): void {
  setReaderSessionStoreState({ restoreStatus: 'error' }, { writeCache: false });
}

export function markUserInteracted(): void {
  setReaderSessionStoreState({ hasUserInteracted: true }, { writeCache: false });
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
  options?: { flush?: boolean },
): void {
  updateStoredReaderState(nextState, {
    persistRemote: true,
    flush: options?.flush,
  });
}

export async function flushPersistence(): Promise<void> {
  const currentState = readerSessionStore.getState();
  const { novelId } = currentState;
  const progress = toRemoteProgress(currentState);

  if (syncTimerId !== null && isBrowser()) {
    window.clearTimeout(syncTimerId);
    syncTimerId = null;
  }

  await enqueueRemotePersistence(progress, novelId);
}

export function useReaderSessionSelector<T>(
  selector: (state: ReaderSessionSnapshot) => T,
): T {
  return useStore(readerSessionStore, selector);
}

export function useReaderSessionActions(): ReaderSessionActions {
  return {
    hydrateSession,
    setMode,
    setChapterIndex,
    setReadingPosition,
    beginRestore,
    completeRestore,
    failRestore,
    flushPersistence,
  };
}

export function resetReaderSessionStoreForTests(): void {
  storeEpoch += 1;
  if (syncTimerId !== null && isBrowser()) {
    window.clearTimeout(syncTimerId);
    syncTimerId = null;
  }

  lastSyncedRemoteSnapshot = '';
  syncQueue = Promise.resolve();
  resetReaderPreferencesStoreForTests();
  resetAppThemeStoreForTests();
  const initialState = createInitialReaderSessionState();
  readerSessionStore.setState(initialState);
}
