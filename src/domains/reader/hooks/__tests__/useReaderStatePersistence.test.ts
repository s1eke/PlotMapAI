import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReaderStatePersistence } from '../useReaderStatePersistence';
import { readerApi } from '../../api/readerApi';
import { resetReaderSessionStoreForTests } from '../sessionStore';

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
      viewMode: 'original',
      chapterProgress: 0,
      isTwoColumn: false,
    });
    vi.mocked(readerApi.saveProgress).mockResolvedValue({ message: 'Progress saved' });
  });

  it('returns defaults when no stored state exists', () => {
    const { result } = renderHook(() => useReaderStatePersistence(1));

    expect(result.current.initialStoredState).toBeNull();
    expect(result.current.latestReaderStateRef.current).toEqual({
      chapterIndex: 0,
      mode: 'scroll',
      viewMode: 'original',
      isTwoColumn: false,
      chapterProgress: undefined,
      scrollPosition: undefined,
      lastContentMode: 'scroll',
    });
    expect(result.current.hasHydratedReaderState).toBe(false);
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
      viewMode: undefined,
      isTwoColumn: undefined,
      lastContentMode: 'paged',
      chapterProgress: undefined,
      scrollPosition: undefined,
    });
    expect(result.current.latestReaderStateRef.current).toEqual({
      chapterIndex: 5,
      mode: 'summary',
      viewMode: 'summary',
      isTwoColumn: false,
      chapterProgress: undefined,
      scrollPosition: undefined,
      lastContentMode: 'paged',
    });
  });

  it('returns null initialStoredState for novelId 0', () => {
    const { result } = renderHook(() => useReaderStatePersistence(0));
    expect(result.current.initialStoredState).toBeNull();
  });

  it('ignores invalid JSON in localStorage', () => {
    localStorage.setItem('reader-state:1', '{invalid json');
    const { result } = renderHook(() => useReaderStatePersistence(1));
    expect(result.current.initialStoredState).toBeNull();
  });

  it('filters invalid fields in stored state', () => {
    localStorage.setItem('reader-state:1', JSON.stringify({
      chapterIndex: 'not-a-number',
      viewMode: 'invalid',
      isTwoColumn: 'yes',
    }));

    const { result } = renderHook(() => useReaderStatePersistence(1));

    expect(result.current.initialStoredState).toEqual({
      chapterIndex: undefined,
      mode: undefined,
      viewMode: undefined,
      isTwoColumn: undefined,
      chapterProgress: undefined,
      scrollPosition: undefined,
      lastContentMode: undefined,
    });
  });

  it('persists state via persistReaderState', () => {
    const { result } = renderHook(() => useReaderStatePersistence(1));

    act(() => {
      result.current.persistReaderState({
        chapterIndex: 3,
        viewMode: 'summary',
        isTwoColumn: true,
        chapterProgress: 0.4,
      });
    });

    expect(result.current.latestReaderStateRef.current).toEqual({
      chapterIndex: 3,
      mode: 'summary',
      viewMode: 'summary',
      isTwoColumn: false,
      chapterProgress: 0.4,
      scrollPosition: undefined,
      lastContentMode: 'scroll',
    });

    const stored = JSON.parse(localStorage.getItem('reader-state:1')!);
    expect(stored).toMatchObject({
      chapterIndex: 3,
      mode: 'summary',
      viewMode: 'summary',
      isTwoColumn: false,
      chapterProgress: 0.4,
      lastContentMode: 'scroll',
    });
  });

  it('merges partial updates with existing state', () => {
    const { result } = renderHook(() => useReaderStatePersistence(1));

    act(() => {
      result.current.persistReaderState({
        chapterIndex: 5,
        viewMode: 'summary',
        isTwoColumn: true,
        chapterProgress: 0.6,
      });
    });

    act(() => {
      result.current.persistReaderState({ chapterIndex: 7 });
    });

    expect(result.current.latestReaderStateRef.current).toEqual({
      chapterIndex: 7,
      mode: 'summary',
      viewMode: 'summary',
      isTwoColumn: false,
      chapterProgress: 0.6,
      scrollPosition: undefined,
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
      viewMode: 'original',
      chapterProgress: 0.2,
      isTwoColumn: false,
    });

    const { result } = renderHook(() => useReaderStatePersistence(1));
    let state: Awaited<ReturnType<typeof result.current.loadPersistedReaderState>>;
    await act(async () => {
      state = await result.current.loadPersistedReaderState();
    });

    expect(state!).toEqual({
      chapterIndex: 4,
      mode: 'summary',
      viewMode: 'summary',
      isTwoColumn: false,
      chapterProgress: 0.75,
      scrollPosition: 120,
      lastContentMode: 'paged',
    });
  });

  it('keeps legacy scrollPosition for one-time restoration and upgrades on next save', () => {
    localStorage.setItem('reader-state:1', JSON.stringify({
      chapterIndex: 2,
      viewMode: 'original',
      isTwoColumn: false,
      scrollPosition: 380,
    }));

    const { result } = renderHook(() => useReaderStatePersistence(1));

    expect(result.current.initialStoredState).toEqual({
      chapterIndex: 2,
      mode: undefined,
      viewMode: 'original',
      isTwoColumn: false,
      chapterProgress: undefined,
      scrollPosition: 380,
      lastContentMode: undefined,
    });

    act(() => {
      result.current.persistReaderState({ chapterProgress: 0.55 });
    });

    expect(JSON.parse(localStorage.getItem('reader-state:1')!)).toMatchObject({
      chapterIndex: 2,
      mode: 'scroll',
      viewMode: 'original',
      isTwoColumn: false,
      chapterProgress: 0.55,
      lastContentMode: 'scroll',
    });
  });

  it('marks user interaction', () => {
    const { result } = renderHook(() => useReaderStatePersistence(1));
    expect(result.current.hasUserInteractedRef.current).toBe(false);

    act(() => { result.current.markUserInteracted(); });
    expect(result.current.hasUserInteractedRef.current).toBe(true);
  });

  it('sets hasHydratedReaderState', () => {
    const { result } = renderHook(() => useReaderStatePersistence(1));
    expect(result.current.hasHydratedReaderState).toBe(false);

    act(() => { result.current.setHasHydratedReaderState(true); });
    expect(result.current.hasHydratedReaderState).toBe(true);
  });

  it('does not write to localStorage when novelId is 0', () => {
    const { result } = renderHook(() => useReaderStatePersistence(0));

    act(() => {
      result.current.persistReaderState({ chapterIndex: 1 });
    });

    // Should not store anything since novelId is 0 (falsy)
    expect(localStorage.getItem('reader-state:0')).toBeNull();
  });
});
