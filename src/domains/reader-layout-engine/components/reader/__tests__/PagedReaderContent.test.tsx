import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { READER_CONTENT_CLASS_NAMES } from '@domains/reader-shell/constants/readerContentContract';

import PagedReaderContent from '../PagedReaderContent';
import { createDeterministicPagedLayout } from '../../../test/deterministicRenderCacheStub';
import { createFakeReaderTextLayoutEngine } from '../../../test/createFakeReaderTextLayoutEngine';
import {
  composePaginatedChapterLayout,
  createReaderTypographyMetrics,
  createReaderViewportMetrics,
  findPageIndexForLocator,
  getPagedContentHeight,
  measurePagedReaderChapterLayout,
  measureReaderChapterLayout,
} from '../../../utils/readerLayout';
import {
  clampDragOffset,
  getPagedDragLayerOffsets,
  shouldCommitPageTurnDrag,
} from '../../../utils/pagedDrag';

const preloadReaderImageResourcesSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const useReaderImageResourceMock = vi.hoisted(() => vi.fn());
const TEXT_LAYOUT_ENGINE = createFakeReaderTextLayoutEngine({ maxCharsPerLine: 22 });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../../hooks/useReaderImageResource', () => ({
  useReaderImageResource: useReaderImageResourceMock,
}));

vi.mock('motion/react', async () => {
  const React = await import('react');

  interface MockMotionValue {
    get: () => number;
    set: (value: number) => void;
  }

  interface MockPanInfo {
    delta: { x: number; y: number };
    offset: { x: number; y: number };
    point: { x: number; y: number };
    velocity: { x: number; y: number };
  }

  const useMotionValue = (initialValue: number): MockMotionValue => {
    const valueRef = React.useRef(initialValue);

    return React.useMemo(() => ({
      get: () => valueRef.current,
      set: (value: number) => {
        valueRef.current = value;
      },
    }), []);
  };

  const useTransform = (value: MockMotionValue): MockMotionValue => value;

  const animate = (
    value: MockMotionValue,
    target: number,
    options?: { duration?: number; onComplete?: () => void },
  ) => {
    const timeoutId = window.setTimeout(() => {
      value.set(target);
      options?.onComplete?.();
    }, (options?.duration ?? 0) * 1000);

    return {
      stop: () => {
        window.clearTimeout(timeoutId);
      },
    };
  };

  interface MotionDivProps extends React.ComponentProps<'div'> {
    animate?: unknown;
    custom?: unknown;
    exit?: unknown;
    initial?: unknown;
    onPan?: (event: PointerEvent, info: MockPanInfo) => void;
    onPanEnd?: (event: PointerEvent, info: MockPanInfo) => void;
    onPanStart?: (event: PointerEvent) => void;
    transition?: unknown;
    variants?: unknown;
  }

  const MotionDiv = React.forwardRef<HTMLDivElement, MotionDivProps>(({
    animate: _animate,
    custom: _custom,
    exit: _exit,
    initial: _initial,
    onPan,
    onPanEnd,
    onPanStart,
    style,
    transition: _transition,
    variants: _variants,
    ...rest
  }, ref) => {
    const panRef = React.useRef<{
      hasStarted: boolean;
      lastTime: number;
      lastX: number;
      lastY: number;
      startX: number;
      startY: number;
    } | null>(null);
    const resolvedStyle = style ? { ...style } : undefined;

    if (resolvedStyle && 'x' in resolvedStyle) {
      delete resolvedStyle.x;
    }

    const createPanInfo = (
      event: React.PointerEvent<HTMLDivElement>,
      previousState: NonNullable<typeof panRef.current>,
    ): MockPanInfo => {
      const deltaX = event.clientX - previousState.lastX;
      const deltaY = event.clientY - previousState.lastY;
      const elapsedMs = Math.max(1, Date.now() - previousState.lastTime);

      return {
        delta: { x: deltaX, y: deltaY },
        offset: {
          x: event.clientX - previousState.startX,
          y: event.clientY - previousState.startY,
        },
        point: { x: event.clientX, y: event.clientY },
        velocity: {
          x: (deltaX / elapsedMs) * 1000,
          y: (deltaY / elapsedMs) * 1000,
        },
      };
    };

    return (
      <div
        {...rest}
        ref={ref}
        style={resolvedStyle}
        onPointerDown={(event) => {
          rest.onPointerDown?.(event);
          panRef.current = {
            hasStarted: false,
            lastTime: Date.now(),
            lastX: event.clientX,
            lastY: event.clientY,
            startX: event.clientX,
            startY: event.clientY,
          };
        }}
        onPointerMove={(event) => {
          rest.onPointerMove?.(event);
          const state = panRef.current;
          if (!state) {
            return;
          }

          const panInfo = createPanInfo(event, state);
          if (!state.hasStarted && (panInfo.offset.x !== 0 || panInfo.offset.y !== 0)) {
            state.hasStarted = true;
            onPanStart?.(event.nativeEvent as PointerEvent);
          }

          if (state.hasStarted) {
            onPan?.(event.nativeEvent as PointerEvent, panInfo);
          }

          state.lastTime = Date.now();
          state.lastX = event.clientX;
          state.lastY = event.clientY;
        }}
        onPointerUp={(event) => {
          rest.onPointerUp?.(event);
          const state = panRef.current;
          if (!state) {
            return;
          }

          const panInfo = createPanInfo(event, state);
          if (state.hasStarted) {
            onPanEnd?.(event.nativeEvent as PointerEvent, panInfo);
          }
          panRef.current = null;
        }}
      />
    );
  });
  MotionDiv.displayName = 'MockMotionDiv';

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    animate,
    motion: {
      div: MotionDiv,
    },
    useMotionValue,
    useTransform,
  };
});

