import type {
  CanonicalPosition,
  CanonicalPositionV2,
  ReaderLocator,
  ReaderPositionMetadata,
  ReaderProjectionMetadata,
  ReaderRestoreTarget,
  ReaderViewMode,
  StoredReaderState,
} from '@shared/contracts/reader';

function hasOwn<T extends object>(obj: T, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function compactUndefined<T extends Record<string, unknown>>(value: T): T {
  const compacted = { ...value };
  for (const key of Object.keys(compacted)) {
    if (compacted[key] === undefined) {
      delete compacted[key];
    }
  }
  return compacted;
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
  scrollProjection?: ReaderProjectionMetadata,
  pagedProjection?: ReaderProjectionMetadata,
): StoredReaderState['hints'] {
  if (
    chapterProgress === undefined
    && pageIndex === undefined
    && !contentMode
    && !viewMode
    && !scrollProjection
    && !pagedProjection
  ) {
    return undefined;
  }

  return compactUndefined({
    chapterProgress,
    pageIndex,
    contentMode,
    viewMode,
    scrollProjection,
    pagedProjection,
  });
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

function sanitizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function sanitizeTextQuote(raw: unknown): ReaderLocator['textQuote'] | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const parsed = raw as Record<string, unknown>;
  const exact = sanitizeOptionalString(parsed.exact);
  if (!exact) {
    return undefined;
  }

  return compactUndefined({
    exact,
    prefix: sanitizeOptionalString(parsed.prefix),
    suffix: sanitizeOptionalString(parsed.suffix),
  });
}

function sanitizeProjectionMetadata(raw: unknown): ReaderProjectionMetadata | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const parsed = raw as Record<string, unknown>;
  const sourceMode: ReaderProjectionMetadata['sourceMode'] =
    parsed.sourceMode === 'scroll' || parsed.sourceMode === 'paged'
      ? parsed.sourceMode
      : undefined;
  const metadata: ReaderProjectionMetadata = compactUndefined({
    basisCanonicalFingerprint: sanitizeOptionalString(parsed.basisCanonicalFingerprint),
    capturedAt: sanitizeOptionalString(parsed.capturedAt),
    layoutKey: sanitizeOptionalString(parsed.layoutKey),
    sourceMode,
  });

  return Object.values(metadata).some((value) => value !== undefined)
    ? metadata
    : undefined;
}

function sanitizePositionMetadata(raw: unknown): ReaderPositionMetadata | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const parsed = raw as Record<string, unknown>;
  const captureQuality: ReaderPositionMetadata['captureQuality'] =
    parsed.captureQuality === 'precise' || parsed.captureQuality === 'approximate'
      ? parsed.captureQuality
      : undefined;
  const sourceMode: ReaderPositionMetadata['sourceMode'] =
    parsed.sourceMode === 'scroll' || parsed.sourceMode === 'paged'
      ? parsed.sourceMode
      : undefined;
  const metadata: ReaderPositionMetadata = compactUndefined({
    capturedAt: sanitizeOptionalString(parsed.capturedAt),
    captureQuality,
    resolverVersion: typeof parsed.resolverVersion === 'number'
      ? parsed.resolverVersion
      : undefined,
    sourceMode,
  });

  return Object.values(metadata).some((value) => value !== undefined)
    ? metadata
    : undefined;
}

