import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteNovelAndCleanupArtifacts } from '@application/use-cases/library';

import { useBookDetailDeleteFlow } from '../useBookDetailDeleteFlow';

vi.mock('@shared/debug', () => ({
  reportAppError: vi.fn(),
}));

vi.mock('@application/use-cases/library', async () => {
  const actual = await vi.importActual<typeof import('@application/use-cases/library')>('@application/use-cases/library');
  return {
    ...actual,
    deleteNovelAndCleanupArtifacts: vi.fn(),
  };
});

describe('useBookDetailDeleteFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deleteNovelAndCleanupArtifacts).mockResolvedValue({ message: 'Novel deleted' });
  });

  it('opens and closes the delete modal', () => {
    const { result } = renderHook(() => useBookDetailDeleteFlow({
      novelId: 1,
      novelTitle: 'Mock Novel',
      onDeleted: vi.fn(),
    }));

    act(() => {
      result.current.openDeleteModal();
    });
    expect(result.current.isDeleteModalOpen).toBe(true);

    act(() => {
      result.current.closeDeleteModal();
    });
    expect(result.current.isDeleteModalOpen).toBe(false);
  });

  it('prevents closing while deletion is running', async () => {
    let resolveDelete: (value: { message: string }) => void;
    vi.mocked(deleteNovelAndCleanupArtifacts).mockImplementation(
      () => new Promise((resolve) => {
        resolveDelete = resolve;
      }),
    );

    const { result } = renderHook(() => useBookDetailDeleteFlow({
      novelId: 1,
      novelTitle: 'Mock Novel',
      onDeleted: vi.fn(),
    }));

    act(() => {
      result.current.openDeleteModal();
    });

    act(() => {
      result.current.confirmDelete();
    });

    act(() => {
      result.current.closeDeleteModal();
    });

    expect(result.current.isDeleting).toBe(true);
    expect(result.current.isDeleteModalOpen).toBe(true);

    await act(async () => {
      resolveDelete!({ message: 'Novel deleted' });
    });
  });

  it('surfaces delete errors and keeps the dialog open', async () => {
    vi.mocked(deleteNovelAndCleanupArtifacts).mockRejectedValue(new Error('Delete failed'));
    const onDeleted = vi.fn();
    const { result } = renderHook(() => useBookDetailDeleteFlow({
      novelId: 1,
      novelTitle: 'Mock Novel',
      onDeleted,
    }));

    act(() => {
      result.current.openDeleteModal();
    });

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(onDeleted).not.toHaveBeenCalled();
    expect(result.current.isDeleteModalOpen).toBe(true);
    expect(result.current.isDeleting).toBe(false);
    expect(result.current.deleteError).toMatchObject({
      code: 'STORAGE_OPERATION_FAILED',
      userMessageKey: 'bookDetail.deleteFailed',
    });
  });

  it('calls onDeleted after a successful delete', async () => {
    const onDeleted = vi.fn();
    const { result } = renderHook(() => useBookDetailDeleteFlow({
      novelId: 1,
      novelTitle: 'Mock Novel',
      onDeleted,
    }));

    act(() => {
      result.current.openDeleteModal();
    });

    await act(async () => {
      await result.current.confirmDelete();
    });

    await waitFor(() => {
      expect(deleteNovelAndCleanupArtifacts).toHaveBeenCalledWith(1);
    });

    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(result.current.isDeleteModalOpen).toBe(false);
  });
});
