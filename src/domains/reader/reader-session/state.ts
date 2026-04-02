import type { ReaderLocator } from '../utils/readerLayout';
import type { ReaderMode, StoredReaderState } from '../hooks/readerSessionTypes';

export function clampChapterProgress(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function shouldUseLocatorAsPrimaryPosition(
  mode: ReaderMode | undefined,
  locator: ReaderLocator | null | undefined,
): locator is ReaderLocator {
  return mode !== 'summary' && Boolean(locator);
}

export function sanitizeLocator(raw: unknown): ReaderLocator | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const parsed = raw as Record<string, unknown>;
  if (
    typeof parsed.chapterIndex !== 'number'
    || typeof parsed.blockIndex !== 'number'
    || (parsed.kind !== 'heading' && parsed.kind !== 'text' && parsed.kind !== 'image')
  ) {
    return undefined;
  }

  const startCursor = parsed.startCursor && typeof parsed.startCursor === 'object'
    ? parsed.startCursor as Record<string, unknown>
    : null;
  const endCursor = parsed.endCursor && typeof parsed.endCursor === 'object'
    ? parsed.endCursor as Record<string, unknown>
    : null;

  return {
    blockIndex: parsed.blockIndex,
    chapterIndex: parsed.chapterIndex,
    edge: parsed.edge === 'start' || parsed.edge === 'end' ? parsed.edge : undefined,
    endCursor: endCursor
      && typeof endCursor.segmentIndex === 'number'
      && typeof endCursor.graphemeIndex === 'number'
      ? {
        graphemeIndex: endCursor.graphemeIndex,
        segmentIndex: endCursor.segmentIndex,
      }
      : undefined,
    kind: parsed.kind,
    lineIndex: typeof parsed.lineIndex === 'number' ? parsed.lineIndex : undefined,
    startCursor: startCursor
      && typeof startCursor.segmentIndex === 'number'
      && typeof startCursor.graphemeIndex === 'number'
      ? {
        graphemeIndex: startCursor.graphemeIndex,
        segmentIndex: startCursor.segmentIndex,
      }
      : undefined,
  };
}

export function sanitizeStoredReaderState(raw: unknown): StoredReaderState | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Record<string, unknown>;
  const mode = parsed.mode === 'scroll' || parsed.mode === 'paged' || parsed.mode === 'summary'
    ? parsed.mode
    : undefined;
  const locator = sanitizeLocator(parsed.locator);
  const chapterIndex = typeof parsed.chapterIndex === 'number' ? parsed.chapterIndex : undefined;

  return buildStoredReaderState({
    chapterIndex: locator?.chapterIndex ?? chapterIndex,
    mode,
    chapterProgress: clampChapterProgress(
      typeof parsed.chapterProgress === 'number' ? parsed.chapterProgress : undefined,
    ),
    lastContentMode: parsed.lastContentMode === 'paged' || parsed.lastContentMode === 'scroll'
      ? parsed.lastContentMode
      : undefined,
    locator,
  });
}

export function resolveModeFromStoredState(
  state: StoredReaderState | null | undefined,
): ReaderMode {
  return state?.mode ?? 'scroll';
}

export function buildStoredReaderState(
  state: StoredReaderState | null | undefined,
): StoredReaderState {
  const mode = resolveModeFromStoredState(state);
  const primaryLocator = shouldUseLocatorAsPrimaryPosition(mode, state?.locator)
    ? state.locator
    : undefined;
  const chapterProgress = mode === 'summary'
    ? clampChapterProgress(state?.chapterProgress)
    : undefined;

  return {
    chapterIndex: primaryLocator?.chapterIndex ?? state?.chapterIndex ?? 0,
    mode,
    chapterProgress,
    lastContentMode: state?.lastContentMode ?? (mode === 'paged' ? 'paged' : 'scroll'),
    locator: primaryLocator,
  };
}

export function mergeStoredReaderState(
  baseState: StoredReaderState | null | undefined,
  overrideState: StoredReaderState | null | undefined,
): StoredReaderState {
  const canonicalBaseState = buildStoredReaderState(baseState);
  if (!overrideState) {
    return canonicalBaseState;
  }

  const nextMode = overrideState.mode ?? canonicalBaseState.mode;
  const overrideLocator = shouldUseLocatorAsPrimaryPosition(nextMode, overrideState.locator)
    ? overrideState.locator
    : undefined;
  const nextChapterIndex = overrideLocator?.chapterIndex
    ?? overrideState.chapterIndex
    ?? canonicalBaseState.chapterIndex;
  const chapterIndexChanged = nextChapterIndex !== canonicalBaseState.chapterIndex;
  const nextChapterProgress = nextMode === 'summary'
    ? clampChapterProgress(
      overrideState.chapterProgress
        ?? (
          !chapterIndexChanged && canonicalBaseState.mode === 'summary'
            ? canonicalBaseState.chapterProgress
            : undefined
        ),
    )
    : undefined;
  const nextLocator = nextMode === 'summary'
    ? undefined
    : overrideLocator
      ?? (chapterIndexChanged ? undefined : canonicalBaseState.locator);

  return buildStoredReaderState({
    chapterIndex: nextChapterIndex,
    mode: nextMode,
    chapterProgress: nextChapterProgress,
    lastContentMode: overrideState?.lastContentMode ?? canonicalBaseState.lastContentMode,
    locator: nextLocator,
  });
}

export function createDefaultStoredReaderState(): StoredReaderState {
  return {
    chapterIndex: 0,
    mode: 'scroll',
    chapterProgress: undefined,
    lastContentMode: 'scroll',
    locator: undefined,
  };
}
