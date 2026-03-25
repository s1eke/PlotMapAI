import { useSyncExternalStore } from 'react';
import { APP_SETTING_KEYS, CACHE_KEYS, storage } from '@infra/storage';
import { readerApi, type ReadingProgress } from '../api/readerApi';

export type PageTarget = 'start' | 'end';
export type ReaderMode = 'scroll' | 'paged' | 'summary';
export type AppTheme = 'light' | 'dark';
export type RestoreStatus = 'hydrating' | 'restoring' | 'ready' | 'error';

const READER_STATE_SYNC_DELAY_MS = 400;
const DEFAULT_FONT_SIZE = 18;
const DEFAULT_LINE_SPACING = 1.8;
const DEFAULT_PARAGRAPH_SPACING = 16;

export interface StoredReaderState {
  chapterIndex?: number;
  mode?: ReaderMode;
  viewMode?: 'original' | 'summary';
  isTwoColumn?: boolean;
  chapterProgress?: number;
  scrollPosition?: number;
  lastContentMode?: 'scroll' | 'paged';
}

export interface ReaderSessionState {
  novelId: number;
  mode: ReaderMode;
  chapterIndex: number;
  chapterProgress?: number;
  scrollPosition?: number;
  readerTheme: string;
  appTheme: AppTheme;
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
  restoreStatus: RestoreStatus;
}

interface ReaderSessionInternalState extends ReaderSessionState {
  viewMode: 'original' | 'summary';
  isTwoColumn: boolean;
  lastContentMode: 'scroll' | 'paged';
  pendingRestoreState: StoredReaderState | null;
  hasUserInteracted: boolean;
}

export type ReaderSessionSnapshot = ReaderSessionInternalState;

export interface ReaderSessionActions {
  hydrateSession: (novelId: number) => Promise<StoredReaderState>;
  setMode: (mode: ReaderMode, options?: SessionUpdateOptions) => void;
  setChapterIndex: (chapterIndex: number, options?: SessionUpdateOptions) => void;
  setReadingPosition: (state: StoredReaderState, options?: SessionUpdateOptions) => void;
  setReaderTheme: (theme: string) => void;
  setAppTheme: (theme: AppTheme) => void;
  setTypography: (state: TypographyState) => void;
  beginRestore: (state: StoredReaderState | null | undefined) => void;
  completeRestore: () => void;
  failRestore: () => void;
  flushPersistence: () => Promise<void>;
}

interface TypographyState {
  fontSize?: number;
  lineSpacing?: number;
  paragraphSpacing?: number;
}

interface LocalReaderSessionSnapshot extends StoredReaderState {
  readerTheme?: string;
  appTheme?: AppTheme;
  fontSize?: number;
  lineSpacing?: number;
  paragraphSpacing?: number;
}

interface SessionUpdateOptions {
  flush?: boolean;
  persistRemote?: boolean;
  markUserInteracted?: boolean;
}

interface SessionPreferenceSnapshot {
  readerTheme: string;
  appTheme: AppTheme;
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
}

const listeners = new Set<() => void>();
let syncTimerId: number | null = null;
let syncQueue: Promise<void> = Promise.resolve();
let lastSyncedRemoteSnapshot = '';
let settingsHydrationPromise: Promise<void> | null = null;
let settingsHydrated = false;
let settingsPersistTimerId: number | null = null;
let settingsPersistQueue: Promise<void> = Promise.resolve();
let preferenceRevision = 0;
let storeEpoch = 0;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readStringCache(key: string): string | null {
  return storage.cache.getString(key);
}

function readNumberCache(key: string, fallback: number): number {
  const saved = readStringCache(key);
  const numeric = saved ? Number(saved) : Number.NaN;
  return Number.isFinite(numeric) ? numeric : fallback;
}

function readReaderTheme(): string {
  return readStringCache(CACHE_KEYS.readerTheme) || 'auto';
}

