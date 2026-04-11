import type { MouseEvent, ReactNode } from 'react';

import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { analyzeChapter } from '@application/use-cases/analysis';
import { loadReaderSession } from '@application/use-cases/library';
import { analysisService } from '@domains/analysis';
import { useReaderInput } from '@domains/reader-interaction';
import { AppErrorCode } from '@shared/errors';

import { useReaderPageViewModel } from '../useReaderPageViewModel';

interface TestReaderChapter {
  id: number;
  title: string;
}

interface TestReaderTheme {
  bg: string;
  contentVariables: Record<string, string>;
  sidebarBg: string;
  text: string;
}

interface TestReaderError {
  code: AppErrorCode;
}

interface TestReaderViewportContent {
  pagedContentProps?: unknown;
  scrollContentProps?: unknown;
  summaryContentProps?: unknown;
}

interface TestReaderBuildContentArgs {
  imageHandlers: {
    onImageActivate: typeof readerOverlayMocks.handleImageActivate;
    onRegisterImageElement: typeof readerOverlayMocks.handleRegisterImageElement;
  };
  interactionLocked: boolean;
}

interface ReaderSurfaceMockState {
  buildContentPropsArgs: TestReaderBuildContentArgs | null;
  currentChapter: TestReaderChapter | null;
  currentTheme: TestReaderTheme;
  customViewportContent: TestReaderViewportContent | null;
  fileType: 'epub' | 'txt';
  headerBg: string;
  imageViewerProps: {
    activeImage: null;
    closeLabel: string;
    isOpen: boolean;
    onClose: ReturnType<typeof vi.fn>;
  };
  isChromeVisible: boolean;
  isImageViewerOpen: boolean;
  isPagedMode: boolean;
  isSidebarOpen: boolean;
  lifecycleStatus: 'ready';
  loadingLabel: string;
  lastContentMode: 'scroll' | 'paged';
  mode: 'summary' | 'scroll' | 'paged';
  pageTurnMode: 'cover' | 'scroll' | 'slide' | 'none';
  paragraphSpacing: number;
  readerError: TestReaderError | null;
  readerTheme: string;
  renderableChapter: TestReaderChapter | null;
  showLoadingOverlay: boolean;
  viewMode: 'summary' | 'original';
  viewportScroll: ReturnType<typeof vi.fn>;
}

const readerShellMocks = vi.hoisted(() => ({
  handleContentClick: vi.fn(),
  handleMobileBack: vi.fn(),
  setFontSize: vi.fn(),
  setIsChromeVisible: vi.fn(),
  setIsSidebarOpen: vi.fn(),
  setLineSpacing: vi.fn(),
  setPageTurnMode: vi.fn(),
  setParagraphSpacing: vi.fn(),
  setReaderTheme: vi.fn(),
  switchMode: vi.fn(),
  toggleSidebar: vi.fn(),
}));

const readerNavigationMocks = vi.hoisted(() => ({
  goToChapter: vi.fn(),
  goToNextPage: vi.fn(),
  goToPrevPage: vi.fn(),
  handleNext: vi.fn(),
  handlePrev: vi.fn(),
}));

const readerOverlayMocks = vi.hoisted(() => ({
  closeImageViewer: vi.fn(),
  handleImageActivate: vi.fn(),
  handleRegisterImageElement: vi.fn(),
}));

const readerSurfaceMocks: ReaderSurfaceMockState = vi.hoisted(() => ({
  buildContentPropsArgs: null,
  currentChapter: { id: 1, title: 'Chapter 1' },
  currentTheme: {
    bg: 'bg-page',
    contentVariables: {},
    sidebarBg: 'bg-sidebar',
    text: 'text-reader',
  },
  customViewportContent: null,
  fileType: 'epub',
  headerBg: 'bg-header',
  imageViewerProps: {
    activeImage: null,
    closeLabel: 'close',
    isOpen: false,
    onClose: vi.fn(),
  },
  isChromeVisible: false,
  isImageViewerOpen: false,
  isPagedMode: false,
  isSidebarOpen: false,
  lifecycleStatus: 'ready',
  loadingLabel: 'reader.loading',
  lastContentMode: 'scroll',
  mode: 'summary',
  pageTurnMode: 'cover',
  paragraphSpacing: 1.2,
  readerError: null,
  readerTheme: 'paper',
  renderableChapter: { id: 1, title: 'Chapter 1' },
  showLoadingOverlay: false,
  viewMode: 'summary',
  viewportScroll: vi.fn(),
}));

