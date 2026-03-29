import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PagedReaderContent from '../PagedReaderContent';
import {
  clampDragOffset,
  getPagedDragLayerOffsets,
  shouldCommitPageTurnDrag,
} from '../../../utils/pagedDrag';

const chapterSectionSpy = vi.hoisted(() => vi.fn());
const preloadReaderImageResourcesSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalScrollWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');

vi.mock('../ReaderChapterSection', () => ({
  default: (props: unknown) => {
    chapterSectionSpy(props);
    return <div data-testid="reader-chapter-section" />;
  },
}));

vi.mock('../../../utils/readerImageResourceCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/readerImageResourceCache')>();
  return {
    ...actual,
    preloadReaderImageResources: preloadReaderImageResourcesSpy,
  };
});

describe('PagedReaderContent', () => {
  afterEach(() => {
    vi.clearAllMocks();

    if (originalClientWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidthDescriptor);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
    }

    if (originalScrollWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', originalScrollWidthDescriptor);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth');
    }
  });

  it('passes paged break rules that allow plain text paragraphs to split naturally', () => {
    render(
      <PagedReaderContent
        chapter={{
          index: 0,
          title: 'Chapter 1',
          content: 'Text',
          wordCount: 100,
          totalChapters: 1,
          hasPrev: false,
          hasNext: false,
        }}
        novelId={1}
        pageIndex={0}
        pageCount={2}
        pagedViewportRef={{ current: null }}
        pagedContentRef={{ current: null }}
        fontSize={18}
        lineSpacing={1.8}
        paragraphSpacing={24}
        readerTheme="auto"
        textClassName=""
        headerBgClassName=""
        pageBgClassName="bg-[#f4ecd8]"
        fitsTwoColumns={false}
        twoColumnWidth={undefined}
        twoColumnGap={48}
        pageTurnMode="cover"
        pageTurnDirection="next"
        pageTurnToken={1}
      />,
    );

    const forwardedProps = chapterSectionSpy.mock.calls.at(-1)?.[0];

    expect(forwardedProps).toEqual(expect.objectContaining({
      headingClassName: expect.stringContaining('break-inside-avoid'),
      imageRenderMode: 'paged',
      mixedParagraphClassName: 'break-inside-avoid',
    }));
    expect(forwardedProps).not.toHaveProperty('paragraphClassName');
    expect(forwardedProps).not.toHaveProperty('blankParagraphClassName');
  });

  it('applies an opaque page background to animated layers', () => {
    const { container } = render(
      <PagedReaderContent
        chapter={{
          index: 0,
          title: 'Chapter 1',
          content: 'Text',
          wordCount: 100,
          totalChapters: 1,
          hasPrev: false,
          hasNext: true,
        }}
        novelId={1}
        pageIndex={0}
        pageCount={2}
        pagedViewportRef={{ current: null }}
        pagedContentRef={{ current: null }}
        fontSize={18}
        lineSpacing={1.8}
        paragraphSpacing={24}
        readerTheme="auto"
        textClassName=""
        headerBgClassName=""
        pageBgClassName="bg-[#f4ecd8]"
        fitsTwoColumns={false}
        twoColumnWidth={undefined}
        twoColumnGap={48}
        pageTurnMode="cover"
        pageTurnDirection="next"
        pageTurnToken={1}
      />,
    );

    const interactiveLayer = container.querySelector('[data-testid="paged-reader-interactive"]');
    const pageFrame = interactiveLayer?.querySelector('[data-testid="paged-reader-page-frame"]');
    const pageBody = pageFrame?.querySelector('.min-h-0.flex-1.bg-\\[\\#f4ecd8\\]');

    expect(pageFrame).toBeInTheDocument();
    expect(pageBody).toBeInTheDocument();
  });

  it('renders the animated page as a full-page frame instead of only animating the text column', () => {
    const { container } = render(
      <PagedReaderContent
        chapter={{
          index: 0,
          title: 'Chapter 1',
          content: 'Text',
          wordCount: 100,
          totalChapters: 1,
          hasPrev: false,
          hasNext: true,
        }}
        novelId={1}
        pageIndex={0}
        pageCount={2}
        pagedViewportRef={{ current: null }}
        pagedContentRef={{ current: null }}
        fontSize={18}
        lineSpacing={1.8}
        paragraphSpacing={24}
        readerTheme="auto"
        textClassName="text-text-primary"
        headerBgClassName="bg-bg-primary"
        pageBgClassName="bg-[#f4ecd8]"
        fitsTwoColumns={false}
        twoColumnWidth={undefined}
        twoColumnGap={48}
        pageTurnMode="cover"
        pageTurnDirection="next"
        pageTurnToken={1}
      />,
    );

    const pageFrame = container.querySelector('[data-testid="paged-reader-interactive"] > .absolute.inset-0.overflow-hidden [data-testid="paged-reader-page-frame"]');
    expect(pageFrame).toBeInTheDocument();
    expect(pageFrame).toHaveClass('h-full', 'w-full', 'flex-col');
  });

  it('lets the paged text body inherit the global sans font stack', () => {
    render(
      <PagedReaderContent
        chapter={{
          index: 0,
          title: 'Chapter 1',
          content: 'Text',
          wordCount: 100,
          totalChapters: 1,
          hasPrev: false,
          hasNext: false,
        }}
        novelId={1}
        pageIndex={0}
        pageCount={1}
        pagedViewportRef={{ current: null }}
        pagedContentRef={{ current: null }}
        fontSize={18}
        lineSpacing={1.8}
        paragraphSpacing={24}
        readerTheme="auto"
        textClassName=""
        headerBgClassName=""
        pageBgClassName="bg-[#f4ecd8]"
        fitsTwoColumns={false}
        twoColumnWidth={undefined}
        twoColumnGap={48}
        pageTurnMode="cover"
        pageTurnDirection="next"
        pageTurnToken={1}
      />,
    );

    for (const contentBody of screen.getAllByTestId('paged-reader-content-body')) {
      expect(contentBody).not.toHaveClass('font-serif');
    }
  });

  it('clamps drag offsets to the available navigation directions', () => {
    expect(clampDragOffset(160, 120, true, false)).toBe(120);
    expect(clampDragOffset(-160, 120, false, true)).toBe(-120);
    expect(clampDragOffset(-40, 120, true, false)).toBe(0);
    expect(clampDragOffset(40, 120, false, true)).toBe(0);
  });

  it('commits a dragged page turn when distance or velocity crosses the threshold', () => {
    expect(shouldCommitPageTurnDrag(-140, 0, 600)).toBe(true);
    expect(shouldCommitPageTurnDrag(-40, 500, 600)).toBe(true);
    expect(shouldCommitPageTurnDrag(-40, 100, 600)).toBe(false);
  });

  it('matches cover drag offsets to the reveal-next and pull-prev interaction', () => {
    expect(getPagedDragLayerOffsets('cover', 'next', -180, 600)).toEqual({
      currentX: -180,
      previewX: 0,
      isPreviewOnTop: false,
    });
    expect(getPagedDragLayerOffsets('cover', 'prev', 180, 600)).toEqual({
      currentX: 0,
      previewX: -420,
      isPreviewOnTop: true,
    });
  });

  it('preloads image keys from the current and adjacent preview chapters', () => {
    render(
      <PagedReaderContent
        chapter={{
          index: 1,
          title: 'Chapter 2',
          content: 'Current [IMG:current] [IMG:shared]',
          wordCount: 100,
          totalChapters: 3,
          hasPrev: true,
          hasNext: true,
        }}
        novelId={1}
        pageIndex={0}
        pageCount={2}
        pagedViewportRef={{ current: null }}
        pagedContentRef={{ current: null }}
        fontSize={18}
        lineSpacing={1.8}
        paragraphSpacing={24}
        readerTheme="auto"
        textClassName=""
        headerBgClassName=""
        pageBgClassName="bg-[#f4ecd8]"
        fitsTwoColumns={false}
        twoColumnWidth={undefined}
        twoColumnGap={48}
        pageTurnMode="cover"
        pageTurnDirection="next"
        pageTurnToken={1}
        previousChapterPreview={{
          index: 0,
          title: 'Chapter 1',
          content: 'Prev [IMG:shared] [IMG:prev]',
          wordCount: 100,
          totalChapters: 3,
          hasPrev: false,
          hasNext: true,
        }}
        nextChapterPreview={{
          index: 2,
          title: 'Chapter 3',
          content: 'Next [IMG:next]',
          wordCount: 100,
          totalChapters: 3,
          hasPrev: true,
          hasNext: false,
        }}
      />,
    );

    expect(preloadReaderImageResourcesSpy).toHaveBeenCalledWith(1, ['current', 'shared', 'prev', 'next']);
  });
});