function copyLocatorMetadata(
  source: Pick<
    ReaderLocator,
    | 'anchorId'
    | 'blockKey'
    | 'blockTextHash'
    | 'chapterKey'
    | 'contentHash'
    | 'contentVersion'
    | 'imageKey'
    | 'importFormatVersion'
    | 'textQuote'
  >,
): Omit<CanonicalPosition, 'chapterIndex' | 'blockIndex' | 'kind' | 'lineIndex' | 'startCursor' | 'endCursor' | 'edge'> {
  return compactUndefined({
    anchorId: source.anchorId,
    blockKey: source.blockKey,
    blockTextHash: source.blockTextHash,
    chapterKey: source.chapterKey,
    contentHash: source.contentHash,
    contentVersion: source.contentVersion,
    imageKey: source.imageKey,
    importFormatVersion: source.importFormatVersion,
    textQuote: source.textQuote
      ? {
        exact: source.textQuote.exact,
        prefix: source.textQuote.prefix,
        suffix: source.textQuote.suffix,
      }
      : undefined,
  });
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

  canonical.chapterKey = sanitizeOptionalString(parsed.chapterKey);
  if (typeof parsed.blockIndex === 'number') {
    canonical.blockIndex = parsed.blockIndex;
  }
  canonical.blockKey = sanitizeOptionalString(parsed.blockKey);
  canonical.anchorId = sanitizeOptionalString(parsed.anchorId);
  canonical.imageKey = sanitizeOptionalString(parsed.imageKey);
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
  canonical.textQuote = sanitizeTextQuote(parsed.textQuote);
  canonical.blockTextHash = sanitizeOptionalString(parsed.blockTextHash);
  canonical.contentVersion = typeof parsed.contentVersion === 'number'
    ? parsed.contentVersion
    : undefined;
  canonical.importFormatVersion = typeof parsed.importFormatVersion === 'number'
    ? parsed.importFormatVersion
    : undefined;
  canonical.contentHash = sanitizeOptionalString(parsed.contentHash);

  return compactUndefined(
    canonical as unknown as Record<string, unknown>,
  ) as unknown as CanonicalPosition;
}

function copyCanonicalV2Metadata(
  source: Pick<
    CanonicalPosition,
    | 'anchorId'
    | 'blockKey'
    | 'blockTextHash'
    | 'chapterKey'
    | 'contentHash'
    | 'contentVersion'
    | 'imageKey'
    | 'importFormatVersion'
    | 'textQuote'
  >,
): Pick<
  CanonicalPositionV2 & Record<string, unknown>,
  | 'anchorId'
  | 'blockKey'
  | 'blockTextHash'
  | 'chapterKey'
  | 'contentHash'
  | 'contentVersion'
  | 'imageKey'
  | 'importFormatVersion'
  | 'textQuote'
> {
  return compactUndefined({
    anchorId: source.anchorId,
    blockKey: source.blockKey,
    blockTextHash: source.blockTextHash,
    chapterKey: source.chapterKey,
    contentHash: source.contentHash,
    contentVersion: source.contentVersion,
    imageKey: source.imageKey,
    importFormatVersion: source.importFormatVersion,
    textQuote: source.textQuote
      ? {
        exact: source.textQuote.exact,
        prefix: source.textQuote.prefix,
        suffix: source.textQuote.suffix,
      }
      : undefined,
  }) as Pick<
    CanonicalPositionV2 & Record<string, unknown>,
    | 'anchorId'
    | 'blockKey'
    | 'blockTextHash'
    | 'chapterKey'
    | 'contentHash'
    | 'contentVersion'
    | 'imageKey'
    | 'importFormatVersion'
    | 'textQuote'
  >;
}

export function toCanonicalPositionV2FromCanonical(
  canonical: CanonicalPosition | null | undefined,
): CanonicalPositionV2 | undefined {
  const normalized = sanitizeCanonicalPosition(canonical);
  if (!normalized) {
    return undefined;
  }

  if (!normalized.kind && (normalized.edge === 'start' || normalized.edge === 'end')) {
    return compactUndefined({
      type: 'chapter-boundary',
      chapterIndex: normalized.chapterIndex,
      chapterKey: normalized.chapterKey,
      edge: normalized.edge,
      contentVersion: normalized.contentVersion,
      importFormatVersion: normalized.importFormatVersion,
      contentHash: normalized.contentHash,
    }) as CanonicalPositionV2;
  }

  if (!normalized.kind && typeof normalized.blockIndex !== 'number') {
    return compactUndefined({
      type: 'chapter-boundary',
      chapterIndex: normalized.chapterIndex,
      chapterKey: normalized.chapterKey,
      edge: normalized.edge === 'end' ? 'end' : 'start',
      contentVersion: normalized.contentVersion,
      importFormatVersion: normalized.importFormatVersion,
      contentHash: normalized.contentHash,
    }) as CanonicalPositionV2;
  }

  return compactUndefined({
    type: 'block-anchor',
    chapterIndex: normalized.chapterIndex,
    ...copyCanonicalV2Metadata(normalized),
    blockIndex: normalized.blockIndex,
    kind: normalized.kind ?? 'text',
    lineIndex: normalized.lineIndex,
    startCursor: normalized.startCursor ? { ...normalized.startCursor } : undefined,
    endCursor: normalized.endCursor ? { ...normalized.endCursor } : undefined,
    edge: normalized.edge,
  }) as CanonicalPositionV2;
}

