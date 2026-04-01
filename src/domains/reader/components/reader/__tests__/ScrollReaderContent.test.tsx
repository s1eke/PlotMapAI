import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ScrollReaderContent from '../ScrollReaderContent';
import { createFakeReaderTextLayoutEngine } from '../../../test/createFakeReaderTextLayoutEngine';
import {
  createReaderTypographyMetrics,
  measureReaderChapterLayout,
} from '../../../utils/readerLayout';

const TEXT_LAYOUT_ENGINE = createFakeReaderTextLayoutEngine({ maxCharsPerLine: 28 });

function createScrollChapterLayout(content: string) {
  const chapter = {
    index: 0,
    title: 'Chapter 1',
    content,
    wordCount: 100,
    totalChapters: 1,
    hasPrev: false,
    hasNext: false,
  };
  const typography = createReaderTypographyMetrics(18, 1.8, 24, 920);
  return {
    chapter,
    layout: measureReaderChapterLayout(
      chapter,
      920,
      typography,
      new Map(),
      undefined,
      TEXT_LAYOUT_ENGINE,
    ),
  };
}

describe('ScrollReaderContent', () => {
  it('renders sticky chapter chrome plus the full static chapter tree in scroll mode', () => {
    const { chapter, layout } = createScrollChapterLayout('Text');

    render(
      <ScrollReaderContent
        chapters={[{
          index: 0,
          chapter,
          layout,
        }]}
        novelId={1}
        readerTheme="auto"
        textClassName=""
        headerBgClassName=""
        onChapterElement={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chapter 1', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.getByTestId('scroll-reader-content-body')).toBeInTheDocument();
    expect(screen.queryByTestId('paged-reader-page-frame')).not.toBeInTheDocument();
  });

  it('renders the body heading from chapter.title even when the layout heading text is stale', () => {
    const { chapter, layout } = createScrollChapterLayout('Text');
    const staleLayout = {
      ...layout,
      metrics: layout.metrics.map((metric, metricIndex) => (
        metricIndex === 0
          ? {
            ...metric,
            block: {
              ...metric.block,
              text: 'Wrong Heading',
            },
          }
          : metric
      )),
    };

    render(
      <ScrollReaderContent
        chapters={[{
          index: 0,
          chapter,
          layout: staleLayout,
        }]}
        novelId={1}
        readerTheme="auto"
        textClassName=""
        headerBgClassName=""
        onChapterElement={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Chapter 1', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wrong Heading', level: 2 })).not.toBeInTheDocument();
  });

  it('lets the scroll reader text body inherit the global sans font stack', () => {
    const { chapter, layout } = createScrollChapterLayout('Text');

    render(
      <ScrollReaderContent
        chapters={[{
          index: 0,
          chapter,
          layout,
        }]}
        novelId={1}
        readerTheme="auto"
        textClassName=""
        headerBgClassName=""
        onChapterElement={() => {}}
      />,
    );

    expect(screen.getByTestId('scroll-reader-content-body')).not.toHaveClass('font-serif');
  });

  it('allows sticky chapter titles to wrap instead of truncating long titles', () => {
    const { chapter, layout } = createScrollChapterLayout('Text');
    const longTitle = 'Chapter 1 with a very long title that should wrap instead of truncating';

    render(
      <ScrollReaderContent
        chapters={[{
          index: 0,
          chapter: {
            ...chapter,
            title: longTitle,
          },
          layout,
        }]}
        novelId={1}
        readerTheme="auto"
        textClassName=""
        headerBgClassName=""
        onChapterElement={() => {}}
      />,
    );

    const stickyTitle = screen.getByRole('heading', { name: longTitle, level: 1 });
    expect(stickyTitle).toHaveClass('break-words');
    expect(stickyTitle).toHaveClass('whitespace-normal');
    expect(stickyTitle).not.toHaveClass('truncate');
  });

  it('renders only the windowed block range when one is provided', () => {
    const { chapter, layout } = createScrollChapterLayout('First paragraph\nSecond paragraph');

    const { container } = render(
      <ScrollReaderContent
        chapters={[{
          index: 0,
          chapter,
          layout,
        }]}
        novelId={1}
        readerTheme="auto"
        textClassName=""
        headerBgClassName=""
        onChapterElement={() => {}}
        visibleBlockRangeByChapter={new Map([
          [0, { startIndex: 1, endIndex: 1 }],
        ])}
      />,
    );

    expect(screen.getByText('First paragraph')).toBeInTheDocument();
    expect(screen.queryByText('Second paragraph')).not.toBeInTheDocument();
    const fragments = container.querySelectorAll('[data-testid="reader-flow-text-fragment"]');
    expect(fragments).toHaveLength(1);
    expect(fragments[0]?.children).toHaveLength(0);
  });
});
