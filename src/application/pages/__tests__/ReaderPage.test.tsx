import type { ReactNode } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { analyzeChapter } from '@application/use-cases/analysis';
import { loadReaderSession } from '@application/use-cases/library';

import ReaderPage from '../reader';

const readerShellMocks = vi.hoisted(() => ({
  setIsSidebarOpen: vi.fn(),
  toggleSidebar: vi.fn(),
  handleMobileBack: vi.fn(),
  setPageTurnMode: vi.fn(),
  setFontSize: vi.fn(),
  setLineSpacing: vi.fn(),
  setParagraphSpacing: vi.fn(),
  setReaderTheme: vi.fn(),
  switchMode: vi.fn(),
  handleContentClick: vi.fn(),
  setIsChromeVisible: vi.fn(),
}));
const readerSurfaceMocks = vi.hoisted(() => ({
  useReaderReadingSurfaceController: vi.fn(),
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
  ReaderProvider: ({ children }: { children: ReactNode }) => children,
  ReaderPageLayout: ({
    backHref,
    viewportProps,
  }: {
    backHref: string;
    viewportProps: {
      summaryContentProps?: {
        analysisPanel: ReactNode;
      };
    };
  }) => (
    <div data-href={backHref}>
      {viewportProps.summaryContentProps?.analysisPanel ?? null}
    </div>
  ),
  useReaderAnalysisBridge: ({
    controller,
    novelId,
  }: {
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
  }),
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

vi.mock('../reader/useReaderReadingSurfaceController', () => ({
  useReaderReadingSurfaceController:
    readerSurfaceMocks.useReaderReadingSurfaceController.mockImplementation(({
      analysisController,
    }: {
      analysisController: {
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
    }) => ({
      chapterData: {
        chapters: [],
        currentChapter: { id: 1, title: 'Chapter 1' },
      },
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
        switchMode: readerShellMocks.switchMode,
      },
      sessionSnapshot: {
        chapterIndex: 0,
        isPagedMode: false,
        lastContentMode: 'scroll',
        mode: 'scroll',
        viewMode: 'summary',
      },
      viewport: {
        buildContentProps: () => ({
          summaryContentProps: {
            analysisPanel: analysisController.renderSummaryPanel({
              analysis: null,
              isAnalyzingChapter: false,
              isLoading: false,
              job: null,
              novelId: 1,
              onAnalyzeChapter: () => {
                analysisController.analyzeChapter(1, 0).catch(() => undefined);
              },
            }),
            chapter: { id: 1, title: 'Chapter 1' },
            headerBgClassName: 'bg-header',
            readerTheme: 'paper',
            textClassName: 'text-reader',
          },
        }),
        handleViewportScroll: vi.fn(),
        renderableChapter: { id: 1, title: 'Chapter 1' },
      },
    })),
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/novel/1/read']}>
      <Routes>
        <Route path="/novel/:id/read" element={<ReaderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('application ReaderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readerSurfaceMocks.useReaderReadingSurfaceController).mockClear();
    vi.mocked(analyzeChapter).mockResolvedValue({
      analysis: {
        chapterIndex: 0,
        chapterTitle: 'Chapter 1',
        characters: [],
        chunkIndex: 0,
        keyPoints: ['point'],
        relationships: [],
        summary: 'summary',
        tags: ['tag'],
        updatedAt: null,
      },
    });
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

  it('wires the summary panel analyze action through the application use-case', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: 'reader.analysisPanel.analyzeChapter' }));

    expect(analyzeChapter).toHaveBeenCalledWith(1, 0);
  });
});