export function sanitizeCanonicalPositionV2(raw: unknown): CanonicalPositionV2 | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const parsed = raw as Record<string, unknown>;
  if (parsed.type === 'chapter-boundary') {
    if (
      typeof parsed.chapterIndex !== 'number'
      || (parsed.edge !== 'start' && parsed.edge !== 'end')
    ) {
      return undefined;
    }

    return compactUndefined({
      type: 'chapter-boundary',
      chapterIndex: parsed.chapterIndex,
      chapterKey: sanitizeOptionalString(parsed.chapterKey),
      edge: parsed.edge,
      contentVersion: typeof parsed.contentVersion === 'number'
        ? parsed.contentVersion
        : undefined,
      importFormatVersion: typeof parsed.importFormatVersion === 'number'
        ? parsed.importFormatVersion
        : undefined,
      contentHash: sanitizeOptionalString(parsed.contentHash),
    }) as CanonicalPositionV2;
  }

  if (parsed.type !== 'block-anchor' || typeof parsed.chapterIndex !== 'number') {
    return toCanonicalPositionV2FromCanonical(sanitizeCanonicalPosition(parsed));
  }

  if (!isValidLocatorKind(parsed.kind)) {
    return undefined;
  }

  const startCursor = parsed.startCursor && typeof parsed.startCursor === 'object'
    ? parsed.startCursor as Record<string, unknown>
    : null;
  const endCursor = parsed.endCursor && typeof parsed.endCursor === 'object'
    ? parsed.endCursor as Record<string, unknown>
    : null;

  return compactUndefined({
    type: 'block-anchor',
    chapterIndex: parsed.chapterIndex,
    chapterKey: sanitizeOptionalString(parsed.chapterKey),
    blockIndex: typeof parsed.blockIndex === 'number' ? parsed.blockIndex : undefined,
    blockKey: sanitizeOptionalString(parsed.blockKey),
    anchorId: sanitizeOptionalString(parsed.anchorId),
    imageKey: sanitizeOptionalString(parsed.imageKey),
    kind: parsed.kind,
    lineIndex: typeof parsed.lineIndex === 'number' ? parsed.lineIndex : undefined,
    startCursor: startCursor
      && typeof startCursor.segmentIndex === 'number'
      && typeof startCursor.graphemeIndex === 'number'
      ? {
        segmentIndex: startCursor.segmentIndex,
        graphemeIndex: startCursor.graphemeIndex,
      }
      : undefined,
    endCursor: endCursor
      && typeof endCursor.segmentIndex === 'number'
      && typeof endCursor.graphemeIndex === 'number'
      ? {
        segmentIndex: endCursor.segmentIndex,
        graphemeIndex: endCursor.graphemeIndex,
      }
      : undefined,
    edge: parsed.edge === 'start' || parsed.edge === 'end' ? parsed.edge : undefined,
    textQuote: sanitizeTextQuote(parsed.textQuote),
    blockTextHash: sanitizeOptionalString(parsed.blockTextHash),
    contentVersion: typeof parsed.contentVersion === 'number' ? parsed.contentVersion : undefined,
    importFormatVersion: typeof parsed.importFormatVersion === 'number'
      ? parsed.importFormatVersion
      : undefined,
    contentHash: sanitizeOptionalString(parsed.contentHash),
  }) as CanonicalPositionV2;
}

