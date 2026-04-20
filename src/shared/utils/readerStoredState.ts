import type {
  CanonicalPosition,
  ReaderLocator,
  ReaderViewMode,
  StoredReaderState,
} from '@shared/contracts/reader';

function hasOwn<T extends object>(obj: T, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isValidLocatorKind(value: unknown): value is NonNullable<CanonicalPosition['kind']> {
  return value === 'heading' || value === 'text' || value === 'image';
}

function isContentMode(
  value: unknown,
): value is NonNullable<NonNullable<StoredReaderState['hints']>['contentMode']> {
  return value === 'scroll' || value === 'paged';
}

function isViewMode(
  value: unknown,
): value is NonNullable<NonNullable<StoredReaderState['hints']>['viewMode']> {
  return value === 'original' || value === 'summary';
}

function toChapterBoundaryCanonical(
  chapterIndex: number | undefined,
): CanonicalPosition | undefined {
  if (typeof chapterIndex !== 'number') {
    return undefined;
  }

  return {
    chapterIndex,
    edge: 'start',
  };
}

function resolveLegacyContentMode(
  source: Record<string, unknown>,
): NonNullable<NonNullable<StoredReaderState['hints']>['contentMode']> | undefined {
  if (isContentMode(source.mode)) {
    return source.mode;
  }
  if (isContentMode(source.lastContentMode)) {
    return source.lastContentMode;
  }
  return undefined;
}

function resolveLegacyViewMode(
  source: Record<string, unknown>,
): ReaderViewMode | undefined {
  if (isViewMode(source.viewMode)) {
    return source.viewMode;
  }
  if (source.mode === 'summary') {
    return 'summary';
  }
  if (isContentMode(source.mode)) {
    return 'original';
  }
  return undefined;
}

function buildLegacyHints(
  chapterProgress: number | undefined,
  pageIndex: number | undefined,
  contentMode: NonNullable<NonNullable<StoredReaderState['hints']>['contentMode']> | undefined,
  viewMode: ReaderViewMode | undefined,
): StoredReaderState['hints'] {
  if (chapterProgress === undefined && pageIndex === undefined && !contentMode && !viewMode) {
    return undefined;
  }

  return {
    chapterProgress,
    pageIndex,
    contentMode,
    viewMode,
  };
}

export function clampChapterProgress(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function clampPageIndex(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  if (value < 0) return 0;
  return Math.floor(value);
}

export function sanitizeCanonicalPosition(raw: unknown): CanonicalPosition | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const parsed = raw as Record<string, unknown>;
  if (typeof parsed.chapterIndex !== 'number') {
    return undefined;
  }

  const canonical: CanonicalPosition = {
    chapterIndex: parsed.chapterIndex,
  };

  if (typeof parsed.blockIndex === 'number') {
    canonical.blockIndex = parsed.blockIndex;
  }
  if (isValidLocatorKind(parsed.kind)) {
    canonical.kind = parsed.kind;
  }
  if (typeof parsed.lineIndex === 'number') {
    canonical.lineIndex = parsed.lineIndex;
  }

  const startCursor = parsed.startCursor && typeof parsed.startCursor === 'object'
    ? parsed.startCursor as Record<string, unknown>
    : null;
  const endCursor = parsed.endCursor && typeof parsed.endCursor === 'object'
    ? parsed.endCursor as Record<string, unknown>
    : null;

  if (
    startCursor
    && typeof startCursor.segmentIndex === 'number'
    && typeof startCursor.graphemeIndex === 'number'
  ) {
    canonical.startCursor = {
      segmentIndex: startCursor.segmentIndex,
      graphemeIndex: startCursor.graphemeIndex,
    };
  }

  if (
    endCursor
    && typeof endCursor.segmentIndex === 'number'
    && typeof endCursor.graphemeIndex === 'number'
  ) {
    canonical.endCursor = {
      segmentIndex: endCursor.segmentIndex,
      graphemeIndex: endCursor.graphemeIndex,
    };
  }

  if (parsed.edge === 'start' || parsed.edge === 'end') {
    canonical.edge = parsed.edge;
  }

  return canonical;
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
    pageIndex: typeof parsed.pageIndex === 'number' ? parsed.pageIndex : undefined,
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

export function toCanonicalPositionFromLocator(
  locator?: ReaderLocator,
): CanonicalPosition | undefined {
  if (!locator) {
    return undefined;
  }

  return {
    chapterIndex: locator.chapterIndex,
    blockIndex: locator.blockIndex,
    kind: locator.kind,
    lineIndex: locator.lineIndex,
    startCursor: locator.startCursor ? { ...locator.startCursor } : undefined,
    endCursor: locator.endCursor ? { ...locator.endCursor } : undefined,
    edge: locator.edge,
  };
}

export function toReaderLocatorFromCanonical(
  canonical: CanonicalPosition | null | undefined,
  pageIndexHint?: number,
): ReaderLocator | undefined {
  if (!canonical || typeof canonical.blockIndex !== 'number' || !canonical.kind) {
    return undefined;
  }

  return {
    chapterIndex: canonical.chapterIndex,
    blockIndex: canonical.blockIndex,
    kind: canonical.kind,
    lineIndex: canonical.lineIndex,
    startCursor: canonical.startCursor ? { ...canonical.startCursor } : undefined,
    endCursor: canonical.endCursor ? { ...canonical.endCursor } : undefined,
    edge: canonical.edge,
    pageIndex: clampPageIndex(pageIndexHint),
  };
}

function normalizeHints(raw: unknown): StoredReaderState['hints'] {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const parsed = raw as Record<string, unknown>;
  const chapterProgress = clampChapterProgress(
    typeof parsed.chapterProgress === 'number' ? parsed.chapterProgress : undefined,
  );
  const pageIndex = clampPageIndex(
    typeof parsed.pageIndex === 'number' ? parsed.pageIndex : undefined,
  );
  const contentMode = parsed.contentMode === 'scroll' || parsed.contentMode === 'paged'
    ? parsed.contentMode
    : undefined;
  const viewMode = isViewMode(parsed.viewMode)
    ? parsed.viewMode
    : undefined;

  if (chapterProgress === undefined && pageIndex === undefined && !contentMode && !viewMode) {
    return undefined;
  }

  return {
    chapterProgress,
    pageIndex,
    contentMode,
    viewMode,
  };
}

export function sanitizeStoredReaderState(raw: unknown): StoredReaderState | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const parsed = raw as Record<string, unknown>;
  const legacyLocator = sanitizeLocator(parsed.locator);
  const legacyChapterIndex = typeof parsed.chapterIndex === 'number' ? parsed.chapterIndex : undefined;
  const canonical = sanitizeCanonicalPosition(parsed.canonical)
    ?? toCanonicalPositionFromLocator(legacyLocator)
    ?? toChapterBoundaryCanonical(legacyChapterIndex);

  const normalizedHints = normalizeHints(parsed.hints);
  const legacyChapterProgress = clampChapterProgress(
    typeof parsed.chapterProgress === 'number' ? parsed.chapterProgress : undefined,
  );
  const legacyPageIndex = clampPageIndex(
    typeof parsed.pageIndex === 'number'
      ? parsed.pageIndex
      : legacyLocator?.pageIndex,
  );
  const legacyContentMode = resolveLegacyContentMode(parsed);
  const legacyViewMode = resolveLegacyViewMode(parsed);
  const hints = normalizedHints ?? buildLegacyHints(
    legacyChapterProgress,
    legacyPageIndex,
    legacyContentMode,
    legacyViewMode,
  );

  return buildStoredReaderState({
    canonical,
    hints,
  });
}

export function getStoredChapterIndex(
  state: StoredReaderState | null | undefined,
): number {
  if (typeof state?.canonical?.chapterIndex === 'number') {
    return state.canonical.chapterIndex;
  }

  const legacy = state as Record<string, unknown> | null | undefined;
  if (typeof legacy?.chapterIndex === 'number') {
    return legacy.chapterIndex;
  }

  const locator = sanitizeLocator(legacy?.locator);
  return locator?.chapterIndex ?? 0;
}

export function buildStoredReaderState(
  state: StoredReaderState | null | undefined,
): StoredReaderState {
  const legacyState = state as Record<string, unknown> | null | undefined;
  const legacyLocator = sanitizeLocator(legacyState?.locator);
  const legacyChapterIndex = typeof legacyState?.chapterIndex === 'number'
    ? legacyState.chapterIndex
    : undefined;
  const canonical = sanitizeCanonicalPosition(state?.canonical)
    ?? toCanonicalPositionFromLocator(legacyLocator)
    ?? toChapterBoundaryCanonical(legacyChapterIndex)
    ?? createDefaultStoredReaderState().canonical;
  const normalizedHints = normalizeHints(state?.hints);
  const legacyChapterProgress = clampChapterProgress(
    typeof legacyState?.chapterProgress === 'number'
      ? legacyState.chapterProgress
      : undefined,
  );
  const legacyPageIndex = clampPageIndex(
    typeof legacyState?.pageIndex === 'number'
      ? legacyState.pageIndex
      : legacyLocator?.pageIndex,
  );
  const legacyContentMode = resolveLegacyContentMode(
    legacyState ?? {},
  );
  const legacyViewMode = resolveLegacyViewMode(
    legacyState ?? {},
  );
  const hints = normalizedHints ?? buildLegacyHints(
    legacyChapterProgress,
    legacyPageIndex,
    legacyContentMode,
    legacyViewMode,
  );

  return {
    canonical,
    hints,
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

  const overrideCanonical = sanitizeCanonicalPosition(overrideState.canonical);
  const nextCanonical = overrideCanonical ?? canonicalBaseState.canonical;
  const chapterChanged =
    nextCanonical?.chapterIndex !== canonicalBaseState.canonical?.chapterIndex;

  const baseHints = canonicalBaseState.hints;
  const rawOverrideHints = overrideState.hints && typeof overrideState.hints === 'object'
    ? overrideState.hints as Record<string, unknown>
    : null;
  const overrideHints = normalizeHints(overrideState.hints) ?? overrideState.hints;
  const hasOverrideHints = Boolean(rawOverrideHints);
  const hasChapterProgressOverride = hasOverrideHints
    && hasOwn(rawOverrideHints as Record<string, unknown>, 'chapterProgress');
  const hasPageIndexOverride = hasOverrideHints
    && hasOwn(rawOverrideHints as Record<string, unknown>, 'pageIndex');
  const hasContentModeOverride = hasOverrideHints
    && hasOwn(rawOverrideHints as Record<string, unknown>, 'contentMode');
  const hasViewModeOverride = hasOverrideHints
    && hasOwn(rawOverrideHints as Record<string, unknown>, 'viewMode');

  let nextChapterProgress: number | undefined;
  if (hasChapterProgressOverride) {
    nextChapterProgress = clampChapterProgress(overrideHints?.chapterProgress);
  } else if (!chapterChanged) {
    nextChapterProgress = baseHints?.chapterProgress;
  }

  let nextPageIndex: number | undefined;
  if (hasPageIndexOverride) {
    nextPageIndex = clampPageIndex(overrideHints?.pageIndex);
  } else if (!chapterChanged) {
    nextPageIndex = baseHints?.pageIndex;
  }

  const nextContentMode = hasContentModeOverride
    ? overrideHints?.contentMode
    : baseHints?.contentMode;
  const nextViewMode = hasViewModeOverride
    ? overrideHints?.viewMode
    : baseHints?.viewMode;
  const nextHints = buildLegacyHints(
    nextChapterProgress,
    nextPageIndex,
    nextContentMode,
    nextViewMode,
  );

  return buildStoredReaderState({
    canonical: nextCanonical,
    hints: nextHints,
  });
}

export function createDefaultStoredReaderState(): StoredReaderState {
  return {
    canonical: {
      chapterIndex: 0,
      edge: 'start',
    },
    hints: undefined,
  };
}
