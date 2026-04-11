import type { ReaderAppearanceState } from '@shared/stores/readerAppearanceStore';
import type { ReaderPreferenceState } from '@shared/stores/readerPreferenceStore';
import type { ReaderPageTurnMode } from '../constants/pageTurnMode';

import {
  applyHydratedReaderPreferenceState,
  ensureReaderPreferenceStoreHydrated,
  flushReaderPreferenceStorePersistence,
  getReaderPreferenceStoreSnapshot,
  hasConfiguredReaderPageTurnModePreference,
  readerPreferenceStore,
  resetReaderPreferenceStoreForTests,
  setReaderPageTurnModePreference,
  setReaderThemePreference,
  setReaderTypographyPreference,
  useReaderPreferenceStoreSelector,
} from '@shared/stores/readerPreferenceStore';

export interface ReaderPreferencesState {
  fontSize: number;
  lineSpacing: number;
  pageTurnMode: ReaderPageTurnMode;
  paragraphSpacing: number;
  readerTheme: ReaderAppearanceState['readerTheme'];
}

interface ReaderPreferenceValues {
  fontSize: number;
  lineSpacing: number;
  pageTurnMode: ReaderPageTurnMode;
  paragraphSpacing: number;
}

type ReaderPreferencesStoreState = ReaderPreferenceState;
type ReaderPreferencesStore = typeof readerPreferenceStore;

export function getReaderPreferencesStore(): ReaderPreferencesStore {
  return readerPreferenceStore;
}

export const readerPreferencesStore = getReaderPreferencesStore();

export async function flushReaderPreferencesPersistence(): Promise<void> {
  await flushReaderPreferenceStorePersistence();
}

export async function ensureReaderPreferencesHydrated(): Promise<void> {
  await ensureReaderPreferenceStoreHydrated();
}

export function setReaderTheme(theme: string): void {
  setReaderThemePreference(theme);
}

export function setReaderPageTurnMode(mode: ReaderPageTurnMode): void {
  setReaderPageTurnModePreference(mode);
}

export function setTypography(nextState: {
  fontSize?: number;
  lineSpacing?: number;
  paragraphSpacing?: number;
}): void {
  setReaderTypographyPreference(nextState);
}

export function applyHydratedReaderPreferences(
  nextState: Partial<ReaderPreferencesState>,
  options: { persistPrimary?: boolean; markPageTurnModeConfigured?: boolean } = {},
): void {
  applyHydratedReaderPreferenceState(nextState, {
    markPageTurnModeConfigured: options.markPageTurnModeConfigured,
    persistPrimary: options.persistPrimary,
  });
}

export function hasConfiguredReaderPageTurnMode(): boolean {
  return hasConfiguredReaderPageTurnModePreference();
}

function getReaderPreferencesSnapshotState(): ReaderPreferenceValues {
  const state = getReaderPreferenceStoreSnapshot();
  return {
    pageTurnMode: state.pageTurnMode,
    fontSize: state.fontSize,
    lineSpacing: state.lineSpacing,
    paragraphSpacing: state.paragraphSpacing,
  };
}

export function getReaderPreferencesSnapshot(): ReaderPreferencesState {
  const state = getReaderPreferenceStoreSnapshot();
  return {
    ...getReaderPreferencesSnapshotState(),
    readerTheme: state.readerTheme,
  };
}

export function useReaderPreferencesSelector<T>(
  selector: (state: ReaderPreferencesStoreState) => T,
): T {
  return useReaderPreferenceStoreSelector(selector);
}

export function resetReaderPreferencesStoreForTests(): void {
  resetReaderPreferenceStoreForTests();
}