vi.mock('../../../utils/readerImageResourceCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/readerImageResourceCache')>();
  return {
    ...actual,
    preloadReaderImageResources: preloadReaderImageResourcesSpy,
  };
});

function createChapter({
  index = 0,
  title = `Chapter ${index + 1}`,
  plainText = 'Text',
  wordCount = 100,
  totalChapters = 1,
  hasPrev = index > 0,
  hasNext = index < totalChapters - 1,
}: {
  hasNext?: boolean;
  hasPrev?: boolean;
  index?: number;
  plainText?: string;
  title?: string;
  totalChapters?: number;
  wordCount?: number;
} = {}) {
  return {
    index,
    title,
    plainText,
    richBlocks: [],
    contentFormat: 'plain' as const,
    contentVersion: 1,
    wordCount,
    totalChapters,
    hasPrev,
    hasNext,
  };
}

function buildPagedContentProps(
  overrides: Partial<React.ComponentProps<typeof PagedReaderContent>> = {},
): React.ComponentProps<typeof PagedReaderContent> {
  const chapter = overrides.chapter ?? createChapter();
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

  return {
    chapter,
    currentLayout: overrides.currentLayout ?? defaultLayout,
    novelId: 1,
    pageIndex: 0,
    pagedViewportRef: { current: null },
    readerTheme: 'auto',
    rootClassName: 'pm-reader pm-reader--paged pm-reader--theme-auto',
    rootStyle: {},
    textClassName: '',
    headerBgClassName: '',
    pageBgClassName: 'bg-[#f4ecd8]',
    fitsTwoColumns: false,
    twoColumnWidth: undefined,
    twoColumnGap: 48,
    pageTurnMode: 'cover',
    pageTurnDirection: 'next',
    pageTurnToken: 1,
    ...overrides,
  };
}

function renderPagedContent(
  overrides: Partial<React.ComponentProps<typeof PagedReaderContent>> = {},
) {
  return render(<PagedReaderContent {...buildPagedContentProps(overrides)} />);
}

