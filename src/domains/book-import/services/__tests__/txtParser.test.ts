import { beforeEach, describe, expect, it, vi } from 'vitest';

import { projectTxtPlainTextToRichBlocks } from '@shared/text-processing';
import { runParseTxtTask } from '../../workers/txtClient';

import { parseTxt } from '../txtParser';

vi.mock('@shared/text-processing', async (importOriginal) => ({
  ...await importOriginal<typeof import('@shared/text-processing')>(),
  projectTxtPlainTextToRichBlocks: vi.fn((plainText: string) => [{
    type: 'paragraph' as const,
    children: [{
      type: 'text' as const,
      text: plainText,
    }],
  }]),
}));

vi.mock('@domains/book-import/workers/txtClient', () => ({
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

  it('forwards txt worker progress details into book import progress updates', async () => {
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
    expect(projectTxtPlainTextToRichBlocks).toHaveBeenCalledWith('Body');
  });
});
