import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../services/db';
import { readerApi, loadAndPurifyChapters } from '../reader';

describe('readerApi', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    // Seed a novel
    await db.novels.add({
      id: undefined as unknown as number,
      title: 'Reader Novel',
      author: 'Author',
      description: '',
      tags: [],
      fileType: 'txt',
      fileHash: 'rh',
      coverPath: '',
      originalFilename: 'r.txt',
      originalEncoding: 'utf-8',
      totalWords: 300,
      createdAt: new Date().toISOString(),
    });
    const novel = await db.novels.orderBy('id').last();
    const novelId = novel!.id;
    await db.chapters.bulkAdd([
      { id: undefined as unknown as number, novelId, title: 'Ch1', content: 'Content one', chapterIndex: 0, wordCount: 11 },
      { id: undefined as unknown as number, novelId, title: 'Ch2', content: 'Content two', chapterIndex: 1, wordCount: 11 },
      { id: undefined as unknown as number, novelId, title: 'Ch3', content: 'Content three', chapterIndex: 2, wordCount: 13 },
    ]);
  });

  async function getNovelId(): Promise<number> {
    const novel = await db.novels.orderBy('id').last();
    return novel!.id;
  }

  it('getChapters returns chapter list', async () => {
    const novelId = await getNovelId();
    const chapters = await readerApi.getChapters(novelId);
    expect(chapters.length).toBe(3);
    expect(chapters[0].title).toBe('Ch1');
    expect(chapters[0].index).toBe(0);
  });

  it('getChapterContent returns content with navigation info', async () => {
    const novelId = await getNovelId();
    const ch = await readerApi.getChapterContent(novelId, 1);
    expect(ch.title).toBe('Ch2');
    expect(ch.content).toBe('Content two');
    expect(ch.hasPrev).toBe(true);
    expect(ch.hasNext).toBe(true);
    expect(ch.totalChapters).toBe(3);
  });

  it('getChapterContent marks first chapter hasPrev=false', async () => {
    const novelId = await getNovelId();
    const ch = await readerApi.getChapterContent(novelId, 0);
    expect(ch.hasPrev).toBe(false);
    expect(ch.hasNext).toBe(true);
  });

  it('getChapterContent marks last chapter hasNext=false', async () => {
    const novelId = await getNovelId();
    const ch = await readerApi.getChapterContent(novelId, 2);
    expect(ch.hasPrev).toBe(true);
    expect(ch.hasNext).toBe(false);
  });

  it('getChapterContent throws for non-existent chapter', async () => {
    const novelId = await getNovelId();
    await expect(readerApi.getChapterContent(novelId, 99)).rejects.toThrow('Chapter not found');
  });

  it('getProgress returns default when no progress saved', async () => {
    const novelId = await getNovelId();
    const progress = await readerApi.getProgress(novelId);
    expect(progress.chapterIndex).toBe(0);
    expect(progress.scrollPosition).toBe(0);
    expect(progress.viewMode).toBe('original');
    expect(progress.chapterProgress).toBe(0);
    expect(progress.isTwoColumn).toBe(false);
  });

  it('saveProgress creates and updates progress', async () => {
    const novelId = await getNovelId();
    await readerApi.saveProgress(novelId, {
      chapterIndex: 2,
      scrollPosition: 500,
      viewMode: 'summary',
      chapterProgress: 0.6,
      isTwoColumn: true,
    });
    const progress = await readerApi.getProgress(novelId);
    expect(progress.chapterIndex).toBe(2);
    expect(progress.scrollPosition).toBe(500);
    expect(progress.viewMode).toBe('summary');
    expect(progress.chapterProgress).toBe(0.6);
    expect(progress.isTwoColumn).toBe(true);
  });

  it('saveProgress updates existing progress', async () => {
    const novelId = await getNovelId();
    await readerApi.saveProgress(novelId, { chapterIndex: 1 });
    await readerApi.saveProgress(novelId, { chapterIndex: 2, scrollPosition: 100, chapterProgress: 0.25 });
    const progress = await readerApi.getProgress(novelId);
    expect(progress.chapterIndex).toBe(2);
    expect(progress.scrollPosition).toBe(100);
    expect(progress.chapterProgress).toBe(0.25);
  });

  it('getImageUrl returns null for non-existent image', async () => {
    const novelId = await getNovelId();
    const result = await readerApi.getImageUrl(novelId, 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('loadAndPurifyChapters', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.novels.add({
      id: undefined as unknown as number,
      title: 'Purify Novel',
      author: '', description: '', tags: [],
      fileType: 'txt', fileHash: 'ph', coverPath: '', originalFilename: 'p.txt',
      originalEncoding: 'utf-8', totalWords: 100, createdAt: new Date().toISOString(),
    });
    const novel = await db.novels.orderBy('id').last();
    await db.chapters.add({
      id: undefined as unknown as number,
      novelId: novel!.id, title: 'Chapter One', content: 'Hello world', chapterIndex: 0, wordCount: 11,
    });
  });

  it('returns raw chapters when no purification rules', async () => {
    const novel = await db.novels.orderBy('id').last();
    const chapters = await loadAndPurifyChapters(novel!.id);
    expect(chapters.length).toBe(1);
    expect(chapters[0].title).toBe('Chapter One');
    expect(chapters[0].content).toBe('Hello world');
  });

  it('applies purification rules when enabled', async () => {
    await db.purificationRules.add({
      id: undefined as unknown as number,
      externalId: null,
      name: 'Replace Hello',
      group: 'test',
      pattern: 'Hello',
      replacement: 'Hi',
      isRegex: false,
      isEnabled: true,
      order: 10,
      scopeTitle: true,
      scopeContent: true,
      bookScope: '',
      excludeBookScope: '',
      timeoutMs: 3000,
      createdAt: new Date().toISOString(),
    });
    const novel = await db.novels.orderBy('id').last();
    const chapters = await loadAndPurifyChapters(novel!.id);
    expect(chapters[0].content).toBe('Hi world');
  });

  it('does not apply disabled rules', async () => {
    await db.purificationRules.add({
      id: undefined as unknown as number,
      externalId: null,
      name: 'Disabled Rule',
      group: 'test',
      pattern: 'Hello',
      replacement: 'REPLACED',
      isRegex: false,
      isEnabled: false,
      order: 10,
      scopeTitle: true,
      scopeContent: true,
      bookScope: '',
      excludeBookScope: '',
      timeoutMs: 3000,
      createdAt: new Date().toISOString(),
    });
    const novel = await db.novels.orderBy('id').last();
    const chapters = await loadAndPurifyChapters(novel!.id);
    expect(chapters[0].content).toBe('Hello world');
  });
});
