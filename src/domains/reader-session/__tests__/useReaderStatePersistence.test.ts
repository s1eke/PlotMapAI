import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@infra/db';
import {
  CACHE_KEYS,
  storage,
} from '@infra/storage';
import {
  readReaderBootstrapSnapshot,
  writeReaderBootstrapSnapshot,
} from '@infra/storage/readerStateCache';

import { resetReaderSessionStoreForTests } from '../readerSessionStore';
import { useReaderStatePersistence } from '../useReaderStatePersistence';

function seedReaderBootstrapSnapshot(
  novelId: number,
  state: Parameters<typeof writeReaderBootstrapSnapshot>[1],
): void {
  writeReaderBootstrapSnapshot(novelId, state);
}

describe('useReaderStatePersistence', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
    resetReaderSessionStoreForTests();
  });

  it('returns defaults when no stored state exists', () => {
    const { result } = renderHook(() => useReaderStatePersistence(1));

    expect(result.current.initialStoredState).toBeNull();
    expect(result.current.latestReaderStateRef.current).toEqual({
      canonical: {
        chapterIndex: 0,
        edge: 'start',
      },
      hints: undefined,
    });
    expect(result.current.hasUserInteractedRef.current).toBe(false);
  });

  it('reads stored state from localStorage', () => {
    seedReaderBootstrapSnapshot(42, {
      canonical: {
        chapterIndex: 5,
        edge: 'start',
      },
      hints: {
        contentMode: 'paged',
      },
    });

    const { result } = renderHook(() => useReaderStatePersistence(42));

    expect(result.current.initialStoredState).toEqual({
      canonical: {
        chapterIndex: 5,
        edge: 'start',
      },
      hints: {
        contentMode: 'paged',
      },
    });
    expect(result.current.latestReaderStateRef.current).toEqual({
      canonical: {
        chapterIndex: 5,
        edge: 'start',
      },
      hints: {
        contentMode: 'paged',
      },
    });
  });

  it('sanitizes an invalid bootstrap snapshot to defaults', () => {
    storage.cache.set(CACHE_KEYS.readerBootstrap(1), {
      version: 2,
      state: {
        canonical: {
          chapterIndex: 'not-a-number',
        },
      },
    });

    const { result } = renderHook(() => useReaderStatePersistence(1));

    expect(result.current.initialStoredState).toEqual({
      canonical: {
        chapterIndex: 0,
        edge: 'start',
      },
      hints: undefined,
    });
    expect(result.current.latestReaderStateRef.current).toEqual({
      canonical: {
        chapterIndex: 0,
        edge: 'start',
      },
      hints: undefined,
    });
  });

  it('persists state and merges partial updates', async () => {
    const { result } = renderHook(() => useReaderStatePersistence(1));

    act(() => {
      result.current.persistReaderState({
        canonical: {
          chapterIndex: 3,
          edge: 'start',
        },
        hints: {
          chapterProgress: 0.4,
        },
      });
    });

    act(() => {
      result.current.persistReaderState({
        canonical: {
          chapterIndex: 7,
          edge: 'start',
        },
      });
    });

    expect(result.current.latestReaderStateRef.current).toEqual({
      canonical: {
        chapterIndex: 7,
        edge: 'start',
      },
      hints: {
        chapterProgress: undefined,
        contentMode: 'scroll',
        pageIndex: undefined,
      },
    });

    await act(async () => {
      await result.current.flushReaderState();
    });

    expect(readReaderBootstrapSnapshot(1)?.state).toEqual({
      canonical: {
        chapterIndex: 7,
        edge: 'start',
      },
      hints: {
        chapterProgress: undefined,
        contentMode: 'scroll',
        pageIndex: undefined,
      },
    });
  });

  it('drops legacy Dexie rows and falls back to default state during hydration', async () => {
    seedReaderBootstrapSnapshot(1, {
      canonical: {
        chapterIndex: 4,
        edge: 'start',
      },
      hints: {
        chapterProgress: 0.75,
        contentMode: 'paged',
      },
    });
    await db.readingProgress.add({
      novelId: 1,
      chapterIndex: 2,
      mode: 'summary',
      chapterProgress: 0.2,
      updatedAt: new Date().toISOString(),
    });

    const { result } = renderHook(() => useReaderStatePersistence(1));
    let state!: Awaited<ReturnType<typeof result.current.loadPersistedReaderState>>;

    await act(async () => {
      state = await result.current.loadPersistedReaderState();
    });

    expect(state).toEqual({
      canonical: {
        chapterIndex: 0,
        edge: 'start',
      },
      hints: {
        chapterProgress: undefined,
        contentMode: 'scroll',
        pageIndex: undefined,
      },
    });
    await expect(db.readingProgress.where('novelId').equals(1).first()).resolves.toBeUndefined();
    expect(readReaderBootstrapSnapshot(1)).toBeNull();
  });

  it('treats the canonical chapter as authoritative for initial stored state', () => {
    seedReaderBootstrapSnapshot(1, {
      canonical: {
        chapterIndex: 8,
        blockIndex: 3,
        kind: 'text',
        lineIndex: 1,
      },
    });

    const { result } = renderHook(() => useReaderStatePersistence(1));

    expect(result.current.initialStoredState).toEqual({
      canonical: {
        chapterIndex: 8,
        blockIndex: 3,
        kind: 'text',
        lineIndex: 1,
      },
      hints: undefined,
    });
  });

  it('replaces a detailed canonical locator when a chapter boundary is persisted', async () => {
    seedReaderBootstrapSnapshot(1, {
      canonical: {
        chapterIndex: 0,
        blockIndex: 3,
        kind: 'text',
        lineIndex: 1,
      },
    });

    const { result } = renderHook(() => useReaderStatePersistence(1));

    act(() => {
      result.current.persistReaderState({
        canonical: {
          chapterIndex: 1,
          edge: 'start',
        },
      });
    });

    expect(result.current.latestReaderStateRef.current).toEqual({
      canonical: {
        chapterIndex: 1,
        edge: 'start',
      },
      hints: {
        chapterProgress: undefined,
        contentMode: 'scroll',
        pageIndex: undefined,
      },
    });

    await act(async () => {
      await result.current.flushReaderState();
    });

    expect(readReaderBootstrapSnapshot(1)?.state).toEqual({
      canonical: {
        chapterIndex: 1,
        edge: 'start',
      },
      hints: {
        chapterProgress: undefined,
        contentMode: 'scroll',
        pageIndex: undefined,
      },
    });
  });

  it('marks user interaction', () => {
    const { result } = renderHook(() => useReaderStatePersistence(1));

    expect(result.current.hasUserInteractedRef.current).toBe(false);

    act(() => {
      result.current.markUserInteracted();
    });

    expect(result.current.hasUserInteractedRef.current).toBe(true);
  });

  it('does not write cache for novelId 0', () => {
    const { result } = renderHook(() => useReaderStatePersistence(0));

    act(() => {
      result.current.persistReaderState({
        canonical: {
          chapterIndex: 1,
          edge: 'start',
        },
      });
    });

    expect(readReaderBootstrapSnapshot(0)).toBeNull();
  });

  it('does not carry the previous novel state into a new novel before hydration', async () => {
    const { result, rerender } = renderHook(
      ({ novelId }: { novelId: number }) => useReaderStatePersistence(novelId),
      { initialProps: { novelId: 1 } },
    );

    act(() => {
      result.current.persistReaderState({
        canonical: {
          chapterIndex: 3,
          edge: 'start',
        },
        hints: {
          chapterProgress: 0.65,
        },
      });
    });

    await act(async () => {
      await result.current.flushReaderState();
    });

    expect(readReaderBootstrapSnapshot(1)?.state).toEqual({
      canonical: {
        chapterIndex: 3,
        edge: 'start',
      },
      hints: {
        chapterProgress: 0.65,
        contentMode: 'scroll',
        pageIndex: undefined,
      },
    });

    act(() => {
      rerender({ novelId: 2 });
    });

    expect(result.current.latestReaderStateRef.current).toEqual({
      canonical: {
        chapterIndex: 0,
        edge: 'start',
      },
      hints: undefined,
    });
    expect(result.current.hasUserInteractedRef.current).toBe(false);

    act(() => {
      result.current.persistReaderState({
        canonical: {
          chapterIndex: 0,
          edge: 'start',
        },
      });
    });

    expect(readReaderBootstrapSnapshot(2)).toBeNull();
  });
});
