import { useCallback, useEffect, useRef } from 'react';
import type {
  ReaderMode,
  ReaderRestoreTarget,
  StoredReaderState,
} from '@shared/contracts/reader';
import { getContainerProgress } from '@shared/utils/readerPosition';

interface UseSummaryProgressPersistenceParams {
  chapterIndex: number;
  mode: ReaderMode;
  pendingRestoreTargetRef: React.MutableRefObject<ReaderRestoreTarget | null>;
  persistReaderState: (state: StoredReaderState) => void;
  isScrollSyncSuppressed: () => boolean;
  viewportContentRef: React.RefObject<HTMLDivElement | null>;
}

export function useSummaryProgressPersistence({
  chapterIndex,
  mode,
  pendingRestoreTargetRef,
  persistReaderState,
  isScrollSyncSuppressed,
  viewportContentRef,
}: UseSummaryProgressPersistenceParams): { handleContentScroll: () => void } {
  const summaryProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (summaryProgressTimerRef.current) {
      clearTimeout(summaryProgressTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (summaryProgressTimerRef.current) {
      clearTimeout(summaryProgressTimerRef.current);
      summaryProgressTimerRef.current = null;
    }
  }, [chapterIndex, mode]);

  const handleContentScroll = useCallback(() => {
    if (isScrollSyncSuppressed()) {
      return;
    }
    if (mode !== 'summary' || pendingRestoreTargetRef.current) {
      return;
    }
    if (summaryProgressTimerRef.current) {
      clearTimeout(summaryProgressTimerRef.current);
    }
    summaryProgressTimerRef.current = setTimeout(() => {
      persistReaderState({
        hints: {
          chapterProgress: getContainerProgress(viewportContentRef.current),
        },
      });
    }, 150);
  }, [
    isScrollSyncSuppressed,
    mode,
    pendingRestoreTargetRef,
    persistReaderState,
    viewportContentRef,
  ]);

  return { handleContentScroll };
}
