import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChapterParagraph from '../ChapterParagraph';

const useReaderImageResourceMock = vi.hoisted(() => vi.fn());

vi.mock('@domains/reader-media', async (importOriginal) => ({
  ...await importOriginal<typeof import('@domains/reader-media')>(),
  useReaderImageResource: useReaderImageResourceMock,
}));

describe('ChapterParagraph', () => {
  beforeEach(() => {
    useReaderImageResourceMock.mockReset();
  });

  it('renders a pure text paragraph without a mixed-content wrapper', () => {
    const { container } = render(
      <ChapterParagraph
        text="Pure text"
        novelId={1}
        marginBottom={24}
        className="plain-paragraph"
        containerClassName="mixed-paragraph"
      />,
    );

    expect(screen.getByText('Pure text')).toHaveClass('plain-paragraph');
    expect(container.querySelector('.mixed-paragraph')).not.toBeInTheDocument();
  });

  it('keeps mixed paragraphs as intact blocks while preserving text styles', () => {
    useReaderImageResourceMock.mockReturnValue(null);

    const { container } = render(
      <ChapterParagraph
        text="Before [IMG:cover] After"
        novelId={1}
        marginBottom={24}
        className="plain-paragraph"
        containerClassName="mixed-paragraph"
      />,
    );

    const mixedContainer = container.querySelector('.mixed-paragraph');

    expect(mixedContainer).toBeInTheDocument();
    expect(mixedContainer?.querySelectorAll('p.plain-paragraph')).toHaveLength(2);
  });

  it('uses eager image loading in paged mode', () => {
    useReaderImageResourceMock.mockReturnValue('blob:image');

    const { container } = render(
      <ChapterParagraph
        text="Before [IMG:cover] After"
        novelId={1}
        marginBottom={24}
        imageRenderMode="paged"
      />,
    );

    expect(container.querySelector('img')).toHaveAttribute('loading', 'eager');
  });

  it('uses lazy image loading in scroll mode', () => {
    useReaderImageResourceMock.mockReturnValue('blob:image');

    const { container } = render(
      <ChapterParagraph
        text="Before [IMG:cover] After"
        novelId={1}
        marginBottom={24}
      />,
    );

    expect(container.querySelector('img')).toHaveAttribute('loading', 'lazy');
  });
});
