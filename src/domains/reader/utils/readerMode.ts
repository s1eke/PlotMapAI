import type { ReaderPageTurnMode } from '../constants/pageTurnMode';
import { isPagedPageTurnMode } from '../constants/pageTurnMode';
import type { ReaderMode } from '../hooks/readerSessionTypes';

export type ReaderContentMode = Exclude<ReaderMode, 'summary'>;

export function getReaderViewMode(mode: ReaderMode): 'original' | 'summary' {
  return mode === 'summary' ? 'summary' : 'original';
}

export function isPagedReaderMode(mode: ReaderMode): boolean {
  return mode === 'paged';
}

export function isSummaryReaderMode(mode: ReaderMode): boolean {
  return mode === 'summary';
}

export function resolveContentModeFromPageTurnMode(
  pageTurnMode: ReaderPageTurnMode,
): ReaderContentMode {
  return isPagedPageTurnMode(pageTurnMode) ? 'paged' : 'scroll';
}

export function resolveReaderModeFromView(
  viewMode: 'original' | 'summary',
  pageTurnMode: ReaderPageTurnMode,
): ReaderMode {
  if (viewMode === 'summary') {
    return 'summary';
  }

  return resolveContentModeFromPageTurnMode(pageTurnMode);
}

export function resolveLastContentMode(
  mode: ReaderMode,
  fallbackMode: ReaderContentMode,
): ReaderContentMode {
  if (mode === 'summary') {
    return fallbackMode;
  }

  return mode;
}
