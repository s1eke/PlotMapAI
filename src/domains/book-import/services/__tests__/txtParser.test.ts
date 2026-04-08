import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runParseTxtTask } from '@shared/text-processing';

import { parseTxt } from '../txtParser';

vi.mock('@shared/text-processing', () => ({
  debugLog: vi.fn(),
  runParseTxtTask: vi.fn(),
}));

describe('parseTxt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runParseTxtTask).mockImplementation(async (_payload, options) => {
      options?.onProgress?.({
        progress: 60,
        stage: 'chapters',
        current: 12,
        total: 12,
        detail: '12 chapters',
      });

      return {
        title: 'TXT Novel',
        chapters: [
          { title: 'Chapter 1', content: 'Body' },
        ],
        encoding: 'utf-8',
        fileHash: 'hash',
        rawText: 'Body',
        totalWords: 4,
      };
    });
  });

  it('maps shared text-processing progress details into book import progress updates', async () => {
    const onProgress = vi.fn();

    await parseTxt(
      new File(['Body'], 'novel.txt', { type: 'text/plain' }),
      [{ rule: '^Chapter', source: 'default' }],
      { onProgress },
    );

    expect(onProgress).toHaveBeenCalledWith({
      progress: 60,
      stage: 'chapters',
      current: 12,
      total: 12,
      detail: '12 chapters',
    });
  });
});