function createSummaryContentProps(
  analysisController: {
    analyzeChapter: (novelId: number, chapterIndex: number) => Promise<unknown>;
    renderSummaryPanel: (input: {
      analysis: null;
      isAnalyzingChapter: boolean;
      isLoading: boolean;
      job: null;
      novelId: number;
      onAnalyzeChapter: () => void;
    }) => ReactNode;
  },
  novelId: number,
) {
  return {
    analysisPanel: analysisController.renderSummaryPanel({
      analysis: null,
      isAnalyzingChapter: false,
      isLoading: false,
      job: null,
      novelId,
      onAnalyzeChapter: () => {
        analysisController.analyzeChapter(novelId, 0).catch(() => undefined);
      },
    }),
    chapter: readerSurfaceMocks.renderableChapter,
    headerBgClassName: readerSurfaceMocks.headerBg,
    readerTheme: readerSurfaceMocks.readerTheme,
    textClassName: readerSurfaceMocks.currentTheme.text,
  };
}

function buildViewportContent(
  analysisController: {
    analyzeChapter: (novelId: number, chapterIndex: number) => Promise<unknown>;
    renderSummaryPanel: (input: {
      analysis: null;
      isAnalyzingChapter: boolean;
      isLoading: boolean;
      job: null;
      novelId: number;
      onAnalyzeChapter: () => void;
    }) => ReactNode;
  },
  novelId: number,
) {
  if (readerSurfaceMocks.customViewportContent) {
    return readerSurfaceMocks.customViewportContent;
  }

  return {
    pagedContentProps: undefined,
    scrollContentProps: undefined,
    summaryContentProps: createSummaryContentProps(analysisController, novelId),
  };
}

function createNovelSummary(fileType: 'epub' | 'txt' = 'epub') {
  return {
    novel: {
      id: 1,
      title: 'Reader Novel',
      author: 'Author',
      description: '',
      tags: [],
      fileType,
      hasCover: false,
      createdAt: new Date().toISOString(),
      totalWords: 100,
      chapterCount: 1,
      originalFilename: `reader.${fileType}`,
      originalEncoding: 'utf-8',
    },
  };
}

function resetReaderSurfaceMocks(): void {
  readerSurfaceMocks.buildContentPropsArgs = null;
  readerSurfaceMocks.currentChapter = { id: 1, title: 'Chapter 1' };
  readerSurfaceMocks.currentTheme = {
    bg: 'bg-page',
    contentVariables: {},
    sidebarBg: 'bg-sidebar',
    text: 'text-reader',
  };
  readerSurfaceMocks.customViewportContent = null;
  readerSurfaceMocks.fileType = 'epub';
  readerSurfaceMocks.headerBg = 'bg-header';
  readerSurfaceMocks.isChromeVisible = false;
  readerSurfaceMocks.isImageViewerOpen = false;
  readerSurfaceMocks.isPagedMode = false;
  readerSurfaceMocks.isSidebarOpen = false;
  readerSurfaceMocks.lifecycleStatus = 'ready';
  readerSurfaceMocks.loadingLabel = 'reader.loading';
  readerSurfaceMocks.lastContentMode = 'scroll';
  readerSurfaceMocks.mode = 'summary';
  readerSurfaceMocks.pageTurnMode = 'cover';
  readerSurfaceMocks.paragraphSpacing = 1.2;
  readerSurfaceMocks.readerError = null;
  readerSurfaceMocks.readerTheme = 'paper';
  readerSurfaceMocks.renderableChapter = { id: 1, title: 'Chapter 1' };
  readerSurfaceMocks.showLoadingOverlay = false;
  readerSurfaceMocks.viewMode = 'summary';
  readerSurfaceMocks.viewportScroll.mockReset();
  readerOverlayMocks.closeImageViewer.mockReset();
  readerOverlayMocks.handleImageActivate.mockReset();
  readerOverlayMocks.handleRegisterImageElement.mockReset();
  readerNavigationMocks.goToChapter.mockReset();
  readerNavigationMocks.goToNextPage.mockReset();
  readerNavigationMocks.goToPrevPage.mockReset();
  readerNavigationMocks.handleNext.mockReset();
  readerNavigationMocks.handlePrev.mockReset();
  readerShellMocks.handleContentClick.mockReset();
  readerShellMocks.handleMobileBack.mockReset();
  readerShellMocks.setFontSize.mockReset();
  readerShellMocks.setIsChromeVisible.mockReset();
  readerShellMocks.setIsSidebarOpen.mockReset();
  readerShellMocks.setLineSpacing.mockReset();
  readerShellMocks.setPageTurnMode.mockReset();
  readerShellMocks.setParagraphSpacing.mockReset();
  readerShellMocks.setReaderTheme.mockReset();
  readerShellMocks.switchMode.mockReset();
  readerShellMocks.toggleSidebar.mockReset();
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@application/use-cases/analysis', () => ({
  analyzeChapter: vi.fn(),
}));

