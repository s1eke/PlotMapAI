import type { BookshelfPageViewModel, UseBookshelfPageViewModelOptions } from './types';
import type { NovelView } from '@domains/library';
import type { AppError } from '@shared/errors';

import { useCallback, useEffect, useState } from 'react';

import { novelRepository } from '@domains/library';
import { reportAppError } from '@shared/debug';
import { AppErrorCode, toAppError } from '@shared/errors';

export function useBookshelfPageViewModel({
  onPendingLaunchFilesHandled,
  pendingLaunchFiles,
}: UseBookshelfPageViewModelOptions): BookshelfPageViewModel {
  const [novels, setNovels] = useState<NovelView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const refreshNovels = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await novelRepository.list();
      setNovels(data);
    } catch (loadError) {
      const normalized = toAppError(loadError, {
        code: AppErrorCode.STORAGE_OPERATION_FAILED,
        kind: 'storage',
        source: 'library',
        userMessageKey: 'bookshelf.loadError',
      });
      reportAppError(normalized);
      setError(normalized);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshNovels().catch(() => undefined);
  }, [refreshNovels]);

  useEffect(() => {
    if (!pendingLaunchFiles || pendingLaunchFiles.length === 0) {
      return;
    }

    setIsUploadModalOpen(true);
  }, [pendingLaunchFiles]);

  const openUploadModal = useCallback((): void => {
    setIsUploadModalOpen(true);
  }, []);

  const closeUploadModal = useCallback((): void => {
    setIsUploadModalOpen(false);
  }, []);

  const handleInitialFilesHandled = useCallback((): void => {
    onPendingLaunchFilesHandled();
  }, [onPendingLaunchFilesHandled]);

  return {
    error,
    isLoading,
    isUploadModalOpen,
    novels,
    closeUploadModal,
    handleInitialFilesHandled,
    openUploadModal,
    refreshNovels,
  };
}
