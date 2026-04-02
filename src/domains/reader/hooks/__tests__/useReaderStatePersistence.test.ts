import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@infra/db';
import {
  mergeReaderStateCacheSnapshot,
  readReaderStateCacheSnapshot,
} from '@infra/storage/readerStateCache';

import { resetReaderSessionStoreForTests } from '../sessionStore';
import { useReaderStatePersistence } from '../useReaderStatePersistence';

function seedReaderStateCache(
  novelId: number,
  state: Record<string, unknown>,
): void {
  mergeReaderStateCacheSnapshot(novelId, state);
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
      chapterIndex: 0,
      mode: 'scroll',
      chapterProgress: undefined,
      lastContentMode: 'scroll',
      locator: undefined,
    });
    expect(result.current.hasUserInteractedRef.current).toBe(false);
  });

  it('reads stored state from localStorage', () => {
    seedReaderStateCache(42, {
      chapterIndex: 5,
      mode: 'summary',
      lastContentMode: 'paged',
    });

    const { result } = renderHook(() => useReaderStatePersistence(42));

    expect(result.current.initialStoredState).toEqual({
      chapterIndex: 5,
      mode: 'summary',
      chapterProgress: undefined,
      lastContentMode: 'paged',
      locator: undefined,
    });
    expect(result.current.latestReaderStateRef.current).toEqual({
      chapterIndex: 5,
      mode: 'summary',
      chapterProgress: undefined,
      lastContentMode: 'paged',
      locator: undefined,
    });
  });

  it('filters invalid fields in stored state', () => {
    seedReaderStateCache(1, {
      chapterIndex: 'not-a-number',
      mode: 'invalid',
      lastContentMode: 'summary',
    });

    const { result } = renderHook(() => useReaderStatePersistence(1));

    expect(result.current.initialStoredState).toEqual({
      chapterIndex: 0,
      mode: 'scroll',
      chapterProgress: undefined,
      lastContentMode: 'scroll',
      locator: undefined,
    });
  });

  it('persists state and merges partial updates', () => {
    const { result } = renderHook(() => useReaderStatePersistence(1));

    act(() => {
      result.current.persistReaderState({
        chapterIndex: 3,
        mode: 'summary',
        chapterProgress: 0.4,
      });
    });

    act(() => {
      result.current.persistReaderState({
        chapterIndex: 7,
      });
    });

    expect(result.current.latestReaderStateRef.current).toEqual({
      chapterIndex: 7,
      mode: 'summary',
      chapterProgress: undefined,
      lastContentMode: 'scroll',
      locator: undefined,
    });

    expect(readReaderStateCacheSnapshot(1)).toMatchObject({
      chapterIndex: 7,
      mode: 'summary',
      lastContentMode: 'scroll',
    });
    expect(readReaderStateCacheSnapshot(1)).not.toHaveProperty('chapterProgress');
  });

  it('prefers Dexie progress over the cache snapshot during hydration', async () => {
    seedReaderStateCache(1, {
      chapterIndex: 4,
      mode: 'summary',
      lastContentMode: 'paged',
      chapterProgress: 0.75,
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
      chapterIndex: 2,
      mode: 'summary',
      chapterProgress: 0.2,
      lastContentMode: 'scroll',
      locator: undefined,
    });
  });

  it('drops legacy scrollPosition from the local cache on first read', () => {
    seedReaderStateCache(1, {
      chapterIndex: 2,
      scrollPosition: 380,
    });

    const { result } = renderHook(() => useReaderStatePersistence(1));

    expect(result.current.initialStoredState).toEqual({
      chapterIndex: 2,
      mode: 'scroll',
      chapterProgress: undefined,
      lastContentMode: 'scroll',
      locator: undefined,
    });

    expect(readReaderStateCacheSnapshot(1)).toMatchObject({
      chapterIndex: 2,
      mode: 'scroll',
      lastContentMode: 'scroll',
    });
    expect(readReaderStateCacheSnapshot(1)).not.toHaveProperty('scrollPosition');
    expect(readReaderStateCacheSnapshot(1)).not.toHaveProperty('chapterProgress');
  });

  it('treats the locator chapter as authoritative for initial stored state', () => {
    seedReaderStateCache(1, {
      chapterIndex: 10,
      mode: 'scroll',
      chapterProgress: 0.8,
      locatorVersion: 1,
      locator: {
        chapterIndex: 8,
        blockIndex: 3,
        kind: 'text',
        lineIndex: 1,
      },
    });

    const { result } = renderHook(() => useReaderStatePersistence(1));

    expect(result.current.initialStoredState).toEqual({
      chapterIndex: 8,
      mode: 'scroll',
      chapterProgress: undefined,
      lastContentMode: 'scroll',
      locator: {
        chapterIndex: 8,
        blockIndex: 3,
        kind: 'text',
        lineIndex: 1,
      },
    });
    expect(readReaderStateCacheSnapshot(1)).not.toHaveProperty('locatorVersion');
  });

  it('clears a stale locator when a chapter jump persists a new chapter index', () => {
    seedReaderStateCache(1, {
      chapterIndex: 0,
      mode: 'scroll',
      locatorVersion: 1,
      locator: {
        chapterIndex: 0,
        blockIndex: 3,
        kind: 'text',
        lineIndex: 1,
      },
    });

    const { result } = renderHook(() => useReaderStatePersistence(1));

    act(() => {
      result.current.persistReaderState({
        chapterIndex: 1,
        mode: 'scroll',
      });
    });

    expect(result.current.latestReaderStateRef.current).toEqual({
      chapterIndex: 1,
      mode: 'scroll',
      chapterProgress: undefined,
      lastContentMode: 'scroll',
      locator: undefined,
    });

    expect(readReaderStateCacheSnapshot(1)).toMatchObject({
      chapterIndex: 1,
      mode: 'scroll',
      lastContentMode: 'scroll',
    });
    expect(readReaderStateCacheSnapshot(1)).not.toHaveProperty('locator');
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
      result.current.persistReaderState({ chapterIndex: 1 });
    });

    expect(readReaderStateCacheSnapshot(0)).toBeNull();
  });

  it('does not carry the previous novel state into a new novel before hydration', () => {
    const { result, rerender } = renderHook(
      ({ novelId }: { novelId: number }) => useReaderStatePersistence(novelId),
      { initialProps: { novelId: 1 } },
    );

    act(() => {
      result.current.persistReaderState({
        chapterIndex: 3,
        mode: 'summary',
        chapterProgress: 0.65,
      });
    });

    expect(readReaderStateCacheSnapshot(1)).toMatchObject({
      chapterIndex: 3,
      mode: 'summary',
      chapterProgress: 0.65,
    });

    act(() => {
      rerender({ novelId: 2 });
    });

    expect(result.current.latestReaderStateRef.current).toEqual({
      chapterIndex: 0,
      mode: 'scroll',
      chapterProgress: undefined,
      lastContentMode: 'scroll',
      locator: undefined,
    });
    expect(result.current.hasUserInteractedRef.current).toBe(false);

    act(() => {
      result.current.persistReaderState({
        chapterIndex: 0,
        mode: 'scroll',
      });
    });

    expect(readReaderStateCacheSnapshot(2)).toBeNull();
  });
});