vi.mock('@application/use-cases/library', () => ({
  loadReaderSession: vi.fn(),
}));

vi.mock('@domains/analysis', async () => {
  const actual = await vi.importActual<typeof import('@domains/analysis')>('@domains/analysis');

  return {
    ...actual,
    ChapterAnalysisPanel: ({ onAnalyzeChapter }: { onAnalyzeChapter: () => void }) => (
      <button type="button" onClick={onAnalyzeChapter}>
        reader.analysisPanel.analyzeChapter
      </button>
    ),
    analysisService: {
      getChapterAnalysis: vi.fn(),
      getStatus: vi.fn(),
    },
  };
});

vi.mock('@domains/reader-shell', () => ({
  useReaderPreferences: () => ({
    currentTheme: readerSurfaceMocks.currentTheme,
    fontSize: 16,
    headerBg: readerSurfaceMocks.headerBg,
    lineSpacing: 1.6,
    pageTurnMode: readerSurfaceMocks.pageTurnMode,
    paragraphSpacing: readerSurfaceMocks.paragraphSpacing,
    readerTheme: readerSurfaceMocks.readerTheme,
    setFontSize: readerShellMocks.setFontSize,
    setLineSpacing: readerShellMocks.setLineSpacing,
    setPageTurnMode: readerShellMocks.setPageTurnMode,
    setParagraphSpacing: readerShellMocks.setParagraphSpacing,
    setReaderTheme: readerShellMocks.setReaderTheme,
  }),
}));

vi.mock('@domains/reader-interaction', () => ({
  useContentClick: () => ({
    handleContentClick: readerShellMocks.handleContentClick,
    isChromeVisible: readerSurfaceMocks.isChromeVisible,
    setIsChromeVisible: readerShellMocks.setIsChromeVisible,
  }),
  useReaderInput: vi.fn(),
  useReaderMobileBack: () => ({
    handleMobileBack: readerShellMocks.handleMobileBack,
  }),
  useSidebarDrag: () => ({
    isSidebarOpen: readerSurfaceMocks.isSidebarOpen,
    setIsSidebarOpen: readerShellMocks.setIsSidebarOpen,
    toggleSidebar: readerShellMocks.toggleSidebar,
  }),
}));

vi.mock('@domains/reader-media', () => ({
  useReaderPageImageOverlay: () => ({
    closeImageViewer: readerOverlayMocks.closeImageViewer,
    handleImageActivate: readerOverlayMocks.handleImageActivate,
    handleRegisterImageElement: readerOverlayMocks.handleRegisterImageElement,
    imageViewerProps: readerSurfaceMocks.imageViewerProps,
    isImageViewerOpen: readerSurfaceMocks.isImageViewerOpen,
  }),
}));

vi.mock('@shared/reader-runtime', () => ({
  useReaderViewportContext: () => ({
    contentRef: { current: null },
  }),
}));

