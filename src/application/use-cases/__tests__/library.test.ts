import { beforeEach, describe, expect, it, vi } from 'vitest';

import { analysisService } from '@domains/analysis';
import { bookImportService } from '@domains/book-import';
import { novelRepository } from '@domains/library';
import {
  deleteReaderArtifacts,
} from '@domains/reader';
import { ensureDefaultTocRules, tocRuleRepository } from '@domains/settings';
import { db } from '@infra/db';
import { CACHE_KEYS, storage } from '@infra/storage';

import {
  deleteNovelAndCleanupArtifacts,
  importBookAndRefreshLibrary,
  loadBookDetailPageData,
} from '../library';

vi.mock('@domains/analysis', () => ({
  analysisService: {
    deleteArtifacts: vi.fn(),
    getStatus: vi.fn(),
  },
}));

vi.mock('@domains/book-import', () => ({
  bookImportService: {
    importBook: vi.fn(),
  },
}));

vi.mock('@domains/library', () => ({
  novelRepository: {
    delete: vi.fn(),
    get: vi.fn(),
    getCoverUrl: vi.fn(),
  },
}));

vi.mock('@domains/reader', () => ({
  deleteReaderArtifacts: vi.fn(),
  loadAndPurifyChapters: vi.fn(),
}));

vi.mock('@domains/settings', () => ({
  ensureDefaultTocRules: vi.fn(),
}));

vi.mock('@domains/settings', () => ({
  ensureDefaultTocRules: vi.fn(),
  tocRuleRepository: {
    getEnabledChapterDetectionRules: vi.fn(),
  },
}));

const baseNovel = {
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
};

function createStatusResponse() {
  return {
    chunks: [],
    job: {
      analysisComplete: false,
      analyzedChapters: 0,
      canPause: false,
      canRestart: false,
      canResume: false,
      canStart: true,
      completedAt: null,
      completedChunks: 0,
      currentChunk: null,
      currentChunkIndex: 0,
      currentStage: 'idle',
      lastError: '',
      lastHeartbeat: null,
      pauseRequested: false,
      progressPercent: 0,
      startedAt: null,
      status: 'idle',
      totalChapters: 0,
      totalChunks: 0,
      updatedAt: null,
    },
    overview: null,
  };
}

describe('application library use-cases', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    await db.delete();
    await db.open();
    vi.mocked(analysisService.deleteArtifacts).mockResolvedValue(undefined);
    vi.mocked(deleteReaderArtifacts).mockResolvedValue(undefined);
    vi.mocked(analysisService.getStatus).mockResolvedValue(createStatusResponse());
  });

  it('importBookAndRefreshLibrary resolves toc rules before importing and then reloads the created novel', async () => {
    const file = new File(['book'], 'book.txt', { type: 'text/plain' });
    vi.mocked(ensureDefaultTocRules).mockResolvedValue(undefined);
    vi.mocked(tocRuleRepository.getEnabledChapterDetectionRules).mockResolvedValue([
      { rule: '^Chapter', source: 'default' },
    ]);
    vi.mocked(bookImportService.importBook).mockResolvedValue({ novelId: 7 });
    vi.mocked(novelRepository.get).mockResolvedValue(baseNovel);

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

  it('loadBookDetailPageData keeps novel data when analysis status loading fails', async () => {
    vi.mocked(novelRepository.get).mockResolvedValue(baseNovel);
    vi.mocked(analysisService.getStatus).mockRejectedValue(new Error('Analysis failed'));

    const data = await loadBookDetailPageData(7);

    expect(data.novel).toEqual(baseNovel);
    expect(data.coverUrl).toBeNull();
    expect(data.analysisStatus).toBeNull();
    expect(data.analysisStatusError).toMatchObject({
      code: 'ANALYSIS_EXECUTION_FAILED',
      userMessageKey: 'bookDetail.analysisLoadError',
    });
    expect(novelRepository.getCoverUrl).not.toHaveBeenCalled();
  });

  it('loadBookDetailPageData loads the cover only when the novel has one', async () => {
    vi.mocked(novelRepository.get).mockResolvedValue({
      ...baseNovel,
      hasCover: true,
    });
    vi.mocked(novelRepository.getCoverUrl).mockResolvedValue('blob:cover');

    const data = await loadBookDetailPageData(7);

    expect(novelRepository.getCoverUrl).toHaveBeenCalledWith(7);
    expect(data.coverUrl).toBe('blob:cover');
    expect(data.analysisStatus).toEqual(createStatusResponse());
    expect(data.analysisStatusError).toBeNull();
  });

  it('deleteNovelAndCleanupArtifacts clears analysis and reader state before deleting the novel aggregate', async () => {
    storage.cache.set(CACHE_KEYS.readerState(5), {
      chapterIndex: 0,
      mode: 'summary',
    });
    vi.mocked(novelRepository.delete).mockResolvedValue({ message: 'Novel deleted' });

    await deleteNovelAndCleanupArtifacts(5);

    expect(storage.cache.getJson(CACHE_KEYS.readerState(5))).toBeNull();
    expect(analysisService.deleteArtifacts).toHaveBeenCalledWith(5);
    expect(deleteReaderArtifacts).toHaveBeenCalledWith(5);
    expect(novelRepository.delete).toHaveBeenCalledWith(5);
  });
});
