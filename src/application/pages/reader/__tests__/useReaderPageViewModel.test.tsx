import type { ReactNode } from 'react';

import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { analyzeChapter } from '@application/use-cases/analysis';
import { loadReaderSession } from '@application/use-cases/library';
import { analysisService } from '@domains/analysis';
import { useReaderInput } from '@domains/reader-interaction';
import { useReaderAnalysisBridge } from '@domains/reader-shell';

import { useReaderPageViewModel } from '../useReaderPageViewModel';

const readerShellMocks = vi.hoisted(() => ({
  setIsSidebarOpen: vi.fn(),
  toggleSidebar: vi.fn(),
  handleMobileBack: vi.fn(),
  handleSetViewMode: vi.fn(),
  handleSetContentMode: vi.fn(),
  setPageTurnMode: vi.fn(),
  setFontSize: vi.fn(),
  setLineSpacing: vi.fn(),
  setParagraphSpacing: vi.fn(),
  setReaderTheme: vi.fn(),
  handleContentClick: vi.fn(),
  setIsChromeVisible: vi.fn(),
}));

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
  useReaderAnalysisBridge: vi.fn(({ controller, novelId }: {
    controller: {
      analyzeChapter: (nextNovelId: number, chapterIndex: number) => Promise<unknown>;
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
    isChapterAnalysisLoading: false,
    summaryPanel: controller.renderSummaryPanel({
      analysis: null,
      isAnalyzingChapter: false,
      isLoading: false,
      job: null,
      novelId,
      onAnalyzeChapter: () => {
        controller.analyzeChapter(novelId, 0).catch(() => undefined);
      },
    }),
    summaryRestoreSignal: null,
  })),
  useReaderPreferences: () => ({
    currentTheme: {
      bg: 'bg-page',
      contentVariables: {},
      sidebarBg: 'bg-sidebar',
      text: 'text-reader',
    },
    fontSize: 16,
    headerBg: 'bg-header',
    lineSpacing: 1.6,
    pageTurnMode: 'cover',
    paragraphSpacing: 1.2,
    readerTheme: 'paper',
    setFontSize: readerShellMocks.setFontSize,
    setLineSpacing: readerShellMocks.setLineSpacing,
    setPageTurnMode: readerShellMocks.setPageTurnMode,
    setParagraphSpacing: readerShellMocks.setParagraphSpacing,
    setReaderTheme: readerShellMocks.setReaderTheme,
  }),
}));

vi.mock('@domains/reader-content', () => ({
  useReaderChapterData: () => ({
    cache: {},
    chapters: [],
    currentChapter: { id: 1, title: 'Chapter 1' },
    fetchChapterContent: vi.fn(),
    preloadAdjacent: vi.fn(),
  }),
}));

vi.mock('@domains/reader-interaction', () => ({
  useContentClick: () => ({
    handleContentClick: readerShellMocks.handleContentClick,
    isChromeVisible: false,
    setIsChromeVisible: readerShellMocks.setIsChromeVisible,
  }),
  useReaderInput: vi.fn(),
  useReaderMobileBack: () => ({
    handleMobileBack: readerShellMocks.handleMobileBack,
  }),
  useSidebarDrag: () => ({
    isSidebarOpen: false,
    setIsSidebarOpen: readerShellMocks.setIsSidebarOpen,
    toggleSidebar: readerShellMocks.toggleSidebar,
  }),
}));

vi.mock('@domains/reader-layout-engine', () => ({
  useReaderLayoutController: ({
    analysis,
    chapterData,
  }: {
    analysis: { summaryPanel: ReactNode };
    chapterData: { currentChapter: { id: number; title: string } };
  }) => ({
    lifecycle: {
      isRestoringPosition: false,
      loadingLabel: 'reader.loading',
      readerError: null,
      showLoadingOverlay: false,
      lifecycleStatus: 'ready',
    },
    navigation: {
      goToChapter: vi.fn(),
      goToNextPage: vi.fn(),
      goToPrevPage: vi.fn(),
      handleNext: vi.fn(),
      handlePrev: vi.fn(),
      toolbarHasNext: false,
      toolbarHasPrev: false,
    },
    restore: {
      handleSetContentMode: readerShellMocks.handleSetContentMode,
      handleSetViewMode: readerShellMocks.handleSetViewMode,
    },
    viewport: {
      buildContentProps: () => ({
        summaryContentProps: {
          analysisPanel: analysis.summaryPanel,
          chapter: chapterData.currentChapter,
          headerBgClassName: 'bg-header',
          readerTheme: 'paper',
          textClassName: 'text-reader',
        },
      }),
      handleViewportScroll: vi.fn(),
      renderableChapter: chapterData.currentChapter,
    },
  }),
}));

vi.mock('@domains/reader-media', () => ({
  useReaderPageImageOverlay: () => ({
    handleImageActivate: vi.fn(),
    handleRegisterImageElement: vi.fn(),
    imageViewerProps: {
      activeImage: null,
      closeLabel: 'close',
      isOpen: false,
      onClose: vi.fn(),
    },
    isImageViewerOpen: false,
  }),
}));

vi.mock('@domains/reader-session', () => ({
  useReaderRestoreController: () => ({}),
  useReaderSession: () => ({
    commands: {},
    snapshot: {
      chapterIndex: 0,
      isPagedMode: false,
      mode: 'scroll',
      viewMode: 'summary',
    },
  }),
}));

vi.mock('@shared/reader-runtime', () => ({
  useReaderViewportContext: () => ({
    contentRef: { current: null },
  }),
}));

describe('useReaderPageViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyzeChapter).mockResolvedValue({ analysis: null });
    vi.mocked(loadReaderSession).mockResolvedValue({
      novel: {
        id: 1,
        title: 'Reader Novel',
        author: 'Author',
        description: '',
        tags: [],
        fileType: 'epub',
        hasCover: false,
        createdAt: new Date().toISOString(),
        totalWords: 100,
        chapterCount: 1,
        originalFilename: 'reader.epub',
        originalEncoding: 'utf-8',
      },
    });
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

    const analysisBridgeArgs = vi.mocked(useReaderAnalysisBridge).mock.calls[0]?.[0];
    expect(analysisBridgeArgs).toMatchObject({
      chapterIndex: 0,
      novelId: 1,
      viewMode: 'summary',
    });
    expect(analysisBridgeArgs?.controller.analyzeChapter).toBe(analyzeChapter);
    expect(analysisBridgeArgs?.controller.getStatus).toBe(analysisService.getStatus);

    render(<>{result.current.viewportProps.summaryContentProps?.analysisPanel}</>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'reader.analysisPanel.analyzeChapter' }));

    expect(analyzeChapter).toHaveBeenCalledWith(1, 0);
  });
});
