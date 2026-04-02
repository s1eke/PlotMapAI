import { afterEach, describe, expect, it, vi } from 'vitest';

describe('readerRenderCache', () => {
  afterEach(async () => {
    vi.doUnmock('@chenglou/pretext');
    vi.useRealTimers();
    const { db } = await import('@infra/db');
    await db.delete();
    vi.resetModules();
  });

  it('builds manifest summaries without invoking pretext measurement', async () => {
    const layoutWithLines = vi.fn(() => {
      throw new Error('manifest build should not invoke layoutWithLines');
    });
    const prepareWithSegments = vi.fn(() => {
      throw new Error('manifest build should not invoke prepareWithSegments');
    });

    vi.doMock('@chenglou/pretext', () => ({
      layoutWithLines,
      prepareWithSegments,
    }));

    const {
      createReaderLayoutSignature,
      createReaderTypographyMetrics,
      getPagedContentHeight,
      resetReaderLayoutPretextCacheForTests,
    } = await import('../readerLayout');
    const { buildStaticRenderManifest } = await import('../readerRenderCache');

    const chapter = {
      index: 2,
      title: 'Chapter 3',
      content: 'First paragraph for manifest estimation.\n[IMG:cover]\nSecond paragraph after the image.',
      hasNext: true,
      hasPrev: true,
      totalChapters: 6,
      wordCount: 180,
    };
    const imageDimensionsByKey = new Map([
      ['cover', { aspectRatio: 4 / 3, height: 900, width: 1200 }],
    ]);
    const typography = createReaderTypographyMetrics(18, 1.6, 16, 420);

    const scrollManifest = buildStaticRenderManifest({
      chapter,
      imageDimensionsByKey,
      layoutSignature: createReaderLayoutSignature({
        columnCount: 1,
        columnGap: 0,
        fontSize: 18,
        lineSpacing: 1.6,
        pageHeight: 800,
        paragraphSpacing: 16,
        textWidth: 420,
      }),
      novelId: 7,
      typography,
      variantFamily: 'original-scroll',
    });

    const pagedManifest = buildStaticRenderManifest({
      chapter,
      imageDimensionsByKey,
      layoutSignature: createReaderLayoutSignature({
        columnCount: 2,
        columnGap: 32,
        fontSize: 18,
        lineSpacing: 1.6,
        pageHeight: getPagedContentHeight(800),
        paragraphSpacing: 16,
        textWidth: 280,
      }),
      novelId: 7,
      typography,
      variantFamily: 'original-paged',
    });

    expect(scrollManifest).toMatchObject({
      chapterIndex: 2,
      novelId: 7,
      storageKind: 'manifest',
      tree: null,
      variantFamily: 'original-scroll',
    });
    expect(scrollManifest.queryManifest).toEqual(expect.objectContaining({
      blockCount: 4,
      lineCount: expect.any(Number),
      totalHeight: expect.any(Number),
    }));
    expect(scrollManifest.queryManifest.startLocator).toMatchObject({
      blockIndex: 0,
      chapterIndex: 2,
      kind: 'heading',
      lineIndex: 0,
    });
    expect(scrollManifest.queryManifest.endLocator).toMatchObject({
      blockIndex: 3,
      chapterIndex: 2,
      kind: 'text',
    });

    expect(pagedManifest).toMatchObject({
      chapterIndex: 2,
      novelId: 7,
      storageKind: 'manifest',
      tree: null,
      variantFamily: 'original-paged',
    });
    expect(pagedManifest.queryManifest).toEqual(expect.objectContaining({
      blockCount: 4,
      lineCount: expect.any(Number),
      pageCount: expect.any(Number),
    }));
    expect(pagedManifest.queryManifest.pageCount).toBeGreaterThan(0);
    expect(prepareWithSegments).not.toHaveBeenCalled();
    expect(layoutWithLines).not.toHaveBeenCalled();

    resetReaderLayoutPretextCacheForTests();
  });

  it('persists an expiry timestamp and clears expired records during maintenance', async () => {
    const { db } = await import('@infra/db');
    const {
      createReaderLayoutSignature,
      createReaderTypographyMetrics,
    } = await import('../readerLayout');
    const {
      READER_RENDER_CACHE_TTL_MS,
      buildStaticRenderManifest,
      persistReaderRenderCacheEntry,
    } = await import('../readerRenderCache');

    await db.delete();
    await db.open();

    await db.readerRenderCache.add({
      novelId: 99,
      chapterIndex: 1,
      variantFamily: 'summary-shell',
      storageKind: 'manifest',
      layoutKey: 'summary-shell:stale',
      layoutSignature: {
        textWidth: 360,
        pageHeight: 720,
        columnCount: 1,
        columnGap: 0,
        fontSize: 18,
        lineSpacing: 1.6,
        paragraphSpacing: 16,
      },
      contentHash: 'stale-hash',
      tree: null,
      queryManifest: {
        blockCount: 1,
        lineCount: 1,
      },
      updatedAt: '2000-03-01T00:00:00.000Z',
      expiresAt: '2000-03-15T00:00:00.000Z',
    });

    const entry = {
      ...buildStaticRenderManifest({
        chapter: {
          index: 2,
          title: 'Fresh Chapter',
          content: 'Fresh content for the cache record.',
          hasNext: false,
          hasPrev: true,
          totalChapters: 3,
          wordCount: 120,
        },
        imageDimensionsByKey: new Map(),
        layoutSignature: createReaderLayoutSignature({
          columnCount: 1,
          columnGap: 0,
          fontSize: 18,
          lineSpacing: 1.6,
          pageHeight: 720,
          paragraphSpacing: 16,
          textWidth: 360,
        }),
        novelId: 7,
        typography: createReaderTypographyMetrics(18, 1.6, 16, 360),
        variantFamily: 'summary-shell',
      }),
      updatedAt: '2026-04-02T00:00:00.000Z',
    };

    await persistReaderRenderCacheEntry(entry);

    const persistedEntries = await db.readerRenderCache.toArray();

    expect(persistedEntries).toHaveLength(1);
    expect(persistedEntries[0]).toMatchObject({
      chapterIndex: entry.chapterIndex,
      contentHash: entry.contentHash,
      layoutKey: entry.layoutKey,
      novelId: entry.novelId,
      variantFamily: entry.variantFamily,
    });
    expect(persistedEntries[0].expiresAt).toBe(
      new Date(
        Date.parse(persistedEntries[0].updatedAt) + READER_RENDER_CACHE_TTL_MS,
      ).toISOString(),
    );
  });

  it('treats expired Dexie cache records as misses and deletes them', async () => {
    const { db } = await import('@infra/db');
    const {
      createReaderLayoutSignature,
      createReaderTypographyMetrics,
    } = await import('../readerLayout');
    const {
      buildStaticRenderManifest,
      getReaderRenderCacheRecordFromDexie,
    } = await import('../readerRenderCache');

    await db.delete();
    await db.open();

    const entry = buildStaticRenderManifest({
      chapter: {
        index: 4,
        title: 'Expired Chapter',
        content: 'Expired content.',
        hasNext: true,
        hasPrev: true,
        totalChapters: 8,
        wordCount: 88,
      },
      imageDimensionsByKey: new Map(),
      layoutSignature: createReaderLayoutSignature({
        columnCount: 1,
        columnGap: 0,
        fontSize: 18,
        lineSpacing: 1.6,
        pageHeight: 720,
        paragraphSpacing: 16,
        textWidth: 360,
      }),
      novelId: 21,
      typography: createReaderTypographyMetrics(18, 1.6, 16, 360),
      variantFamily: 'summary-shell',
    });

    await db.readerRenderCache.add({
      ...entry,
      expiresAt: '2000-03-20T00:00:00.000Z',
      updatedAt: '2000-03-06T00:00:00.000Z',
    });

    const record = await getReaderRenderCacheRecordFromDexie({
      chapterIndex: entry.chapterIndex,
      contentHash: entry.contentHash,
      layoutKey: entry.layoutKey,
      novelId: entry.novelId,
      variantFamily: entry.variantFamily,
    });

    expect(record).toBeNull();
    expect(await db.readerRenderCache.toArray()).toEqual([]);
  });
});