vi.mock('../useReaderReadingSurfaceController', () => ({
  useReaderReadingSurfaceController: vi.fn(({
    analysisController,
    novelId,
  }: {
    analysisController: {
      analyzeChapter: (nextNovelId: number, chapterIndex: number) => Promise<unknown>;
      getStatus: () => Promise<unknown>;
      renderSummaryPanel: (input: {
        analysis: null;
        isAnalyzingChapter: boolean;
        isLoading: boolean;
        job: null;
        novelId: number;
        onAnalyzeChapter: () => void;
      }) => ReactNode;
    };
    novelId: number;
  }) => ({
    chapterData: {
      chapters: [],
      currentChapter: readerSurfaceMocks.currentChapter,
    },
    lifecycle: {
      isRestoringPosition: false,
      loadingLabel: readerSurfaceMocks.loadingLabel,
      readerError: readerSurfaceMocks.readerError,
      showLoadingOverlay: readerSurfaceMocks.showLoadingOverlay,
      lifecycleStatus: readerSurfaceMocks.lifecycleStatus,
    },
    navigation: {
      goToChapter: readerNavigationMocks.goToChapter,
      goToNextPage: readerNavigationMocks.goToNextPage,
      goToPrevPage: readerNavigationMocks.goToPrevPage,
      handleNext: readerNavigationMocks.handleNext,
      handlePrev: readerNavigationMocks.handlePrev,
      toolbarHasNext: false,
      toolbarHasPrev: false,
    },
    restore: {
      switchMode: readerShellMocks.switchMode,
    },
    sessionSnapshot: {
      chapterIndex: 0,
      isPagedMode: readerSurfaceMocks.isPagedMode,
      lastContentMode: readerSurfaceMocks.lastContentMode,
      mode: readerSurfaceMocks.mode,
      viewMode: readerSurfaceMocks.viewMode,
    },
    viewport: {
      buildContentProps: (options: {
        imageHandlers: {
          onImageActivate: typeof readerOverlayMocks.handleImageActivate;
          onRegisterImageElement: typeof readerOverlayMocks.handleRegisterImageElement;
        };
        interactionLocked: boolean;
      }) => {
        readerSurfaceMocks.buildContentPropsArgs = options;
        return buildViewportContent(analysisController, novelId);
      },
      handleViewportScroll: readerSurfaceMocks.viewportScroll,
      renderableChapter: readerSurfaceMocks.renderableChapter,
    },
  })),
}));

