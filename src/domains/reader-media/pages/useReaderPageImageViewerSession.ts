import type { MutableRefObject } from 'react';
import type {
  ReaderImageActivationPayload,
  ReaderImageGalleryEntry,
} from '@shared/contracts/reader';
import type { ReaderImageViewerSessionState } from '../utils/readerImageViewerTypes';

import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { createReaderImageEntryId } from '@shared/reader-rendering';

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
const READER_IMAGE_VIEWER_HISTORY_STATE_KEY = '__plotmapai_reader_image_viewer';

let readerImageViewerHistorySequence = 0;

function createClosedImageViewerSessionState(
  previousState: ReaderImageViewerSessionState,
): ReaderImageViewerSessionState {
  return {
    ...previousState,
    isIndexLoading: false,
    isOpen: false,
  };
}

function createReaderImageViewerHistoryToken(): string {
  readerImageViewerHistorySequence += 1;
  return `reader-image-viewer:${readerImageViewerHistorySequence}`;
}

function readReaderImageViewerHistoryToken(state: unknown): string | null {
  if (!state || typeof state !== 'object') {
    return null;
  }

  const token = (state as Record<string, unknown>)[READER_IMAGE_VIEWER_HISTORY_STATE_KEY];
  return typeof token === 'string' ? token : null;
}

function readCurrentReaderImageViewerHistoryToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return readReaderImageViewerHistoryToken(window.history.state);
}

function createHistoryStateWithImageViewerToken(token: string): Record<string, unknown> {
  const currentState = window.history.state;
  const nextState = currentState && typeof currentState === 'object'
    ? { ...(currentState as Record<string, unknown>) }
    : {};

  nextState[READER_IMAGE_VIEWER_HISTORY_STATE_KEY] = token;
  return nextState;
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
  const imageViewerHistoryTokenRef = useRef<string | null>(null);
  const isSyncingImageViewerHistoryRef = useRef(false);
  const sessionStateRef = useRef(sessionState);

  useEffect(() => {
    sessionStateRef.current = sessionState;
  }, [sessionState]);

  const clearImageViewerHistoryTracking = useCallback((): void => {
    imageViewerHistoryTokenRef.current = null;
    isSyncingImageViewerHistoryRef.current = false;
  }, []);

  const closeImageViewerInternal = useCallback((syncHistory: boolean): void => {
    const focusTarget = imageViewerFocusRestoreRef.current;
    const historyToken = imageViewerHistoryTokenRef.current;

    setSessionState((previousState) => (
      previousState.isOpen
        ? createClosedImageViewerSessionState(previousState)
        : previousState
    ));

    if (
      syncHistory
      && historyToken
      && readCurrentReaderImageViewerHistoryToken() === historyToken
    ) {
      isSyncingImageViewerHistoryRef.current = true;
      window.history.back();
    } else if (historyToken) {
      clearImageViewerHistoryTracking();
    }

    window.setTimeout(() => {
      if (focusTarget && focusTarget.isConnected) {
        focusTarget.focus();
      }
    }, 0);
  }, [clearImageViewerHistoryTracking]);

  useEffect(() => {
    imageElementRegistryRef.current.clear();
    imageViewerFocusRestoreRef.current = null;
    clearImageViewerHistoryTracking();
    startTransition(() => {
      setSessionState(INITIAL_READER_IMAGE_VIEWER_SESSION_STATE);
    });
  }, [clearImageViewerHistoryTracking, novelId]);

  useEffect(() => {
    if (isEnabled) {
      return;
    }

    closeImageViewerInternal(true);
  }, [closeImageViewerInternal, isEnabled]);

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
    closeImageViewerInternal(true);
  }, [closeImageViewerInternal]);

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

  useEffect(() => {
    if (typeof window === 'undefined' || !sessionState.isOpen || imageViewerHistoryTokenRef.current) {
      return;
    }

    const historyToken = createReaderImageViewerHistoryToken();
    window.history.pushState(
      createHistoryStateWithImageViewerToken(historyToken),
      '',
      window.location.href,
    );
    imageViewerHistoryTokenRef.current = historyToken;
  }, [sessionState.isOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handlePopState = (event: PopStateEvent) => {
      const historyToken = imageViewerHistoryTokenRef.current;
      if (!historyToken) {
        return;
      }

      const nextHistoryToken = readReaderImageViewerHistoryToken(event.state);
      if (isSyncingImageViewerHistoryRef.current) {
        isSyncingImageViewerHistoryRef.current = false;
        if (nextHistoryToken !== historyToken) {
          imageViewerHistoryTokenRef.current = null;
        }
        return;
      }

      if (nextHistoryToken === historyToken) {
        return;
      }

      if (sessionStateRef.current.isOpen) {
        closeImageViewerInternal(false);
        return;
      }

      clearImageViewerHistoryTracking();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [clearImageViewerHistoryTracking, closeImageViewerInternal]);

  return {
    closeImageViewer,
    getImageOriginRect,
    handleImageActivate,
    handleNavigateImage,
    handleRegisterImageElement,
    sessionState,
  };
}
