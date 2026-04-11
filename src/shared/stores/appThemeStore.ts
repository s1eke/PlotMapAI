import type { AppTheme as SharedAppTheme } from './readerPreferenceStore';

import {
  applyHydratedAppThemePreference,
  ensureReaderPreferenceStoreHydrated,
  flushReaderPreferenceStorePersistence,
  getReaderPreferenceStoreSnapshot,
  isAppTheme,
  readerPreferenceStore,
  resetReaderPreferenceStoreForTests,
  setAppThemePreference,
  toggleAppThemePreference,
  useReaderPreferenceStoreSelector,
} from './readerPreferenceStore';

export type AppTheme = SharedAppTheme;

export interface AppThemeStoreState {
  theme: AppTheme;
}

type AppThemeStore = typeof readerPreferenceStore;

export function getAppThemeStore(): AppThemeStore {
  return readerPreferenceStore;
}

export const appThemeStore = getAppThemeStore();

export async function flushAppThemePersistence(): Promise<void> {
  await flushReaderPreferenceStorePersistence();
}

export async function ensureAppThemeHydrated(): Promise<void> {
  await ensureReaderPreferenceStoreHydrated();
}

export function setAppTheme(theme: AppTheme): void {
  setAppThemePreference(theme);
}

export function toggleAppTheme(): void {
  toggleAppThemePreference();
}

export function applyHydratedAppTheme(theme: AppTheme | null | undefined): void {
  applyHydratedAppThemePreference(theme);
}

export function getAppThemeSnapshot(): AppThemeStoreState {
  const state = getReaderPreferenceStoreSnapshot();
  return { theme: state.theme };
}

export function useAppThemeSelector<T>(selector: (state: AppThemeStoreState) => T): T {
  return useReaderPreferenceStoreSelector((state) => selector({ theme: state.theme }));
}

export function resetAppThemeStoreForTests(): void {
  resetReaderPreferenceStoreForTests();
}

export { isAppTheme };
