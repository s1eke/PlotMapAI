import type {
  ReaderImageActivationPayload,
  ReaderImageGalleryEntry,
} from '@shared/contracts/reader';
import type { ReaderImageViewerProps } from '../components/reader/ReaderImageViewer';

import { useEffect, useMemo } from 'react';
import { useReaderContentRuntime } from '@shared/reader-runtime';
import { createReaderImageEntryId } from '@shared/reader-content';

import { preloadReaderImageResources, clearReaderImageResourcesForNovel } from '../utils/readerImageResourceCache';
import { useReaderPageImageGalleryIndex } from './useReaderPageImageGalleryIndex';
import { useReaderPageImageViewerSession } from './useReaderPageImageViewerSession';

interface UseReaderPageImageOverlayParams {
  dismissBlockedInteraction: () => void;
  isEnabled: boolean;
  novelId: number;
}

interface UseReaderPageImageOverlayResult {
  closeImageViewer: () => void;
  handleImageActivate: (payload: ReaderImageActivationPayload) => void;
  handleRegisterImageElement: (
    entry: Pick<ReaderImageGalleryEntry, 'blockIndex' | 'chapterIndex' | 'imageKey'>,
    element: HTMLButtonElement | null,
  ) => void;
  imageViewerProps: ReaderImageViewerProps;
  isImageViewerOpen: boolean;
}

export function useReaderPageImageOverlay({
  dismissBlockedInteraction,
  isEnabled,
  novelId,
}: UseReaderPageImageOverlayParams): UseReaderPageImageOverlayResult {
  const readerContentRuntime = useReaderContentRuntime();
  const galleryIndex = useReaderPageImageGalleryIndex(novelId);
  const viewerSession = useReaderPageImageViewerSession({
    dismissBlockedInteraction,
    ensureImageGalleryEntriesLoaded: galleryIndex.ensureImageGalleryEntriesLoaded,
    entriesRef: galleryIndex.entriesRef,
    isEnabled,
    isIndexLoading: galleryIndex.isIndexLoading,
    isIndexResolved: galleryIndex.isIndexResolved,
    novelId,
  });
  const {
    ensureImageGalleryEntriesLoaded,
    entries,
    isIndexResolved,
  } = galleryIndex;
  const { sessionState } = viewerSession;

  useEffect(() => {
    ensureImageGalleryEntriesLoaded();
  }, [ensureImageGalleryEntriesLoaded]);

  useEffect(() => {
    return () => {
      clearReaderImageResourcesForNovel(novelId);
    };
  }, [novelId]);

  const activeImageEntryId = viewerSession.sessionState.activeEntry
    ? createReaderImageEntryId(viewerSession.sessionState.activeEntry)
    : null;
  const activeImageIndex = useMemo(() => (
    activeImageEntryId
      ? entries.findIndex(
        (entry) => createReaderImageEntryId(entry) === activeImageEntryId,
      )
      : -1
  ), [activeImageEntryId, entries]);
  const activeImageEntry = activeImageIndex >= 0
    ? entries[activeImageIndex] ?? null
    : sessionState.activeEntry;

  useEffect(() => {
    if (!sessionState.isOpen || !activeImageEntry) {
      return;
    }

    const imageKeys = new Set<string>([activeImageEntry.imageKey]);
    const previousEntry = activeImageIndex > 0
      ? entries[activeImageIndex - 1] ?? null
      : null;
    const nextEntry = activeImageIndex >= 0 && activeImageIndex < entries.length - 1
      ? entries[activeImageIndex + 1] ?? null
      : null;
    if (previousEntry) {
      imageKeys.add(previousEntry.imageKey);
    }
    if (nextEntry) {
      imageKeys.add(nextEntry.imageKey);
    }

    preloadReaderImageResources(readerContentRuntime, novelId, imageKeys);
  }, [
    activeImageEntry,
    activeImageIndex,
    entries,
    novelId,
    readerContentRuntime,
    sessionState.isOpen,
  ]);

  return {
    closeImageViewer: viewerSession.closeImageViewer,
    handleImageActivate: viewerSession.handleImageActivate,
    handleRegisterImageElement: viewerSession.handleRegisterImageElement,
    imageViewerProps: {
      activeEntry: activeImageEntry,
      activeIndex: activeImageIndex,
      canNavigateNext: Boolean(
        isIndexResolved
        && activeImageEntry
        && activeImageIndex >= 0
        && activeImageIndex < entries.length - 1,
      ),
      canNavigatePrev: Boolean(
        isIndexResolved
        && activeImageEntry
        && activeImageIndex > 0,
      ),
      entries,
      getOriginRect: viewerSession.getImageOriginRect,
      isIndexResolved,
      isIndexLoading: sessionState.isIndexLoading,
      isOpen: sessionState.isOpen,
      novelId,
      onRequestClose: viewerSession.closeImageViewer,
      onRequestNavigate: viewerSession.handleNavigateImage,
    },
    isImageViewerOpen: sessionState.isOpen,
  };
}
