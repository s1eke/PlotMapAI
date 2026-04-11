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
import * as repository from '../repository';

function createStoredCanonical(chapterIndex: number) {
  return {
    canonical: {
      chapterIndex,
      edge: 'start' as const,
    },
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
    writeReaderBootstrapSnapshot(1, createStoredCanonical(5));
    vi.spyOn(repository, 'readReadingProgress').mockRejectedValueOnce(new Error('db read failed'));

    await expect(hydrateSession(1, { pageTurnMode: 'scroll' })).rejects.toThrow('db read failed');

    const snapshot = getReaderSessionSnapshot();
    expect(snapshot.restoreStatus).toBe('error');
    expect(snapshot.persistenceStatus).toBe('degraded');
    expect(snapshot.lastPersistenceFailure).not.toBeNull();
    expect(snapshot.chapterIndex).toBe(0);
  });

  it('ignores bootstrap cache when DB has no record and clears stale cache', async () => {
    writeReaderBootstrapSnapshot(7, createStoredCanonical(4));
    vi.spyOn(repository, 'readReadingProgress').mockResolvedValueOnce(null);

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

  it('marks persistence degraded when DB write fails without rolling back UI state', async () => {
    vi.spyOn(repository, 'readReadingProgress').mockResolvedValueOnce(null);
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
    vi.spyOn(repository, 'readReadingProgress').mockResolvedValueOnce(null);
    const replaceSpy = vi
      .spyOn(repository, 'replaceReadingProgress')
      .mockRejectedValueOnce(new Error('first write failed'))
      .mockResolvedValueOnce();

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
    expect(readReaderBootstrapSnapshot(5)?.state).toEqual({
      canonical: {
        chapterIndex: 6,
        edge: 'start',
      },
      hints: {
        chapterProgress: undefined,
        contentMode: 'scroll',
        pageIndex: undefined,
      },
    });
  });
});
