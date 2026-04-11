import type { StoreApi } from 'zustand/vanilla';

import { useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

import type { ReaderPageTurnMode } from '@shared/contracts/reader/preferences';
import { APP_SETTING_KEYS, CACHE_KEYS, storage } from '@infra/storage';
import { createPersistedRuntime } from '@shared/stores/persistence/createPersistedRuntime';

export type AppTheme = 'light' | 'dark';

const READER_PREFERENCE_SNAPSHOT_VERSION = 1 as const;
const DEFAULT_READER_THEME = 'auto';
const DEFAULT_PAGE_TURN_MODE: ReaderPageTurnMode = 'scroll';
const DEFAULT_FONT_SIZE = 18;
const DEFAULT_LINE_SPACING = 1.8;
const DEFAULT_PARAGRAPH_SPACING = 16;
const PREFERENCE_PERSIST_DELAY_MS = 80;

export interface ReaderPreferenceState {
  fontSize: number;
  lineSpacing: number;
  pageTurnMode: ReaderPageTurnMode;
  paragraphSpacing: number;
  readerTheme: string;
  theme: AppTheme;
}

export interface ReaderPreferenceSnapshot {
  version: typeof READER_PREFERENCE_SNAPSHOT_VERSION;
  appTheme: AppTheme;
  fontSize: number;
  lineSpacing: number;
  pageTurnMode: ReaderPageTurnMode;
  paragraphSpacing: number;
  readerTheme: string;
}

type ReaderPreferenceStoreState = ReaderPreferenceState;

type ReaderPreferenceStore = StoreApi<ReaderPreferenceStoreState>;

let hasConfiguredPageTurnModePreference =
  readCachedReaderPreferenceSnapshot() !== null;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readSystemAppTheme(): AppTheme {
  if (
    !isBrowser()
    || typeof window.matchMedia !== 'function'
    || !window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'light';
  }

  return 'dark';
}

function applyAppTheme(theme: AppTheme): void {
  if (!isBrowser()) {
    return;
  }

  const root = window.document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    return;
  }

  root.classList.remove('dark');
}

export function isAppTheme(value: unknown): value is AppTheme {
  return value === 'dark' || value === 'light';
}

function isReaderPageTurnMode(value: unknown): value is ReaderPageTurnMode {
  return value === 'scroll' || value === 'cover' || value === 'slide' || value === 'none';
}

function parseReaderPreferenceSnapshot(raw: unknown): ReaderPreferenceSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const parsed = raw as Record<string, unknown>;
  if (
    parsed.version !== READER_PREFERENCE_SNAPSHOT_VERSION
    || !isAppTheme(parsed.appTheme)
    || typeof parsed.readerTheme !== 'string'
    || !isReaderPageTurnMode(parsed.pageTurnMode)
    || !isFiniteNumber(parsed.fontSize)
    || !isFiniteNumber(parsed.lineSpacing)
    || !isFiniteNumber(parsed.paragraphSpacing)
  ) {
    return null;
  }

  return {
    version: READER_PREFERENCE_SNAPSHOT_VERSION,
    appTheme: parsed.appTheme,
    fontSize: parsed.fontSize,
    lineSpacing: parsed.lineSpacing,
    pageTurnMode: parsed.pageTurnMode,
    paragraphSpacing: parsed.paragraphSpacing,
    readerTheme: parsed.readerTheme,
  };
}

function toReaderPreferenceState(
  snapshot: ReaderPreferenceSnapshot,
): ReaderPreferenceStoreState {
  return {
    theme: snapshot.appTheme,
    readerTheme: snapshot.readerTheme,
    pageTurnMode: snapshot.pageTurnMode,
    fontSize: snapshot.fontSize,
    lineSpacing: snapshot.lineSpacing,
    paragraphSpacing: snapshot.paragraphSpacing,
  };
}

function toReaderPreferenceSnapshot(
  state: ReaderPreferenceStoreState,
): ReaderPreferenceSnapshot {
  return {
    version: READER_PREFERENCE_SNAPSHOT_VERSION,
    appTheme: state.theme,
    readerTheme: state.readerTheme,
    pageTurnMode: state.pageTurnMode,
    fontSize: state.fontSize,
    lineSpacing: state.lineSpacing,
    paragraphSpacing: state.paragraphSpacing,
  };
}

function createDefaultReaderPreferenceState(): ReaderPreferenceStoreState {
  return {
    theme: readSystemAppTheme(),
    readerTheme: DEFAULT_READER_THEME,
    pageTurnMode: DEFAULT_PAGE_TURN_MODE,
    fontSize: DEFAULT_FONT_SIZE,
    lineSpacing: DEFAULT_LINE_SPACING,
    paragraphSpacing: DEFAULT_PARAGRAPH_SPACING,
  };
}

function readCachedReaderPreferenceSnapshot(): ReaderPreferenceSnapshot | null {
  return parseReaderPreferenceSnapshot(
    storage.cache.getJson<unknown>(CACHE_KEYS.readerPreferences),
  );
}

function createInitialReaderPreferenceState(): ReaderPreferenceStoreState {
  const cachedSnapshot = readCachedReaderPreferenceSnapshot();
  return cachedSnapshot
    ? toReaderPreferenceState(cachedSnapshot)
    : createDefaultReaderPreferenceState();
}

export function createReaderPreferenceStore(): ReaderPreferenceStore {
  return createStore<ReaderPreferenceStoreState>()(
    subscribeWithSelector(() => createInitialReaderPreferenceState()),
  );
}