describe('useReaderPageViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetReaderSurfaceMocks();
    vi.mocked(analyzeChapter).mockResolvedValue({ analysis: null });
    vi.mocked(loadReaderSession).mockResolvedValue(createNovelSummary('epub'));
  });

  it('builds the reader page view model from domain hooks and wires the analysis controller', async () => {
    const { result } = renderHook(() => useReaderPageViewModel(1));

    expect(result.current.backHref).toBe('/novel/1');
    expect(result.current.pageBgClassName).toBe('bg-page');
    expect(result.current.reparseRecovery.accept).toBe('.epub');
    expect(result.current.reparseRecovery.visible).toBe(false);
    expect(result.current.viewportProps.emptyHref).toBe('/novel/1');
    expect(result.current.viewportProps.summaryContentProps).toBeDefined();
    expect(useReaderInput).toHaveBeenCalledTimes(1);

    render(<>{result.current.viewportProps.summaryContentProps?.analysisPanel}</>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'reader.analysisPanel.analyzeChapter' }));

    expect(analyzeChapter).toHaveBeenCalledWith(1, 0);
    expect(analysisService.getStatus).toBeTypeOf('function');
  });

  it('updates page turn preferences without changing content mode in summary mode', () => {
    readerSurfaceMocks.mode = 'summary';
    readerSurfaceMocks.viewMode = 'summary';

    const { result } = renderHook(() => useReaderPageViewModel(1));

    act(() => {
      result.current.toolbarProps?.setPageTurnMode('scroll');
    });

    expect(readerShellMocks.setPageTurnMode).toHaveBeenCalledWith('scroll');
    expect(readerShellMocks.switchMode).not.toHaveBeenCalled();
  });

  it('maps page turn mode changes back into content mode while in original reading mode', () => {
    readerSurfaceMocks.mode = 'paged';
    readerSurfaceMocks.viewMode = 'original';
    readerSurfaceMocks.isPagedMode = true;

    const { result } = renderHook(() => useReaderPageViewModel(1));

    act(() => {
      result.current.toolbarProps?.setPageTurnMode('scroll');
    });

    expect(readerShellMocks.setPageTurnMode).toHaveBeenCalledWith('scroll');
    expect(readerShellMocks.switchMode).toHaveBeenCalledWith('scroll');
  });

  it('maps top bar view changes into switchMode targets', () => {
    readerSurfaceMocks.mode = 'summary';
    readerSurfaceMocks.viewMode = 'summary';
    readerSurfaceMocks.lastContentMode = 'paged';

    const { result } = renderHook(() => useReaderPageViewModel(1));

    act(() => {
      result.current.topBarProps.onSetViewMode('original');
    });
    act(() => {
      result.current.topBarProps.onSetViewMode('summary');
    });

    expect(readerShellMocks.switchMode).toHaveBeenNthCalledWith(1, 'paged');
    expect(readerShellMocks.switchMode).toHaveBeenNthCalledWith(2, 'summary');
  });

  it('dismisses blocked interactions before delegating viewport clicks', () => {
    readerSurfaceMocks.isSidebarOpen = true;
    readerSurfaceMocks.isChromeVisible = true;

    const { result, rerender } = renderHook(() => useReaderPageViewModel(1));
    const blockedEvent = new MouseEvent('click') as unknown as MouseEvent<HTMLDivElement>;

    act(() => {
      result.current.viewportProps.onContentClick(blockedEvent);
    });

    expect(readerShellMocks.setIsSidebarOpen).toHaveBeenCalledWith(false);
    expect(readerShellMocks.setIsChromeVisible).toHaveBeenCalledWith(false);
    expect(readerShellMocks.handleContentClick).not.toHaveBeenCalled();

    readerSurfaceMocks.isSidebarOpen = false;
    readerSurfaceMocks.isChromeVisible = false;
    rerender();

    act(() => {
      result.current.viewportProps.onContentClick(blockedEvent);
    });

    expect(readerShellMocks.handleContentClick).toHaveBeenCalledWith(blockedEvent);
  });

  it('navigates to the selected chapter start and closes the sidebar', () => {
    const { result } = renderHook(() => useReaderPageViewModel(1));

    act(() => {
      result.current.sidebarProps.onSelectChapter(3);
    });

    expect(readerNavigationMocks.goToChapter).toHaveBeenCalledWith(3, 'start');
    expect(readerShellMocks.setIsSidebarOpen).toHaveBeenCalledWith(false);
  });

  it('marks viewport content as interaction-locked and forwards image handlers', () => {
    readerSurfaceMocks.isImageViewerOpen = true;

    renderHook(() => useReaderPageViewModel(1));

    expect(readerSurfaceMocks.buildContentPropsArgs).toMatchObject({
      interactionLocked: true,
      imageHandlers: {
        onImageActivate: readerOverlayMocks.handleImageActivate,
        onRegisterImageElement: readerOverlayMocks.handleRegisterImageElement,
      },
    });
  });

  it('shows reparse recovery for missing structured content and updates accepted file types after session load', async () => {
    readerSurfaceMocks.readerError = {
      code: AppErrorCode.CHAPTER_STRUCTURED_CONTENT_MISSING,
    };
    vi.mocked(loadReaderSession).mockResolvedValue(createNovelSummary('txt'));

    const { result } = renderHook(() => useReaderPageViewModel(1));

    expect(result.current.reparseRecovery.visible).toBe(true);

    await waitFor(() => {
      expect(result.current.reparseRecovery.accept).toBe('.txt');
    });
  });

  it('omits toolbar props while loading overlays are visible or no current chapter is available', () => {
    const { result, rerender } = renderHook(() => useReaderPageViewModel(1));

    expect(result.current.toolbarProps).toBeDefined();

    readerSurfaceMocks.showLoadingOverlay = true;
    rerender();

    expect(result.current.toolbarProps).toBeUndefined();

    readerSurfaceMocks.showLoadingOverlay = false;
    readerSurfaceMocks.currentChapter = null;
    readerSurfaceMocks.renderableChapter = null;
    readerSurfaceMocks.customViewportContent = {
      pagedContentProps: undefined,
      scrollContentProps: undefined,
      summaryContentProps: undefined,
    };
    rerender();

    expect(result.current.toolbarProps).toBeUndefined();
  });
});
