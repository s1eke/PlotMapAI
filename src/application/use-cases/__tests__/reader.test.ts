import { beforeEach, describe, expect, it, vi } from 'vitest';

import { novelRepository } from '@domains/library';

import { loadReaderSession } from '../reader';

vi.mock('@domains/library', () => ({
  novelRepository: {
    get: vi.fn(),
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

describe('reader use-cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the novel needed by the reader session', async () => {
    vi.mocked(novelRepository.get).mockResolvedValue(baseNovel);

    await expect(loadReaderSession(7)).resolves.toEqual({
      novel: baseNovel,
    });
    expect(novelRepository.get).toHaveBeenCalledWith(7);
  });
});
