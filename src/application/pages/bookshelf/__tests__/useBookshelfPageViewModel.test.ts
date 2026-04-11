import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { novelRepository } from '@domains/library';

import { useBookshelfPageViewModel } from '../useBookshelfPageViewModel';

vi.mock('@shared/debug', () => ({
  reportAppError: vi.fn(),
}));

vi.mock('@domains/library', () => ({
  novelRepository: {
    list: vi.fn(),
  },
}));

const baseNovels = [
  {
    author: 'Author',
    chapterCount: 4,
    createdAt: new Date().toISOString(),
    description: 'Desc',
    fileType: 'txt' as const,
    hasCover: false,
    id: 1,
    originalEncoding: 'utf-8',
    originalFilename: 'alpha.txt',
    tags: [],
    title: 'Alpha',
    totalWords: 1200,
  },
];

describe('useBookshelfPageViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(novelRepository.list).mockResolvedValue(baseNovels);
  });

  it('loads novels on mount', async () => {
    const { result } = renderHook(() => useBookshelfPageViewModel({
      onPendingLaunchFilesHandled: vi.fn(),
      pendingLaunchFiles: null,
    }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.novels).toEqual(baseNovels);
    expect(result.current.error).toBeNull();
  });

  it('retries after a load failure', async () => {
    vi.mocked(novelRepository.list)
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce(baseNovels);

    const { result } = renderHook(() => useBookshelfPageViewModel({
      onPendingLaunchFilesHandled: vi.fn(),
      pendingLaunchFiles: null,
    }));

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    await act(async () => {
      await result.current.refreshNovels();
    });

    expect(novelRepository.list).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.novels).toEqual(baseNovels);
  });

  it('opens the upload modal when pending launch files arrive and lets the page consume them', async () => {
    const onPendingLaunchFilesHandled = vi.fn();
    const { result, rerender } = renderHook(
      ({ pendingLaunchFiles }) => useBookshelfPageViewModel({
        onPendingLaunchFilesHandled,
        pendingLaunchFiles,
      }),
      {
        initialProps: {
          pendingLaunchFiles: null as File[] | null,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    rerender({
      pendingLaunchFiles: [new File(['chapter 1'], 'launch-book.txt', { type: 'text/plain' })],
    });

    await waitFor(() => {
      expect(result.current.isUploadModalOpen).toBe(true);
    });

    act(() => {
      result.current.handleInitialFilesHandled();
    });

    expect(onPendingLaunchFilesHandled).toHaveBeenCalledTimes(1);
  });

  it('refreshes novels again after an upload succeeds', async () => {
    vi.mocked(novelRepository.list)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(baseNovels);

    const { result } = renderHook(() => useBookshelfPageViewModel({
      onPendingLaunchFilesHandled: vi.fn(),
      pendingLaunchFiles: null,
    }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.refreshNovels();
    });

    expect(novelRepository.list).toHaveBeenCalledTimes(2);
    expect(result.current.novels).toEqual(baseNovels);
  });
});
