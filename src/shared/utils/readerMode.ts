import type { ReaderPageTurnMode } from '@shared/contracts/reader/preferences';
import type {
  ReaderMode,
  ReaderStateHints,
  ReaderViewMode,
  StoredReaderState,
} from '@shared/contracts/reader';

import { isPagedPageTurnMode } from '@shared/contracts/reader/preferences';

export type ReaderContentMode = Exclude<ReaderMode, 'summary'>;
export interface ResolvedPersistedReaderMode {
  contentMode: ReaderContentMode;
  mode: ReaderMode;
  usedContentModeFallback: boolean;
  usedViewModeFallback: boolean;
  viewMode: ReaderViewMode;
}

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

export function getReaderViewModeFromState(
  state: StoredReaderState | null | undefined,
): ReaderViewMode | undefined {
  return state?.hints?.viewMode;
}

export function createReaderStateModeHints(
  mode: ReaderMode,
  lastContentMode: ReaderContentMode,
): Pick<NonNullable<ReaderStateHints>, 'contentMode' | 'viewMode'> {
  return {
    contentMode: mode === 'summary' ? lastContentMode : mode,
    viewMode: mode === 'summary' ? 'summary' : 'original',
  };
}

export function resolvePersistedReaderMode(
  state: StoredReaderState | null | undefined,
  options: {
    fallbackContentMode?: ReaderContentMode;
    pageTurnMode?: ReaderPageTurnMode;
  } = {},
): ResolvedPersistedReaderMode {
  const fallbackContentMode = options.pageTurnMode
    ? resolveContentModeFromPageTurnMode(options.pageTurnMode)
    : options.fallbackContentMode ?? 'scroll';
  const contentMode = state?.hints?.contentMode ?? fallbackContentMode;
  const viewMode = state?.hints?.viewMode ?? 'original';

  return {
    contentMode,
    mode: viewMode === 'summary' ? 'summary' : contentMode,
    usedContentModeFallback: state?.hints?.contentMode == null,
    usedViewModeFallback: state?.hints?.viewMode == null,
    viewMode,
  };
}
