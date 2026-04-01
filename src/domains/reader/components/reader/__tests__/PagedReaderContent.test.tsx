import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PagedReaderContent from '../PagedReaderContent';
import { createFakeReaderTextLayoutEngine } from '../../../test/createFakeReaderTextLayoutEngine';
import {
  composePaginatedChapterLayout,
  createReaderTypographyMetrics,
  createReaderViewportMetrics,
  findPageIndexForLocator,
  getPagedContentHeight,
  measureReaderChapterLayout,
} from '../../../utils/readerLayout';
import {
  clampDragOffset,
  getPagedDragLayerOffsets,
  shouldCommitPageTurnDrag,
} from '../../../utils/pagedDrag';

const preloadReaderImageResourcesSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const TEXT_LAYOUT_ENGINE = createFakeReaderTextLayoutEngine({ maxCharsPerLine: 22 });

vi.mock('../../../utils/readerImageResourceCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/readerImageResourceCache')>();
  return {
    ...actual,
    preloadReaderImageResources: preloadReaderImageResourcesSpy,
  };
});

function renderPagedContent(
  overrides: Partial<React.ComponentProps<typeof PagedReaderContent>> = {},
) {
  const chapter = overrides.chapter ?? {
    index: 0,
    title: 'Chapter 1',
    content: 'Text',
    wordCount: 100,
    totalChapters: 1,
    hasPrev: false,
    hasNext: false,
  };
  const viewportMetrics = createReaderViewportMetrics(720, 1200, 720, 1200, 18);
  const typography = createReaderTypographyMetrics(18, 1.8, 24, viewportMetrics.pagedViewportWidth);
  const measuredLayout = measureReaderChapterLayout(
    chapter,
    viewportMetrics.pagedColumnWidth,
    typography,
    new Map(),
    undefined,
    TEXT_LAYOUT_ENGINE,
  );
  const defaultLayout = composePaginatedChapterLayout(
    measuredLayout,
    getPagedContentHeight(viewportMetrics.pagedViewportHeight),
    viewportMetrics.pagedColumnCount,
    viewportMetrics.pagedColumnGap,
  );

  return render(
    <PagedReaderContent
      chapter={chapter}
      currentLayout={overrides.currentLayout ?? defaultLayout}
      novelId={1}
      pageIndex={0}
      pagedViewportRef={{ current: null }}
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
      {...overrides}
    />,
  );
}

function buildMultiPageLayout() {
  const chapter = {
    index: 0,
    title: 'Chapter 1',
    content: Array.from(
      { length: 14 },
      (_, paragraphIndex) => `Paragraph ${paragraphIndex + 1} ${'alpha beta gamma delta epsilon '.repeat(8)}`,
    ).join('\n'),
    wordCount: 1600,
    totalChapters: 1,
    hasPrev: false,
    hasNext: false,
  };
  const viewportMetrics = createReaderViewportMetrics(720, 1200, 720, 1200, 18);
  const typography = createReaderTypographyMetrics(18, 1.8, 24, viewportMetrics.pagedViewportWidth);
  const measuredLayout = measureReaderChapterLayout(
    chapter,
    viewportMetrics.pagedColumnWidth,
    typography,
    new Map(),
    undefined,
    TEXT_LAYOUT_ENGINE,
  );
  const currentLayout = composePaginatedChapterLayout(
    measuredLayout,
    getPagedContentHeight(viewportMetrics.pagedViewportHeight),
    viewportMetrics.pagedColumnCount,
    viewportMetrics.pagedColumnGap,
  );

  if (currentLayout.pageSlices.length < 2) {
    throw new Error('Expected test layout to span multiple pages');
  }

  return {
    chapter,
    currentLayout,
  };
}

function buildPagedLayoutForTypography(
  chapter: {
    content: string;
    hasNext: boolean;
    hasPrev: boolean;
    index: number;
    title: string;
    totalChapters: number;
    wordCount: number;
  },
  typographyOptions: {
    fontSize: number;
    lineSpacing: number;
    paragraphSpacing: number;
  },
) {
  const viewportMetrics = createReaderViewportMetrics(
    720,
    1200,
    720,
    1200,
    typographyOptions.fontSize,
  );
  const typography = createReaderTypographyMetrics(
    typographyOptions.fontSize,
    typographyOptions.lineSpacing,
    typographyOptions.paragraphSpacing,
    viewportMetrics.pagedViewportWidth,
  );
  const measuredLayout = measureReaderChapterLayout(
    chapter,
    viewportMetrics.pagedColumnWidth,
    typography,
    new Map(),
    undefined,
    TEXT_LAYOUT_ENGINE,
  );

  return composePaginatedChapterLayout(
    measuredLayout,
    getPagedContentHeight(viewportMetrics.pagedViewportHeight),
    viewportMetrics.pagedColumnCount,
    viewportMetrics.pagedColumnGap,
  );
}

