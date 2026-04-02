import type { StoreApi } from 'zustand/vanilla';

import { useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

import { APP_SETTING_KEYS, CACHE_KEYS, storage } from '@infra/storage';
import { mergeReaderStateCacheSnapshot } from '@infra/storage/readerStateCache';
import {
  createPersistedRuntime,
} from '@shared/stores/persistence/createPersistedRuntime';

const DEFAULT_READER_THEME = 'auto';
const APPEARANCE_PERSIST_DELAY_MS = 80;

export interface ReaderAppearanceState {
  readerTheme: string;
}

interface ReaderAppearanceStoreState extends ReaderAppearanceState {
  activeNovelId: number;
}

type ReaderAppearanceStore = StoreApi<ReaderAppearanceStoreState>;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readCachedReaderTheme(): string {
  return storage.cache.getString(CACHE_KEYS.readerTheme) || DEFAULT_READER_THEME;
}

function createInitialReaderAppearanceState(): ReaderAppearanceStoreState {
  return {
    activeNovelId: 0,
    readerTheme: readCachedReaderTheme(),
  };
}

export function createReaderAppearanceStore(): ReaderAppearanceStore {
  return createStore<ReaderAppearanceStoreState>()(
    subscribeWithSelector(() => createInitialReaderAppearanceState()),
  );
}

export const readerAppearanceStore = createReaderAppearanceStore();

function writeReaderAppearanceCache(state: ReaderAppearanceStoreState): void {
  if (!isBrowser()) {
    return;
  }

  storage.cache.set(CACHE_KEYS.readerTheme, state.readerTheme);
  if (state.activeNovelId) {
    mergeReaderStateCacheSnapshot(state.activeNovelId, {
      readerTheme: state.readerTheme,
    });
  }
}

async function persistReaderTheme(state: ReaderAppearanceStoreState): Promise<void> {
  await storage.primary.settings.set(APP_SETTING_KEYS.readerTheme, state.readerTheme);
}

async function loadPrimaryReaderTheme(): Promise<Partial<ReaderAppearanceStoreState>> {
  const cachedTheme = readCachedReaderTheme();

  try {
    const storedTheme = await storage.primary.settings.get<string>(APP_SETTING_KEYS.readerTheme);
    const resolvedTheme = typeof storedTheme === 'string'
      ? storedTheme
      : cachedTheme;

    if (storedTheme === null) {
      await storage.primary.settings
        .set(APP_SETTING_KEYS.readerTheme, resolvedTheme)
        .catch(() => undefined);
    }

    return { readerTheme: resolvedTheme };
  } catch {
    return { readerTheme: cachedTheme };
  }
}

const readerAppearanceRuntime = createPersistedRuntime<ReaderAppearanceStoreState>({
  createInitialState: createInitialReaderAppearanceState,
  hydrate: async () => loadPrimaryReaderTheme(),
  isEnabled: isBrowser,
  persist: persistReaderTheme,
  persistDelayMs: APPEARANCE_PERSIST_DELAY_MS,
  store: readerAppearanceStore,
  writeCache: writeReaderAppearanceCache,
});

export async function flushReaderAppearancePersistence(): Promise<void> {
  await readerAppearanceRuntime.flush();
}

export async function ensureReaderAppearanceHydrated(): Promise<void> {
  await readerAppearanceRuntime.hydrate();
}

export function setReaderAppearanceTheme(theme: string): void {
  readerAppearanceRuntime.patch({ readerTheme: theme }, {
    bumpRevision: true,
    persist: true,
  });
}

export function setReaderAppearanceNovelId(novelId: number): void {
  if (readerAppearanceStore.getState().activeNovelId === novelId) {
    return;
  }

  readerAppearanceRuntime.patch({ activeNovelId: novelId }, { writeCache: false });
}

export function applyHydratedReaderAppearance(
  readerTheme: string | null | undefined,
  options: { persistPrimary?: boolean } = {},
): void {
  if (!readerTheme) {
    return;
  }

  readerAppearanceRuntime.patch({ readerTheme }, {
    flush: options.persistPrimary,
    persist: options.persistPrimary,
  });
}

export function getReaderAppearanceSnapshot(): ReaderAppearanceState {
  const state = readerAppearanceStore.getState();
  return {
    readerTheme: state.readerTheme,
  };
}

export function useReaderAppearanceSelector<T>(
  selector: (state: ReaderAppearanceStoreState) => T,
): T {
  return useStore(readerAppearanceStore, selector);
}

export function resetReaderAppearanceStoreForTests(): void {
  readerAppearanceRuntime.reset();
}
