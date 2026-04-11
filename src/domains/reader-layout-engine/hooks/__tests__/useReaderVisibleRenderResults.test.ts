import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChapterContent } from '@shared/contracts/reader';
import type {
  ReaderLayoutSignature,
  ReaderTypographyMetrics,
} from '../../utils/readerLayout';
import type { ReaderVisibleRenderTarget } from '../../utils/readerRenderCachePlanning';

const {
  mockBuildStaticRenderTree,
  mockCountPageItems,
  mockGetReaderRenderCacheEntryFromMemory,
  mockSummarizeCacheSources,
} = vi.hoisted(() => ({
  mockBuildStaticRenderTree: vi.fn(),
  mockCountPageItems: vi.fn(),
  mockGetReaderRenderCacheEntryFromMemory: vi.fn(),
  mockSummarizeCacheSources: vi.fn(),
}));

vi.mock('@shared/debug', () => ({
  debugLog: vi.fn(),
}));

vi.mock('../../utils/readerRenderCache', () => ({
  buildStaticRenderTree: mockBuildStaticRenderTree,
  coercePagedTree: (entry: { variantFamily?: string }) => (
    entry.variantFamily === 'original-paged'
      ? { pageSlices: [{}] }
      : null
  ),
  coerceScrollTree: () => null,
  coerceSummaryShellTree: () => null,
  getReaderRenderCacheEntryFromMemory: mockGetReaderRenderCacheEntryFromMemory,
  persistReaderRenderCacheEntry: vi.fn().mockResolvedValue(undefined),
  primeReaderRenderCacheEntry: vi.fn(),
}));

vi.mock('../../utils/readerRenderCachePlanning', () => ({
  buildChapterImageDimensionsMap: vi.fn(() => new Map()),
  countPageItems: mockCountPageItems,
  summarizeCacheSources: mockSummarizeCacheSources,
}));

import { useReaderVisibleRenderResults } from '../useReaderVisibleRenderResults';

describe('useReaderVisibleRenderResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReaderRenderCacheEntryFromMemory.mockReturnValue(null);
    mockBuildStaticRenderTree.mockImplementation((params: {
      chapter: { index: number };
      variantFamily: string;
    }) => ({
      chapterIndex: params.chapter.index,
      variantFamily: params.variantFamily,
    }));
    mockCountPageItems.mockReturnValue(3);
    mockSummarizeCacheSources.mockImplementation((sources: string[]) => ({
      built: sources.filter((source) => source === 'built').length,
      dexie: sources.filter((source) => source === 'dexie').length,
      memory: sources.filter((source) => source === 'memory').length,
    }));
  });

  it('counts only unsupported rich blocks as paged downgrades', () => {
    const chapter: ChapterContent = {
      index: 0,
      title: 'Chapter 1',
      plainText: 'Intro\nSidebar\nNested unsupported',
      richBlocks: [
        {
          type: 'paragraph',
          children: [{ type: 'text', text: 'Intro' }],
        },
        {
          type: 'unsupported',
          originalTag: 'aside',
          plainText: 'Sidebar',
        },
        {
          type: 'list',
          ordered: false,
          items: [[{
            type: 'unsupported',
            originalTag: 'details',
            plainText: 'Nested unsupported',
          }]],
        },
      ],
      contentFormat: 'rich',
      contentVersion: 7,
      wordCount: 3,
      totalChapters: 1,
      hasPrev: false,
      hasNext: false,
    };
    const visibleTargets: ReaderVisibleRenderTarget[] = [{
      chapter,
      contentFormat: chapter.contentFormat,
      contentVersion: chapter.contentVersion,
      contentHash: 'hash',
      exactKey: 'key-1',
      layoutFeatureSet: 'structured-layout-v1',
      layoutKey: 'layout-key',
      rendererVersion: 1,
      variantFamily: 'original-paged',
    }];
    const typography: ReaderTypographyMetrics = {
      bodyFont: 'Georgia',
      bodyFontSize: 18,
      bodyLineHeightPx: 30,
      headingFont: 'Georgia',
      headingFontSize: 28,
      headingLineHeightPx: 36,
      paragraphSpacing: 16,
    };
    const pagedSignature: ReaderLayoutSignature = {
      textWidth: 640,
      pageHeight: 900,
      columnCount: 1,
      columnGap: 24,
      fontSize: 18,
      lineSpacing: 1.6,
      paragraphSpacing: 16,
    };
    const variantSignatures: Record<'original-paged' | 'original-scroll' | 'summary-shell', ReaderLayoutSignature> = {
      'original-paged': {
        ...pagedSignature,
      },
      'original-scroll': { ...pagedSignature },
      'summary-shell': { ...pagedSignature },
    };

    const { result } = renderHook(() => useReaderVisibleRenderResults({
      activeVariant: 'original-paged',
      currentChapterIndex: 0,
      novelId: 5,
      preferRichScrollRendering: true,
      revisionKey: 'revision-1',
      scrollChapterCount: 1,
      typography,
      variantSignatures,
      visibleTargets,
    }));

    expect(result.current.layoutSnapshot.pagedDowngradeCount).toBe(2);
    expect(result.current.layoutSnapshot.pagedFallbackCount).toBe(2);
    expect(result.current.layoutSnapshot.unsupportedBlockCount).toBe(2);
    expect(result.current.layoutSnapshot.richBlockCount).toBe(4);
  });
});