export function toCanonicalPositionFromCanonicalV2(
  position: CanonicalPositionV2 | null | undefined,
): CanonicalPosition | undefined {
  const normalized = sanitizeCanonicalPositionV2(position);
  if (!normalized) {
    return undefined;
  }

  if (normalized.type === 'chapter-boundary') {
    return compactUndefined({
      chapterIndex: normalized.chapterIndex,
      chapterKey: normalized.chapterKey,
      edge: normalized.edge,
      contentVersion: normalized.contentVersion,
      importFormatVersion: normalized.importFormatVersion,
      contentHash: normalized.contentHash,
    }) as CanonicalPosition;
  }

  return compactUndefined({
    chapterIndex: normalized.chapterIndex,
    chapterKey: normalized.chapterKey,
    blockIndex: normalized.blockIndex,
    blockKey: normalized.blockKey,
    anchorId: normalized.anchorId,
    imageKey: normalized.imageKey,
    kind: normalized.kind,
    lineIndex: normalized.lineIndex,
    startCursor: normalized.startCursor ? { ...normalized.startCursor } : undefined,
    endCursor: normalized.endCursor ? { ...normalized.endCursor } : undefined,
    edge: normalized.edge,
    textQuote: normalized.textQuote
      ? {
        exact: normalized.textQuote.exact,
        prefix: normalized.textQuote.prefix,
        suffix: normalized.textQuote.suffix,
      }
      : undefined,
    blockTextHash: normalized.blockTextHash,
    contentVersion: normalized.contentVersion,
    importFormatVersion: normalized.importFormatVersion,
    contentHash: normalized.contentHash,
  }) as CanonicalPosition;
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

  return compactUndefined({
    blockIndex: parsed.blockIndex,
    blockKey: sanitizeOptionalString(parsed.blockKey),
    chapterIndex: parsed.chapterIndex,
    chapterKey: sanitizeOptionalString(parsed.chapterKey),
    anchorId: sanitizeOptionalString(parsed.anchorId),
    imageKey: sanitizeOptionalString(parsed.imageKey),
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
    textQuote: sanitizeTextQuote(parsed.textQuote),
    blockTextHash: sanitizeOptionalString(parsed.blockTextHash),
    contentVersion: typeof parsed.contentVersion === 'number' ? parsed.contentVersion : undefined,
    importFormatVersion: typeof parsed.importFormatVersion === 'number'
      ? parsed.importFormatVersion
      : undefined,
    contentHash: sanitizeOptionalString(parsed.contentHash),
    startCursor: startCursor
      && typeof startCursor.segmentIndex === 'number'
      && typeof startCursor.graphemeIndex === 'number'
      ? {
        graphemeIndex: startCursor.graphemeIndex,
        segmentIndex: startCursor.segmentIndex,
      }
      : undefined,
  }) as ReaderLocator;
}

export function toCanonicalPositionFromLocator(
  locator?: ReaderLocator,
): CanonicalPosition | undefined {
  if (!locator) {
    return undefined;
  }

  return compactUndefined({
    chapterIndex: locator.chapterIndex,
    ...copyLocatorMetadata(locator),
    blockIndex: locator.blockIndex,
    kind: locator.kind,
    lineIndex: locator.lineIndex,
    startCursor: locator.startCursor ? { ...locator.startCursor } : undefined,
    endCursor: locator.endCursor ? { ...locator.endCursor } : undefined,
    edge: locator.edge,
  }) as CanonicalPosition;
}

export function toCanonicalPositionV2FromLocator(
  locator?: ReaderLocator,
): CanonicalPositionV2 | undefined {
  return toCanonicalPositionV2FromCanonical(toCanonicalPositionFromLocator(locator));
}

export function toReaderLocatorFromCanonical(
  canonical: CanonicalPosition | null | undefined,
  pageIndexHint?: number,
): ReaderLocator | undefined {
  if (!canonical || typeof canonical.blockIndex !== 'number' || !canonical.kind) {
    return undefined;
  }

  return compactUndefined({
    chapterIndex: canonical.chapterIndex,
    chapterKey: canonical.chapterKey,
    blockIndex: canonical.blockIndex,
    blockKey: canonical.blockKey,
    anchorId: canonical.anchorId,
    imageKey: canonical.imageKey,
    kind: canonical.kind,
    lineIndex: canonical.lineIndex,
    startCursor: canonical.startCursor ? { ...canonical.startCursor } : undefined,
    endCursor: canonical.endCursor ? { ...canonical.endCursor } : undefined,
    edge: canonical.edge,
    pageIndex: clampPageIndex(pageIndexHint),
    textQuote: canonical.textQuote
      ? {
        exact: canonical.textQuote.exact,
        prefix: canonical.textQuote.prefix,
        suffix: canonical.textQuote.suffix,
      }
      : undefined,
    blockTextHash: canonical.blockTextHash,
    contentVersion: canonical.contentVersion,
    importFormatVersion: canonical.importFormatVersion,
    contentHash: canonical.contentHash,
  }) as ReaderLocator;
}

