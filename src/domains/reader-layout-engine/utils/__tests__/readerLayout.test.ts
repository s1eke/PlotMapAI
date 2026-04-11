import { describe, expect, it } from 'vitest';

import { buildChapterImageGalleryEntries } from '@shared/text-processing';

import {
  buildReaderBlocks,
  createReaderViewportMetrics,
  getPagedContentHeight,
  PAGED_VIEWPORT_TOP_PADDING_PX,
} from '../readerLayout';

describe('readerLayout facade', () => {
  it('normalizes headings, text, and image markers into ordered reader blocks', () => {
    const blocks = buildReaderBlocks({
      index: 0,
      title: 'Chapter 1',
      plainText: 'Intro text [IMG:cover] tail text\nSecond paragraph',
      richBlocks: [],
      contentFormat: 'plain',
      contentVersion: 1,
      wordCount: 100,
      totalChapters: 1,
      hasPrev: false,
      hasNext: false,
    }, 16);

    expect(blocks.map((block) => block.kind)).toEqual([
      'heading',
      'text',
      'image',
      'text',
      'text',
    ]);
    expect(blocks[2]).toMatchObject({
      imageKey: 'cover',
      kind: 'image',
    });
    expect(blocks[3]?.kind).toBe('text');
    expect(blocks[3]?.text?.trim()).toBe('tail text');
  });

  it('collapses paragraph spacing around blank line separators', () => {
    const blocks = buildReaderBlocks({
      index: 0,
      title: 'Chapter 1',
      plainText: 'First paragraph\n\n\nSecond paragraph\n',
      richBlocks: [],
      contentFormat: 'plain',
      contentVersion: 1,
      wordCount: 100,
      totalChapters: 1,
      hasPrev: false,
      hasNext: false,
    }, 16);

    expect(blocks.map((block) => block.kind)).toEqual([
      'heading',
      'text',
      'blank',
      'text',
    ]);
    expect(blocks[1]?.marginAfter).toBe(0);
    expect(blocks[2]?.marginAfter).toBe(16);
    expect(blocks[3]?.marginAfter).toBe(0);
  });

  it('keeps image gallery block indices aligned with reader blocks', () => {
    const chapter = {
      index: 0,
      title: 'Chapter 1',
      plainText: 'Intro text [IMG:cover] tail text\n\nBody [IMG:map]',
      richBlocks: [],
      contentFormat: 'plain' as const,
      contentVersion: 1,
      wordCount: 100,
      totalChapters: 1,
      hasPrev: false,
      hasNext: false,
    };

    const blocks = buildReaderBlocks(chapter, 16)
      .filter((block) => block.kind === 'image');
    const galleryEntries = buildChapterImageGalleryEntries({
      content: chapter.plainText,
      index: chapter.index,
      title: chapter.title,
    });

    expect(galleryEntries).toEqual(blocks.map((block, order) => ({
      blockIndex: block.blockIndex,
      chapterIndex: block.chapterIndex,
      imageKey: block.imageKey!,
      order,
    })));
  });

  it('falls back to a single paged column for portrait or large-type viewports', () => {
    const portraitViewport = createReaderViewportMetrics(600, 800, 800, 1400, 18);
    const largeTypeViewport = createReaderViewportMetrics(600, 800, 900, 720, 28);
    const wideViewport = createReaderViewportMetrics(600, 800, 1280, 800, 18);

    expect(portraitViewport.pagedFitsTwoColumns).toBe(false);
    expect(portraitViewport.pagedColumnCount).toBe(1);
    expect(largeTypeViewport.pagedFitsTwoColumns).toBe(false);
    expect(largeTypeViewport.pagedColumnCount).toBe(1);
    expect(wideViewport.pagedFitsTwoColumns).toBe(true);
    expect(wideViewport.pagedColumnCount).toBe(2);
  });

  it('reserves paged viewport top padding from the available content height', () => {
    expect(getPagedContentHeight(800)).toBe(800 - PAGED_VIEWPORT_TOP_PADDING_PX);
    expect(getPagedContentHeight(8)).toBe(0);
  });
});