export const readerPreferenceStore = createReaderPreferenceStore();
applyAppTheme(readerPreferenceStore.getState().theme);

function writeReaderPreferenceCache(state: ReaderPreferenceStoreState): void {
  if (!isBrowser()) {
    return;
  }

  storage.cache.set(CACHE_KEYS.readerPreferences, toReaderPreferenceSnapshot(state));
}

async function persistReaderPreferenceState(
  state: ReaderPreferenceStoreState,
): Promise<void> {
  await storage.primary.settings.set(
    APP_SETTING_KEYS.readerPreferences,
    toReaderPreferenceSnapshot(state),
  );
}

async function loadPrimaryReaderPreferenceState(): Promise<Partial<ReaderPreferenceStoreState>> {
  const cachedSnapshot = readCachedReaderPreferenceSnapshot();
  const cachedState = cachedSnapshot
    ? toReaderPreferenceState(cachedSnapshot)
    : createDefaultReaderPreferenceState();

  try {
    const storedSnapshot = parseReaderPreferenceSnapshot(
      await storage.primary.settings.get<unknown>(APP_SETTING_KEYS.readerPreferences),
    );
    hasConfiguredPageTurnModePreference =
      storedSnapshot !== null || cachedSnapshot !== null;

    const resolvedState = storedSnapshot
      ? toReaderPreferenceState(storedSnapshot)
      : cachedState;

    if (!storedSnapshot) {
      await storage.primary.settings
        .set(APP_SETTING_KEYS.readerPreferences, toReaderPreferenceSnapshot(resolvedState))
        .catch(() => undefined);
    }

    return resolvedState;
  } catch {
    hasConfiguredPageTurnModePreference = cachedSnapshot !== null;
    return cachedState;
  }
}

const readerPreferenceRuntime = createPersistedRuntime<ReaderPreferenceStoreState>({
  createInitialState: createInitialReaderPreferenceState,
  hydrate: async () => loadPrimaryReaderPreferenceState(),
  isEnabled: isBrowser,
  onReset: () => {
    hasConfiguredPageTurnModePreference =
      readCachedReaderPreferenceSnapshot() !== null;
  },
  onStateChange: (state) => {
    applyAppTheme(state.theme);
  },
  persist: persistReaderPreferenceState,
  persistDelayMs: PREFERENCE_PERSIST_DELAY_MS,
  store: readerPreferenceStore,
  writeCache: writeReaderPreferenceCache,
});

export async function ensureReaderPreferenceStoreHydrated(): Promise<void> {
  await readerPreferenceRuntime.hydrate();
}

export async function flushReaderPreferenceStorePersistence(): Promise<void> {
  await readerPreferenceRuntime.flush();
}

export function setAppThemePreference(theme: AppTheme): void {
  readerPreferenceRuntime.patch({ theme }, {
    bumpRevision: true,
    persist: true,
  });
}

export function toggleAppThemePreference(): void {
  const currentTheme = readerPreferenceStore.getState().theme;
  setAppThemePreference(currentTheme === 'dark' ? 'light' : 'dark');
}

export function applyHydratedAppThemePreference(
  theme: AppTheme | null | undefined,
  options: { persistPrimary?: boolean } = {},
): void {
  if (!theme) {
    return;
  }

  readerPreferenceRuntime.patch({ theme }, {
    flush: options.persistPrimary,
    persist: options.persistPrimary,
  });
}

export function setReaderThemePreference(theme: string): void {
  readerPreferenceRuntime.patch({ readerTheme: theme }, {
    bumpRevision: true,
    persist: true,
  });
}

export function setReaderPageTurnModePreference(mode: ReaderPageTurnMode): void {
  hasConfiguredPageTurnModePreference = true;
  readerPreferenceRuntime.patch({ pageTurnMode: mode }, {
    bumpRevision: true,
    persist: true,
  });
}

export function setReaderTypographyPreference(nextState: {
  fontSize?: number;
  lineSpacing?: number;
  paragraphSpacing?: number;
}): void {
  const currentState = readerPreferenceStore.getState();
  readerPreferenceRuntime.patch({
    fontSize: nextState.fontSize ?? currentState.fontSize,
    lineSpacing: nextState.lineSpacing ?? currentState.lineSpacing,
    paragraphSpacing: nextState.paragraphSpacing ?? currentState.paragraphSpacing,
  }, {
    bumpRevision: true,
    persist: true,
  });
}

export function applyHydratedReaderPreferenceState(
  nextState: Partial<ReaderPreferenceState>,
  options: { markPageTurnModeConfigured?: boolean; persistPrimary?: boolean } = {},
): void {
  if (options.markPageTurnModeConfigured && nextState.pageTurnMode) {
    hasConfiguredPageTurnModePreference = true;
  }

  readerPreferenceRuntime.patch(nextState, {
    flush: options.persistPrimary,
    persist: options.persistPrimary,
  });
}

export function hasConfiguredReaderPageTurnModePreference(): boolean {
  return hasConfiguredPageTurnModePreference;
}

export function getReaderPreferenceStoreSnapshot(): ReaderPreferenceStoreState {
  return readerPreferenceStore.getState();
}

export function useReaderPreferenceStoreSelector<T>(
  selector: (state: ReaderPreferenceStoreState) => T,
): T {
  return useStore(readerPreferenceStore, selector);
}

export function resetReaderPreferenceStoreForTests(): void {
  readerPreferenceRuntime.reset();
}