function readAppTheme(): AppTheme {
  if (!isBrowser()) return 'light';
  const saved = readStringCache(CACHE_KEYS.theme);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyAppTheme(theme: AppTheme): void {
  if (!isBrowser()) return;
  const root = window.document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

function clampChapterProgress(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function shouldMaskRestore(state: StoredReaderState | null | undefined): boolean {
  if (!state) return false;
  const mode = resolveModeFromStoredState(state);
  return (state.chapterIndex ?? 0) > 0
    || mode === 'summary'
    || mode === 'paged'
    || (typeof state.chapterProgress === 'number' && state.chapterProgress > 0)
    || (typeof state.scrollPosition === 'number' && state.scrollPosition > 0);
}

function resolveModeFromStoredState(state: StoredReaderState | null | undefined): ReaderMode {
  if (state?.mode === 'scroll' || state?.mode === 'paged' || state?.mode === 'summary') {
    return state.mode;
  }
  if (state?.viewMode === 'summary') return 'summary';
  return state?.isTwoColumn ? 'paged' : 'scroll';
}

function deriveViewState(mode: ReaderMode): Pick<ReaderSessionInternalState, 'mode' | 'viewMode' | 'isTwoColumn'> {
  return {
    mode,
    viewMode: mode === 'summary' ? 'summary' : 'original',
    isTwoColumn: mode === 'paged',
  };
}

function toStoredReaderState(state: ReaderSessionInternalState): StoredReaderState {
  return {
    chapterIndex: state.chapterIndex,
    mode: state.mode,
    viewMode: state.viewMode,
    isTwoColumn: state.isTwoColumn,
    chapterProgress: clampChapterProgress(state.chapterProgress),
    scrollPosition: typeof state.scrollPosition === 'number' && Number.isFinite(state.scrollPosition)
      ? state.scrollPosition
      : undefined,
    lastContentMode: state.lastContentMode,
  };
}

function sanitizeStoredReaderState(raw: unknown): StoredReaderState | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Record<string, unknown>;
  const mode = parsed.mode === 'scroll' || parsed.mode === 'paged' || parsed.mode === 'summary'
    ? parsed.mode
    : undefined;
  return {
    chapterIndex: typeof parsed.chapterIndex === 'number' ? parsed.chapterIndex : undefined,
    mode,
    viewMode: parsed.viewMode === 'summary' || parsed.viewMode === 'original'
      ? parsed.viewMode
      : undefined,
    isTwoColumn: typeof parsed.isTwoColumn === 'boolean' ? parsed.isTwoColumn : undefined,
    chapterProgress: clampChapterProgress(typeof parsed.chapterProgress === 'number' ? parsed.chapterProgress : undefined),
    scrollPosition: typeof parsed.scrollPosition === 'number' && Number.isFinite(parsed.scrollPosition)
      ? parsed.scrollPosition
      : undefined,
    lastContentMode: parsed.lastContentMode === 'paged' || parsed.lastContentMode === 'scroll'
      ? parsed.lastContentMode
      : undefined,
  };
}

function buildStoredReaderState(state: StoredReaderState | null | undefined): StoredReaderState {
  const mode = resolveModeFromStoredState(state);
  const viewState = deriveViewState(mode);
  return {
    chapterIndex: state?.chapterIndex ?? 0,
    mode,
    viewMode: viewState.viewMode,
    isTwoColumn: viewState.isTwoColumn,
    chapterProgress: clampChapterProgress(state?.chapterProgress),
    scrollPosition: typeof state?.scrollPosition === 'number' && Number.isFinite(state.scrollPosition)
      ? state.scrollPosition
      : undefined,
    lastContentMode: state?.lastContentMode ?? (mode === 'paged' ? 'paged' : 'scroll'),
  };
}

function mergeStoredReaderState(
  baseState: StoredReaderState | null | undefined,
  overrideState: StoredReaderState | null | undefined,
): StoredReaderState {
  const prefersLegacyScrollPosition = overrideState?.chapterProgress === undefined
    && typeof overrideState?.scrollPosition === 'number'
    && Number.isFinite(overrideState.scrollPosition);
  const mode = overrideState?.mode
    ?? (overrideState?.viewMode || overrideState?.isTwoColumn !== undefined
      ? resolveModeFromStoredState(overrideState)
      : baseState?.mode ?? resolveModeFromStoredState(baseState));
  return buildStoredReaderState({
    chapterIndex: overrideState?.chapterIndex ?? baseState?.chapterIndex,
    mode,
    viewMode: overrideState?.viewMode ?? baseState?.viewMode,
    isTwoColumn: overrideState?.isTwoColumn ?? baseState?.isTwoColumn,
    chapterProgress: prefersLegacyScrollPosition
      ? undefined
      : overrideState?.chapterProgress ?? baseState?.chapterProgress,
    scrollPosition: overrideState?.scrollPosition ?? baseState?.scrollPosition,
    lastContentMode: overrideState?.lastContentMode ?? baseState?.lastContentMode,
  });
}

function readLocalSessionState(novelId: number): LocalReaderSessionSnapshot | null {
  if (!isBrowser() || !novelId) return null;
  const parsed = storage.cache.getJson<Record<string, unknown>>(CACHE_KEYS.readerState(novelId));
  if (!parsed) return null;
  return {
    ...sanitizeStoredReaderState(parsed),
    readerTheme: typeof parsed.readerTheme === 'string' ? parsed.readerTheme : undefined,
    appTheme: parsed.appTheme === 'light' || parsed.appTheme === 'dark' ? parsed.appTheme : undefined,
    fontSize: typeof parsed.fontSize === 'number' && Number.isFinite(parsed.fontSize) ? parsed.fontSize : undefined,
    lineSpacing: typeof parsed.lineSpacing === 'number' && Number.isFinite(parsed.lineSpacing) ? parsed.lineSpacing : undefined,
    paragraphSpacing: typeof parsed.paragraphSpacing === 'number' && Number.isFinite(parsed.paragraphSpacing) ? parsed.paragraphSpacing : undefined,
  };
}

function getRemoteProgressSnapshot(progress: ReadingProgress): string {
  return JSON.stringify({
    chapterIndex: progress.chapterIndex,
    scrollPosition: progress.scrollPosition,
    viewMode: progress.viewMode,
    chapterProgress: clampChapterProgress(progress.chapterProgress) ?? 0,
    isTwoColumn: progress.isTwoColumn ?? false,
  });
}

function getSessionPreferences(currentState: ReaderSessionInternalState): SessionPreferenceSnapshot {
  return {
    readerTheme: currentState.readerTheme,
    appTheme: currentState.appTheme,
    fontSize: currentState.fontSize,
    lineSpacing: currentState.lineSpacing,
    paragraphSpacing: currentState.paragraphSpacing,
  };
}

function readCachedPreferenceState(): SessionPreferenceSnapshot {
  return {
    readerTheme: readReaderTheme(),
    appTheme: readAppTheme(),
    fontSize: readNumberCache(CACHE_KEYS.readerFontSize, DEFAULT_FONT_SIZE),
    lineSpacing: readNumberCache(CACHE_KEYS.readerLineSpacing, DEFAULT_LINE_SPACING),
    paragraphSpacing: readNumberCache(CACHE_KEYS.readerParagraphSpacing, DEFAULT_PARAGRAPH_SPACING),
  };
}

function writeCachePersistence(currentState: ReaderSessionInternalState): void {
  if (!isBrowser()) return;

  storage.cache.set(CACHE_KEYS.theme, currentState.appTheme);
  storage.cache.set(CACHE_KEYS.readerTheme, currentState.readerTheme);
  storage.cache.set(CACHE_KEYS.readerFontSize, String(currentState.fontSize));
  storage.cache.set(CACHE_KEYS.readerLineSpacing, String(currentState.lineSpacing));
  storage.cache.set(CACHE_KEYS.readerParagraphSpacing, String(currentState.paragraphSpacing));

  if (!currentState.novelId) return;

  const snapshot: LocalReaderSessionSnapshot = {
    ...toStoredReaderState(currentState),
    readerTheme: currentState.readerTheme,
    appTheme: currentState.appTheme,
    fontSize: currentState.fontSize,
    lineSpacing: currentState.lineSpacing,
    paragraphSpacing: currentState.paragraphSpacing,
  };
  storage.cache.set(CACHE_KEYS.readerState(currentState.novelId), snapshot);
}

async function persistPreferenceSettings(preferences: SessionPreferenceSnapshot): Promise<void> {
  await Promise.all([
    storage.primary.settings.set(APP_SETTING_KEYS.appTheme, preferences.appTheme),
    storage.primary.settings.set(APP_SETTING_KEYS.readerTheme, preferences.readerTheme),
    storage.primary.settings.set(APP_SETTING_KEYS.readerFontSize, preferences.fontSize),
    storage.primary.settings.set(APP_SETTING_KEYS.readerLineSpacing, preferences.lineSpacing),
    storage.primary.settings.set(APP_SETTING_KEYS.readerParagraphSpacing, preferences.paragraphSpacing),
  ]);
}

async function loadPrimaryPreferenceState(): Promise<SessionPreferenceSnapshot> {
  const cached = readCachedPreferenceState();
  try {
    const [appTheme, readerTheme, fontSize, lineSpacing, paragraphSpacing] = await Promise.all([
      storage.primary.settings.get<AppTheme>(APP_SETTING_KEYS.appTheme),
      storage.primary.settings.get<string>(APP_SETTING_KEYS.readerTheme),
      storage.primary.settings.get<number>(APP_SETTING_KEYS.readerFontSize),
      storage.primary.settings.get<number>(APP_SETTING_KEYS.readerLineSpacing),
      storage.primary.settings.get<number>(APP_SETTING_KEYS.readerParagraphSpacing),
    ]);

    const resolved: SessionPreferenceSnapshot = {
      appTheme: appTheme === 'light' || appTheme === 'dark' ? appTheme : cached.appTheme,
      readerTheme: typeof readerTheme === 'string' ? readerTheme : cached.readerTheme,
      fontSize: typeof fontSize === 'number' && Number.isFinite(fontSize) ? fontSize : cached.fontSize,
      lineSpacing: typeof lineSpacing === 'number' && Number.isFinite(lineSpacing) ? lineSpacing : cached.lineSpacing,
      paragraphSpacing: typeof paragraphSpacing === 'number' && Number.isFinite(paragraphSpacing) ? paragraphSpacing : cached.paragraphSpacing,
    };

    if (
      appTheme === null
      || readerTheme === null
      || fontSize === null
      || lineSpacing === null
      || paragraphSpacing === null
    ) {
      await persistPreferenceSettings(resolved).catch(() => undefined);
    }

    return resolved;
  } catch {
    return cached;
  }
}

function schedulePreferencePersistence(): void {
  if (!isBrowser()) return;
  if (settingsPersistTimerId !== null) {
    window.clearTimeout(settingsPersistTimerId);
  }

  settingsPersistTimerId = window.setTimeout(() => {
    settingsPersistTimerId = null;
    const snapshot = getSessionPreferences(state);
    const epochAtSchedule = storeEpoch;
    settingsPersistQueue = settingsPersistQueue
      .then(async () => {
        if (epochAtSchedule !== storeEpoch) return;
        await persistPreferenceSettings(snapshot);
      })
      .catch(() => undefined);
  }, 80);
}

async function flushPreferencePersistence(): Promise<void> {
  if (settingsPersistTimerId !== null && isBrowser()) {
    window.clearTimeout(settingsPersistTimerId);
    settingsPersistTimerId = null;
    const epochAtFlush = storeEpoch;
    settingsPersistQueue = settingsPersistQueue
      .then(async () => {
        if (epochAtFlush !== storeEpoch) return;
        await persistPreferenceSettings(getSessionPreferences(state));
      })
      .catch(() => undefined);
  }
  await settingsPersistQueue;
}

export async function ensureSessionPreferencesHydrated(): Promise<void> {
  if (!isBrowser() || settingsHydrated) return;
  if (settingsHydrationPromise) return settingsHydrationPromise;

  const epochAtStart = storeEpoch;
  const revisionAtStart = preferenceRevision;
  const hydrationPromise = (async () => {
    const preferences = await loadPrimaryPreferenceState();
    if (epochAtStart !== storeEpoch) return;
    if (revisionAtStart === preferenceRevision) {
      setState(preferences);
    }
    settingsHydrated = true;
  })().catch(() => {
    if (epochAtStart === storeEpoch) {
      settingsHydrated = true;
    }
  });

  const trackedPromise = hydrationPromise.finally(() => {
    if (settingsHydrationPromise === trackedPromise) {
      settingsHydrationPromise = null;
    }
  });
  settingsHydrationPromise = trackedPromise;

  return trackedPromise;
}

function toRemoteProgress(state: ReaderSessionInternalState): ReadingProgress {
  return {
    chapterIndex: state.chapterIndex,
    scrollPosition: typeof state.scrollPosition === 'number' && Number.isFinite(state.scrollPosition)
      ? state.scrollPosition
      : 0,
    viewMode: state.viewMode,
    chapterProgress: clampChapterProgress(state.chapterProgress) ?? 0,
    isTwoColumn: state.isTwoColumn,
  };
}

function createInitialState(): ReaderSessionInternalState {
  const mode: ReaderMode = 'scroll';
  const preferences = readCachedPreferenceState();
  return {
    novelId: 0,
    ...deriveViewState(mode),
    chapterIndex: 0,
    chapterProgress: undefined,
    scrollPosition: undefined,
    ...preferences,
    restoreStatus: 'hydrating',
    lastContentMode: 'scroll',
    pendingRestoreState: null,
    hasUserInteracted: false,
  };
}

let state: ReaderSessionInternalState = createInitialState();
applyAppTheme(state.appTheme);

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReaderSessionSnapshot(): ReaderSessionSnapshot {
  return state;
}

function setState(partial: Partial<ReaderSessionInternalState>): void {
  state = { ...state, ...partial };
  applyAppTheme(state.appTheme);
  writeCachePersistence(state);
  emit();
}

function enqueueRemotePersistence(progress: ReadingProgress, novelId = state.novelId): Promise<void> {
  if (!novelId) return Promise.resolve();
  const snapshot = getRemoteProgressSnapshot(progress);
  if (snapshot === lastSyncedRemoteSnapshot) return syncQueue;
  syncQueue = syncQueue
    .then(async () => {
      if (snapshot === lastSyncedRemoteSnapshot) return;
      await readerApi.saveProgress(novelId, progress);
      lastSyncedRemoteSnapshot = snapshot;
    })
    .catch(() => undefined);
  return syncQueue;
}

function scheduleRemotePersistence(): void {
  if (!isBrowser() || !state.novelId) return;
  if (syncTimerId !== null) {
    window.clearTimeout(syncTimerId);
  }
  syncTimerId = window.setTimeout(() => {
    syncTimerId = null;
    void enqueueRemotePersistence(toRemoteProgress(state));
  }, READER_STATE_SYNC_DELAY_MS);
}

function updateStoredReaderState(
  nextState: StoredReaderState,
  options: SessionUpdateOptions = {},
): StoredReaderState {
  const merged = mergeStoredReaderState(toStoredReaderState(state), nextState);
  const mode = resolveModeFromStoredState(merged);
  const viewState = deriveViewState(mode);
  const nextLastContentMode = merged.lastContentMode
    ?? (mode === 'summary' ? state.lastContentMode : mode === 'paged' ? 'paged' : 'scroll');
  setState({
    ...viewState,
    chapterIndex: merged.chapterIndex ?? 0,
    chapterProgress: clampChapterProgress(merged.chapterProgress),
    scrollPosition: typeof merged.scrollPosition === 'number' && Number.isFinite(merged.scrollPosition)
      ? merged.scrollPosition
      : undefined,
    lastContentMode: mode === 'summary' ? nextLastContentMode : mode === 'paged' ? 'paged' : 'scroll',
    hasUserInteracted: options.markUserInteracted ?? state.hasUserInteracted,
  });
  if (options.persistRemote) {
    if (options.flush) {
      void enqueueRemotePersistence(toRemoteProgress(state));
    } else {
      scheduleRemotePersistence();
    }
  }
  return merged;
}

export async function hydrateSession(novelId: number): Promise<StoredReaderState> {
  storeEpoch += 1;
  const epochAtStart = storeEpoch;
  const localState = readLocalSessionState(novelId);
  const cachedPreferences = readCachedPreferenceState();
  setState({
    novelId,
    restoreStatus: 'hydrating',
    pendingRestoreState: null,
    hasUserInteracted: false,
    readerTheme: localState?.readerTheme ?? cachedPreferences.readerTheme,
    appTheme: localState?.appTheme ?? cachedPreferences.appTheme,
    fontSize: localState?.fontSize ?? cachedPreferences.fontSize,
    lineSpacing: localState?.lineSpacing ?? cachedPreferences.lineSpacing,
    paragraphSpacing: localState?.paragraphSpacing ?? cachedPreferences.paragraphSpacing,
  });

  await ensureSessionPreferencesHydrated();
  if (epochAtStart !== storeEpoch) return buildStoredReaderState(localState);
  const preferences = getSessionPreferences(state);

  let remoteState: StoredReaderState | null = null;
  try {
    remoteState = sanitizeStoredReaderState(await readerApi.getProgress(novelId));
    if (remoteState) {
      const progress = buildStoredReaderState(remoteState);
      lastSyncedRemoteSnapshot = getRemoteProgressSnapshot({
        chapterIndex: progress.chapterIndex ?? 0,
        scrollPosition: progress.scrollPosition ?? 0,
        viewMode: progress.viewMode ?? 'original',
        chapterProgress: progress.chapterProgress,
        isTwoColumn: progress.isTwoColumn,
      });
    }
  } catch {
    remoteState = null;
  }

  if (epochAtStart !== storeEpoch) return buildStoredReaderState(localState);
  const mergedState = mergeStoredReaderState(remoteState, localState);
  const mode = resolveModeFromStoredState(mergedState);
  setState({
    novelId,
    ...preferences,
    ...deriveViewState(mode),
    chapterIndex: mergedState.chapterIndex ?? 0,
    chapterProgress: clampChapterProgress(mergedState.chapterProgress),
    scrollPosition: typeof mergedState.scrollPosition === 'number' && Number.isFinite(mergedState.scrollPosition)
      ? mergedState.scrollPosition
      : undefined,
    lastContentMode: mergedState.lastContentMode ?? (mode === 'paged' ? 'paged' : 'scroll'),
    pendingRestoreState: shouldMaskRestore(mergedState) ? mergedState : null,
    restoreStatus: shouldMaskRestore(mergedState) ? 'restoring' : 'ready',
  });
  return mergedState;
}

export function setMode(mode: ReaderMode, options: SessionUpdateOptions = {}): void {
  const nextMode = mode === 'summary'
    ? 'summary'
    : mode === 'paged'
      ? 'paged'
      : 'scroll';
  updateStoredReaderState(
    {
      chapterIndex: state.chapterIndex,
      chapterProgress: state.chapterProgress,
      scrollPosition: state.scrollPosition,
      mode: nextMode,
      lastContentMode: nextMode === 'summary'
        ? state.lastContentMode
        : nextMode === 'paged'
          ? 'paged'
          : 'scroll',
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

export function setReadingPosition(nextState: StoredReaderState, options: SessionUpdateOptions = {}): void {
  updateStoredReaderState(nextState, {
    persistRemote: options.persistRemote ?? true,
    markUserInteracted: options.markUserInteracted,
    flush: options.flush,
  });
}

export function setReaderTheme(theme: string): void {
  preferenceRevision += 1;
  setState({ readerTheme: theme });
  schedulePreferencePersistence();
}

export function setAppTheme(theme: AppTheme): void {
  preferenceRevision += 1;
  setState({ appTheme: theme });
  schedulePreferencePersistence();
}

export function setTypography(nextState: TypographyState): void {
  preferenceRevision += 1;
  setState({
    fontSize: nextState.fontSize ?? state.fontSize,
    lineSpacing: nextState.lineSpacing ?? state.lineSpacing,
    paragraphSpacing: nextState.paragraphSpacing ?? state.paragraphSpacing,
  });
  schedulePreferencePersistence();
}

export function setPendingRestoreState(nextState: StoredReaderState | null): void {
  setState({ pendingRestoreState: nextState });
}

export function setRestoreStatus(restoreStatus: RestoreStatus): void {
  setState({ restoreStatus });
}

export function setSessionNovelId(novelId: number): void {
  if (state.novelId === novelId) return;
  setState({ novelId });
}

export function beginRestore(nextState: StoredReaderState | null | undefined): void {
  setState({
    pendingRestoreState: nextState ?? null,
    restoreStatus: shouldMaskRestore(nextState) ? 'restoring' : 'ready',
  });
}

export function completeRestore(): void {
  setState({
    pendingRestoreState: null,
    restoreStatus: 'ready',
  });
}

export function failRestore(): void {
  setState({
    restoreStatus: 'error',
  });
}

export function markUserInteracted(): void {
  setState({ hasUserInteracted: true });
}

export function setHasHydratedReaderState(hasHydratedReaderState: boolean): void {
  if (!hasHydratedReaderState) {
    setState({ restoreStatus: 'hydrating' });
    return;
  }
  setState({
    restoreStatus: state.pendingRestoreState ? 'restoring' : 'ready',
  });
}

export function getStoredReaderStateSnapshot(): StoredReaderState {
  return toStoredReaderState(state);
}

export function readInitialStoredReaderState(novelId: number): StoredReaderState | null {
  const localState = readLocalSessionState(novelId);
  return localState ? sanitizeStoredReaderState(localState) : null;
}

export function persistStoredReaderState(nextState: StoredReaderState, options?: { flush?: boolean }): void {
  updateStoredReaderState(nextState, {
    persistRemote: true,
    flush: options?.flush,
  });
}

export async function flushPersistence(): Promise<void> {
  const novelId = state.novelId;
  const progress = toRemoteProgress(state);
  await flushPreferencePersistence();
  if (syncTimerId !== null && isBrowser()) {
    window.clearTimeout(syncTimerId);
    syncTimerId = null;
  }
  await enqueueRemotePersistence(progress, novelId);
}

export function useReaderSessionSelector<T>(selector: (state: ReaderSessionSnapshot) => T): T {
  const snapshot = useSyncExternalStore(
    subscribe,
    getReaderSessionSnapshot,
    getReaderSessionSnapshot,
  );
  return selector(snapshot);
}

export function useReaderSessionActions(): ReaderSessionActions {
  return {
    hydrateSession,
    setMode,
    setChapterIndex,
    setReadingPosition,
    setReaderTheme,
    setAppTheme,
    setTypography,
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
  if (settingsPersistTimerId !== null && isBrowser()) {
    window.clearTimeout(settingsPersistTimerId);
    settingsPersistTimerId = null;
  }
  lastSyncedRemoteSnapshot = '';
  syncQueue = Promise.resolve();
  settingsHydrationPromise = null;
  settingsHydrated = false;
  settingsPersistQueue = Promise.resolve();
  preferenceRevision = 0;
  state = createInitialState();
  applyAppTheme(state.appTheme);
  emit();
}
