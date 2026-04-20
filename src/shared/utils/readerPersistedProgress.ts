import type {
  PersistedReadingProgress,
  StoredReaderState,
} from '@shared/contracts/reader';

import { buildStoredReaderState } from './readerStoredState';

const LEGACY_PROGRESS_UPDATED_AT = new Date(0).toISOString();

function clampRevision(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

export function buildPersistedReadingProgress(params: {
  revision: number;
  state: StoredReaderState;
  updatedAt: string;
}): PersistedReadingProgress {
  return {
    revision: clampRevision(params.revision),
    state: buildStoredReaderState(params.state),
    updatedAt: params.updatedAt,
  };
}

export function createLegacyPersistedReadingProgress(
  state: StoredReaderState,
): PersistedReadingProgress {
  return buildPersistedReadingProgress({
    revision: 0,
    state,
    updatedAt: LEGACY_PROGRESS_UPDATED_AT,
  });
}

export function sanitizePersistedReadingProgress(raw: unknown): PersistedReadingProgress | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const parsed = raw as Record<string, unknown>;
  if (typeof parsed.updatedAt !== 'string') {
    return null;
  }

  return buildPersistedReadingProgress({
    revision: clampRevision(parsed.revision),
    state: buildStoredReaderState(parsed.state as StoredReaderState | null | undefined),
    updatedAt: parsed.updatedAt,
  });
}

export function getPersistedReadingProgressFingerprint(
  state: StoredReaderState | PersistedReadingProgress | null | undefined,
): string {
  const normalizedState = 'state' in (state ?? {})
    ? (state as PersistedReadingProgress).state
    : state as StoredReaderState | null | undefined;

  return JSON.stringify(buildStoredReaderState(normalizedState));
}
