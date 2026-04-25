import { useEffect, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { ReaderLocator } from '@shared/contracts/reader';
import {
  resolveLocatorGlobalOffset,
  type NovelFlowIndex,
} from '../layout-core/internal';

export interface PendingScrollWindowAnchor {
  locator: ReaderLocator;
  previousOffset: number;
}

interface ScrollFlowCompensationAnchor {
  chapterIndex: number;
  chapterProgress: number;
}

function resolveAnchorGlobalOffset(
  novelFlowIndex: NovelFlowIndex,
  anchor: ScrollFlowCompensationAnchor | null | undefined,
): number | null {
  if (!anchor) {
    return null;
  }

  const entry = novelFlowIndex.chapters[anchor.chapterIndex];
  if (!entry || entry.manifestStatus === 'missing') {
    return null;
  }

  const chapterHeight = Math.max(0, entry.scrollEnd - entry.scrollStart);
  const chapterProgress = Math.max(0, Math.min(1, anchor.chapterProgress));
  return entry.scrollStart + chapterHeight * chapterProgress;
}

export function useScrollFlowOffsetCompensation(params: {
  anchorRef?: MutableRefObject<ScrollFlowCompensationAnchor | null>;
  enabled: boolean;
  layoutQueries: {
    getCurrentOriginalLocator: () => ReaderLocator | null;
  };
  novelFlowIndex: NovelFlowIndex | null;
  pendingScrollWindowAnchorRef: MutableRefObject<PendingScrollWindowAnchor | null>;
  persistence: {
    suppressScrollSyncTemporarily: () => void;
  };
  syncViewportState: (options?: { force?: boolean }) => void;
  viewportContentRef: RefObject<HTMLDivElement | null>;
}): void {
  const {
    anchorRef,
    enabled,
    layoutQueries,
    novelFlowIndex,
    pendingScrollWindowAnchorRef,
    persistence,
    syncViewportState,
    viewportContentRef,
  } = params;
  const previousNovelFlowIndexRef = useRef<NovelFlowIndex | null>(null);

  useEffect(() => {
    const previousIndex = previousNovelFlowIndexRef.current;
    previousNovelFlowIndexRef.current = novelFlowIndex;
    if (!enabled || !previousIndex || !novelFlowIndex || previousIndex === novelFlowIndex) {
      return;
    }

    const pendingScrollWindowAnchor = pendingScrollWindowAnchorRef.current;
    const locator = pendingScrollWindowAnchor?.locator ?? layoutQueries.getCurrentOriginalLocator();

    const previousOffset = pendingScrollWindowAnchor?.previousOffset
      ?? (locator
        ? resolveLocatorGlobalOffset(previousIndex, locator)
        : resolveAnchorGlobalOffset(previousIndex, anchorRef?.current));
    const nextOffset = locator
      ? resolveLocatorGlobalOffset(novelFlowIndex, locator)
      : resolveAnchorGlobalOffset(novelFlowIndex, anchorRef?.current);
    const container = viewportContentRef.current;
    if (previousOffset === null || nextOffset === null || !container) {
      return;
    }

    const offsetDelta = nextOffset - previousOffset;
    if (Math.abs(offsetDelta) <= 0.5) {
      if (pendingScrollWindowAnchor) {
        pendingScrollWindowAnchorRef.current = null;
      }
      return;
    }

    persistence.suppressScrollSyncTemporarily();
    container.scrollTop += offsetDelta;
    pendingScrollWindowAnchorRef.current = null;
    syncViewportState({ force: true });
  }, [
    anchorRef,
    enabled,
    layoutQueries,
    novelFlowIndex,
    pendingScrollWindowAnchorRef,
    persistence,
    syncViewportState,
    viewportContentRef,
  ]);
}
