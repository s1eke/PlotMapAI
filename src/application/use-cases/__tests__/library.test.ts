import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bookLifecycleService } from '@application/services/bookLifecycleService';
import { analysisService } from '@domains/analysis';
import { chapterRichContentRepository } from '@domains/book-content';
import { novelRepository } from '@domains/library';
import {
  ensureDefaultPurificationRules,
  ensureDefaultTocRules,
  purificationRuleRepository,
  tocRuleRepository,
} from '@domains/settings';
import { db } from '@infra/db';

import {
  deleteNovelAndCleanupArtifacts,
  importBookAndRefreshLibrary,
  loadBookDetailPageData,
  reparseBookAndRefreshDetail,
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
    reparseBook: vi.fn(),
  },
}));

vi.mock('@domains/library', () => ({
  novelRepository: {
    delete: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('@domains/book-content', () => ({
  chapterRichContentRepository: {
    listNovelChapterRichContents: vi.fn(),
  },
}));

vi.mock('@domains/settings', () => ({
  ensureDefaultPurificationRules: vi.fn(),
  ensureDefaultTocRules: vi.fn(),
  purificationRuleRepository: {
    getEnabledPurificationRules: vi.fn(),
  },
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
    vi.mocked(chapterRichContentRepository.listNovelChapterRichContents).mockResolvedValue([]);
    vi.mocked(bookLifecycleService.deleteNovel).mockResolvedValue({ message: 'Novel deleted' });
  });

  it('importBookAndRefreshLibrary resolves toc rules before importing and then reloads the created novel', async () => {
    const file = new File(['book'], 'book.txt', { type: 'text/plain' });
    vi.mocked(ensureDefaultTocRules).mockResolvedValue(undefined);
    vi.mocked(ensureDefaultPurificationRules).mockResolvedValue(undefined);
    vi.mocked(tocRuleRepository.getEnabledChapterDetectionRules).mockResolvedValue([
      { rule: '^Chapter', source: 'default' },
    ]);
    vi.mocked(purificationRuleRepository.getEnabledPurificationRules).mockResolvedValue([]);
    vi.mocked(bookLifecycleService.importBook).mockResolvedValue(baseNovel);

    const novel = await importBookAndRefreshLibrary(file, {
      onProgress: vi.fn(),
    });

    expect(ensureDefaultTocRules).toHaveBeenCalledTimes(1);
    expect(ensureDefaultPurificationRules).toHaveBeenCalledTimes(1);
    expect(tocRuleRepository.getEnabledChapterDetectionRules).toHaveBeenCalledTimes(1);
    expect(purificationRuleRepository.getEnabledPurificationRules).toHaveBeenCalledTimes(1);
    expect(bookLifecycleService.importBook).toHaveBeenCalledWith(
      file,
      [{ rule: '^Chapter', source: 'default' }],
      {
        onProgress: expect.any(Function),
        purificationRules: [],
      },
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
    expect(data.contentSummary).toEqual({
      contentFormat: 'rich',
      contentVersion: null,
      importFormatVersion: null,
      lastParsedAt: null,
    });
  });

  it('loadBookDetailPageData returns novel, analysis data, and rich content summary', async () => {
    vi.mocked(novelRepository.get).mockResolvedValue({
      ...baseNovel,
      hasCover: true,
    });
    vi.mocked(chapterRichContentRepository.listNovelChapterRichContents).mockResolvedValue([
      {
        chapterIndex: 0,
        contentFormat: 'rich',
        contentVersion: 1,
        importFormatVersion: 1,
        plainText: 'Chapter one',
        richBlocks: [],
        updatedAt: '2026-04-01T10:00:00.000Z',
      },
      {
        chapterIndex: 1,
        contentFormat: 'rich',
        contentVersion: 4,
        importFormatVersion: 3,
        plainText: 'Chapter two',
        richBlocks: [],
        updatedAt: '2026-04-02T12:30:00.000Z',
      },
    ]);

    const data = await loadBookDetailPageData(7);

    expect(novelRepository.get).toHaveBeenCalledWith(7);
    expect(chapterRichContentRepository.listNovelChapterRichContents).toHaveBeenCalledWith(7);
    expect(data.analysisStatus).toEqual(createStatusResponse());
    expect(data.analysisStatusError).toBeNull();
    expect(data.contentSummary).toEqual({
      contentFormat: 'rich',
      contentVersion: 4,
      importFormatVersion: 3,
      lastParsedAt: '2026-04-02T12:30:00.000Z',
    });
  });

  it('reparseBookAndRefreshDetail resolves rules before overwriting the existing novel', async () => {
    const file = new File(['book'], 'book.txt', { type: 'text/plain' });
    vi.mocked(ensureDefaultTocRules).mockResolvedValue(undefined);
    vi.mocked(ensureDefaultPurificationRules).mockResolvedValue(undefined);
    vi.mocked(tocRuleRepository.getEnabledChapterDetectionRules).mockResolvedValue([
      { rule: '^Chapter', source: 'default' },
    ]);
    vi.mocked(purificationRuleRepository.getEnabledPurificationRules).mockResolvedValue([]);
    vi.mocked(bookLifecycleService.reparseBook).mockResolvedValue(baseNovel);

    const novel = await reparseBookAndRefreshDetail(7, file, {
      onProgress: vi.fn(),
    });

    expect(ensureDefaultTocRules).toHaveBeenCalledTimes(1);
    expect(ensureDefaultPurificationRules).toHaveBeenCalledTimes(1);
    expect(bookLifecycleService.reparseBook).toHaveBeenCalledWith(
      7,
      file,
      [{ rule: '^Chapter', source: 'default' }],
      {
        onProgress: expect.any(Function),
        purificationRules: [],
      },
    );
    expect(novel).toMatchObject({
      id: 7,
      title: 'Imported Novel',
    });
  });

  it('deleteNovelAndCleanupArtifacts clears analysis and reader state before deleting the novel aggregate', async () => {
    await deleteNovelAndCleanupArtifacts(5);

    expect(bookLifecycleService.deleteNovel).toHaveBeenCalledWith(5);
  });
});
