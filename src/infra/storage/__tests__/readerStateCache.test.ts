import { beforeEach, describe, expect, it } from 'vitest';

import { CACHE_KEYS, storage } from '@infra/storage';

import {
  clearReaderBootstrapSnapshot,
  readReaderBootstrapSnapshot,
  writeReaderBootstrapSnapshot,
} from '../readerStateCache';

describe('readerStateCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a typed reader bootstrap snapshot', () => {
    writeReaderBootstrapSnapshot(7, {
      revision: 3,
      state: {
        canonical: {
          chapterIndex: 3,
          edge: 'start',
        },
        hints: {
          chapterProgress: 0.4,
          contentMode: 'paged',
          viewMode: 'original',
        },
      },
      updatedAt: '2026-04-12T00:00:00.000Z',
    });

    expect(readReaderBootstrapSnapshot(7)).toEqual({
      version: 3,
      progress: {
        revision: 3,
        state: {
          canonical: {
            chapterIndex: 3,
            edge: 'start',
          },
          hints: {
            chapterProgress: 0.4,
            contentMode: 'paged',
            pageIndex: undefined,
            viewMode: 'original',
          },
        },
        updatedAt: '2026-04-12T00:00:00.000Z',
      },
    });
  });

  it('treats an old mixed reader-state snapshot as invalid', () => {
    storage.cache.set(CACHE_KEYS.readerBootstrap(7), {
      chapterIndex: 3,
      mode: 'summary',
      readerTheme: 'night',
    });

    expect(readReaderBootstrapSnapshot(7)).toBeNull();
  });

  it('accepts a legacy v2 state-only snapshot and normalizes it into the v3 shape', () => {
    storage.cache.set(CACHE_KEYS.readerBootstrap(7), {
      version: 2,
      state: {
        canonical: {
          chapterIndex: 4,
          edge: 'start',
        },
        hints: {
          contentMode: 'paged',
          viewMode: 'summary',
        },
      },
    });

    expect(readReaderBootstrapSnapshot(7)).toEqual({
      version: 3,
      progress: {
        revision: 0,
        state: {
          canonical: {
            chapterIndex: 4,
            edge: 'start',
          },
          hints: {
            chapterProgress: undefined,
            contentMode: 'paged',
            pageIndex: undefined,
            viewMode: 'summary',
          },
        },
        updatedAt: '1970-01-01T00:00:00.000Z',
      },
    });
  });

  it('treats a snapshot with an invalid state schema as invalid', () => {
    storage.cache.set(CACHE_KEYS.readerBootstrap(7), {
      version: 2,
      state: null,
    });

    expect(readReaderBootstrapSnapshot(7)).toBeNull();
  });

  it('clears the typed bootstrap snapshot', () => {
    writeReaderBootstrapSnapshot(7, {
      revision: 1,
      state: {
        canonical: {
          chapterIndex: 2,
          edge: 'start',
        },
      },
      updatedAt: '2026-04-12T00:00:00.000Z',
    });
    clearReaderBootstrapSnapshot(7);

    expect(readReaderBootstrapSnapshot(7)).toBeNull();
  });
});
