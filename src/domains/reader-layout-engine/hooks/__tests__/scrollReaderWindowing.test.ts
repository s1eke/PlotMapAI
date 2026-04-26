import type { Dispatch, SetStateAction } from 'react';
import type { ChapterContent } from '@shared/contracts/reader';
import type {
  ScrollAnchorSnapshot,
  VisibleScrollBlockRange,
} from '../scrollReaderControllerTypes';

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useScrollReaderWindowing } from '../scrollReaderWindowing';

function createChapter(index: number, totalChapters: number): ChapterContent {
  return {
    index,
    title: `Chapter ${index + 1}`,
    plainText: `Chapter ${index + 1} content`,
    richBlocks: [],
    contentFormat: 'plain',
    contentVersion: 1,
    hasNext: index < totalChapters - 1,
    hasPrev: index > 0,
    totalChapters,
    wordCount: 120,
  };
}

function createWindowingParams(overrides: {
  currentChapter?: ChapterContent | null;
  scrollModeChapters?: number[];
  setScrollModeChapters?: Dispatch<SetStateAction<number[]>>;
} = {}): Parameters<typeof useScrollReaderWindowing>[0] {
  const totalChapters = 6;
  const currentChapter = overrides.currentChapter ?? createChapter(0, totalChapters);

  return {
    cache: {
      getCachedChapter: vi.fn(() => null),
      hasCachedChapter: vi.fn(() => true),
      setCachedChapter: vi.fn(),
    },
    chapterIndex: currentChapter?.index ?? 0,
    chaptersLength: totalChapters,
    currentChapter,
    enabled: true,
    fetchChapterContent: vi.fn(async (index: number) => createChapter(index, totalChapters)),
    layoutQueries: {
      clearScrollChapterBodyElements: vi.fn(),
      clearScrollChapterElements: vi.fn(),
    },
    pendingRestoreTargetRef: { current: null },
    retainedFocusedWindowChapterIndex: null,
    scrollAnchorSnapshotRef: {
      current: {
        chapterIndex: null,
        chapterOffsetTop: null,
        firstRenderableChapterIndex: null,
        scrollTop: 0,
      },
    } satisfies { current: ScrollAnchorSnapshot },
    scrollChapterBodyElementsRef: { current: new Map<number, HTMLDivElement>() },
    scrollModeChapters: overrides.scrollModeChapters ?? [0, 1, 2],
    setScrollModeChapters: overrides.setScrollModeChapters ?? vi.fn(),
    setVisibleScrollBlockRangeByChapter: vi.fn() as Dispatch<
      SetStateAction<Map<number, VisibleScrollBlockRange>>
    >,
  };
}

describe('useScrollReaderWindowing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('不会因为 flow 可视窗口扩展而反复重置基础章节窗口', async () => {
    const setScrollModeChapters = vi.fn();
    const currentChapter = createChapter(0, 6);
    const baseParams = createWindowingParams({
      currentChapter,
      scrollModeChapters: [0, 1, 2],
      setScrollModeChapters,
    });
    const { rerender } = renderHook(
      (params: Parameters<typeof useScrollReaderWindowing>[0]) => {
        useScrollReaderWindowing(params);
      },
      {
        initialProps: baseParams,
      },
    );

    await waitFor(() => {
      expect(setScrollModeChapters).toHaveBeenCalledTimes(1);
    });

    rerender({
      ...baseParams,
      scrollModeChapters: [0, 1, 2, 3],
    });

    await Promise.resolve();

    expect(setScrollModeChapters).toHaveBeenCalledTimes(1);
  });
});
