import type { ReaderLocator } from '../utils/readerLayout';
import type { ReaderMode, StoredReaderState } from '../hooks/readerSessionTypes';

export function clampChapterProgress(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function sanitizeFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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
  const useLocatorAsPrimary = shouldUseLocatorAsPrimaryPosition(mode, locator);
  const chapterIndex = typeof parsed.chapterIndex === 'number' ? parsed.chapterIndex : undefined;
  const chapterProgress = clampChapterProgress(
    typeof parsed.chapterProgress === 'number' ? parsed.chapterProgress : undefined,
  );
  const scrollPosition = sanitizeFiniteNumber(parsed.scrollPosition);

  return {
    chapterIndex: useLocatorAsPrimary ? locator.chapterIndex : chapterIndex,
    mode,
    chapterProgress: useLocatorAsPrimary ? undefined : chapterProgress,
    scrollPosition: useLocatorAsPrimary ? undefined : scrollPosition,
    lastContentMode: parsed.lastContentMode === 'paged' || parsed.lastContentMode === 'scroll'
      ? parsed.lastContentMode
      : undefined,
    locatorVersion: useLocatorAsPrimary && parsed.locatorVersion === 1 ? 1 : undefined,
    locator: useLocatorAsPrimary ? locator : undefined,
  };
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
  const useLocatorAsPrimary = shouldUseLocatorAsPrimaryPosition(mode, state?.locator);
  const primaryLocator = useLocatorAsPrimary ? state?.locator : undefined;
  const scrollPosition = sanitizeFiniteNumber(state?.scrollPosition);

  return {
    chapterIndex: primaryLocator?.chapterIndex ?? state?.chapterIndex ?? 0,
    mode,
    chapterProgress: useLocatorAsPrimary ? undefined : clampChapterProgress(state?.chapterProgress),
    scrollPosition: useLocatorAsPrimary ? undefined : scrollPosition,
    lastContentMode: state?.lastContentMode ?? (mode === 'paged' ? 'paged' : 'scroll'),
    locatorVersion: useLocatorAsPrimary ? 1 : undefined,
    locator: primaryLocator,
  };
}

export function mergeStoredReaderState(
  baseState: StoredReaderState | null | undefined,
  overrideState: StoredReaderState | null | undefined,
): StoredReaderState {
  const canonicalBaseState = buildStoredReaderState(baseState);
  const nextMode = overrideState?.mode
    ?? canonicalBaseState.mode
    ?? resolveModeFromStoredState(canonicalBaseState);
  const canonicalOverrideChapterIndex = shouldUseLocatorAsPrimaryPosition(
    nextMode,
    overrideState?.locator,
  )
    ? overrideState!.locator.chapterIndex
    : overrideState?.chapterIndex;
  const chapterIndexChanged = typeof canonicalOverrideChapterIndex === 'number'
    && canonicalOverrideChapterIndex !== canonicalBaseState.chapterIndex;
  const shouldPreferLocator = shouldUseLocatorAsPrimaryPosition(nextMode, overrideState?.locator);
  const prefersLegacyScrollPosition = overrideState?.chapterProgress === undefined
    && typeof overrideState?.scrollPosition === 'number'
    && Number.isFinite(overrideState.scrollPosition);
  const shouldResetLocator = !shouldPreferLocator && overrideState?.locator === undefined && (
    chapterIndexChanged
    || overrideState?.chapterProgress !== undefined
    || overrideState?.scrollPosition !== undefined
  );
  const shouldResetLegacyPosition = shouldPreferLocator || (
    chapterIndexChanged
    && overrideState?.chapterProgress === undefined
    && overrideState?.scrollPosition === undefined
  );
  const nextChapterProgress =
    shouldResetLegacyPosition || prefersLegacyScrollPosition
      ? undefined
      : overrideState?.chapterProgress ?? canonicalBaseState.chapterProgress;
  const nextScrollPosition = shouldResetLegacyPosition
    ? undefined
    : overrideState?.scrollPosition ?? canonicalBaseState.scrollPosition;
  let nextLocatorVersion = overrideState?.locatorVersion ?? canonicalBaseState.locatorVersion;
  if (shouldPreferLocator) {
    nextLocatorVersion = 1;
  } else if (shouldResetLocator) {
    nextLocatorVersion = undefined;
  }
  let nextLocator = overrideState?.locator ?? canonicalBaseState.locator;
  if (shouldPreferLocator) {
    nextLocator = overrideState?.locator;
  } else if (shouldResetLocator) {
    nextLocator = undefined;
  }

  return buildStoredReaderState({
    chapterIndex: canonicalOverrideChapterIndex ?? canonicalBaseState.chapterIndex,
    mode: nextMode,
    chapterProgress: nextChapterProgress,
    scrollPosition: nextScrollPosition,
    lastContentMode: overrideState?.lastContentMode ?? canonicalBaseState.lastContentMode,
    locatorVersion: nextLocatorVersion,
    locator: nextLocator,
  });
}

export function createDefaultStoredReaderState(): StoredReaderState {
  return {
    chapterIndex: 0,
    mode: 'scroll',
    chapterProgress: undefined,
    scrollPosition: undefined,
    lastContentMode: 'scroll',
    locatorVersion: undefined,
    locator: undefined,
  };
}
