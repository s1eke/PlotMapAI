import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ScrollReaderContent from '../ScrollReaderContent';
import {
  createReaderTypographyMetrics,
  measureReaderChapterLayout,
} from '../../../utils/readerLayout';

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
    layout: measureReaderChapterLayout(chapter, 920, typography, new Map()),
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

  it('renders only the windowed block range when one is provided', () => {
    const { chapter, layout } = createScrollChapterLayout('First paragraph\nSecond paragraph');

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
        visibleBlockRangeByChapter={new Map([
          [0, { startIndex: 1, endIndex: 1 }],
        ])}
      />,
    );

    expect(screen.getByText('First paragraph')).toBeInTheDocument();
    expect(screen.queryByText('Second paragraph')).not.toBeInTheDocument();
  });
});
