import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  registerReaderContentController,
  resetReaderContentControllerForTests,
} from '../readerContentController';
import { readerContentService } from '../readerContentService';

describe('readerContentService', () => {
  const controller = {
    getChapters: vi.fn(),
    getChapterContent: vi.fn(),
    getImageBlob: vi.fn(),
    getImageGalleryEntries: vi.fn(),
    loadPurifiedBookChapters: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetReaderContentControllerForTests();
    registerReaderContentController(controller);
  });

  it('delegates chapter list reads to the registered controller', async () => {
    controller.getChapters.mockResolvedValueOnce([
      { index: 0, title: 'Chapter 1', wordCount: 12 },
    ]);

    await expect(readerContentService.getChapters(1)).resolves.toEqual([
      { index: 0, title: 'Chapter 1', wordCount: 12 },
    ]);
    expect(controller.getChapters).toHaveBeenCalledWith(1, {});
  });

  it('delegates chapter content reads to the registered controller', async () => {
    controller.getChapterContent.mockResolvedValueOnce({
      index: 1,
      title: 'Chapter 2',
      plainText: 'Body',
      richBlocks: [{
        type: 'paragraph',
        children: [{
          type: 'text',
          text: 'Body',
        }],
      }],
      contentFormat: 'plain',
      contentVersion: 1,
      wordCount: 4,
      totalChapters: 2,
      hasPrev: true,
      hasNext: false,
    });

    await expect(readerContentService.getChapterContent(1, 1)).resolves.toEqual({
      index: 1,
      title: 'Chapter 2',
      plainText: 'Body',
      richBlocks: [{
        type: 'paragraph',
        children: [{
          type: 'text',
          text: 'Body',
        }],
      }],
      contentFormat: 'plain',
      contentVersion: 1,
      wordCount: 4,
      totalChapters: 2,
      hasPrev: true,
      hasNext: false,
    });
    expect(controller.getChapterContent).toHaveBeenCalledWith(1, 1, {});
  });

  it('delegates image blob and gallery reads to the registered controller', async () => {
    const blob = new Blob(['image']);
    controller.getImageBlob.mockResolvedValueOnce(blob);
    controller.getImageGalleryEntries.mockResolvedValueOnce([
      { chapterIndex: 0, blockIndex: 1, imageKey: 'map', order: 0 },
    ]);

    await expect(readerContentService.getImageBlob(1, 'map')).resolves.toBe(blob);
    await expect(readerContentService.getImageGalleryEntries(1)).resolves.toEqual([
      { chapterIndex: 0, blockIndex: 1, imageKey: 'map', order: 0 },
    ]);
  });

  it('creates object URLs from delegated image blobs', async () => {
    const blob = new Blob(['image']);
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:test') as typeof URL.createObjectURL;
    controller.getImageBlob.mockResolvedValueOnce(blob);

    await expect(readerContentService.getImageUrl(1, 'map')).resolves.toBe('blob:test');
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);

    URL.createObjectURL = originalCreateObjectURL;
  });
});
