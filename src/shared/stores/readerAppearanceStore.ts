import {
  applyHydratedReaderPreferenceState,
  ensureReaderPreferenceStoreHydrated,
  flushReaderPreferenceStorePersistence,
  getReaderPreferenceStoreSnapshot,
  readerPreferenceStore,
  resetReaderPreferenceStoreForTests,
  setReaderThemePreference,
  useReaderPreferenceStoreSelector,
} from './readerPreferenceStore';

export interface ReaderAppearanceState {
  readerTheme: string;
}

type ReaderAppearanceStore = typeof readerPreferenceStore;

export function getReaderAppearanceStore(): ReaderAppearanceStore {
  return readerPreferenceStore;
}

export const readerAppearanceStore = getReaderAppearanceStore();

export async function flushReaderAppearancePersistence(): Promise<void> {
  await flushReaderPreferenceStorePersistence();
}

export async function ensureReaderAppearanceHydrated(): Promise<void> {
  await ensureReaderPreferenceStoreHydrated();
}

export function setReaderAppearanceTheme(theme: string): void {
  setReaderThemePreference(theme);
}

export function applyHydratedReaderAppearance(
  readerTheme: string | null | undefined,
  options: { persistPrimary?: boolean } = {},
): void {
  if (!readerTheme) {
    return;
  }

  applyHydratedReaderPreferenceState(
    { readerTheme },
    { persistPrimary: options.persistPrimary },
  );
}

export function getReaderAppearanceSnapshot(): ReaderAppearanceState {
  const state = getReaderPreferenceStoreSnapshot();
  return {
    readerTheme: state.readerTheme,
  };
}

export function useReaderAppearanceSelector<T>(
  selector: (state: ReaderAppearanceState) => T,
): T {
  return useReaderPreferenceStoreSelector((state) => selector({
    readerTheme: state.readerTheme,
  }));
}

export function resetReaderAppearanceStoreForTests(): void {
  resetReaderPreferenceStoreForTests();
}
