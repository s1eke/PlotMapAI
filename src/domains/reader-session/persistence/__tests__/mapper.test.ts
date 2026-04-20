import { describe, expect, it } from 'vitest';

import type { ReadingProgressRecord } from '@infra/db/reader';

import {
  toReadingProgress,
  toReadingProgressRecord,
  toStoredReaderState,
} from '../mapper';

describe('reader session mapper', () => {
  it('maps canonical persisted progress into stored reader state', () => {
    const record: ReadingProgressRecord = {
      id: 1,
      novelId: 7,
      canonical: {
        chapterIndex: 4,
        blockIndex: 2,
        kind: 'text',
        lineIndex: 3,
      },
      updatedAt: '2026-04-01T00:00:00.000Z',
    };

    expect(toStoredReaderState(record)).toMatchObject({
      canonical: {
        chapterIndex: 4,
        blockIndex: 2,
        kind: 'text',
        lineIndex: 3,
      },
      hints: undefined,
    });
  });

  it('returns null for legacy mixed records without canonical payload', () => {
    const legacyRecord: ReadingProgressRecord = {
      id: 1,
      novelId: 7,
      chapterIndex: 2,
      mode: 'summary',
      chapterProgress: 0.65,
      updatedAt: '2026-04-01T00:00:00.000Z',
    };

    expect(toStoredReaderState(legacyRecord)).toBeNull();
  });

  it('maps canonical reader state into canonical persisted progress records', () => {
    const state = {
      canonical: {
        chapterIndex: 2,
        edge: 'start' as const,
      },
      hints: {
        chapterProgress: 0.65,
      },
    };

    expect(toReadingProgress(state)).toEqual({
      revision: 0,
      state: {
        canonical: {
          chapterIndex: 2,
          edge: 'start',
        },
        hints: {
          chapterProgress: 0.65,
          contentMode: undefined,
          pageIndex: undefined,
          viewMode: undefined,
        },
      },
      updatedAt: '1970-01-01T00:00:00.000Z',
    });
    expect(toReadingProgressRecord({
      existingId: 1,
      novelId: 7,
      revision: 2,
      state,
      updatedAt: '2026-04-01T00:00:00.000Z',
    })).toMatchObject({
      id: 1,
      novelId: 7,
      canonical: {
        chapterIndex: 2,
        edge: 'start',
      },
      chapterProgress: 0.65,
      revision: 2,
      updatedAt: '2026-04-01T00:00:00.000Z',
    });
  });
});
