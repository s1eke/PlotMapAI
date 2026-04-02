import { describe, expect, it } from 'vitest';

import type { ReadingProgressRecord } from '@infra/db/reader';

import {
  toReadingProgress,
  toReadingProgressRecord,
  toStoredReaderState,
} from '../mapper';

describe('reader session mapper', () => {
  it('maps persisted progress into stored reader state', () => {
    const record: ReadingProgressRecord = {
      id: 1,
      novelId: 7,
      chapterIndex: 4,
      mode: 'paged',
      chapterProgress: undefined,
      locator: {
        chapterIndex: 4,
        blockIndex: 2,
        kind: 'text',
        lineIndex: 3,
      },
      updatedAt: '2026-04-01T00:00:00.000Z',
    };

    expect(toStoredReaderState(record)).toMatchObject({
      chapterIndex: 4,
      mode: 'paged',
      locator: {
        chapterIndex: 4,
        blockIndex: 2,
        kind: 'text',
        lineIndex: 3,
      },
    });
  });

  it('maps canonical reader state into a persisted progress record', () => {
    const state = {
      chapterIndex: 2,
      mode: 'summary' as const,
      chapterProgress: 0.65,
      lastContentMode: 'scroll' as const,
    };

    expect(toReadingProgress(state)).toEqual({
      chapterIndex: 2,
      mode: 'summary',
      chapterProgress: 0.65,
      locator: undefined,
    });
    expect(toReadingProgressRecord({
      existingId: 1,
      novelId: 7,
      state,
      updatedAt: '2026-04-01T00:00:00.000Z',
    })).toMatchObject({
      id: 1,
      novelId: 7,
      chapterIndex: 2,
      mode: 'summary',
      chapterProgress: 0.65,
    });
  });
});
