import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@infra/db';
import { createReaderContextWrapper } from '@test/readerRuntimeTestUtils';
import { createCanonicalPositionFingerprint } from '@shared/utils/readerStoredState';

import {
  readReaderProgressSnapshot,
  replaceReaderProgressSnapshot,
} from '../../progress-core/repository';
import { resetReaderSessionStoreForTests, setMode } from '../../store/readerSessionStore';
import { useReaderStatePersistence } from '../useReaderStatePersistence';

const { Wrapper } = createReaderContextWrapper();

describe('useReaderStatePersistence', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
    resetReaderSessionStoreForTests();
  });

  it('returns defaults when no stored state exists', () => {
    const { result } = renderHook(() => useReaderStatePersistence(1), {
      wrapper: Wrapper,
    });

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

  it('persists state and merges partial updates', async () => {
    const { result } = renderHook(() => useReaderStatePersistence(1), {
      wrapper: Wrapper,
    });

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
        contentMode: 'scroll',
        viewMode: 'original',
      },
      metadata: {
        captureQuality: 'approximate',
        capturedAt: expect.any(String),
        resolverVersion: 1,
        sourceMode: 'scroll',
      },
    });

    await act(async () => {
      await result.current.flushReaderState();
    });

    await expect(readReaderProgressSnapshot(1)).resolves.toEqual({
      novelId: 1,
      revision: 1,
      snapshot: {
        mode: 'scroll',
        activeChapterIndex: 7,
        position: {
          type: 'chapter-edge',
          chapterIndex: 7,
          edge: 'start',
        },
        projections: undefined,
        captureQuality: 'approximate',
        capturedAt: expect.any(String),
        sourceMode: 'scroll',
        resolverVersion: 1,
      },
      updatedAt: expect.any(String),
    });
  });

  it('restores paged position hints from durable reader progress', async () => {
    await replaceReaderProgressSnapshot(1, {
      mode: 'paged',
      activeChapterIndex: 5,
      position: {
        type: 'locator',
        locator: {
          chapterIndex: 5,
          blockIndex: 2,
          kind: 'text',
          pageIndex: 8,
        },
      },
      projections: {
        paged: {
          pageIndex: 8,
        },
        scroll: {
          chapterProgress: 0.55,
        },
      },
      captureQuality: 'precise',
    });

    const { result } = renderHook(() => useReaderStatePersistence(1), {
      wrapper: Wrapper,
    });
    let state!: Awaited<ReturnType<typeof result.current.loadPersistedReaderState>>;

    await act(async () => {
      state = await result.current.loadPersistedReaderState();
    });

    expect(state).toEqual({
      canonical: {
        chapterIndex: 5,
        blockIndex: 2,
        kind: 'text',
      },
      hints: {
        chapterProgress: 0.55,
        contentMode: 'paged',
        pageIndex: 8,
        viewMode: 'original',
      },
      metadata: {
        captureQuality: 'precise',
      },
    });
  });

  it('runs before-flush capture hooks before flushing durable state', async () => {
    const runBeforeFlush = vi.fn();
    const { Wrapper: beforeFlushWrapper } = createReaderContextWrapper({
      runBeforeFlush,
    });
    const { result } = renderHook(() => useReaderStatePersistence(1), {
      wrapper: beforeFlushWrapper,
    });

    await act(async () => {
      await result.current.flushReaderState();
    });

    expect(runBeforeFlush).toHaveBeenCalledTimes(1);
  });

  it('drops malformed Dexie rows and falls back to default state during hydration', async () => {
    await db.readerProgress.put({
      novelId: 1,
      mode: 'scroll',
      activeChapterIndex: 0,
      position: undefined as never,
      captureQuality: 'approximate',
      updatedAt: new Date().toISOString(),
    });

    const { result } = renderHook(() => useReaderStatePersistence(1), {
      wrapper: Wrapper,
    });
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
        contentMode: 'scroll',
        viewMode: 'original',
      },
    });
    await expect(db.readerProgress.get(1)).resolves.toBeUndefined();
  });

  it('replaces a detailed canonical locator when a chapter boundary is persisted', async () => {
    const { result } = renderHook(() => useReaderStatePersistence(1), {
      wrapper: Wrapper,
    });

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
        contentMode: 'scroll',
        viewMode: 'original',
      },
      metadata: {
        captureQuality: 'approximate',
        capturedAt: expect.any(String),
        resolverVersion: 1,
        sourceMode: 'scroll',
      },
    });

    await act(async () => {
      await result.current.flushReaderState();
    });

    await expect(readReaderProgressSnapshot(1)).resolves.toEqual({
      novelId: 1,
      revision: 1,
      snapshot: {
        mode: 'scroll',
        activeChapterIndex: 1,
        position: {
          type: 'chapter-edge',
          chapterIndex: 1,
          edge: 'start',
        },
        projections: undefined,
        captureQuality: 'approximate',
        capturedAt: expect.any(String),
        sourceMode: 'scroll',
        resolverVersion: 1,
      },
      updatedAt: expect.any(String),
    });
  });

  it('keeps explicit projection clears through the final store merge', async () => {
    const { result } = renderHook(() => useReaderStatePersistence(1), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.persistReaderState({
        canonical: {
          chapterIndex: 0,
          blockIndex: 12,
          kind: 'text',
        },
        hints: {
          chapterProgress: 0.34,
          contentMode: 'scroll',
        },
      });
    });

    await act(async () => {
      await result.current.flushReaderState();
    });

    await expect(readReaderProgressSnapshot(1)).resolves.toMatchObject({
      snapshot: {
        projections: {
          scroll: {
            chapterProgress: 0.34,
          },
        },
      },
    });

    act(() => {
      setMode('paged');
      result.current.persistReaderState({
        canonical: {
          chapterIndex: 0,
          blockIndex: 24,
          kind: 'text',
        },
        hints: {
          chapterProgress: undefined,
          contentMode: 'paged',
          pageIndex: 4,
        },
      });
    });

    expect(result.current.latestReaderStateRef.current.hints?.chapterProgress).toBeUndefined();
    expect(result.current.latestReaderStateRef.current.hints?.scrollProjection).toBeUndefined();

    await act(async () => {
      await result.current.flushReaderState();
    });

    const persisted = await readReaderProgressSnapshot(1);
    expect(persisted?.snapshot.projections?.scroll).toBeUndefined();
    expect(persisted?.snapshot.projections?.paged?.pageIndex).toBe(4);
  });

  it('refreshes scroll projection metadata when spread hints carry an old fingerprint', async () => {
    const { result } = renderHook(() => useReaderStatePersistence(1), {
      wrapper: Wrapper,
    });
    const firstCanonical = {
      chapterIndex: 0,
      blockIndex: 4,
      kind: 'text' as const,
    };
    const nextCanonical = {
      chapterIndex: 0,
      blockIndex: 18,
      kind: 'text' as const,
    };

    act(() => {
      result.current.persistReaderState({
        canonical: firstCanonical,
        hints: {
          chapterProgress: 0.2,
          contentMode: 'scroll',
        },
      });
    });
    const staleHints = result.current.latestReaderStateRef.current.hints;

    act(() => {
      result.current.persistReaderState({
        canonical: nextCanonical,
        hints: {
          ...staleHints,
          chapterProgress: 0.55,
          contentMode: 'scroll',
        },
      });
    });

    expect(
      result.current.latestReaderStateRef.current.hints?.scrollProjection
        ?.basisCanonicalFingerprint,
    ).toBe(createCanonicalPositionFingerprint(nextCanonical));

    await act(async () => {
      await result.current.flushReaderState();
    });

    await expect(readReaderProgressSnapshot(1)).resolves.toMatchObject({
      snapshot: {
        projections: {
          scroll: {
            basisCanonicalFingerprint: createCanonicalPositionFingerprint(nextCanonical),
            chapterProgress: 0.55,
          },
        },
      },
    });
  });

  it('marks user interaction', () => {
    const { result } = renderHook(() => useReaderStatePersistence(1), {
      wrapper: Wrapper,
    });

    expect(result.current.hasUserInteractedRef.current).toBe(false);

    act(() => {
      result.current.markUserInteracted();
    });

    expect(result.current.hasUserInteractedRef.current).toBe(true);
  });

  it('does not write cache for novelId 0', async () => {
    const { result } = renderHook(() => useReaderStatePersistence(0), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.persistReaderState({
        canonical: {
          chapterIndex: 1,
          edge: 'start',
        },
      });
    });

    await expect(readReaderProgressSnapshot(0)).resolves.toBeNull();
  });

  it('does not carry the previous novel state into a new novel before hydration', async () => {
    const { result, rerender } = renderHook(
      ({ novelId }: { novelId: number }) => useReaderStatePersistence(novelId),
      { initialProps: { novelId: 1 }, wrapper: Wrapper },
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

    await expect(readReaderProgressSnapshot(1)).resolves.toEqual({
      novelId: 1,
      revision: 1,
      snapshot: {
        mode: 'scroll',
        activeChapterIndex: 3,
        position: {
          type: 'chapter-edge',
          chapterIndex: 3,
          edge: 'start',
        },
        projections: {
          paged: undefined,
          scroll: {
            chapterProgress: 0.65,
            capturedAt: expect.any(String),
            sourceMode: 'scroll',
            basisCanonicalFingerprint: '{"chapterIndex":3,"edge":"start"}',
          },
        },
        captureQuality: 'approximate',
        capturedAt: expect.any(String),
        sourceMode: 'scroll',
        resolverVersion: 1,
      },
      updatedAt: expect.any(String),
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

    await expect(readReaderProgressSnapshot(2)).resolves.toBeNull();
  });
});
