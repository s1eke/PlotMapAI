import type { ReaderPageTurnMode } from '@shared/contracts/reader/preferences';
import type { ReaderMode } from '@shared/contracts/reader';

import { isPagedPageTurnMode } from '@shared/contracts/reader/preferences';

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
