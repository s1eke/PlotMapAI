import type { MutableRefObject } from 'react';
import type {
  ReaderImageActivationPayload,
  ReaderImageGalleryEntry,
} from '../../utils/readerImageGallery';
import type { ReaderImageViewerSessionState } from '../../utils/readerImageViewerTypes';

import { startTransition, useCallback, useEffect, useRef, useState } from 'react';

import { createReaderImageEntryId } from '../../utils/readerImageGallery';

interface UseReaderPageImageViewerSessionParams {
  dismissBlockedInteraction: () => void;
  ensureImageGalleryEntriesLoaded: () => Promise<boolean>;
  entriesRef: MutableRefObject<ReaderImageGalleryEntry[]>;
  isEnabled: boolean;
  isIndexLoading: boolean;
  isIndexResolved: boolean;
  novelId: number;
}

interface UseReaderPageImageViewerSessionResult {
  closeImageViewer: () => void;
  getImageOriginRect: (entry: ReaderImageGalleryEntry | null) => DOMRect | null;
  handleImageActivate: (payload: ReaderImageActivationPayload) => void;
  handleNavigateImage: (direction: 'next' | 'prev') => Promise<boolean>;
  handleRegisterImageElement: (
    entry: Pick<ReaderImageGalleryEntry, 'blockIndex' | 'chapterIndex' | 'imageKey'>,
    element: HTMLButtonElement | null,
  ) => void;
  sessionState: ReaderImageViewerSessionState;
}

const INITIAL_READER_IMAGE_VIEWER_SESSION_STATE: ReaderImageViewerSessionState = {
  activeEntry: null,
  isIndexLoading: false,
  isOpen: false,
  originRect: null,
};

function createClosedImageViewerSessionState(
  previousState: ReaderImageViewerSessionState,
): ReaderImageViewerSessionState {
  return {
    ...previousState,
    isIndexLoading: false,
    isOpen: false,
  };
}

export function useReaderPageImageViewerSession({
  dismissBlockedInteraction,
  ensureImageGalleryEntriesLoaded,
  entriesRef,
  isEnabled,
  isIndexLoading,
  isIndexResolved,
  novelId,
}: UseReaderPageImageViewerSessionParams): UseReaderPageImageViewerSessionResult {
  const [sessionState, setSessionState] = useState<ReaderImageViewerSessionState>(
    INITIAL_READER_IMAGE_VIEWER_SESSION_STATE,
  );
  const imageElementRegistryRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const imageViewerFocusRestoreRef = useRef<HTMLElement | null>(null);
  const sessionStateRef = useRef(sessionState);

  useEffect(() => {
    sessionStateRef.current = sessionState;
  }, [sessionState]);

  useEffect(() => {
    imageElementRegistryRef.current.clear();
    imageViewerFocusRestoreRef.current = null;
    startTransition(() => {
      setSessionState(INITIAL_READER_IMAGE_VIEWER_SESSION_STATE);
    });
  }, [novelId]);

  useEffect(() => {
    if (isEnabled) {
      return;
    }

    setSessionState((previousState) => (
      previousState.isOpen
        ? createClosedImageViewerSessionState(previousState)
        : previousState
    ));
  }, [isEnabled]);

  useEffect(() => {
    setSessionState((previousState) => (
      previousState.isIndexLoading === isIndexLoading
        ? previousState
        : {
          ...previousState,
          isIndexLoading,
        }
    ));
  }, [isIndexLoading]);

  const getImageOriginRect = useCallback(
    (entry: ReaderImageGalleryEntry | null): DOMRect | null => {
      if (!entry) {
        return null;
      }

      const element = imageElementRegistryRef.current.get(createReaderImageEntryId(entry));
      if (!element || !element.isConnected) {
        return null;
      }

      return element.getBoundingClientRect();
    },
    [],
  );

  const handleRegisterImageElement = useCallback((
    entry: Pick<ReaderImageGalleryEntry, 'blockIndex' | 'chapterIndex' | 'imageKey'>,
    element: HTMLButtonElement | null,
  ) => {
    const entryId = createReaderImageEntryId(entry);
    if (element) {
      imageElementRegistryRef.current.set(entryId, element);
      return;
    }

    const registeredElement = imageElementRegistryRef.current.get(entryId);
    if (!registeredElement || !registeredElement.isConnected) {
      imageElementRegistryRef.current.delete(entryId);
    }
  }, []);

  const closeImageViewer = useCallback(() => {
    const focusTarget = imageViewerFocusRestoreRef.current;
    setSessionState((previousState) => (
      previousState.isOpen
        ? createClosedImageViewerSessionState(previousState)
        : previousState
    ));
    window.setTimeout(() => {
      if (focusTarget && focusTarget.isConnected) {
        focusTarget.focus();
      }
    }, 0);
  }, []);

  const handleImageActivate = useCallback((payload: ReaderImageActivationPayload) => {
    imageViewerFocusRestoreRef.current = payload.sourceElement;
    dismissBlockedInteraction();
    const nextActiveEntry = entriesRef.current.find((entry) => (
      entry.chapterIndex === payload.chapterIndex
      && entry.blockIndex === payload.blockIndex
      && entry.imageKey === payload.imageKey
    )) ?? {
      blockIndex: payload.blockIndex,
      chapterIndex: payload.chapterIndex,
      imageKey: payload.imageKey,
      order: 0,
    };

    setSessionState({
      activeEntry: nextActiveEntry,
      isIndexLoading: isIndexLoading || !isIndexResolved,
      isOpen: true,
      originRect: payload.sourceElement.getBoundingClientRect(),
    });
    if (!isIndexResolved) {
      ensureImageGalleryEntriesLoaded();
    }
  }, [
    dismissBlockedInteraction,
    ensureImageGalleryEntriesLoaded,
    entriesRef,
    isIndexLoading,
    isIndexResolved,
  ]);

  const handleNavigateImage = useCallback(async (direction: 'next' | 'prev'): Promise<boolean> => {
    const currentEntry = sessionStateRef.current.activeEntry;
    if (!currentEntry) {
      return false;
    }

    if (!isIndexResolved) {
      const didResolveIndex = await ensureImageGalleryEntriesLoaded();
      if (!didResolveIndex) {
        return false;
      }
    }

    const currentEntryId = createReaderImageEntryId(currentEntry);
    const currentIndex = entriesRef.current.findIndex(
      (entry) => createReaderImageEntryId(entry) === currentEntryId,
    );
    const step = direction === 'next' ? 1 : -1;
    const candidateEntry = currentIndex >= 0
      ? entriesRef.current[currentIndex + step] ?? null
      : null;
    if (!candidateEntry) {
      return false;
    }

    setSessionState((previousState) => ({
      ...previousState,
      activeEntry: candidateEntry,
      isIndexLoading: false,
    }));
    return true;
  }, [ensureImageGalleryEntriesLoaded, entriesRef, isIndexResolved]);

  return {
    closeImageViewer,
    getImageOriginRect,
    handleImageActivate,
    handleNavigateImage,
    handleRegisterImageElement,
    sessionState,
  };
}
