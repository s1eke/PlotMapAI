import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bookLifecycleService } from '@application/services/bookLifecycleService';
import {
  ensureDefaultPurificationRules,
  ensureDefaultTocRules,
  purificationRuleRepository,
  tocRuleRepository,
} from '@domains/settings';

import { importBookAndRefreshLibrary } from '../bookshelf';

vi.mock('@application/services/bookLifecycleService', () => ({
  bookLifecycleService: {
    importBook: vi.fn(),
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

describe('bookshelf use-cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
