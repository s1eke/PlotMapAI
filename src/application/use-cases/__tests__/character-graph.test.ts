import { beforeEach, describe, expect, it, vi } from 'vitest';

import { analysisService } from '@domains/analysis';
import { novelRepository } from '@domains/library';

import { projectNovelText } from '@application/read-models/novel-text-projection';

import { loadCharacterGraphPageData } from '../character-graph';

vi.mock('@domains/analysis', () => ({
  analysisService: {
    getCharacterGraph: vi.fn(),
  },
}));

vi.mock('@domains/library', () => ({
  novelRepository: {
    get: vi.fn(),
  },
}));

vi.mock('@application/read-models/novel-text-projection', () => ({
  projectNovelText: vi.fn(),
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

describe('character-graph use-cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the novel and projected chapters before building the character graph', async () => {
    const chapters = [
      { chapterIndex: 0, content: 'Chapter 1' },
    ];
    const graph = {
      edges: [],
      meta: {
        analyzedChapters: 1,
        edgeCount: 0,
        generatedAt: null,
        hasData: true,
        hasOverview: true,
        isComplete: true,
        nodeCount: 1,
        totalChapters: 1,
      },
      nodes: [],
    };

    vi.mocked(novelRepository.get).mockResolvedValue(baseNovel);
    vi.mocked(projectNovelText).mockResolvedValue(chapters as never);
    vi.mocked(analysisService.getCharacterGraph).mockResolvedValue(graph);

    const data = await loadCharacterGraphPageData(7);

    expect(novelRepository.get).toHaveBeenCalledWith(7);
    expect(projectNovelText).toHaveBeenCalledWith(7);
    expect(analysisService.getCharacterGraph).toHaveBeenCalledWith(7, chapters);
    expect(data).toEqual({
      graph,
      novel: baseNovel,
    });
  });
});