export function toReaderLocatorFromCanonicalV2(
  position: CanonicalPositionV2 | null | undefined,
  pageIndexHint?: number,
): ReaderLocator | undefined {
  const canonical = toCanonicalPositionFromCanonicalV2(position);
  return toReaderLocatorFromCanonical(canonical, pageIndexHint);
}

export function getReaderRestoreTargetPosition(
  target: ReaderRestoreTarget | null | undefined,
): CanonicalPositionV2 | undefined {
  if (!target) {
    return undefined;
  }

  return sanitizeCanonicalPositionV2(target.position)
    ?? toCanonicalPositionV2FromLocator(target.locator)
    ?? (
      target.locatorBoundary
        ? {
          type: 'chapter-boundary',
          chapterIndex: target.chapterIndex,
          edge: target.locatorBoundary,
        } satisfies CanonicalPositionV2
        : undefined
    );
}

export function getReaderRestoreTargetLocator(
  target: ReaderRestoreTarget | null | undefined,
): ReaderLocator | undefined {
  if (!target) {
    return undefined;
  }

  return sanitizeLocator(target.locator)
    ?? toReaderLocatorFromCanonicalV2(target.position);
}

export function getReaderRestoreTargetBoundary(
  target: ReaderRestoreTarget | null | undefined,
): ReaderLocator['edge'] | undefined {
  if (!target) {
    return undefined;
  }

  const position = getReaderRestoreTargetPosition(target);
  if (position?.type === 'chapter-boundary') {
    return position.edge;
  }

  return target.locatorBoundary;
}

export function getReaderRestoreTargetChapterIndex(
  target: ReaderRestoreTarget | null | undefined,
): number | undefined {
  if (!target) {
    return undefined;
  }

  return getReaderRestoreTargetPosition(target)?.chapterIndex
    ?? target.locator?.chapterIndex
    ?? target.chapterIndex;
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
  const contentMode: NonNullable<StoredReaderState['hints']>['contentMode'] =
    parsed.contentMode === 'scroll' || parsed.contentMode === 'paged'
      ? parsed.contentMode
      : undefined;
  const viewMode: NonNullable<StoredReaderState['hints']>['viewMode'] =
    isViewMode(parsed.viewMode)
      ? parsed.viewMode
      : undefined;
  const scrollProjection = sanitizeProjectionMetadata(parsed.scrollProjection);
  const pagedProjection = sanitizeProjectionMetadata(parsed.pagedProjection);

  if (
    chapterProgress === undefined
    && pageIndex === undefined
    && !contentMode
    && !viewMode
    && !scrollProjection
    && !pagedProjection
  ) {
    return undefined;
  }

  return compactUndefined({
    chapterProgress,
    pageIndex,
    contentMode,
    viewMode,
    scrollProjection,
    pagedProjection,
  });
}

export function sanitizeStoredReaderState(raw: unknown): StoredReaderState | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const parsed = raw as Record<string, unknown>;
  const legacyLocator = sanitizeLocator(parsed.locator);
  const legacyChapterIndex = typeof parsed.chapterIndex === 'number' ? parsed.chapterIndex : undefined;
  const parsedCanonicalV2 = sanitizeCanonicalPositionV2(parsed.canonicalV2);
  const canonical = sanitizeCanonicalPosition(parsed.canonical)
    ?? toCanonicalPositionFromCanonicalV2(parsedCanonicalV2)
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
    canonicalV2: parsedCanonicalV2,
    hints,
    metadata: sanitizePositionMetadata(parsed.metadata),
  });
}

