import type { StoreApi } from 'zustand/vanilla';

import { useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

import { APP_SETTING_KEYS, CACHE_KEYS, storage } from '@infra/storage';
import { mergeReaderStateCacheSnapshot } from '@infra/storage/readerStateCache';

const DEFAULT_READER_THEME = 'auto';
const APPEARANCE_PERSIST_DELAY_MS = 80;

export interface ReaderAppearanceState {
  readerTheme: string;
}

interface ReaderAppearanceStoreState extends ReaderAppearanceState {
  activeNovelId: number;
}

type ReaderAppearanceStore = StoreApi<ReaderAppearanceStoreState>;

let appearanceHydrationPromise: Promise<void> | null = null;
let appearanceHydrated = false;
let appearancePersistQueue: Promise<void> = Promise.resolve();
let appearancePersistTimerId: number | null = null;
let appearanceRevision = 0;
let appearanceStoreEpoch = 0;

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

function setReaderAppearanceStoreState(
  partial: Partial<ReaderAppearanceStoreState>,
  options: { writeCache?: boolean } = {},
): void {
  const nextState = {
    ...readerAppearanceStore.getState(),
    ...partial,
  };

  readerAppearanceStore.setState(nextState);
  if (options.writeCache !== false) {
    writeReaderAppearanceCache(nextState);
  }
}

async function persistReaderTheme(readerTheme: string): Promise<void> {
  await storage.primary.settings.set(APP_SETTING_KEYS.readerTheme, readerTheme);
}

async function loadPrimaryReaderTheme(): Promise<string> {
  const cachedTheme = readCachedReaderTheme();

  try {
    const storedTheme = await storage.primary.settings.get<string>(APP_SETTING_KEYS.readerTheme);
    const resolvedTheme = typeof storedTheme === 'string'
      ? storedTheme
      : cachedTheme;

    if (storedTheme === null) {
      await persistReaderTheme(resolvedTheme).catch(() => undefined);
    }

    return resolvedTheme;
  } catch {
    return cachedTheme;
  }
}

function scheduleReaderAppearancePersistence(): void {
  if (!isBrowser()) {
    return;
  }

  if (appearancePersistTimerId !== null) {
    window.clearTimeout(appearancePersistTimerId);
  }

  appearancePersistTimerId = window.setTimeout(() => {
    appearancePersistTimerId = null;
    const snapshot = readerAppearanceStore.getState().readerTheme;
    const revisionAtSchedule = appearanceRevision;
    const epochAtSchedule = appearanceStoreEpoch;
    appearancePersistQueue = appearancePersistQueue
      .then(async () => {
        if (epochAtSchedule !== appearanceStoreEpoch) {
          return;
        }
        if (revisionAtSchedule !== appearanceRevision) {
          return;
        }

        await persistReaderTheme(snapshot);
      })
      .catch(() => undefined);
  }, APPEARANCE_PERSIST_DELAY_MS);
}

export async function flushReaderAppearancePersistence(): Promise<void> {
  if (appearancePersistTimerId !== null && isBrowser()) {
    window.clearTimeout(appearancePersistTimerId);
    appearancePersistTimerId = null;
    const snapshot = readerAppearanceStore.getState().readerTheme;
    const epochAtFlush = appearanceStoreEpoch;
    appearancePersistQueue = appearancePersistQueue
      .then(async () => {
        if (epochAtFlush !== appearanceStoreEpoch) {
          return;
        }

        await persistReaderTheme(snapshot);
      })
      .catch(() => undefined);
  }

  await appearancePersistQueue;
}

export async function ensureReaderAppearanceHydrated(): Promise<void> {
  if (!isBrowser() || appearanceHydrated) {
    return;
  }

  if (appearanceHydrationPromise) {
    return appearanceHydrationPromise;
  }

  const epochAtStart = appearanceStoreEpoch;
  const revisionAtStart = appearanceRevision;
  const hydrationPromise = (async () => {
    const readerTheme = await loadPrimaryReaderTheme();
    if (epochAtStart !== appearanceStoreEpoch) {
      return;
    }
    if (revisionAtStart === appearanceRevision) {
      setReaderAppearanceStoreState({ readerTheme });
    }
    appearanceHydrated = true;
  })().catch(() => {
    if (epochAtStart === appearanceStoreEpoch) {
      appearanceHydrated = true;
    }
  });

  const trackedPromise = hydrationPromise.finally(() => {
    if (appearanceHydrationPromise === trackedPromise) {
      appearanceHydrationPromise = null;
    }
  });
  appearanceHydrationPromise = trackedPromise;

  return trackedPromise;
}

export function setReaderAppearanceTheme(theme: string): void {
  appearanceRevision += 1;
  setReaderAppearanceStoreState({ readerTheme: theme });
  scheduleReaderAppearancePersistence();
}

export function setReaderAppearanceNovelId(novelId: number): void {
  if (readerAppearanceStore.getState().activeNovelId === novelId) {
    return;
  }

  setReaderAppearanceStoreState({ activeNovelId: novelId }, { writeCache: false });
}

export function applyHydratedReaderAppearance(
  readerTheme: string | null | undefined,
  options: { persistPrimary?: boolean } = {},
): void {
  if (!readerTheme) {
    return;
  }

  setReaderAppearanceStoreState({ readerTheme });

  if (!options.persistPrimary) {
    return;
  }

  const snapshot = readerAppearanceStore.getState().readerTheme;
  const epochAtSchedule = appearanceStoreEpoch;
  appearancePersistQueue = appearancePersistQueue
    .then(async () => {
      if (epochAtSchedule !== appearanceStoreEpoch) {
        return;
      }

      await persistReaderTheme(snapshot);
    })
    .catch(() => undefined);
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
  appearanceStoreEpoch += 1;
  if (appearancePersistTimerId !== null && isBrowser()) {
    window.clearTimeout(appearancePersistTimerId);
    appearancePersistTimerId = null;
  }

  appearanceHydrationPromise = null;
  appearanceHydrated = false;
  appearancePersistQueue = Promise.resolve();
  appearanceRevision = 0;

  readerAppearanceStore.setState(createInitialReaderAppearanceState());
}