function buildMultiPageLayout() {
  const chapter = createChapter({
    plainText: Array.from(
      { length: 14 },
      (_, paragraphIndex) => `Paragraph ${paragraphIndex + 1} ${'alpha beta gamma delta epsilon '.repeat(8)}`,
    ).join('\n'),
    wordCount: 1600,
  });
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
  chapter: ReturnType<typeof createChapter>,
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

function buildDeterministicPagedImageLayout() {
  const chapter = createChapter({
    plainText: [
      '[IMG:page-1]',
      '',
      'First page copy',
      '',
      '[IMG:page-2]',
      '',
      'Second page copy',
    ].join('\n'),
    wordCount: 400,
  });

  return {
    chapter,
    currentLayout: createDeterministicPagedLayout(chapter),
  };
}

function getPagedInteractiveLayer(container: HTMLElement): HTMLDivElement {
  const interactiveLayer = container.querySelector('[data-testid="paged-reader-interactive"]');
  if (!(interactiveLayer instanceof HTMLDivElement)) {
    throw new Error('paged reader interactive layer not found');
  }

  return interactiveLayer;
}

describe('PagedReaderContent', () => {
  const originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const originalClientHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

  beforeEach(() => {
    useReaderImageResourceMock.mockReturnValue('blob:reader-image');
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(Element.prototype, 'releasePointerCapture', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
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
    expect(screen.getByTestId('paged-reader-page-frame')).toHaveClass(
      READER_CONTENT_CLASS_NAMES.root,
      'pm-reader--paged',
      'pm-reader--theme-auto',
    );
    expect(screen.getByRole('heading', { name: 'Chapter 1', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
  });

  it('renders the body heading from chapter.title even when the page item heading text is stale', () => {
    const chapter = createChapter();
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

  it('renders rich EPUB inline marks in paged mode', () => {
    const chapter = {
      ...createChapter({
        plainText: 'Bold italic Link',
      }),
      contentFormat: 'rich' as const,
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
    };
    const viewportMetrics = createReaderViewportMetrics(720, 1200, 720, 1200, 18);
    const typography = createReaderTypographyMetrics(
      18,
      1.8,
      24,
      viewportMetrics.pagedViewportWidth,
    );
    const measuredLayout = measurePagedReaderChapterLayout(
      chapter,
      viewportMetrics.pagedColumnWidth,
      typography,
      new Map(),
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

    const pageFrame = screen.getByTestId('paged-reader-page-frame');
    expect(pageFrame.querySelector('strong')).not.toBeNull();
    expect(pageFrame.querySelector('em')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Link' })).toHaveAttribute('href', '#anchor');
  });

  it('applies an opaque page background to animated layers', () => {
    const { container } = renderPagedContent({
      chapter: createChapter({ hasNext: true }),
    });

    const interactiveLayer = container.querySelector('[data-testid="paged-reader-interactive"]');
    const pageFrame = interactiveLayer?.querySelector('[data-testid="paged-reader-page-frame"]');
    const pageBody = pageFrame?.querySelector('.min-h-0.flex-1.bg-\\[\\#f4ecd8\\]');

    expect(pageFrame).toBeInTheDocument();
    expect(pageBody).toBeInTheDocument();
  });

  it('renders the animated page as a full-page frame instead of only animating the text column', () => {
    const { container } = renderPagedContent({
      chapter: createChapter({ hasNext: true }),
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

    const chapter = createChapter({
      plainText: Array.from(
        { length: 12 },
        (_, paragraphIndex) => `Paragraph ${paragraphIndex + 1} ${'alpha beta gamma delta epsilon '.repeat(6)}`,
      ).join('\n'),
      wordCount: 1200,
    });
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
        rootClassName="pm-reader pm-reader--paged pm-reader--theme-auto"
        rootStyle={{}}
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

  it('keeps image activation available while the paged reader is idle', () => {
    const onImageActivate = vi.fn();
    const onRegisterImageElement = vi.fn();
    const { chapter, currentLayout } = buildDeterministicPagedImageLayout();

    renderPagedContent({
      chapter,
      currentLayout,
      onImageActivate,
      onRegisterImageElement,
    });

    const imageButton = screen.getByRole('button', { name: 'reader.imageViewer.title' });
    fireEvent.click(imageButton);

    expect(onRegisterImageElement).toHaveBeenCalledWith({
      blockIndex: 1,
      chapterIndex: 0,
      imageKey: 'page-1',
    }, expect.anything());
    expect(onImageActivate).toHaveBeenCalledWith(expect.objectContaining({
      blockIndex: 1,
      chapterIndex: 0,
      imageKey: 'page-1',
      sourceElement: imageButton,
    }));
  });

  it('treats a drag that starts on the image hit target as a page turn instead of image activation', () => {
    const onImageActivate = vi.fn();
    const onRequestNextPage = vi.fn();
    const { chapter, currentLayout } = buildDeterministicPagedImageLayout();
    const { container } = renderPagedContent({
      chapter,
      currentLayout,
      onImageActivate,
      onRequestNextPage,
      pageIndex: 0,
    });

    const imageButton = screen.getByRole('button', { name: 'reader.imageViewer.title' });
    const interactiveLayer = getPagedInteractiveLayer(container);

    fireEvent.pointerDown(imageButton, {
      buttons: 1,
      clientX: 420,
      clientY: 240,
      pointerId: 1,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(interactiveLayer, {
      buttons: 1,
      clientX: 180,
      clientY: 240,
      pointerId: 1,
      pointerType: 'touch',
    });

    expect(screen.queryByRole('button', { name: 'reader.imageViewer.title' })).not.toBeInTheDocument();

    fireEvent.pointerUp(interactiveLayer, {
      clientX: 180,
      clientY: 240,
      pointerId: 1,
      pointerType: 'touch',
    });

    expect(onRequestNextPage).toHaveBeenCalledTimes(1);
    expect(onImageActivate).not.toHaveBeenCalled();
  });

  it('temporarily removes image activation after a page turn token change and restores it after the cooldown', async () => {
    vi.useFakeTimers();
    const onImageActivate = vi.fn();
    const onRegisterImageElement = vi.fn();
    const { chapter, currentLayout } = buildDeterministicPagedImageLayout();
    const initialProps = buildPagedContentProps({
      chapter,
      currentLayout,
      onImageActivate,
      onRegisterImageElement,
      pageIndex: 0,
      pageTurnMode: 'none',
      pageTurnToken: 1,
    });
    const rendered = render(<PagedReaderContent {...initialProps} />);

    expect(screen.getByRole('button', { name: 'reader.imageViewer.title' })).toBeInTheDocument();

    rendered.rerender(
      <PagedReaderContent
        {...initialProps}
        pageIndex={1}
        pageTurnToken={2}
      />,
    );

    expect(screen.queryByRole('button', { name: 'reader.imageViewer.title' })).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(280);
    });

    const restoredButton = screen.getByRole('button', { name: 'reader.imageViewer.title' });
    fireEvent.click(restoredButton);

    expect(onImageActivate).toHaveBeenCalledWith(expect.objectContaining({
      blockIndex: 5,
      chapterIndex: 0,
      imageKey: 'page-2',
      sourceElement: restoredButton,
    }));
  });

  it('keeps image activation disabled through a committed drag settle and cooldown', async () => {
    vi.useFakeTimers();
    const onImageActivate = vi.fn();
    const onRequestNextPage = vi.fn();
    const { chapter, currentLayout } = buildDeterministicPagedImageLayout();
    const initialProps = buildPagedContentProps({
      chapter,
      currentLayout,
      onImageActivate,
      onRequestNextPage,
      pageIndex: 0,
    });
    const rendered = render(<PagedReaderContent {...initialProps} />);
    const interactiveLayer = getPagedInteractiveLayer(rendered.container);

    fireEvent.pointerDown(interactiveLayer, {
      buttons: 1,
      clientX: 420,
      clientY: 240,
      pointerId: 1,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(interactiveLayer, {
      buttons: 1,
      clientX: 180,
      clientY: 240,
      pointerId: 1,
      pointerType: 'touch',
    });

    expect(screen.queryByRole('button', { name: 'reader.imageViewer.title' })).not.toBeInTheDocument();

    fireEvent.pointerUp(interactiveLayer, {
      clientX: 180,
      clientY: 240,
      pointerId: 1,
      pointerType: 'touch',
    });

    expect(onRequestNextPage).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'reader.imageViewer.title' })).not.toBeInTheDocument();

    rendered.rerender(
      <PagedReaderContent
        {...initialProps}
        pageIndex={1}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(280);
    });

    const restoredButton = screen.getByRole('button', { name: 'reader.imageViewer.title' });
    fireEvent.click(restoredButton);

    expect(onImageActivate).toHaveBeenCalledWith(expect.objectContaining({
      blockIndex: 5,
      chapterIndex: 0,
      imageKey: 'page-2',
      sourceElement: restoredButton,
    }));
  });

  it('restores image activation after a short drag rebounds without committing a page turn', async () => {
    vi.useFakeTimers();
    const onImageActivate = vi.fn();
    const onRequestNextPage = vi.fn();
    const { chapter, currentLayout } = buildDeterministicPagedImageLayout();
    const { container } = renderPagedContent({
      chapter,
      currentLayout,
      onImageActivate,
      onRequestNextPage,
      pageIndex: 0,
    });
    const interactiveLayer = getPagedInteractiveLayer(container);

    fireEvent.pointerDown(interactiveLayer, {
      buttons: 1,
      clientX: 420,
      clientY: 240,
      pointerId: 1,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(interactiveLayer, {
      buttons: 1,
      clientX: 360,
      clientY: 240,
      pointerId: 1,
      pointerType: 'touch',
    });

    expect(screen.queryByRole('button', { name: 'reader.imageViewer.title' })).not.toBeInTheDocument();

    fireEvent.pointerUp(interactiveLayer, {
      clientX: 360,
      clientY: 240,
      pointerId: 1,
      pointerType: 'touch',
    });

    expect(onRequestNextPage).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'reader.imageViewer.title' })).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(220);
    });

    const restoredButton = screen.getByRole('button', { name: 'reader.imageViewer.title' });
    fireEvent.click(restoredButton);

    expect(onImageActivate).toHaveBeenCalledWith(expect.objectContaining({
      blockIndex: 1,
      chapterIndex: 0,
      imageKey: 'page-1',
      sourceElement: restoredButton,
    }));
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
      chapter: createChapter({
        index: 1,
        title: 'Chapter 2',
        plainText: 'Current [IMG:current] [IMG:shared]',
        totalChapters: 3,
        hasPrev: true,
        hasNext: true,
      }),
      previousChapterPreview: createChapter({
        index: 0,
        title: 'Chapter 1',
        plainText: 'Prev [IMG:shared] [IMG:prev]',
        totalChapters: 3,
        hasPrev: false,
        hasNext: true,
      }),
      nextChapterPreview: createChapter({
        index: 2,
        title: 'Chapter 3',
        plainText: 'Next [IMG:next]',
        totalChapters: 3,
        hasPrev: true,
        hasNext: false,
      }),
    });

    expect(preloadReaderImageResourcesSpy).toHaveBeenCalledWith(1, ['current', 'shared', 'prev', 'next']);
  });
});
