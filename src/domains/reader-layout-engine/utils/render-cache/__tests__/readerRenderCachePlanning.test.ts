import type { ReaderLayoutSignature } from '../../layout/readerLayout';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const imageCacheMock = vi.hoisted(() => ({
  peekReaderImageDimensions: vi.fn().mockReturnValue(undefined),
}));

vi.mock('@domains/reader-media', () => imageCacheMock);

import type { ChapterContent } from '@shared/contracts/reader';
import {
  buildChapterImageLayoutKey,
  buildPreheatTargets,
  buildVisibleRenderTargets,
  collectLoadedImageKeys,
  getActiveVariant,
  summarizeCacheSources,
} from '../readerRenderCachePlanning';

function createChapter(index: number, totalChapters: number): ChapterContent {
  return {
    index,
    title: `Chapter ${index + 1}`,
    plainText: `Content for chapter ${index + 1}`,
    richBlocks: [],
    contentFormat: 'plain',
    contentVersion: 1,
    wordCount: 120,
    totalChapters,
    hasPrev: index > 0,
    hasNext: index < totalChapters - 1,
  };
}

function createVariantSignatures(): Record<'original-paged' | 'original-scroll' | 'summary-shell', ReaderLayoutSignature> {
  return {
    'original-paged': {
      columnCount: 1,
      columnGap: 0,
      fontSize: 18,
      lineSpacing: 1.8,
      pageHeight: 720,
      paragraphSpacing: 16,
      textWidth: 520,
    },
    'original-scroll': {
      columnCount: 1,
      columnGap: 0,
      fontSize: 18,
      lineSpacing: 1.8,
      pageHeight: 800,
      paragraphSpacing: 16,
      textWidth: 640,
    },
    'summary-shell': {
      columnCount: 1,
      columnGap: 0,
      fontSize: 18,
      lineSpacing: 1.8,
      pageHeight: 800,
      paragraphSpacing: 16,
      textWidth: 640,
    },
  };
}

describe('readerRenderCachePlanning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    imageCacheMock.peekReaderImageDimensions.mockReturnValue(undefined);
  });

  it('selects the active render variant from view mode and pagination state', () => {
    expect(getActiveVariant(false, 'original')).toBe('original-scroll');
    expect(getActiveVariant(true, 'original')).toBe('original-paged');
    expect(getActiveVariant(false, 'summary')).toBe('summary-shell');
    expect(getActiveVariant(true, 'summary')).toBe('summary-shell');
  });

  it('collects loaded image keys once and keeps them sorted', () => {
    const currentChapter = {
      ...createChapter(0, 3),
      plainText: 'A\n[IMG:cover]\nB\n[IMG:map]',
    };
    const pagedChapter = {
      ...createChapter(1, 3),
      plainText: 'C\n[IMG:cover]\nD',
    };
    const scrollChapter = {
      ...createChapter(2, 3),
      plainText: 'E\n[IMG:appendix]\nF',
    };

    expect(collectLoadedImageKeys({
      currentChapter,
      pagedChapters: [pagedChapter],
      scrollChapters: [{ chapter: scrollChapter, index: scrollChapter.index }],
    })).toEqual(['appendix', 'cover', 'map']);
  });

  it('builds image layout keys with pending, missing, and decoded image dimensions', () => {
    imageCacheMock.peekReaderImageDimensions.mockImplementation(
      (_novelId: number, imageKey: string) => {
        if (imageKey === 'cover') {
          return undefined;
        }
        if (imageKey === 'portrait') {
          return null;
        }

        return {
          aspectRatio: 4,
          height: 250.2,
          width: 1000.4,
        };
      },
    );

    const chapter = {
      ...createChapter(0, 1),
      plainText: '[IMG:cover]\n[IMG:portrait]\n[IMG:map]',
    };

    expect(buildChapterImageLayoutKey(7, chapter, 'base-layout')).toBe(
      'base-layout::img:cover:pending,portrait:missing,map:1000x250',
    );
  });

  it('builds visible targets for summary mode from the current chapter only', () => {
    const currentChapter = createChapter(1, 3);
    const targets = buildVisibleRenderTargets({
      currentChapter,
      isPagedMode: false,
      novelId: 11,
      pagedChapters: [createChapter(0, 3)],
      scrollRenderMode: 'rich',
      scrollChapters: [{ chapter: createChapter(2, 3), index: 2 }],
      variantSignatures: createVariantSignatures(),
      viewMode: 'summary',
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]).toEqual(expect.objectContaining({
      chapter: currentChapter,
      exactKey: expect.stringContaining(':summary-shell:'),
      variantFamily: 'summary-shell',
    }));
  });

  it('keeps layout keys stable while separating scroll render identities', () => {
    const chapter = {
      ...createChapter(0, 1),
      contentFormat: 'rich' as const,
      richBlocks: [{
        type: 'paragraph' as const,
        children: [{
          type: 'text' as const,
          text: 'Rich paragraph',
        }],
      }],
    };

    const richTargets = buildVisibleRenderTargets({
      currentChapter: chapter,
      isPagedMode: false,
      novelId: 7,
      pagedChapters: [],
      scrollRenderMode: 'rich',
      scrollChapters: [{ chapter, index: 0 }],
      variantSignatures: createVariantSignatures(),
      viewMode: 'original',
    });
    const legacyTargets = buildVisibleRenderTargets({
      currentChapter: chapter,
      isPagedMode: false,
      novelId: 7,
      pagedChapters: [],
      scrollRenderMode: 'plain',
      scrollChapters: [{ chapter, index: 0 }],
      variantSignatures: createVariantSignatures(),
      viewMode: 'original',
    });

    expect(richTargets[0]?.layoutKey).toBe(legacyTargets[0]?.layoutKey);
    expect(richTargets[0]?.layoutFeatureSet).toBe('scroll-rich-inline');
    expect(legacyTargets[0]?.layoutFeatureSet).toBe('scroll-plain');
    expect(richTargets[0]?.exactKey).not.toBe(legacyTargets[0]?.exactKey);
  });

  it('builds preheat targets in the current order without duplicates', () => {
    expect(buildPreheatTargets({
      activeVariant: 'original-scroll',
      chaptersLength: 4,
      currentChapterIndex: 1,
    })).toEqual([
      {
        chapterIndex: 1,
        storageKind: 'render-tree',
        variantFamily: 'original-paged',
      },
      {
        chapterIndex: 1,
        storageKind: 'render-tree',
        variantFamily: 'summary-shell',
      },
      {
        chapterIndex: 0,
        storageKind: 'manifest',
        variantFamily: 'original-scroll',
      },
      {
        chapterIndex: 2,
        storageKind: 'manifest',
        variantFamily: 'original-scroll',
      },
      {
        chapterIndex: 3,
        storageKind: 'manifest',
        variantFamily: 'original-scroll',
      },
    ]);
  });

  it('keeps summary-shell preheating on the current chapter only', () => {
    expect(buildPreheatTargets({
      activeVariant: 'summary-shell',
      chaptersLength: 5,
      currentChapterIndex: 2,
    })).toEqual([
      {
        chapterIndex: 2,
        storageKind: 'render-tree',
        variantFamily: 'original-scroll',
      },
      {
        chapterIndex: 2,
        storageKind: 'render-tree',
        variantFamily: 'original-paged',
      },
    ]);
  });

  it('summarizes cache source counts across visible entries', () => {
    expect(summarizeCacheSources([
      'built',
      'memory',
      'memory',
      'dexie',
    ])).toEqual({
      built: 1,
      dexie: 1,
      memory: 2,
    });
  });
});
