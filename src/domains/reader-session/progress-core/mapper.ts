import type {
  ReaderLocatorRecord,
  ReaderProgressPositionRecord,
  ReaderProgressProjectionRecord,
  ReaderProgressRecord,
} from '@infra/db/reader';
import type { ReaderLocator } from '@shared/contracts/reader';

import type {
  PersistedReaderProgressSnapshot,
  ReaderProgressPosition,
  ReaderProgressProjection,
  ReaderProgressSnapshot,
} from './contracts';

function clampChapterProgress(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}

function normalizePageIndex(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeOffset(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, value);
}

function normalizeString(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeSourceMode(value: unknown): 'scroll' | 'paged' | undefined {
  return value === 'scroll' || value === 'paged' ? value : undefined;
}

function toReaderLocatorRecord(locator: ReaderLocator): ReaderLocatorRecord {
  return {
    chapterIndex: locator.chapterIndex,
    chapterKey: normalizeString(locator.chapterKey),
    blockIndex: locator.blockIndex,
    blockKey: normalizeString(locator.blockKey),
    anchorId: normalizeString(locator.anchorId),
    imageKey: normalizeString(locator.imageKey),
    kind: locator.kind,
    lineIndex: locator.lineIndex,
    startCursor: locator.startCursor ? { ...locator.startCursor } : undefined,
    endCursor: locator.endCursor ? { ...locator.endCursor } : undefined,
    edge: locator.edge,
    pageIndex: normalizePageIndex(locator.pageIndex),
    textQuote: locator.textQuote,
    blockTextHash: normalizeString(locator.blockTextHash),
    contentVersion: locator.contentVersion,
    importFormatVersion: locator.importFormatVersion,
    contentHash: normalizeString(locator.contentHash),
  };
}

function toReaderLocator(locator: ReaderLocatorRecord): ReaderLocator {
  return {
    chapterIndex: locator.chapterIndex,
    chapterKey: normalizeString(locator.chapterKey),
    blockIndex: locator.blockIndex,
    blockKey: normalizeString(locator.blockKey),
    anchorId: normalizeString(locator.anchorId),
    imageKey: normalizeString(locator.imageKey),
    kind: locator.kind,
    lineIndex: locator.lineIndex,
    startCursor: locator.startCursor ? { ...locator.startCursor } : undefined,
    endCursor: locator.endCursor ? { ...locator.endCursor } : undefined,
    edge: locator.edge,
    pageIndex: normalizePageIndex(locator.pageIndex),
    textQuote: locator.textQuote,
    blockTextHash: normalizeString(locator.blockTextHash),
    contentVersion: locator.contentVersion,
    importFormatVersion: locator.importFormatVersion,
    contentHash: normalizeString(locator.contentHash),
  };
}

export function toReaderProgressPositionRecord(
  position: ReaderProgressPosition,
): ReaderProgressPositionRecord {
  if (position.type === 'locator') {
    return {
      type: 'locator',
      locator: toReaderLocatorRecord(position.locator),
    };
  }

  return {
    type: 'chapter-edge',
    chapterIndex: position.chapterIndex,
    edge: position.edge,
  };
}

export function toReaderProgressPosition(
  record: ReaderProgressPositionRecord | undefined,
): ReaderProgressPosition | null {
  if (!record || typeof record !== 'object') {
    return null;
  }

  if (record.type === 'locator') {
    if (!record.locator || typeof record.locator !== 'object') {
      return null;
    }

    return {
      type: 'locator',
      locator: toReaderLocator(record.locator),
    };
  }

  if (
    record.type !== 'chapter-edge'
    || typeof record.chapterIndex !== 'number'
    || (record.edge !== 'start' && record.edge !== 'end')
  ) {
    return null;
  }

  return {
    type: 'chapter-edge',
    chapterIndex: record.chapterIndex,
    edge: record.edge,
  };
}

export function toReaderProgressProjectionRecord(
  projection: ReaderProgressProjection | undefined,
): ReaderProgressProjectionRecord | undefined {
  const scrollChapterProgress = clampChapterProgress(projection?.scroll?.chapterProgress);
  const pagedPageIndex = normalizePageIndex(projection?.paged?.pageIndex);
  const globalScrollOffset = normalizeOffset(projection?.global?.globalScrollOffset);
  const globalPageIndex = normalizePageIndex(projection?.global?.globalPageIndex);

  if (
    scrollChapterProgress === undefined
    && pagedPageIndex === undefined
    && globalScrollOffset === undefined
    && globalPageIndex === undefined
  ) {
    return undefined;
  }

  return {
    globalScrollOffset,
    globalPageIndex,
    globalCapturedAt: normalizeString(projection?.global?.capturedAt),
    globalSourceMode: projection?.global?.sourceMode,
    globalBasisCanonicalFingerprint: normalizeString(projection?.global?.basisCanonicalFingerprint),
    globalLayoutKey: normalizeString(projection?.global?.layoutKey),
    pagedPageIndex,
    pagedCapturedAt: normalizeString(projection?.paged?.capturedAt),
    pagedSourceMode: projection?.paged?.sourceMode,
    pagedBasisCanonicalFingerprint: normalizeString(projection?.paged?.basisCanonicalFingerprint),
    pagedLayoutKey: normalizeString(projection?.paged?.layoutKey),
    scrollChapterProgress,
    scrollCapturedAt: normalizeString(projection?.scroll?.capturedAt),
    scrollSourceMode: projection?.scroll?.sourceMode,
    scrollBasisCanonicalFingerprint: normalizeString(projection?.scroll?.basisCanonicalFingerprint),
  };
}

export function toReaderProgressProjection(
  record: ReaderProgressProjectionRecord | undefined,
): ReaderProgressProjection | undefined {
  const scrollChapterProgress = clampChapterProgress(record?.scrollChapterProgress);
  const pagedPageIndex = normalizePageIndex(record?.pagedPageIndex);
  const globalScrollOffset = normalizeOffset(record?.globalScrollOffset);
  const globalPageIndex = normalizePageIndex(record?.globalPageIndex);

  if (
    scrollChapterProgress === undefined
    && pagedPageIndex === undefined
    && globalScrollOffset === undefined
    && globalPageIndex === undefined
  ) {
    return undefined;
  }

  return {
    global: globalScrollOffset === undefined && globalPageIndex === undefined
      ? undefined
      : {
        ...(globalScrollOffset === undefined ? {} : { globalScrollOffset }),
        ...(globalPageIndex === undefined ? {} : { globalPageIndex }),
        ...(normalizeString(record?.globalCapturedAt)
          ? { capturedAt: normalizeString(record?.globalCapturedAt) }
          : {}),
        ...(normalizeSourceMode(record?.globalSourceMode)
          ? { sourceMode: normalizeSourceMode(record?.globalSourceMode) }
          : {}),
        ...(normalizeString(record?.globalBasisCanonicalFingerprint)
          ? { basisCanonicalFingerprint: normalizeString(record?.globalBasisCanonicalFingerprint) }
          : {}),
        ...(normalizeString(record?.globalLayoutKey)
          ? { layoutKey: normalizeString(record?.globalLayoutKey) }
          : {}),
      },
    paged: pagedPageIndex === undefined
      ? undefined
      : {
        pageIndex: pagedPageIndex,
        ...(normalizeString(record?.pagedCapturedAt)
          ? { capturedAt: normalizeString(record?.pagedCapturedAt) }
          : {}),
        ...(normalizeSourceMode(record?.pagedSourceMode)
          ? { sourceMode: normalizeSourceMode(record?.pagedSourceMode) }
          : {}),
        ...(normalizeString(record?.pagedBasisCanonicalFingerprint)
          ? { basisCanonicalFingerprint: normalizeString(record?.pagedBasisCanonicalFingerprint) }
          : {}),
        ...(normalizeString(record?.pagedLayoutKey)
          ? { layoutKey: normalizeString(record?.pagedLayoutKey) }
          : {}),
      },
    scroll: scrollChapterProgress === undefined
      ? undefined
      : {
        chapterProgress: scrollChapterProgress,
        ...(normalizeString(record?.scrollCapturedAt)
          ? { capturedAt: normalizeString(record?.scrollCapturedAt) }
          : {}),
        ...(normalizeSourceMode(record?.scrollSourceMode)
          ? { sourceMode: normalizeSourceMode(record?.scrollSourceMode) }
          : {}),
        ...(normalizeString(record?.scrollBasisCanonicalFingerprint)
          ? { basisCanonicalFingerprint: normalizeString(record?.scrollBasisCanonicalFingerprint) }
          : {}),
      },
  };
}

function isValidCaptureQuality(value: unknown): value is ReaderProgressSnapshot['captureQuality'] {
  return value === 'precise' || value === 'approximate';
}

function isValidMode(value: unknown): value is ReaderProgressSnapshot['mode'] {
  return value === 'scroll' || value === 'paged';
}

export function toReaderProgressRecord(params: {
  novelId: number;
  revision: number;
  snapshot: ReaderProgressSnapshot;
  updatedAt: string;
}): ReaderProgressRecord {
  return {
    novelId: params.novelId,
    mode: params.snapshot.mode,
    activeChapterIndex: params.snapshot.activeChapterIndex,
    position: toReaderProgressPositionRecord(params.snapshot.position),
    projections: toReaderProgressProjectionRecord(params.snapshot.projections),
    captureQuality: params.snapshot.captureQuality,
    ...(normalizeString(params.snapshot.capturedAt)
      ? { capturedAt: normalizeString(params.snapshot.capturedAt) }
      : {}),
    ...(params.snapshot.sourceMode ? { sourceMode: params.snapshot.sourceMode } : {}),
    ...(typeof params.snapshot.resolverVersion === 'number'
      ? { resolverVersion: params.snapshot.resolverVersion }
      : {}),
    revision: params.revision,
    updatedAt: params.updatedAt,
  };
}

export function toPersistedReaderProgressSnapshot(
  record: ReaderProgressRecord,
): PersistedReaderProgressSnapshot | null {
  if (!isValidMode(record.mode) || !isValidCaptureQuality(record.captureQuality)) {
    return null;
  }

  if (
    typeof record.novelId !== 'number'
    || typeof record.activeChapterIndex !== 'number'
    || typeof record.updatedAt !== 'string'
  ) {
    return null;
  }

  const position = toReaderProgressPosition(record.position);
  if (!position) {
    return null;
  }

  return {
    novelId: record.novelId,
    revision: typeof record.revision === 'number' ? record.revision : 0,
    snapshot: {
      mode: record.mode,
      activeChapterIndex: record.activeChapterIndex,
      position,
      projections: toReaderProgressProjection(record.projections),
      captureQuality: record.captureQuality,
      ...(normalizeString(record.capturedAt)
        ? { capturedAt: normalizeString(record.capturedAt) }
        : {}),
      ...(normalizeSourceMode(record.sourceMode)
        ? { sourceMode: normalizeSourceMode(record.sourceMode) }
        : {}),
      ...(typeof record.resolverVersion === 'number'
        ? { resolverVersion: record.resolverVersion }
        : {}),
    },
    updatedAt: record.updatedAt,
  };
}
