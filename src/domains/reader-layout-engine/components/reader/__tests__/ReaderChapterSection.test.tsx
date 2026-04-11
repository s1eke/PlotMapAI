import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReaderChapterSection from '../ReaderChapterSection';

const chapterParagraphSpy = vi.hoisted(() => vi.fn());

vi.mock('../../ChapterParagraph', () => ({
  default: (props: unknown) => {
    chapterParagraphSpy(props);
    return <div data-testid="chapter-paragraph" />;
  },
}));

describe('ReaderChapterSection', () => {
  beforeEach(() => {
    chapterParagraphSpy.mockClear();
  });

  it('renders the chapter heading once and skips a duplicated title paragraph', () => {
    const { container } = render(
      <ReaderChapterSection
        title="Chapter 1"
        content={'Chapter 1\n\nFirst paragraph\nSecond paragraph'}
        novelId={1}
        paragraphSpacing={24}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Chapter 1', level: 2 })).toBeInTheDocument();
    expect(screen.getAllByText('Chapter 1')).toHaveLength(1);
    expect(chapterParagraphSpy).toHaveBeenCalledTimes(2);
    expect(chapterParagraphSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({
      text: 'First paragraph',
    }));
    expect(chapterParagraphSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      text: 'Second paragraph',
    }));
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
  });

  it('forwards distinct classes for plain, mixed, and blank paragraphs', () => {
    const { container } = render(
      <ReaderChapterSection
        title="Chapter 1"
        content={'Chapter 1\n\nPlain paragraph\nBefore [IMG:cover] After'}
        novelId={1}
        paragraphSpacing={24}
        imageRenderMode="paged"
        paragraphClassName="plain-paragraph"
        mixedParagraphClassName="mixed-paragraph"
        blankParagraphClassName="blank-paragraph"
      />,
    );

    expect(container.querySelectorAll('.blank-paragraph')).toHaveLength(1);
    expect(chapterParagraphSpy).toHaveBeenCalledWith(expect.objectContaining({
      className: 'plain-paragraph',
      containerClassName: 'mixed-paragraph',
      imageRenderMode: 'paged',
    }));
  });
});
