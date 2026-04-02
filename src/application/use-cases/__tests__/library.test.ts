import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bookImportService } from '@domains/book-import';
import { novelRepository } from '@domains/library';
import {
  clearReaderRenderCacheMemoryForNovel,
} from '@domains/reader';
import { ensureDefaultTocRules } from '@domains/settings';
import { tocRuleRepository } from '@domains/settings/tocRuleRepository';
import { db } from '@infra/db';
import { CACHE_KEYS, storage } from '@infra/storage';

import {
  deleteNovelAndCleanupArtifacts,
  importBookAndRefreshLibrary,
} from '../library';

vi.mock('@domains/book-import', () => ({
  bookImportService: {
    importBook: vi.fn(),
  },
}));

vi.mock('@domains/library', () => ({
  novelRepository: {
    delete: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('@domains/reader', () => ({
  clearReaderRenderCacheMemoryForNovel: vi.fn(),
  loadAndPurifyChapters: vi.fn(),
}));

vi.mock('@domains/settings', () => ({
  ensureDefaultTocRules: vi.fn(),
}));

vi.mock('@domains/settings/tocRuleRepository', () => ({
  tocRuleRepository: {
    getEnabledChapterDetectionRules: vi.fn(),
  },
}));

describe('application library use-cases', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    await db.delete();
    await db.open();
  });

  it('importBookAndRefreshLibrary resolves toc rules before importing and then reloads the created novel', async () => {
    const file = new File(['book'], 'book.txt', { type: 'text/plain' });
    vi.mocked(ensureDefaultTocRules).mockResolvedValue(undefined);
    vi.mocked(tocRuleRepository.getEnabledChapterDetectionRules).mockResolvedValue([
      { rule: '^Chapter', source: 'default' },
    ]);
    vi.mocked(bookImportService.importBook).mockResolvedValue({ novelId: 7 });
    vi.mocked(novelRepository.get).mockResolvedValue({
      author: '',
      chapterCount: 2,
      createdAt: new Date().toISOString(),
      description: '',
      fileType: 'txt',
      hasCover: false,
      id: 7,
      originalEncoding: 'utf-8',
      originalFilename: 'book.txt',
      tags: [],
      title: 'Imported Novel',
      totalWords: 200,
    });

    const novel = await importBookAndRefreshLibrary(file, {
      onProgress: vi.fn(),
    });

    expect(ensureDefaultTocRules).toHaveBeenCalledTimes(1);
    expect(tocRuleRepository.getEnabledChapterDetectionRules).toHaveBeenCalledTimes(1);
    expect(bookImportService.importBook).toHaveBeenCalledWith(
      file,
      [{ rule: '^Chapter', source: 'default' }],
      { onProgress: expect.any(Function) },
    );
    expect(novel).toMatchObject({
      id: 7,
      title: 'Imported Novel',
    });
  });

  it('deleteNovelAndCleanupArtifacts clears analysis and reader state before deleting the novel aggregate', async () => {
    await db.analysisJobs.add({
      analyzedChapters: 1,
      completedAt: null,
      completedChunks: 1,
      currentChunkIndex: 0,
      currentStage: 'chapters',
      lastError: '',
      lastHeartbeat: null,
      novelId: 5,
      pauseRequested: false,
      startedAt: null,
      status: 'paused',
      totalChapters: 1,
      totalChunks: 1,
      updatedAt: new Date().toISOString(),
    });
    await db.analysisChunks.add({
      chapterIndices: [0],
      chunkIndex: 0,
      chunkSummary: '',
      endChapterIndex: 0,
      errorMessage: '',
      novelId: 5,
      startChapterIndex: 0,
      status: 'completed',
      updatedAt: new Date().toISOString(),
    });
    await db.chapterAnalyses.add({
      chapterIndex: 0,
      chapterTitle: 'Chapter 1',
      characters: [],
      chunkIndex: 0,
      keyPoints: [],
      novelId: 5,
      relationships: [],
      summary: 'summary',
      tags: [],
      updatedAt: new Date().toISOString(),
    });
    await db.analysisOverviews.add({
      analyzedChapters: 1,
      bookIntro: 'intro',
      characterStats: [],
      globalSummary: 'summary',
      novelId: 5,
      relationshipGraph: [],
      themes: [],
      totalChapters: 1,
      updatedAt: new Date().toISOString(),
    });
    await db.readerRenderCache.add({
      chapterIndex: 0,
      contentHash: 'content-hash',
      expiresAt: '2026-04-16T00:00:00.000Z',
      layoutKey: 'summary-shell:base',
      layoutSignature: {
        columnCount: 1,
        columnGap: 0,
        fontSize: 18,
        lineSpacing: 1.6,
        pageHeight: 720,
        paragraphSpacing: 16,
        textWidth: 360,
      },
      novelId: 5,
      queryManifest: {
        blockCount: 2,
        lineCount: 4,
        totalHeight: 120,
      },
      storageKind: 'manifest',
      tree: null,
      updatedAt: '2026-04-02T00:00:00.000Z',
      variantFamily: 'summary-shell',
    });
    await db.readingProgress.add({
      chapterIndex: 0,
      mode: 'scroll',
      novelId: 5,
      updatedAt: new Date().toISOString(),
    });
    storage.cache.set(CACHE_KEYS.readerState(5), {
      chapterIndex: 0,
      mode: 'summary',
    });
    vi.mocked(novelRepository.delete).mockResolvedValue({ message: 'Novel deleted' });

    await deleteNovelAndCleanupArtifacts(5);

    await expect(db.analysisJobs.count()).resolves.toBe(0);
    await expect(db.analysisChunks.count()).resolves.toBe(0);
    await expect(db.chapterAnalyses.count()).resolves.toBe(0);
    await expect(db.analysisOverviews.count()).resolves.toBe(0);
    await expect(db.readerRenderCache.count()).resolves.toBe(0);
    await expect(db.readingProgress.count()).resolves.toBe(0);
    expect(storage.cache.getJson(CACHE_KEYS.readerState(5))).toBeNull();
    expect(clearReaderRenderCacheMemoryForNovel).toHaveBeenCalledWith(5);
    expect(novelRepository.delete).toHaveBeenCalledWith(5);
  });
});
