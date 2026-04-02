import type { NovelView } from '@domains/library';
import type { AppError } from '@shared/errors';

export interface UseBookshelfPageViewModelOptions {
  onPendingLaunchFilesHandled: () => void;
  pendingLaunchFiles: File[] | null;
}

export interface BookshelfPageViewModel {
  error: AppError | null;
  isLoading: boolean;
  isUploadModalOpen: boolean;
  novels: NovelView[];
  closeUploadModal: () => void;
  handleInitialFilesHandled: () => void;
  openUploadModal: () => void;
  refreshNovels: () => Promise<void>;
}
