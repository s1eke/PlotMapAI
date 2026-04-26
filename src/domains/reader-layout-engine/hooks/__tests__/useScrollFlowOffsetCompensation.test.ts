import type { NovelFlowIndex } from '../../layout-core/internal';

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useScrollFlowOffsetCompensation } from '../useScrollFlowOffsetCompensation';

const LAYOUT_SIGNATURE: NovelFlowIndex['layoutSignature'] = {
  columnCount: 1,
  columnGap: 0,
  fontSize: 18,
  lineSpacing: 1.8,
  pageHeight: 800,
  paragraphSpacing: 16,
  textWidth: 560,
};

function createNovelFlowIndex(chapterStarts: number[]): NovelFlowIndex {
  return {
    chapters: chapterStarts.map((scrollStart, chapterIndex) => ({
      blockSummaries: [],
      chapterIndex,
      endLocator: null,
      manifestStatus: 'estimated',
      pageEnd: 0,
      pageStart: 0,
      scrollEnd: scrollStart + 1000,
      scrollStart,
      startLocator: null,
    })),
    layoutKey: `layout:${chapterStarts.join(',')}`,
    layoutSignature: LAYOUT_SIGNATURE,
    novelId: 1,
    totalPageCount: 0,
    totalScrollHeight: (chapterStarts[chapterStarts.length - 1] ?? 0) + 1000,
  };
}

function createScrollContainer(scrollTop = 200): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    writable: true,
    value: scrollTop,
  });
  return element;
}

describe('useScrollFlowOffsetCompensation', () => {
  it('uses the last stable reading anchor when a live locator is unavailable', () => {
    const container = createScrollContainer(200);
    const anchorRef = { current: { chapterIndex: 1, chapterProgress: 0.5 } };
    const suppressScrollSyncTemporarily = vi.fn();
    const syncViewportState = vi.fn();
    const props = {
      novelFlowIndex: createNovelFlowIndex([0, 1000, 2000]),
    };

    const { rerender } = renderHook(
      ({ novelFlowIndex }: typeof props) => useScrollFlowOffsetCompensation({
        anchorRef,
        enabled: true,
        layoutQueries: {
          getCurrentOriginalLocator: () => null,
        },
        novelFlowIndex,
        pendingScrollWindowAnchorRef: { current: null },
        persistence: {
          suppressScrollSyncTemporarily,
        },
        syncViewportState,
        viewportContentRef: { current: container },
      }),
      { initialProps: props },
    );

    rerender({
      novelFlowIndex: createNovelFlowIndex([0, 1400, 2400]),
    });

    expect(container.scrollTop).toBe(600);
    expect(suppressScrollSyncTemporarily).toHaveBeenCalledTimes(1);
    expect(syncViewportState).toHaveBeenCalledWith({ force: true });
  });
});
