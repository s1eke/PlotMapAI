import type { ReactElement } from 'react';

import { lazy, Suspense } from 'react';

import { useFileHandling } from '@shared/pwa/FileHandlingContext';

import BookshelfScreen from './BookshelfScreen';
import { useBookshelfPageViewModel } from './useBookshelfPageViewModel';

const LazyUploadModal = lazy(() => import('./UploadModal'));

export default function BookshelfPage(): ReactElement {
  const { pendingLaunchFiles, consumePendingLaunchFiles } = useFileHandling();
  const viewModel = useBookshelfPageViewModel({
    onPendingLaunchFilesHandled: consumePendingLaunchFiles,
    pendingLaunchFiles,
  });

  return (
    <BookshelfScreen
      viewModel={viewModel}
      uploadModal={viewModel.isUploadModalOpen ? (
        <Suspense fallback={null}>
          <LazyUploadModal
            isOpen={viewModel.isUploadModalOpen}
            onClose={viewModel.closeUploadModal}
            onSuccess={viewModel.refreshNovels}
            initialFiles={pendingLaunchFiles}
            onInitialFilesHandled={viewModel.handleInitialFilesHandled}
          />
        </Suspense>
      ) : null}
    />
  );
}
