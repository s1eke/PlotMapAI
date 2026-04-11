import type {
  CanonicalPositionRecord,
  ReadingProgressRecord,
} from '@infra/db/reader';
import type {
  CanonicalPosition,
  ReaderLocator,
  StoredReaderState,
} from '@shared/contracts/reader';

import {
  buildStoredReaderState,
  sanitizeStoredReaderState,
} from './state';

export interface ReadingProgress {
  canonical: CanonicalPosition;
}

function isValidLocatorKind(value: unknown): value is NonNullable<CanonicalPosition['kind']> {
  return value === 'heading' || value === 'text' || value === 'image';
}

function toCanonicalPositionFromRecord(
  record?: CanonicalPositionRecord | null,
): CanonicalPosition | undefined {
  if (!record || typeof record.chapterIndex !== 'number') {
    return undefined;
  }

  const canonical: CanonicalPosition = {
    chapterIndex: record.chapterIndex,
  };

  if (typeof record.blockIndex === 'number') {
    canonical.blockIndex = record.blockIndex;
  }
  if (isValidLocatorKind(record.kind)) {
    canonical.kind = record.kind;
  }
  if (typeof record.lineIndex === 'number') {
    canonical.lineIndex = record.lineIndex;
  }
  if (record.startCursor) {
    canonical.startCursor = { ...record.startCursor };
  }
  if (record.endCursor) {
    canonical.endCursor = { ...record.endCursor };
  }
  if (record.edge === 'start' || record.edge === 'end') {
    canonical.edge = record.edge;
  }

  return canonical;
}

export function toCanonicalPosition(locator?: ReaderLocator | null): CanonicalPosition | undefined {
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

export function toCanonicalPositionRecord(
  canonical?: CanonicalPosition,
): CanonicalPositionRecord | undefined {
  if (!canonical) {
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
  };
}

export function toReaderLocator(
  canonical?: CanonicalPosition,
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
    pageIndex: typeof pageIndexHint === 'number' ? pageIndexHint : undefined,
  };
}

export function toStoredReaderState(record: ReadingProgressRecord): StoredReaderState | null {
  const canonical = toCanonicalPositionFromRecord(record.canonical);
  if (!canonical) {
    return null;
  }

  return sanitizeStoredReaderState({
    canonical,
  }) ?? buildStoredReaderState(undefined);
}

export function toReadingProgress(state: StoredReaderState): ReadingProgress | null {
  const canonicalState = buildStoredReaderState(state);
  if (!canonicalState.canonical) {
    return null;
  }

  return {
    canonical: canonicalState.canonical,
  };
}

export function toReadingProgressRecord(params: {
  existingId?: number;
  novelId: number;
  state: StoredReaderState;
  updatedAt: string;
}): ReadingProgressRecord | null {
  const progress = toReadingProgress(params.state);
  if (!progress) {
    return null;
  }

  return {
    id: params.existingId ?? 0,
    novelId: params.novelId,
    canonical: toCanonicalPositionRecord(progress.canonical),
    updatedAt: params.updatedAt,
  };
}
