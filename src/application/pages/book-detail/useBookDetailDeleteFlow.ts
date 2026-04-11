import type { AppError } from '@shared/errors';

import { useCallback, useState } from 'react';

import { deleteNovelAndCleanupArtifacts } from '@application/use-cases/library';
import { reportAppError } from '@shared/debug';
import { AppErrorCode, toAppError } from '@shared/errors';

import type { BookDetailDeleteFlow } from './types';

interface UseBookDetailDeleteFlowOptions {
  novelId: number;
  novelTitle: string;
  onDeleted: () => void;
}

function isValidNovelId(novelId: number): boolean {
  return Number.isFinite(novelId) && novelId > 0;
}

export function useBookDetailDeleteFlow({
  novelId,
  novelTitle,
  onDeleted,
}: UseBookDetailDeleteFlowOptions): BookDetailDeleteFlow {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<AppError | null>(null);

  const openDeleteModal = useCallback((): void => {
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  }, []);

  const closeDeleteModal = useCallback((): void => {
    if (isDeleting) {
      return;
    }

    setDeleteError(null);
    setIsDeleteModalOpen(false);
  }, [isDeleting]);

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (!isValidNovelId(novelId)) {
      return;
    }

    setDeleteError(null);
    setIsDeleting(true);

    try {
      await deleteNovelAndCleanupArtifacts(novelId);
      setIsDeleteModalOpen(false);
      setIsDeleting(false);
      onDeleted();
    } catch (error) {
      const normalized = toAppError(error, {
        code: AppErrorCode.STORAGE_OPERATION_FAILED,
        kind: 'storage',
        source: 'library',
        userMessageKey: 'bookDetail.deleteFailed',
      });
      reportAppError(normalized);
      setDeleteError(normalized);
      setIsDeleting(false);
    }
  }, [novelId, onDeleted]);

  return {
    closeDeleteModal,
    confirmDelete,
    deleteError,
    isDeleteModalOpen,
    isDeleting,
    novelTitle,
    openDeleteModal,
  };
}
