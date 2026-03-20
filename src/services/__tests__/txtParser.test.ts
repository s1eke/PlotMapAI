import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock crypto.subtle.digest
const mockDigest = vi.fn().mockResolvedValue(
  new ArrayBuffer(32) // SHA-256 produces 32 bytes
);

Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: {
      digest: mockDigest,
    },
  },
  writable: true,
});

import { parseTxt } from '../txtParser';

describe('parseTxt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDigest.mockResolvedValue(new ArrayBuffer(32));
  });

  it('parses a simple txt file', async () => {
    const content = 'Hello World\nThis is a test.';
    const file = new File([content], 'MyNovel.txt', { type: 'text/plain' });
    const result = await parseTxt(file, []);

    expect(result.title).toBe('MyNovel');
    expect(result.author).toBe('');
    expect(result.chapters.length).toBeGreaterThanOrEqual(1);
    expect(result.totalWords).toBeGreaterThan(0);
    expect(result.fileHash).toBeDefined();
    expect(result.encoding).toBeDefined();
  });

  it('strips .txt extension from title', async () => {
    const file = new File(['content'], 'TestBook.TXT', { type: 'text/plain' });
    const result = await parseTxt(file, []);
    expect(result.title).toBe('TestBook');
  });

  it('detects chapters when TOC rules match', async () => {
    const lines = [
      '第1章 Start',
      'Content of chapter 1',
      '',
      '第2章 Middle',
      'Content of chapter 2',
    ];
    const file = new File([lines.join('\n')], 'book.txt', { type: 'text/plain' });
    const result = await parseTxt(file, [{ rule: '^第\\d+章' }]);
    expect(result.chapters.length).toBeGreaterThanOrEqual(2);
  });

  it('computes file hash', async () => {
    const file = new File(['test content'], 'hash.txt', { type: 'text/plain' });
    const result = await parseTxt(file, []);
    expect(mockDigest).toHaveBeenCalled();
    expect(result.fileHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns empty tags array', async () => {
    const file = new File(['content'], 'book.txt', { type: 'text/plain' });
    const result = await parseTxt(file, []);
    expect(result.tags).toEqual([]);
  });

  it('returns empty images array', async () => {
    const file = new File(['content'], 'book.txt', { type: 'text/plain' });
    const result = await parseTxt(file, []);
    expect(result.images).toEqual([]);
  });
});
