import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../db';

// Mock the module-level side effect (recoverInterruptedJobs)
vi.mock('../aiAnalysis', async () => {
  const actual = await vi.importActual<typeof import('../aiAnalysis')>('../aiAnalysis');
  return {
    ...actual,
    // Keep all real exports; mock only what's needed
  };
});

// Mock loadAndPurifyChapters to avoid needing real purifier rules
vi.mock('../../api/reader', () => ({
  loadAndPurifyChapters: vi.fn().mockResolvedValue([]),
}));

import {
  getAnalysisStatus,
  getChapterAnalysis,
  getOverview,
} from '../analysisRunner';

describe('analysisRunner', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
  });

  it('getAnalysisStatus returns idle status when no job exists', async () => {
    // Seed a novel
    await db.novels.add({
      id: undefined as unknown as number,
      title: 'Test Novel',
      author: 'Author',
      description: '',
      tags: [],
      fileType: 'txt',
      fileHash: 'hash',
      coverPath: '',
      originalFilename: 'test.txt',
      originalEncoding: 'utf-8',
      totalWords: 1000,
      createdAt: new Date().toISOString(),
    });
    const novel = await db.novels.orderBy('id').last();
    const result = await getAnalysisStatus(novel!.id);
    expect(result.job.status).toBe('idle');
    expect(result.job.canStart).toBe(true);
    expect(result.chunks).toEqual([]);
  });

  it('getChapterAnalysis returns null when no analysis exists', async () => {
    await db.novels.add({
      id: undefined as unknown as number,
      title: 'Novel',
      author: '',
      description: '',
      tags: [],
      fileType: 'txt',
      fileHash: 'h',
      coverPath: '',
      originalFilename: 'n.txt',
      originalEncoding: 'utf-8',
      totalWords: 100,
      createdAt: new Date().toISOString(),
    });
    const novel = await db.novels.orderBy('id').last();
    const result = await getChapterAnalysis(novel!.id, 0);
    expect(result.analysis).toBeNull();
  });

  it('getOverview returns null when no overview exists', async () => {
    await db.novels.add({
      id: undefined as unknown as number,
      title: 'Novel',
      author: '',
      description: '',
      tags: [],
      fileType: 'txt',
      fileHash: 'h',
      coverPath: '',
      originalFilename: 'n.txt',
      originalEncoding: 'utf-8',
      totalWords: 100,
      createdAt: new Date().toISOString(),
    });
    const novel = await db.novels.orderBy('id').last();
    const result = await getOverview(novel!.id);
    expect(result.overview).toBeNull();
  });

  it('startAnalysis throws when no AI config exists', async () => {
    await db.novels.add({
      id: undefined as unknown as number,
      title: 'Novel',
      author: '',
      description: '',
      tags: [],
      fileType: 'txt',
      fileHash: 'h',
      coverPath: '',
      originalFilename: 'n.txt',
      originalEncoding: 'utf-8',
      totalWords: 100,
      createdAt: new Date().toISOString(),
    });
    const novel = await db.novels.orderBy('id').last();
    const { startAnalysis } = await import('../analysisRunner');
    await expect(startAnalysis(novel!.id)).rejects.toThrow();
  });
});
