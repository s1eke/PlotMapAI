import { afterEach, describe, expect, it, vi } from 'vitest';

describe('readerLayout fallback behavior', () => {
  afterEach(() => {
    vi.doUnmock('@chenglou/pretext');
    vi.resetModules();
  });

  it('clamps fallback text cursors to the source text length', async () => {
    vi.doMock('@chenglou/pretext', () => ({
      layoutWithLines: () => {
        throw new Error('forced fallback layout');
      },
      prepareWithSegments: () => {
        throw new Error('forced fallback layout');
      },
    }));

    const {
      createReaderTypographyMetrics,
      measureReaderChapterLayout,
      resetReaderLayoutPretextCacheForTests,
    } = await import('../readerLayout');

    const typography = createReaderTypographyMetrics(16, 1.6, 16, 400);
    const measuredLayout = measureReaderChapterLayout({
      index: 0,
      title: 'Chapter 1',
      content: 'abcdefghij',
      wordCount: 10,
      totalChapters: 1,
      hasPrev: false,
      hasNext: false,
    }, 40, typography, new Map());

    const textMetric = measuredLayout.metrics.find((metric) => metric.block.kind === 'text');
    expect(textMetric?.lines.at(-1)?.end.graphemeIndex).toBe(10);

    resetReaderLayoutPretextCacheForTests();
  });
});
