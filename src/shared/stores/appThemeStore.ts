import { useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { APP_SETTING_KEYS, CACHE_KEYS, storage } from '@infra/storage';
import { mergeReaderStateCacheSnapshot } from '@infra/storage/readerStateCache';
import {
  createPersistedRuntime,
} from '@shared/stores/persistence/createPersistedRuntime';

export type AppTheme = 'light' | 'dark';

interface AppThemeStoreState {
  activeNovelId: number;
  theme: AppTheme;
}

type AppThemeStore = StoreApi<AppThemeStoreState>;

const APP_THEME_PERSIST_DELAY_MS = 80;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readCachedAppTheme(): AppTheme {
  if (!isBrowser()) {
    return 'light';
  }

  const saved = storage.cache.getString(CACHE_KEYS.theme);
  if (saved === 'dark' || saved === 'light') {
    return saved;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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

function createInitialAppThemeState(): AppThemeStoreState {
  return {
    activeNovelId: 0,
    theme: readCachedAppTheme(),
  };
}

export function createAppThemeStore(): AppThemeStore {
  return createStore<AppThemeStoreState>()(
    subscribeWithSelector(() => createInitialAppThemeState()),
  );
}

export const appThemeStore = createAppThemeStore();
applyAppTheme(appThemeStore.getState().theme);

function writeAppThemeCache(state: AppThemeStoreState): void {
  if (!isBrowser()) {
    return;
  }

  storage.cache.set(CACHE_KEYS.theme, state.theme);
  if (state.activeNovelId) {
    mergeReaderStateCacheSnapshot(state.activeNovelId, {
      appTheme: state.theme,
    });
  }
}

async function persistAppTheme(state: AppThemeStoreState): Promise<void> {
  await storage.primary.settings.set(APP_SETTING_KEYS.appTheme, state.theme);
}

async function loadPrimaryAppTheme(): Promise<Partial<AppThemeStoreState>> {
  const cachedTheme = readCachedAppTheme();

  try {
    const storedTheme = await storage.primary.settings.get<AppTheme>(APP_SETTING_KEYS.appTheme);
    const resolvedTheme = isAppTheme(storedTheme)
      ? storedTheme
      : cachedTheme;

    if (storedTheme === null) {
      await storage.primary.settings
        .set(APP_SETTING_KEYS.appTheme, resolvedTheme)
        .catch(() => undefined);
    }

    return { theme: resolvedTheme };
  } catch {
    return { theme: cachedTheme };
  }
}

const appThemeRuntime = createPersistedRuntime<AppThemeStoreState>({
  createInitialState: createInitialAppThemeState,
  hydrate: async () => loadPrimaryAppTheme(),
  isEnabled: isBrowser,
  onStateChange: (state) => {
    applyAppTheme(state.theme);
  },
  persist: persistAppTheme,
  persistDelayMs: APP_THEME_PERSIST_DELAY_MS,
  store: appThemeStore,
  writeCache: writeAppThemeCache,
});

export async function flushAppThemePersistence(): Promise<void> {
  await appThemeRuntime.flush();
}

export async function ensureAppThemeHydrated(): Promise<void> {
  await appThemeRuntime.hydrate();
}

export function setAppTheme(theme: AppTheme): void {
  appThemeRuntime.patch({ theme }, {
    bumpRevision: true,
    persist: true,
  });
}

export function toggleAppTheme(): void {
  const currentTheme = appThemeStore.getState().theme;
  setAppTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

export function setAppThemeNovelId(novelId: number): void {
  if (appThemeStore.getState().activeNovelId === novelId) {
    return;
  }

  appThemeRuntime.patch({ activeNovelId: novelId }, { writeCache: false });
}

export function applyHydratedAppTheme(theme: AppTheme | null | undefined): void {
  if (!theme) {
    return;
  }

  appThemeRuntime.patch({ theme });
}

export function getAppThemeSnapshot(): AppThemeStoreState {
  return appThemeStore.getState();
}

export function useAppThemeSelector<T>(selector: (state: AppThemeStoreState) => T): T {
  return useStore(appThemeStore, selector);
}

export function resetAppThemeStoreForTests(): void {
  appThemeRuntime.reset();
}
