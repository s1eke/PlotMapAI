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
    } = await import('../../layout/readerLayout');
    const { buildStaticRenderManifest } = await import('../readerRenderCache');

    const chapter = {
      index: 2,
      title: 'Chapter 3',
      plainText: 'First paragraph for manifest estimation.\n[IMG:cover]\nSecond paragraph after the image.',
      richBlocks: [],
      contentFormat: 'plain' as const,
      contentVersion: 1,
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
    } = await import('../../layout/readerLayout');
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
          plainText: 'Fresh content for the cache record.',
          richBlocks: [],
          contentFormat: 'plain',
          contentVersion: 1,
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
    } = await import('../../layout/readerLayout');
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
        plainText: 'Expired content.',
        richBlocks: [],
        contentFormat: 'plain',
        contentVersion: 1,
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

  it('round-trips paged rich inline fragments through Dexie render cache entries', async () => {
    const { db } = await import('@infra/db');
    const {
      createReaderLayoutSignature,
      createReaderTypographyMetrics,
      getPagedContentHeight,
    } = await import('../../layout/readerLayout');
    const {
      buildStaticRenderTree,
      coercePagedTree,
      getReaderRenderCacheEntryFromDexie,
      persistReaderRenderCacheEntry,
    } = await import('../readerRenderCache');

    await db.delete();
    await db.open();

    const chapter = {
      index: 3,
      title: 'Styled Chapter',
      plainText: 'Bold italic Link',
      richBlocks: [{
        type: 'paragraph' as const,
        children: [
          {
            marks: ['bold'] as const,
            text: 'Bold',
            type: 'text' as const,
          },
          {
            text: ' ',
            type: 'text' as const,
          },
          {
            marks: ['italic'] as const,
            text: 'italic',
            type: 'text' as const,
          },
          {
            text: ' ',
            type: 'text' as const,
          },
          {
            children: [{
              text: 'Link',
              type: 'text' as const,
            }],
            href: '#anchor',
            type: 'link' as const,
          },
        ],
      }],
      contentFormat: 'rich' as const,
      contentVersion: 1,
      hasNext: true,
      hasPrev: true,
      totalChapters: 6,
      wordCount: 120,
    };
    const layoutSignature = createReaderLayoutSignature({
      columnCount: 1,
      columnGap: 0,
      fontSize: 18,
      lineSpacing: 1.6,
      pageHeight: getPagedContentHeight(720),
      paragraphSpacing: 16,
      textWidth: 320,
    });
    const entry = buildStaticRenderTree({
      chapter,
      imageDimensionsByKey: new Map(),
      layoutSignature,
      novelId: 42,
      typography: createReaderTypographyMetrics(18, 1.6, 16, 320),
      variantFamily: 'original-paged',
    });

    await persistReaderRenderCacheEntry(entry);

    const hydratedEntry = await getReaderRenderCacheEntryFromDexie({
      chapterIndex: entry.chapterIndex,
      contentHash: entry.contentHash,
      contentFormat: entry.contentFormat,
      contentVersion: entry.contentVersion,
      layoutFeatureSet: entry.layoutFeatureSet,
      layoutKey: entry.layoutKey,
      novelId: entry.novelId,
      rendererVersion: entry.rendererVersion,
      variantFamily: entry.variantFamily,
    });
    const pagedTree = coercePagedTree(hydratedEntry);
    const pageItem = pagedTree?.pageSlices
      .flatMap((page) => page.columns.flatMap((column) => column.items))
      .find((item) => item.kind === 'text' && item.renderRole === 'rich-text');

    expect(pageItem && 'richLineFragments' in pageItem ? pageItem.richLineFragments : undefined).toEqual([
      [
        {
          marks: ['bold'],
          text: 'Bold',
          type: 'text',
        },
        {
          text: ' ',
          type: 'text',
        },
        {
          marks: ['italic'],
          text: 'italic',
          type: 'text',
        },
        {
          text: ' ',
          type: 'text',
        },
        {
          children: [{
            text: 'Link',
            type: 'text',
          }],
          href: '#anchor',
          type: 'link',
        },
      ],
    ]);
  });

  it('round-trips paged rich image caption fragments through Dexie render cache entries', async () => {
    vi.doMock('@chenglou/pretext', () => {
      const prepareWithSegments = (text: string) => {
        const segments = text.split(/( )/).filter((segment) => segment.length > 0);
        return {
          breakablePrefixWidths: segments.map((segment) => (segment === ' ' ? null : Array.from({
            length: segment.length,
          }, (_, index) => (index + 1) * 8))),
          breakableWidths: segments.map((segment) => (segment === ' '
            ? null
            : Array.from({ length: segment.length }, () => 8))),
          chunks: [{
            consumedEndSegmentIndex: segments.length,
            endSegmentIndex: segments.length,
            startSegmentIndex: 0,
          }],
          discretionaryHyphenWidth: 0,
          kinds: segments.map((segment) => (segment === ' ' ? 'space' : 'text')),
          lineEndFitAdvances: segments.map((segment) => (segment === ' ' ? 0 : segment.length * 8)),
          lineEndPaintAdvances: segments.map((segment) => (segment === ' ' ? 0 : segment.length * 8)),
          segLevels: null,
          segments,
          simpleLineWalkFastPath: false,
          tabStopAdvance: 0,
          widths: segments.map((segment) => (segment === ' ' ? 4 : segment.length * 8)),
        };
      };

      return {
        layoutNextLine: (prepared: ReturnType<typeof prepareWithSegments>) => ({
          end: {
            graphemeIndex: 0,
            segmentIndex: prepared.segments.length,
          },
          start: {
            graphemeIndex: 0,
            segmentIndex: 0,
          },
          text: prepared.segments.join(''),
          width: prepared.widths.reduce((total, width) => total + width, 0),
        }),
        layoutWithLines: (
          prepared: ReturnType<typeof prepareWithSegments>,
          _maxWidth: number,
          lineHeight: number,
        ) => ({
          height: lineHeight,
          lineCount: 1,
          lines: [{
            end: {
              graphemeIndex: 0,
              segmentIndex: prepared.segments.length,
            },
            start: {
              graphemeIndex: 0,
              segmentIndex: 0,
            },
            text: prepared.segments.join(''),
            width: prepared.widths.reduce((total, width) => total + width, 0),
          }],
        }),
        prepareWithSegments,
      };
    });

    const { db } = await import('@infra/db');
    const {
      createReaderLayoutSignature,
      createReaderTypographyMetrics,
      getPagedContentHeight,
    } = await import('../../layout/readerLayout');
    const {
      buildStaticRenderTree,
      coercePagedTree,
      getReaderRenderCacheEntryFromDexie,
      persistReaderRenderCacheEntry,
    } = await import('../readerRenderCache');

    await db.delete();
    await db.open();

    const chapter = {
      index: 4,
      title: 'Captioned Chapter',
      plainText: 'Signal 2',
      richBlocks: [{
        type: 'image' as const,
        key: 'seal',
        caption: [
          {
            text: 'Signal',
            type: 'text' as const,
          },
          {
            text: ' ',
            type: 'text' as const,
          },
          {
            marks: ['sup'] as const,
            text: '2',
            type: 'text' as const,
          },
        ],
      }],
      contentFormat: 'rich' as const,
      contentVersion: 1,
      hasNext: true,
      hasPrev: true,
      totalChapters: 6,
      wordCount: 40,
    };
    const layoutSignature = createReaderLayoutSignature({
      columnCount: 1,
      columnGap: 0,
      fontSize: 18,
      lineSpacing: 1.6,
      pageHeight: getPagedContentHeight(720),
      paragraphSpacing: 16,
      textWidth: 320,
    });
    const entry = buildStaticRenderTree({
      chapter,
      imageDimensionsByKey: new Map([
        ['seal', { aspectRatio: 16 / 9, height: 180, width: 320 }],
      ]),
      layoutSignature,
      novelId: 42,
      typography: createReaderTypographyMetrics(18, 1.6, 16, 320),
      variantFamily: 'original-paged',
    });

    await persistReaderRenderCacheEntry(entry);

    const hydratedEntry = await getReaderRenderCacheEntryFromDexie({
      chapterIndex: entry.chapterIndex,
      contentHash: entry.contentHash,
      contentFormat: entry.contentFormat,
      contentVersion: entry.contentVersion,
      layoutFeatureSet: entry.layoutFeatureSet,
      layoutKey: entry.layoutKey,
      novelId: entry.novelId,
      rendererVersion: entry.rendererVersion,
      variantFamily: entry.variantFamily,
    });
    const pagedTree = coercePagedTree(hydratedEntry);
    const imageItem = pagedTree?.pageSlices
      .flatMap((page) => page.columns.flatMap((column) => column.items))
      .find((item) => item.kind === 'image');

    expect(imageItem && 'captionRichLineFragments' in imageItem ? imageItem.captionRichLineFragments : undefined).toEqual([
      [
        {
          text: 'Signal ',
          type: 'text',
        },
        {
          marks: ['sup'],
          text: '2',
          type: 'text',
        },
      ],
    ]);
  });

  it('treats paged render cache entries from older renderer versions as misses', async () => {
    const { db } = await import('@infra/db');
    const {
      createReaderLayoutSignature,
      createReaderTypographyMetrics,
      getPagedContentHeight,
    } = await import('../../layout/readerLayout');
    const {
      READER_RENDERER_VERSION,
      buildStaticRenderTree,
      getReaderRenderCacheRecordFromDexie,
    } = await import('../readerRenderCache');

    await db.delete();
    await db.open();

    const chapter = {
      index: 5,
      title: 'Cache Version Probe',
      plainText: 'Stale paged cache should miss.',
      richBlocks: [],
      contentFormat: 'plain' as const,
      contentVersion: 1,
      hasNext: false,
      hasPrev: true,
      totalChapters: 6,
      wordCount: 60,
    };
    const layoutSignature = createReaderLayoutSignature({
      columnCount: 1,
      columnGap: 0,
      fontSize: 18,
      lineSpacing: 1.6,
      pageHeight: getPagedContentHeight(720),
      paragraphSpacing: 16,
      textWidth: 320,
    });
    const entry = buildStaticRenderTree({
      chapter,
      imageDimensionsByKey: new Map(),
      layoutSignature,
      novelId: 55,
      typography: createReaderTypographyMetrics(18, 1.6, 16, 320),
      variantFamily: 'original-paged',
    });

    await db.readerRenderCache.add({
      ...entry,
      expiresAt: '2026-04-21T00:00:00.000Z',
      rendererVersion: READER_RENDERER_VERSION - 1,
      updatedAt: '2026-04-07T00:00:00.000Z',
    });

    const record = await getReaderRenderCacheRecordFromDexie({
      chapterIndex: entry.chapterIndex,
      contentHash: entry.contentHash,
      contentFormat: entry.contentFormat,
      contentVersion: entry.contentVersion,
      layoutFeatureSet: entry.layoutFeatureSet,
      layoutKey: entry.layoutKey,
      novelId: entry.novelId,
      rendererVersion: entry.rendererVersion,
      variantFamily: entry.variantFamily,
    });

    expect(record).toBeNull();
  });

  it('prunes the oldest persisted cache entries when the global cap is exceeded', async () => {
    const { db } = await import('@infra/db');
    const {
      READER_RENDER_CACHE_PERSISTED_LIMIT,
      buildStaticRenderManifest,
      persistReaderRenderCacheEntry,
    } = await import('../readerRenderCache');
    const {
      createReaderLayoutSignature,
      createReaderTypographyMetrics,
    } = await import('../../layout/readerLayout');

    await db.delete();
    await db.open();

    const layoutSignature = createReaderLayoutSignature({
      columnCount: 1,
      columnGap: 0,
      fontSize: 18,
      lineSpacing: 1.6,
      pageHeight: 720,
      paragraphSpacing: 16,
      textWidth: 360,
    });
    const typography = createReaderTypographyMetrics(18, 1.6, 16, 360);

    for (let index = 0; index < READER_RENDER_CACHE_PERSISTED_LIMIT + 2; index += 1) {
      const entry = buildStaticRenderManifest({
        chapter: {
          index,
          title: `Chapter ${index + 1}`,
          plainText: `Content ${index + 1}`,
          richBlocks: [],
          contentFormat: 'plain',
          contentVersion: 1,
          hasNext: true,
          hasPrev: index > 0,
          totalChapters: READER_RENDER_CACHE_PERSISTED_LIMIT + 2,
          wordCount: 80,
        },
        imageDimensionsByKey: new Map(),
        layoutSignature,
        novelId: 77,
        typography,
        variantFamily: 'summary-shell',
      });

      await persistReaderRenderCacheEntry({
        ...entry,
        updatedAt: new Date(Date.UTC(2026, 3, 1, 0, index, 0)).toISOString(),
      });
    }

    const persistedEntries = await db.readerRenderCache.orderBy('updatedAt').toArray();

    expect(persistedEntries).toHaveLength(READER_RENDER_CACHE_PERSISTED_LIMIT);
    expect(persistedEntries[0]).toMatchObject({
      chapterIndex: 2,
      novelId: 77,
    });
    expect(persistedEntries.at(-1)).toMatchObject({
      chapterIndex: READER_RENDER_CACHE_PERSISTED_LIMIT + 1,
      novelId: 77,
    });
  });
});
