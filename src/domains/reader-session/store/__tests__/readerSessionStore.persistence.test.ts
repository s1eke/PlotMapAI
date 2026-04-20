import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as debug from '@shared/debug';
import { db } from '@infra/db';
import {
  readReaderBootstrapSnapshot,
  writeReaderBootstrapSnapshot,
} from '@infra/storage/readerStateCache';

import {
  flushPersistence,
  getReaderSessionSnapshot,
  hydrateSession,
  persistStoredReaderState,
  resetReaderSessionStoreForTests,
} from '../readerSessionStore';
import * as repository from '../../persistence/repository';

function createStoredCanonical(chapterIndex: number) {
  return {
    canonical: {
      chapterIndex,
      edge: 'start' as const,
    },
  };
}

function createPersistedProgress(
  chapterIndex: number,
  overrides: Partial<ReturnType<typeof createStoredCanonical>> = {},
) {
  return {
    revision: 1,
    state: {
      ...createStoredCanonical(chapterIndex),
      ...overrides,
    },
    updatedAt: '2026-04-12T00:00:00.000Z',
  };
}

describe('readerSessionStore persistence', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.delete();
    await db.open();
    localStorage.clear();
    resetReaderSessionStoreForTests();
  });

  it('enters error state and throws when DB hydration read fails', async () => {
    writeReaderBootstrapSnapshot(1, createPersistedProgress(5));
    vi.spyOn(repository, 'readPersistedReadingProgress').mockRejectedValueOnce(new Error('db read failed'));

    await expect(hydrateSession(1, { pageTurnMode: 'scroll' })).rejects.toThrow('db read failed');

    const snapshot = getReaderSessionSnapshot();
    expect(snapshot.restoreStatus).toBe('error');
    expect(snapshot.persistenceStatus).toBe('degraded');
    expect(snapshot.lastPersistenceFailure).not.toBeNull();
    expect(snapshot.chapterIndex).toBe(0);
  });

  it('ignores bootstrap cache when DB has no record and clears stale cache', async () => {
    writeReaderBootstrapSnapshot(7, createPersistedProgress(4));
    vi.spyOn(repository, 'readPersistedReadingProgress').mockResolvedValueOnce(null);

    const hydratedState = await hydrateSession(7, { pageTurnMode: 'scroll' });

    expect(hydratedState).toEqual({
      canonical: {
        chapterIndex: 0,
        edge: 'start',
      },
      hints: undefined,
    });
    expect(readReaderBootstrapSnapshot(7)).toBeNull();
    expect(getReaderSessionSnapshot().chapterIndex).toBe(0);
  });

  it('prefers Dexie progress over a conflicting bootstrap mirror during hydration', async () => {
    writeReaderBootstrapSnapshot(9, createPersistedProgress(4, {
      hints: {
        contentMode: 'scroll',
        viewMode: 'original',
      },
    }));
    vi.spyOn(repository, 'readPersistedReadingProgress').mockResolvedValueOnce({
      revision: 5,
      state: {
        canonical: {
          chapterIndex: 2,
          blockIndex: 3,
          kind: 'text',
        },
        hints: {
          chapterProgress: 0.65,
          contentMode: 'paged',
          pageIndex: 7,
          viewMode: 'summary',
        },
      },
      updatedAt: '2026-04-12T00:00:00.000Z',
    });

    const hydratedState = await hydrateSession(9, { pageTurnMode: 'scroll' });

    expect(hydratedState).toEqual({
      canonical: {
        chapterIndex: 2,
        blockIndex: 3,
        kind: 'text',
      },
      hints: {
        chapterProgress: 0.65,
        contentMode: 'paged',
        pageIndex: 7,
        viewMode: 'summary',
      },
    });
    expect(getReaderSessionSnapshot()).toMatchObject({
      chapterIndex: 2,
      lastContentMode: 'paged',
      mode: 'summary',
    });
  });

  it('marks persistence degraded when DB write fails without rolling back UI state', async () => {
    vi.spyOn(repository, 'readPersistedReadingProgress').mockResolvedValueOnce(null);
    const replaceSpy = vi
      .spyOn(repository, 'replaceReadingProgress')
      .mockRejectedValueOnce(new Error('db write failed'));
    const reportErrorSpy = vi.spyOn(debug, 'reportAppError');

    await hydrateSession(3, { pageTurnMode: 'scroll' });

    persistStoredReaderState(createStoredCanonical(2), {
      flush: true,
      persistRemote: true,
    });
    await flushPersistence();

    const snapshot = getReaderSessionSnapshot();
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(snapshot.chapterIndex).toBe(2);
    expect(snapshot.persistenceStatus).toBe('degraded');
    expect(snapshot.lastPersistenceFailure).not.toBeNull();
    expect(reportErrorSpy).toHaveBeenCalled();
    expect(readReaderBootstrapSnapshot(3)).toBeNull();
  });

  it('recovers persistence health and writes cache after a later successful DB write', async () => {
    vi.spyOn(repository, 'readPersistedReadingProgress').mockResolvedValueOnce(null);
    const originalReplaceReadingProgress = repository.replaceReadingProgress;
    const replaceSpy = vi
      .spyOn(repository, 'replaceReadingProgress')
      .mockRejectedValueOnce(new Error('first write failed'))
      .mockImplementationOnce(originalReplaceReadingProgress);

    await hydrateSession(5, { pageTurnMode: 'scroll' });

    persistStoredReaderState(createStoredCanonical(1), {
      flush: true,
      persistRemote: true,
    });
    await flushPersistence();

    expect(getReaderSessionSnapshot().persistenceStatus).toBe('degraded');
    expect(readReaderBootstrapSnapshot(5)).toBeNull();

    persistStoredReaderState(createStoredCanonical(6), {
      flush: true,
      persistRemote: true,
    });
    await flushPersistence();

    const snapshot = getReaderSessionSnapshot();
    expect(replaceSpy).toHaveBeenCalledTimes(2);
    expect(snapshot.persistenceStatus).toBe('healthy');
    expect(snapshot.lastPersistenceFailure).toBeNull();
    expect(readReaderBootstrapSnapshot(5)?.progress).toMatchObject({
      revision: 1,
      state: {
        canonical: {
          chapterIndex: 6,
          edge: 'start',
        },
        hints: {
          chapterProgress: undefined,
          contentMode: 'scroll',
          pageIndex: undefined,
          viewMode: 'original',
        },
      },
    });
    expect(readReaderBootstrapSnapshot(5)?.progress.updatedAt).toEqual(expect.any(String));
  });
});
