import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bookLifecycleService } from '@application/services/bookLifecycleService';
import { analysisService } from '@domains/analysis';
import { novelRepository } from '@domains/library';
import { ensureDefaultTocRules, tocRuleRepository } from '@domains/settings';
import { db } from '@infra/db';

import {
  deleteNovelAndCleanupArtifacts,
  importBookAndRefreshLibrary,
  loadBookDetailPageData,
} from '../library';

vi.mock('@domains/analysis', () => ({
  analysisService: {
    getStatus: vi.fn(),
  },
}));

vi.mock('@application/services/bookLifecycleService', () => ({
  bookLifecycleService: {
    deleteNovel: vi.fn(),
    importBook: vi.fn(),
  },
}));

vi.mock('@domains/library', () => ({
  novelRepository: {
    delete: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('@application/services/readerContentController', () => ({
  loadPurifiedBookChapters: vi.fn(),
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
    vi.mocked(analysisService.getStatus).mockResolvedValue(createStatusResponse());
    vi.mocked(bookLifecycleService.deleteNovel).mockResolvedValue({ message: 'Novel deleted' });
  });

  it('importBookAndRefreshLibrary resolves toc rules before importing and then reloads the created novel', async () => {
    const file = new File(['book'], 'book.txt', { type: 'text/plain' });
    vi.mocked(ensureDefaultTocRules).mockResolvedValue(undefined);
    vi.mocked(tocRuleRepository.getEnabledChapterDetectionRules).mockResolvedValue([
      { rule: '^Chapter', source: 'default' },
    ]);
    vi.mocked(bookLifecycleService.importBook).mockResolvedValue(baseNovel);

    const novel = await importBookAndRefreshLibrary(file, {
      onProgress: vi.fn(),
    });

    expect(ensureDefaultTocRules).toHaveBeenCalledTimes(1);
    expect(tocRuleRepository.getEnabledChapterDetectionRules).toHaveBeenCalledTimes(1);
    expect(bookLifecycleService.importBook).toHaveBeenCalledWith(
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
    expect(data.analysisStatus).toBeNull();
    expect(data.analysisStatusError).toMatchObject({
      code: 'ANALYSIS_EXECUTION_FAILED',
      userMessageKey: 'bookDetail.analysisLoadError',
    });
  });

  it('loadBookDetailPageData returns novel and analysis data without touching cover resources', async () => {
    vi.mocked(novelRepository.get).mockResolvedValue({
      ...baseNovel,
      hasCover: true,
    });

    const data = await loadBookDetailPageData(7);

    expect(novelRepository.get).toHaveBeenCalledWith(7);
    expect(data.analysisStatus).toEqual(createStatusResponse());
    expect(data.analysisStatusError).toBeNull();
  });

  it('deleteNovelAndCleanupArtifacts clears analysis and reader state before deleting the novel aggregate', async () => {
    await deleteNovelAndCleanupArtifacts(5);

    expect(bookLifecycleService.deleteNovel).toHaveBeenCalledWith(5);
  });
});