describe('PagedReaderContent', () => {
  const originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const originalClientHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

  afterEach(() => {
    vi.clearAllMocks();
    if (originalClientWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidthDescriptor);
    }
    if (originalClientHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeightDescriptor);
    }
  });

  it('renders paged text blocks inside the page frame', () => {
    renderPagedContent();

    expect(screen.getByTestId('paged-reader-page-frame')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chapter 1', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
  });

  it('renders the body heading from chapter.title even when the page item heading text is stale', () => {
    const chapter = {
      index: 0,
      title: 'Chapter 1',
      content: 'Text',
      wordCount: 100,
      totalChapters: 1,
      hasPrev: false,
      hasNext: false,
    };
    const viewportMetrics = createReaderViewportMetrics(720, 1200, 720, 1200, 18);
    const typography = createReaderTypographyMetrics(
      18,
      1.8,
      24,
      viewportMetrics.pagedViewportWidth,
    );
    const measuredLayout = measureReaderChapterLayout(
      chapter,
      viewportMetrics.pagedColumnWidth,
      typography,
      new Map(),
      undefined,
      TEXT_LAYOUT_ENGINE,
    );
    const currentLayout = composePaginatedChapterLayout(
      measuredLayout,
      getPagedContentHeight(viewportMetrics.pagedViewportHeight),
      viewportMetrics.pagedColumnCount,
      viewportMetrics.pagedColumnGap,
    );
    const staleLayout = {
      ...currentLayout,
      pageSlices: currentLayout.pageSlices.map((pageSlice) => ({
        ...pageSlice,
        columns: pageSlice.columns.map((column) => ({
          ...column,
          items: column.items.map((item) => (
            item.kind === 'heading'
              ? {
                ...item,
                text: 'Wrong Heading',
              }
              : item
          )),
        })),
      })),
    };

    renderPagedContent({
      chapter,
      currentLayout: staleLayout,
    });

    expect(screen.getByRole('heading', { name: 'Chapter 1', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wrong Heading', level: 2 })).not.toBeInTheDocument();
  });

  it('applies an opaque page background to animated layers', () => {
    const { container } = renderPagedContent({
      chapter: {
        index: 0,
        title: 'Chapter 1',
        content: 'Text',
        wordCount: 100,
        totalChapters: 1,
        hasPrev: false,
        hasNext: true,
      },
    });

    const interactiveLayer = container.querySelector('[data-testid="paged-reader-interactive"]');
    const pageFrame = interactiveLayer?.querySelector('[data-testid="paged-reader-page-frame"]');
    const pageBody = pageFrame?.querySelector('.min-h-0.flex-1.bg-\\[\\#f4ecd8\\]');

    expect(pageFrame).toBeInTheDocument();
    expect(pageBody).toBeInTheDocument();
  });

  it('renders the animated page as a full-page frame instead of only animating the text column', () => {
    const { container } = renderPagedContent({
      chapter: {
        index: 0,
        title: 'Chapter 1',
        content: 'Text',
        wordCount: 100,
        totalChapters: 1,
        hasPrev: false,
        hasNext: true,
      },
      textClassName: 'text-text-primary',
      headerBgClassName: 'bg-bg-primary',
    });

    const pageFrame = container.querySelector('[data-testid="paged-reader-interactive"] > .absolute.inset-0.overflow-hidden [data-testid="paged-reader-page-frame"]');
    expect(pageFrame).toBeInTheDocument();
    expect(pageFrame).toHaveClass('h-full', 'w-full', 'flex-col');
  });

  it('lets the paged text body inherit the global sans font stack', () => {
    renderPagedContent();

    for (const contentBody of screen.getAllByTestId('paged-reader-content-body')) {
      expect(contentBody).not.toHaveClass('font-serif');
    }
  });

  it('renders the provided single-column static layout without recomposing it in the component', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 720,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 1200,
    });

    const chapter = {
      index: 0,
      title: 'Chapter 1',
      content: Array.from(
        { length: 12 },
        (_, paragraphIndex) => `Paragraph ${paragraphIndex + 1} ${'alpha beta gamma delta epsilon '.repeat(6)}`,
      ).join('\n'),
      wordCount: 1200,
      totalChapters: 1,
      hasPrev: false,
      hasNext: false,
    };
    const viewportMetrics = createReaderViewportMetrics(720, 1200, 720, 1200, 18);
    const typography = createReaderTypographyMetrics(
      18,
      1.8,
      24,
      viewportMetrics.pagedViewportWidth,
    );
    const measuredLayout = measureReaderChapterLayout(
      chapter,
      viewportMetrics.pagedColumnWidth,
      typography,
      new Map(),
      undefined,
      TEXT_LAYOUT_ENGINE,
    );
    const currentLayout = composePaginatedChapterLayout(
      measuredLayout,
      getPagedContentHeight(viewportMetrics.pagedViewportHeight),
      viewportMetrics.pagedColumnCount,
      viewportMetrics.pagedColumnGap,
    );

    renderPagedContent({
      chapter,
      currentLayout,
    });

    const contentBody = screen.getByTestId('paged-reader-content-body');
    expect(contentBody.children).toHaveLength(currentLayout.columnCount);
  });

  it('renders the visible page count from the current layout', () => {
    const { chapter, currentLayout } = buildMultiPageLayout();

    renderPagedContent({
      chapter,
      currentLayout,
      pageIndex: 0,
    });

    expect(screen.getByText(`1 / ${currentLayout.pageSlices.length}`)).toBeInTheDocument();
  });

  it('renders the pending end target page while parent pageIndex is still stale after a previous-chapter transition', () => {
    const { chapter, currentLayout } = buildMultiPageLayout();

    renderPagedContent({
      chapter,
      currentLayout,
      pageIndex: 0,
      pendingPageTarget: 'end',
    });

    expect(screen.getByText(`${currentLayout.pageSlices.length} / ${currentLayout.pageSlices.length}`)).toBeInTheDocument();
  });

  it('renders one compact text node per paged fragment instead of one node per line', () => {
    const { chapter, currentLayout } = buildMultiPageLayout();
    const firstPage = currentLayout.pageSlices[0];
    const flattenedItems = firstPage?.columns.flatMap((column) => column.items) ?? [];
    const expectedFragmentCount = flattenedItems.filter(
      (item) => item.kind === 'heading' || item.kind === 'text',
    ).length;
    const expectedLineCount = flattenedItems.reduce(
      (total, item) =>
        (item.kind === 'heading' || item.kind === 'text'
          ? total + item.lines.length
          : total),
      0,
    );

    expect(expectedLineCount).toBeGreaterThan(expectedFragmentCount);

    const { container } = renderPagedContent({
      chapter,
      currentLayout,
      pageIndex: 0,
    });

    const fragments = container.querySelectorAll('[data-testid="reader-flow-text-fragment"]');
    expect(fragments).toHaveLength(expectedFragmentCount);
    for (const fragment of fragments) {
      expect(fragment.children).toHaveLength(0);
    }
  });

  it('re-renders with updated typography layouts while keeping page-zero locator mapping stable', () => {
    const { chapter, currentLayout } = buildMultiPageLayout();
    const updatedLayout = buildPagedLayoutForTypography(chapter, {
      fontSize: 24,
      lineSpacing: 2.2,
      paragraphSpacing: 32,
    });
    const updatedStartLocator = updatedLayout.pageSlices[0]?.startLocator ?? null;

    expect(updatedLayout.pageSlices.length).toBeGreaterThanOrEqual(currentLayout.pageSlices.length);
    expect(findPageIndexForLocator(updatedLayout, updatedStartLocator)).toBe(0);

    const rendered = renderPagedContent({
      chapter,
      currentLayout,
      pageIndex: 0,
    });

    expect(screen.getByText(`1 / ${currentLayout.pageSlices.length}`)).toBeInTheDocument();

    rendered.rerender(
      <PagedReaderContent
        chapter={chapter}
        currentLayout={updatedLayout}
        novelId={1}
        pageIndex={0}
        pagedViewportRef={{ current: null }}
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

    expect(screen.getByText(`1 / ${updatedLayout.pageSlices.length}`)).toBeInTheDocument();
    const fragments = document.querySelectorAll('[data-testid="reader-flow-text-fragment"]');
    expect(Array.from(fragments).some((fragment) => fragment.textContent?.includes('Paragraph 1'))).toBe(true);
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
    renderPagedContent({
      chapter: {
        index: 1,
        title: 'Chapter 2',
        content: 'Current [IMG:current] [IMG:shared]',
        wordCount: 100,
        totalChapters: 3,
        hasPrev: true,
        hasNext: true,
      },
      previousChapterPreview: {
        index: 0,
        title: 'Chapter 1',
        content: 'Prev [IMG:shared] [IMG:prev]',
        wordCount: 100,
        totalChapters: 3,
        hasPrev: false,
        hasNext: true,
      },
      nextChapterPreview: {
        index: 2,
        title: 'Chapter 3',
        content: 'Next [IMG:next]',
        wordCount: 100,
        totalChapters: 3,
        hasPrev: true,
        hasNext: false,
      },
    });

    expect(preloadReaderImageResourcesSpy).toHaveBeenCalledWith(1, ['current', 'shared', 'prev', 'next']);
  });
});
