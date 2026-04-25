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

export function useScrollFlowOffsetCompensation(params: {
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
    if (!locator) {
      return;
    }

    const previousOffset = pendingScrollWindowAnchor?.previousOffset
      ?? resolveLocatorGlobalOffset(previousIndex, locator);
    const nextOffset = resolveLocatorGlobalOffset(novelFlowIndex, locator);
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
    enabled,
    layoutQueries,
    novelFlowIndex,
    pendingScrollWindowAnchorRef,
    persistence,
    syncViewportState,
    viewportContentRef,
  ]);
}
