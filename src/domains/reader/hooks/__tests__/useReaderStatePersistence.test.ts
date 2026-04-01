import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readerApi } from '../../api/readerApi';
import { resetReaderSessionStoreForTests } from '../sessionStore';
import { useReaderStatePersistence } from '../useReaderStatePersistence';

vi.mock('../../api/readerApi', () => ({
  readerApi: {
    getProgress: vi.fn(),
    saveProgress: vi.fn(),
  },
}));

describe('useReaderStatePersistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    resetReaderSessionStoreForTests();
    vi.mocked(readerApi.getProgress).mockResolvedValue({
      chapterIndex: 0,
      scrollPosition: 0,
      mode: 'scroll',
      chapterProgress: 0,
    });
    vi.mocked(readerApi.saveProgress).mockResolvedValue({ message: 'Progress saved' });
  });

  it('returns defaults when no stored state exists', () => {
    const { result } = renderHook(() => useReaderStatePersistence(1));

    expect(result.current.initialStoredState).toBeNull();
    expect(result.current.latestReaderStateRef.current).toEqual({
      chapterIndex: 0,
      mode: 'scroll',
      chapterProgress: undefined,
      scrollPosition: undefined,
      lastContentMode: 'scroll',
      locatorVersion: undefined,
      locator: undefined,
    });
    expect(result.current.hasUserInteractedRef.current).toBe(false);
  });

  it('reads stored state from localStorage', () => {
    localStorage.setItem('reader-state:42', JSON.stringify({
      chapterIndex: 5,
      mode: 'summary',
      lastContentMode: 'paged',
    }));

    const { result } = renderHook(() => useReaderStatePersistence(42));

    expect(result.current.initialStoredState).toEqual({
      chapterIndex: 5,
      mode: 'summary',
      chapterProgress: undefined,
      scrollPosition: undefined,
      lastContentMode: 'paged',
      locatorVersion: undefined,
      locator: undefined,
    });
    expect(result.current.latestReaderStateRef.current).toEqual({
      chapterIndex: 5,
      mode: 'summary',
      chapterProgress: undefined,
      scrollPosition: undefined,
      lastContentMode: 'paged',
      locatorVersion: undefined,
      locator: undefined,
    });
  });

  it('filters invalid fields in stored state', () => {
    localStorage.setItem('reader-state:1', JSON.stringify({
      chapterIndex: 'not-a-number',
      mode: 'invalid',
      lastContentMode: 'summary',
    }));

    const { result } = renderHook(() => useReaderStatePersistence(1));

    expect(result.current.initialStoredState).toEqual({
      chapterIndex: undefined,
      mode: undefined,
      chapterProgress: undefined,
      scrollPosition: undefined,
      lastContentMode: undefined,
      locatorVersion: undefined,
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
      chapterProgress: 0.4,
      scrollPosition: undefined,
      lastContentMode: 'scroll',
      locatorVersion: undefined,
      locator: undefined,
    });

    expect(JSON.parse(localStorage.getItem('reader-state:1') ?? 'null')).toMatchObject({
      chapterIndex: 7,
      mode: 'summary',
      chapterProgress: 0.4,
      lastContentMode: 'scroll',
    });
  });

  it('loads persisted state with localStorage priority over Dexie progress', async () => {
    localStorage.setItem('reader-state:1', JSON.stringify({
      chapterIndex: 4,
      mode: 'summary',
      lastContentMode: 'paged',
      chapterProgress: 0.75,
    }));
    vi.mocked(readerApi.getProgress).mockResolvedValueOnce({
      chapterIndex: 2,
      scrollPosition: 120,
      mode: 'scroll',
      chapterProgress: 0.2,
    });

    const { result } = renderHook(() => useReaderStatePersistence(1));
    let state!: Awaited<ReturnType<typeof result.current.loadPersistedReaderState>>;

    await act(async () => {
      state = await result.current.loadPersistedReaderState();
    });

    expect(state).toEqual({
      chapterIndex: 4,
      mode: 'summary',
      chapterProgress: 0.75,
      scrollPosition: 120,
      lastContentMode: 'paged',
      locatorVersion: undefined,
      locator: undefined,
    });
  });

  it('keeps legacy scrollPosition for one-time restoration and upgrades on next save', () => {
    localStorage.setItem('reader-state:1', JSON.stringify({
      chapterIndex: 2,
      scrollPosition: 380,
    }));

    const { result } = renderHook(() => useReaderStatePersistence(1));

    expect(result.current.initialStoredState).toEqual({
      chapterIndex: 2,
      mode: undefined,
      chapterProgress: undefined,
      scrollPosition: 380,
      lastContentMode: undefined,
      locatorVersion: undefined,
      locator: undefined,
    });

    act(() => {
      result.current.persistReaderState({ chapterProgress: 0.55 });
    });

    expect(JSON.parse(localStorage.getItem('reader-state:1') ?? 'null')).toMatchObject({
      chapterIndex: 2,
      mode: 'scroll',
      chapterProgress: 0.55,
      scrollPosition: 380,
      lastContentMode: 'scroll',
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
      result.current.persistReaderState({ chapterIndex: 1 });
    });

    expect(localStorage.getItem('reader-state:0')).toBeNull();
  });

  it('does not carry the previous novel state into a new novel before hydration', () => {
    const { result, rerender } = renderHook(
      ({ novelId }: { novelId: number }) => useReaderStatePersistence(novelId),
      { initialProps: { novelId: 1 } },
    );

    act(() => {
      result.current.persistReaderState({
        chapterIndex: 3,
        chapterProgress: 0.65,
      });
    });

    expect(JSON.parse(localStorage.getItem('reader-state:1') ?? 'null')).toMatchObject({
      chapterIndex: 3,
      chapterProgress: 0.65,
    });

    act(() => {
      rerender({ novelId: 2 });
    });

    expect(result.current.latestReaderStateRef.current).toEqual({
      chapterIndex: 0,
      mode: 'scroll',
      chapterProgress: undefined,
      scrollPosition: undefined,
      lastContentMode: 'scroll',
      locatorVersion: undefined,
      locator: undefined,
    });
    expect(result.current.hasUserInteractedRef.current).toBe(false);

    act(() => {
      result.current.persistReaderState({
        chapterIndex: 0,
        mode: 'scroll',
      });
    });

    expect(localStorage.getItem('reader-state:2')).toBeNull();
  });
});
