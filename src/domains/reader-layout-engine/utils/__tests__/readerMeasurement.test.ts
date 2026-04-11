import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFakeReaderTextLayoutEngine } from '../../test/createFakeReaderTextLayoutEngine';
import {
  createReaderTypographyMetrics,
  createScrollImageLayoutConstraints,
  measurePagedReaderChapterLayout,
  measureScrollReaderChapterLayout,
  measureReaderChapterLayout,
  resetReaderLayoutPretextCacheForTests,
} from '../readerLayout';

describe('readerMeasurement', () => {
  afterEach(() => {
    resetReaderLayoutPretextCacheForTests();
    vi.doUnmock('@chenglou/pretext');
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('measures text, blank, and image blocks with an injected text layout engine', () => {
    const textLayoutEngine = createFakeReaderTextLayoutEngine({ maxCharsPerLine: 3 });
    const typography = createReaderTypographyMetrics(20, 1.5, 12, 320);
    const measuredLayout = measureReaderChapterLayout(
      {
        index: 0,
        title: 'TitleOne',
        plainText: 'abcdefghi\n\n[IMG:map]\njklmno',
        richBlocks: [],
        contentFormat: 'plain',
        contentVersion: 1,
        wordCount: 40,
        totalChapters: 1,
        hasPrev: false,
        hasNext: false,
      },
      240,
      typography,
      new Map([
        ['map', { width: 480, height: 240, aspectRatio: 2 }],
      ]),
      undefined,
      textLayoutEngine,
    );

    expect(measuredLayout.metrics.map((metric) => metric.block.kind)).toEqual([
      'heading',
      'text',
      'blank',
      'image',
      'text',
    ]);
    expect(measuredLayout.metrics[0]?.lines).toHaveLength(3);
    expect(measuredLayout.metrics[1]?.lines).toHaveLength(3);
    expect(measuredLayout.metrics[2]?.contentHeight).toBe(0);
    expect(measuredLayout.metrics[3]).toMatchObject({
      contentHeight: 120,
      displayHeight: 120,
      displayWidth: 240,
    });
    expect(measuredLayout.metrics[4]?.lines).toHaveLength(2);
    expect(measuredLayout.metrics[1]?.top).toBeCloseTo(
      measuredLayout.metrics[0]?.height ?? 0,
      5,
    );
    expect(measuredLayout.metrics[3]?.top).toBeCloseTo(
      (measuredLayout.metrics[0]?.height ?? 0)
        + (measuredLayout.metrics[1]?.height ?? 0)
        + (measuredLayout.metrics[2]?.height ?? 0),
      5,
    );
    expect(measuredLayout.totalHeight).toBeCloseTo(
      measuredLayout.metrics.reduce((total, metric) => total + metric.height, 0),
      5,
    );
  });

  it('caps scroll-mode image size to the viewport height while preserving aspect ratio', () => {
    const textLayoutEngine = createFakeReaderTextLayoutEngine();
    const typography = createReaderTypographyMetrics(18, 1.8, 16, 600);
    const measuredLayout = measureReaderChapterLayout(
      {
        index: 0,
        title: 'Chapter 1',
        plainText: '[IMG:tall-illustration]',
        richBlocks: [],
        contentFormat: 'plain',
        contentVersion: 1,
        wordCount: 10,
        totalChapters: 1,
        hasPrev: false,
        hasNext: false,
      },
      400,
      typography,
      new Map([
        ['tall-illustration', { width: 1200, height: 2400, aspectRatio: 0.5 }],
      ]),
      createScrollImageLayoutConstraints(400, 360),
      textLayoutEngine,
    );

    const imageMetric = measuredLayout.metrics.find((metric) => metric.block.kind === 'image');
    expect(imageMetric).toBeDefined();
    expect(imageMetric?.displayHeight).toBe(344);
    expect(imageMetric?.displayWidth).toBe(172);
  });

  it('measures rich scroll blocks including poem lines and image captions', () => {
    const textLayoutEngine = createFakeReaderTextLayoutEngine({ maxCharsPerLine: 8 });
    const typography = createReaderTypographyMetrics(18, 1.8, 16, 600);
    const measuredLayout = measureScrollReaderChapterLayout(
      {
        index: 0,
        title: 'Chapter 1',
        plainText: 'Section\nLine 1\nLine 2\nWorld map',
        richBlocks: [
          {
            type: 'heading',
            level: 2,
            children: [{
              type: 'text',
              text: 'Section',
            }],
          },
          {
            type: 'poem',
            lines: [
              [{
                type: 'text',
                text: 'Line 1',
              }],
              [{
                type: 'text',
                text: 'Line 2',
              }],
            ],
          },
          {
            type: 'image',
            key: 'map',
            caption: [{
              type: 'text',
              text: 'World map',
            }],
          },
        ],
        contentFormat: 'rich',
        contentVersion: 1,
        wordCount: 40,
        totalChapters: 1,
        hasPrev: false,
        hasNext: false,
      },
      360,
      typography,
      new Map([
        ['map', { width: 480, height: 240, aspectRatio: 2 }],
      ]),
      createScrollImageLayoutConstraints(360, 360),
      textLayoutEngine,
    );

    expect(measuredLayout.renderMode).toBe('rich');
    expect(
      measuredLayout.metrics.map((metric) => metric.block.blockIndex),
    ).toEqual([0, 1, 2, 3, 4]);
    expect(measuredLayout.metrics.map((metric) => metric.block.kind)).toEqual([
      'heading',
      'heading',
      'text',
      'text',
      'image',
    ]);
    expect(measuredLayout.metrics[2]?.block.container).toBe('poem-line');
    expect(measuredLayout.metrics[4]).toMatchObject({
      captionHeight: typography.bodyLineHeightPx * 2,
      displayHeight: 180,
      displayWidth: 360,
    });
  });

  it('measures image captions against the rendered image width for narrow assets', () => {
    const textLayoutEngine = createFakeReaderTextLayoutEngine();
    const typography = createReaderTypographyMetrics(18, 1.8, 16, 600);
    const measuredLayout = measureScrollReaderChapterLayout(
      {
        index: 0,
        title: 'Chapter 1',
        plainText: 'Signal banner stretched low across the relay hall.',
        richBlocks: [
          {
            type: 'image',
            key: 'banner',
            caption: [{
              type: 'text',
              text: 'Signal banner stretched low across the relay hall.',
            }],
          },
        ],
        contentFormat: 'rich',
        contentVersion: 1,
        wordCount: 20,
        totalChapters: 1,
        hasPrev: false,
        hasNext: false,
      },
      360,
      typography,
      new Map([
        ['banner', { width: 180, height: 90, aspectRatio: 2 }],
      ]),
      createScrollImageLayoutConstraints(360, 360),
      textLayoutEngine,
    );

    const imageMetric = measuredLayout.metrics.find((metric) => metric.block.kind === 'image');
    expect(imageMetric).toMatchObject({
      displayHeight: 90,
      displayWidth: 180,
    });
    expect(imageMetric?.captionHeight).toBe(typography.bodyLineHeightPx * 3);
  });

  it('stores rich caption line fragments for paged rich image blocks', () => {
    const textLayoutEngine = createFakeReaderTextLayoutEngine({ maxCharsPerLine: 24 });
    const typography = createReaderTypographyMetrics(18, 1.8, 16, 600);
    const measuredLayout = measurePagedReaderChapterLayout(
      {
        index: 0,
        title: 'Chapter 1',
        plainText: 'Signal 2',
        richBlocks: [
          {
            type: 'image',
            key: 'seal',
            caption: [
              {
                text: 'Signal',
                type: 'text',
              },
              {
                text: ' ',
                type: 'text',
              },
              {
                marks: ['sup'],
                text: '2',
                type: 'text',
              },
            ],
          },
        ],
        contentFormat: 'rich',
        contentVersion: 1,
        wordCount: 10,
        totalChapters: 1,
        hasPrev: false,
        hasNext: false,
      },
      320,
      typography,
      new Map([
        ['seal', { width: 320, height: 180, aspectRatio: 16 / 9 }],
      ]),
      textLayoutEngine,
    );

    const imageMetric = measuredLayout.metrics.find((metric) => metric.block.kind === 'image');
    expect(imageMetric?.captionRichLineFragments).toEqual([
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

  it('falls back to sans-serif when document.body is unavailable', () => {
    const originalBody = document.body;
    Object.defineProperty(document, 'body', {
      configurable: true,
      value: null,
    });

    try {
      const typography = createReaderTypographyMetrics(18, 1.8, 16, 600);
      expect(typography.bodyFont).toContain('sans-serif');
      expect(typography.headingFont).toContain('sans-serif');
    } finally {
      Object.defineProperty(document, 'body', {
        configurable: true,
        value: originalBody,
      });
    }
  });

  it('clamps fallback text cursors to the source text length when pretext throws', async () => {
    vi.doMock('@chenglou/pretext', () => ({
      layoutWithLines: () => {
        throw new Error('forced fallback layout');
      },
      prepareWithSegments: () => {
        throw new Error('forced fallback layout');
      },
    }));

    const {
      createReaderTypographyMetrics: createTypography,
      measureReaderChapterLayout: measureLayout,
      resetReaderLayoutPretextCacheForTests: resetCache,
    } = await import('../readerLayout');

    const typography = createTypography(16, 1.6, 16, 400);
    const measuredLayout = measureLayout({
      index: 0,
      title: 'Chapter 1',
      plainText: 'abcdefghij',
      richBlocks: [],
      contentFormat: 'plain',
      contentVersion: 1,
      wordCount: 10,
      totalChapters: 1,
      hasPrev: false,
      hasNext: false,
    }, 40, typography, new Map());

    const textMetric = measuredLayout.metrics.find((metric) => metric.block.kind === 'text');
    expect(textMetric?.lines.at(-1)?.end.graphemeIndex).toBe(10);

    resetCache();
  });

  it('keeps the pretext cache bounded with LRU eviction', async () => {
    vi.doMock('@chenglou/pretext', () => ({
      layoutWithLines: (prepared: { text: string }, maxWidth: number) => ({
        height: 24,
        lineCount: 1,
        lines: [{
          end: {
            graphemeIndex: prepared.text.length,
            segmentIndex: 0,
          },
          start: {
            graphemeIndex: 0,
            segmentIndex: 0,
          },
          text: prepared.text,
          width: maxWidth,
        }],
      }),
      prepareWithSegments: (text: string) => ({ text }),
    }));

    const {
      createReaderTypographyMetrics: createTypography,
      getReaderLayoutPretextCacheSizeForTests: getCacheSize,
      measureReaderChapterLayout: measureLayout,
      resetReaderLayoutPretextCacheForTests: resetCache,
    } = await import('../readerLayout');

    const typography = createTypography(18, 1.8, 16, 600);

    for (let index = 0; index < 320; index += 1) {
      measureLayout({
        index,
        title: 'Chapter 1',
        plainText: `Paragraph ${index} ${'alpha beta gamma '.repeat(4)}`,
        richBlocks: [],
        contentFormat: 'plain',
        contentVersion: 1,
        wordCount: 100,
        totalChapters: 320,
        hasPrev: index > 0,
        hasNext: index < 319,
      }, 420, typography, new Map());
    }

    expect(getCacheSize()).toBeLessThanOrEqual(256);

    resetCache();
  });
});
