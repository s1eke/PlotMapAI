import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ScrollReaderContent from '../ScrollReaderContent';

const chapterSectionSpy = vi.hoisted(() => vi.fn());

vi.mock('../ReaderChapterSection', () => ({
  default: (props: unknown) => {
    chapterSectionSpy(props);
    return <div data-testid="reader-chapter-section" />;
  },
}));

describe('ScrollReaderContent', () => {
  beforeEach(() => {
    chapterSectionSpy.mockClear();
  });

  it('keeps scroll mode paragraph rendering free of paged-only break rules', () => {
    render(
      <ScrollReaderContent
        chapters={[{
          index: 0,
          chapter: {
            index: 0,
            title: 'Chapter 1',
            content: 'Text',
            wordCount: 100,
            totalChapters: 1,
            hasPrev: false,
            hasNext: false,
          },
        }]}
        novelId={1}
        fontSize={18}
        lineSpacing={1.8}
        paragraphSpacing={24}
        readerTheme="auto"
        textClassName=""
        headerBgClassName=""
        onChapterElement={() => {}}
      />,
    );

    const forwardedProps = chapterSectionSpy.mock.calls.at(-1)?.[0];

    expect(forwardedProps).toEqual(expect.objectContaining({
      headingClassName: expect.not.stringContaining('break-inside-avoid'),
      imageRenderMode: 'scroll',
    }));
    expect(forwardedProps).not.toHaveProperty('paragraphClassName');
    expect(forwardedProps).not.toHaveProperty('mixedParagraphClassName');
    expect(forwardedProps).not.toHaveProperty('blankParagraphClassName');
  });

  it('lets the scroll reader text body inherit the global sans font stack', () => {
    render(
      <ScrollReaderContent
        chapters={[{
          index: 0,
          chapter: {
            index: 0,
            title: 'Chapter 1',
            content: 'Text',
            wordCount: 100,
            totalChapters: 1,
            hasPrev: false,
            hasNext: false,
          },
        }]}
        novelId={1}
        fontSize={18}
        lineSpacing={1.8}
        paragraphSpacing={24}
        readerTheme="auto"
        textClassName=""
        headerBgClassName=""
        onChapterElement={() => {}}
      />,
    );

    expect(screen.getByTestId('scroll-reader-content-body')).not.toHaveClass('font-serif');
  });
});
