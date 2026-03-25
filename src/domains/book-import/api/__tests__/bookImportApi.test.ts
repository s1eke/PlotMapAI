import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@infra/db';
import { bookImportApi } from '../bookImportApi';

vi.mock('../../services/bookParser', () => ({
  parseBook: vi.fn().mockResolvedValue({
    title: 'Parsed Novel',
    author: 'Parsed Author',
    description: 'Parsed desc',
    coverBlob: null,
    chapters: [{ title: 'Ch1', content: 'Content 1' }, { title: 'Ch2', content: 'Content 2' }],
    rawText: 'Content 1\nContent 2',
    encoding: 'utf-8',
    totalWords: 20,
    fileHash: 'parsedhash',
    tags: ['fiction'],
    images: [],
  }),
}));

vi.mock('@domains/settings', () => ({
  ensureDefaultTocRules: vi.fn().mockResolvedValue(undefined),
}));

describe('bookImportApi', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
  });

  it('upload creates novel and chapters', async () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    const novel = await bookImportApi.importBook(file);
    expect(novel.title).toBe('Parsed Novel');
    expect(novel.chapterCount).toBe(2);
  });

  it('upload throws for unsupported file type', async () => {
    const file = new File(['data'], 'test.pdf', { type: 'application/pdf' });
    await expect(bookImportApi.importBook(file)).rejects.toThrow('Only .txt and .epub files are supported');
  });
});
