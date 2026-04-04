import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@infra/db';

describe('db', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('opens successfully', () => {
    expect(db.name).toBe('PlotMapAI');
  });

  it('registers all current tables in the schema', () => {
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'analysisChunks',
      'analysisJobs',
      'analysisOverviews',
      'appSettings',
      'chapterAnalyses',
      'chapterImages',
      'chapterRichContents',
      'chapters',
      'coverImages',
      'novelImageGalleryEntries',
      'novels',
      'purificationRules',
      'readerRenderCache',
      'readingProgress',
      'tocRules',
    ]);
  });

  it('can add and retrieve a novel', async () => {
    const id = await db.novels.add({
      title: 'Test Novel',
      author: 'Author',
      description: 'Desc',
      tags: [],
      fileType: 'txt',
      fileHash: 'abc123',
      coverPath: '',
      originalFilename: 'test.txt',
      originalEncoding: 'utf-8',
      totalWords: 1000,
      chapterCount: 0,
      createdAt: new Date().toISOString(),
    });
    const novel = await db.novels.get(id);
    expect(novel).toBeDefined();
    expect(novel!.title).toBe('Test Novel');
  });

  it('can add and retrieve chapters', async () => {
    const novelId = await db.novels.add({
      title: 'Novel',
      author: '',
      description: '',
      tags: [],
      fileType: 'txt',
      fileHash: 'hash',
      coverPath: '',
      originalFilename: 'n.txt',
      originalEncoding: 'utf-8',
      totalWords: 100,
      chapterCount: 0,
      createdAt: new Date().toISOString(),
    });
    await db.chapters.add({
      novelId: novelId as number,
      title: 'Chapter 1',
      content: 'Content',
      chapterIndex: 0,
      wordCount: 100,
    });
    const chapters = await db.chapters.where('novelId').equals(novelId).toArray();
    expect(chapters.length).toBe(1);
    expect(chapters[0].title).toBe('Chapter 1');
  });

  it('can add and retrieve chapter rich contents', async () => {
    await db.chapterRichContents.add({
      novelId: 1,
      chapterIndex: 0,
      contentRich: [
        {
          type: 'paragraph',
          children: [{
            type: 'text',
            text: 'Rich content',
          }],
        },
      ],
      contentPlain: 'Rich content',
      contentFormat: 'rich',
      contentVersion: 1,
      importFormatVersion: 1,
      updatedAt: new Date().toISOString(),
    });

    const richContent = await db.chapterRichContents
      .where('[novelId+chapterIndex]')
      .equals([1, 0])
      .first();

    expect(richContent).toBeDefined();
    expect(richContent?.contentFormat).toBe('rich');
    expect(richContent?.contentRich).toEqual([
      {
        type: 'paragraph',
        children: [{
          type: 'text',
          text: 'Rich content',
        }],
      },
    ]);
  });

  it('can add and retrieve purification rules', async () => {
    await db.purificationRules.add({
      externalId: null,
      name: 'Test Rule',
      group: 'default',
      pattern: 'foo',
      replacement: 'bar',
      isRegex: false,
      isEnabled: true,
      order: 10,
      targetScope: 'all',
      executionStage: 'post-ast',
      ruleVersion: 2,
      bookScope: '',
      excludeBookScope: '',
      exclusiveGroup: '',
      isDefault: false,
      timeoutMs: 3000,
      createdAt: new Date().toISOString(),
    });
    const rules = await db.purificationRules.toArray();
    expect(rules.length).toBe(1);
    expect(rules[0].pattern).toBe('foo');
  });

  it('can add and retrieve novel image gallery entries', async () => {
    await db.novelImageGalleryEntries.add({
      novelId: 1,
      chapterIndex: 0,
      blockIndex: 2,
      imageKey: 'cover',
      order: 0,
    });

    const entries = await db.novelImageGalleryEntries.where('novelId').equals(1).toArray();

    expect(entries).toHaveLength(1);
    expect(entries[0].imageKey).toBe('cover');
  });

  it('can add and retrieve reading progress', async () => {
    await db.readingProgress.add({
      novelId: 1,
      chapterIndex: 5,
      mode: 'summary',
      chapterProgress: 0.5,
      updatedAt: new Date().toISOString(),
    });
    const progress = await db.readingProgress.where('novelId').equals(1).first();
    expect(progress).toBeDefined();
    expect(progress!.chapterIndex).toBe(5);
    expect(progress!.mode).toBe('summary');
  });

  it('can add analysis jobs', async () => {
    await db.analysisJobs.add({
      novelId: 1,
      status: 'idle',
      totalChapters: 10,
      analyzedChapters: 0,
      totalChunks: 3,
      completedChunks: 0,
      currentChunkIndex: 0,
      pauseRequested: false,
      lastError: '',
      startedAt: null,
      completedAt: null,
      lastHeartbeat: null,
      updatedAt: new Date().toISOString(),
    });
    const jobs = await db.analysisJobs.toArray();
    expect(jobs.length).toBe(1);
    expect(jobs[0].status).toBe('idle');
  });
});