export function getStoredChapterIndex(
  state: StoredReaderState | null | undefined,
): number {
  if (typeof state?.canonicalV2?.chapterIndex === 'number') {
    return state.canonicalV2.chapterIndex;
  }

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
  const parsedCanonicalV2 = sanitizeCanonicalPositionV2(state?.canonicalV2);
  const canonical = sanitizeCanonicalPosition(state?.canonical)
    ?? toCanonicalPositionFromCanonicalV2(parsedCanonicalV2)
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

  const metadata = sanitizePositionMetadata(state?.metadata ?? legacyState?.metadata);

  const canonicalV2 = parsedCanonicalV2 ?? toCanonicalPositionV2FromCanonical(canonical);

  return {
    canonical,
    ...(state?.canonicalV2 ? { canonicalV2 } : {}),
    hints,
    ...(metadata ? { metadata } : {}),
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

  const overrideCanonicalV2 = sanitizeCanonicalPositionV2(overrideState.canonicalV2);
  const overrideCanonical = sanitizeCanonicalPosition(overrideState.canonical)
    ?? toCanonicalPositionFromCanonicalV2(overrideCanonicalV2);
  const nextCanonical = overrideCanonical ?? canonicalBaseState.canonical;
  const nextCanonicalV2 = overrideCanonicalV2
    ?? toCanonicalPositionV2FromCanonical(nextCanonical);
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
  const hasScrollProjectionOverride = hasOverrideHints
    && hasOwn(rawOverrideHints as Record<string, unknown>, 'scrollProjection');
  const hasPagedProjectionOverride = hasOverrideHints
    && hasOwn(rawOverrideHints as Record<string, unknown>, 'pagedProjection');

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
  let nextScrollProjection: ReaderProjectionMetadata | undefined;
  if (hasChapterProgressOverride && nextChapterProgress === undefined) {
    nextScrollProjection = undefined;
  } else if (hasScrollProjectionOverride) {
    nextScrollProjection = sanitizeProjectionMetadata(overrideHints?.scrollProjection);
  } else if (!chapterChanged) {
    nextScrollProjection = baseHints?.scrollProjection;
  }

  let nextPagedProjection: ReaderProjectionMetadata | undefined;
  if (hasPageIndexOverride && nextPageIndex === undefined) {
    nextPagedProjection = undefined;
  } else if (hasPagedProjectionOverride) {
    nextPagedProjection = sanitizeProjectionMetadata(overrideHints?.pagedProjection);
  } else if (!chapterChanged) {
    nextPagedProjection = baseHints?.pagedProjection;
  }
  const nextHints = buildLegacyHints(
    nextChapterProgress,
    nextPageIndex,
    nextContentMode,
    nextViewMode,
    nextScrollProjection,
    nextPagedProjection,
  );
  const overrideMetadata = sanitizePositionMetadata(overrideState.metadata);
  const nextMetadata = overrideMetadata ?? (
    chapterChanged ? undefined : canonicalBaseState.metadata
  );

  return buildStoredReaderState({
    canonical: nextCanonical,
    ...(overrideState.canonicalV2 ? { canonicalV2: nextCanonicalV2 } : {}),
    hints: nextHints,
    metadata: nextMetadata,
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

export function createCanonicalPositionFingerprint(
  canonical: CanonicalPosition | null | undefined,
): string {
  return JSON.stringify(sanitizeCanonicalPosition(canonical) ?? null);
}

export function createCanonicalPositionV2Fingerprint(
  canonical: CanonicalPosition | CanonicalPositionV2 | null | undefined,
): string {
  const normalizedV2 = sanitizeCanonicalPositionV2(canonical)
    ?? toCanonicalPositionV2FromCanonical(sanitizeCanonicalPosition(canonical));
  return JSON.stringify(normalizedV2 ?? null);
}

export function isReaderProjectionFreshForCanonical(
  projection: ReaderProjectionMetadata | null | undefined,
  canonical: CanonicalPosition | null | undefined,
): boolean {
  if (!projection?.basisCanonicalFingerprint) {
    return true;
  }

  return projection.basisCanonicalFingerprint === createCanonicalPositionFingerprint(canonical)
    || projection.basisCanonicalFingerprint === createCanonicalPositionV2Fingerprint(canonical);
}
