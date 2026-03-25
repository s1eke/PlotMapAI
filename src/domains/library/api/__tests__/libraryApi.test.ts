import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@infra/db';
import { libraryApi } from '../libraryApi';

describe('libraryApi', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
  });

  it('list returns empty array when no novels', async () => {
    const result = await libraryApi.list();
    expect(result).toEqual([]);
  });

  it('list returns novels sorted by createdAt descending', async () => {
    await db.novels.add({
      id: undefined as unknown as number,
      title: 'First', author: '', description: '', tags: [],
      fileType: 'txt', fileHash: 'h1', coverPath: '', originalFilename: 'f.txt',
      originalEncoding: 'utf-8', totalWords: 100, createdAt: '2024-01-01T00:00:00Z',
    });
    await db.novels.add({
      id: undefined as unknown as number,
      title: 'Second', author: '', description: '', tags: [],
      fileType: 'txt', fileHash: 'h2', coverPath: '', originalFilename: 's.txt',
      originalEncoding: 'utf-8', totalWords: 200, createdAt: '2024-02-01T00:00:00Z',
    });
    const result = await libraryApi.list();
    expect(result.length).toBe(2);
    expect(result[0].title).toBe('Second');
  });

  it('get returns a novel by id', async () => {
    const id = await db.novels.add({
      id: undefined as unknown as number,
      title: 'Get Test', author: 'Auth', description: 'Desc', tags: ['tag1'],
      fileType: 'txt', fileHash: 'h', coverPath: '', originalFilename: 'g.txt',
      originalEncoding: 'utf-8', totalWords: 500, createdAt: new Date().toISOString(),
    });
    const novel = await libraryApi.get(id as number);
    expect(novel.title).toBe('Get Test');
    expect(novel.tags).toEqual(['tag1']);
  });

  it('get throws for non-existent novel', async () => {
    await expect(libraryApi.get(999)).rejects.toThrow('Novel not found');
  });

  it('delete removes novel and related data', async () => {
    const id = await db.novels.add({
      id: undefined as unknown as number,
      title: 'Delete Me', author: '', description: '', tags: [],
      fileType: 'txt', fileHash: 'dh', coverPath: '', originalFilename: 'd.txt',
      originalEncoding: 'utf-8', totalWords: 100, createdAt: new Date().toISOString(),
    });
    await db.chapters.add({
      id: undefined as unknown as number,
      novelId: id as number, title: 'Ch', content: 'c', chapterIndex: 0, wordCount: 1,
    });
    await libraryApi.delete(id as number);
    const novels = await db.novels.toArray();
    expect(novels.length).toBe(0);
    const chapters = await db.chapters.toArray();
    expect(chapters.length).toBe(0);
  });

  it('getCoverUrl returns null when no cover', async () => {
    const result = await libraryApi.getCoverUrl(1);
    expect(result).toBeNull();
  });

  it('novelToApi converts tags from JSON string to array', async () => {
    await db.novels.add({
      id: undefined as unknown as number,
      title: 'Tagged', author: '', description: '', tags: ['a','b','c'],
      fileType: 'txt', fileHash: 'th', coverPath: '', originalFilename: 't.txt',
      originalEncoding: 'utf-8', totalWords: 100, createdAt: new Date().toISOString(),
    });
    const novels = await libraryApi.list();
    expect(novels[0].tags).toEqual(['a', 'b', 'c']);
  });
});
