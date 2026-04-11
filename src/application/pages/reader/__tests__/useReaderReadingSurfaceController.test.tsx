import type { ReactNode } from 'react';

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReaderContextWrapper } from '@test/readerRuntimeTestUtils';
import { DEBUG_RETRY_READER_RESTORE_EVENT } from '@app/debug/pwaDebugTools';

import { useReaderReadingSurfaceController } from '../useReaderReadingSurfaceController';

const surfaceMocks = vi.hoisted(() => {
  const chapter = {
    index: 0,
    title: 'Chapter 1',
    wordCount: 120,
    plainText: 'hello',
    richBlocks: [],
    contentFormat: 'plain' as const,
    contentVersion: 1,
    totalChapters: 1,
    hasPrev: false,
    hasNext: false,
  };

  return {
    chapter,
    chapterData: {
      cache: {},
      chapters: [chapter],
      currentChapter: chapter,
      fetchChapterContent: vi.fn(),
      hydrateReaderData: vi.fn(),
      loadActiveChapter: vi.fn(),
      loadingMessage: null,
      preloadAdjacent: vi.fn(),
      readerError: null,
      resetReaderContent: vi.fn(),
    },
    lifecycle: {
      handleRestoreSettled: vi.fn(),
      isChapterNavigationReady: true,
      isRestoringPosition: false,
      lifecycleStatus: 'ready' as const,
      loadingLabel: null,
      readerError: null,
      renderableChapter: chapter,
      showLoadingOverlay: false,
    },
    navigation: {
      goToChapter: vi.fn(),
      goToNextPage: vi.fn(),
      goToNextPageSilently: vi.fn(),
      goToPrevPage: vi.fn(),
      goToPrevPageSilently: vi.fn(),
      handleNext: vi.fn(),
      handlePrev: vi.fn(),
      pageTurnDirection: 'next' as const,
      pageTurnToken: 1,
      toolbarHasNext: false,
      toolbarHasPrev: false,
    },
    pagedController: {
      currentPagedLayout: null,
      currentPagedLayoutChapterIndex: null,
      goToChapter: vi.fn(),
      goToNextPage: vi.fn(),
      goToNextPageSilently: vi.fn(),
      goToPrevPage: vi.fn(),
      goToPrevPageSilently: vi.fn(),
      handleNext: vi.fn(),
      handlePagedContentRef: vi.fn(),
      handlePagedViewportRef: vi.fn(),
      handlePrev: vi.fn(),
      nextChapterPreview: null,
      nextPagedLayout: null,
      pageCount: 1,
      pageIndex: 0,
      pageTurnDirection: 'next' as const,
      pageTurnToken: 1,
      pendingPageTarget: null,
      previousChapterPreview: null,
      previousPagedLayout: null,
      toolbarHasNext: false,
      toolbarHasPrev: false,
    },
    preferences: {
      currentTheme: {
        bg: 'bg-page',
        contentVariables: {},
        sidebarBg: 'bg-sidebar',
        text: 'text-reader',
      },
      fontSize: 18,
      headerBg: 'bg-header',
      lineSpacing: 1.8,
      pageTurnMode: 'cover' as const,
      paragraphSpacing: 20,
      readerTheme: 'paper',
    },
    registerRestoreSettledHandler: vi.fn(() => vi.fn()),
    restoreFlow: {
      clearPendingRestoreTarget: vi.fn(),
      getRestoreAttempt: vi.fn(() => 0),
      handleBeforeChapterChange: vi.fn(),
      handleContentScroll: vi.fn(),
      pendingRestoreTarget: null,
      pendingRestoreTargetRef: { current: null },
      recordRestoreResult: vi.fn(() => ({ scheduledRetry: false })),
      retryLastFailedRestore: vi.fn(() => false),
      setPendingRestoreTarget: vi.fn(),
      startRestoreMaskForTarget: vi.fn(),
      stopRestoreMask: vi.fn(),
      switchMode: vi.fn(),
    },
    scrollController: {
      handleContentScroll: vi.fn(),
      handleScrollChapterBodyElement: vi.fn(),
      handleScrollChapterElement: vi.fn(),
      renderableScrollLayouts: [] as Array<{
        chapter: typeof chapter;
        index: number;
        layout: { textWidth: number };
      }>,
      syncViewportState: vi.fn(),
      visibleScrollBlockRangeByChapter: new Map(),
    },
    sessionSnapshot: {
      chapterIndex: 0,
      isPagedMode: false,
      lastContentMode: 'scroll' as const,
      mode: 'summary' as const,
      viewMode: 'summary' as const,
    },
  };
});

vi.mock('@domains/reader-content', () => ({
  useReaderChapterData: () => surfaceMocks.chapterData,
}));

vi.mock('@domains/reader-layout-engine', () => ({
  PagedReaderContent: () => null,
  ScrollReaderContent: () => null,
  SummaryReaderContent: () => null,
  resolveReaderContentRootProps: vi.fn(() => ({
    rootClassName: 'pm-reader',
    rootStyle: { '--pm-reader-font-size': '18px' },
  })),
  usePagedReaderViewportController: () => surfaceMocks.pagedController,
  useScrollReaderViewportController: () => surfaceMocks.scrollController,
}));

vi.mock('@domains/reader-shell', () => ({
  useReaderAnalysisBridge: ({ controller }: {
    controller: {
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
    isChapterAnalysisLoading: false,
    summaryPanel: controller.renderSummaryPanel({
      analysis: null,
      isAnalyzingChapter: false,
      isLoading: false,
      job: null,
      novelId: 1,
      onAnalyzeChapter: vi.fn(),
    }),
    summaryRestoreSignal: null,
  }),
}));

vi.mock('@domains/reader-session', () => ({
  useReaderRestoreController: () => surfaceMocks.restoreFlow,
  useReaderSession: () => ({
    commands: {
      hasUserInteractedRef: { current: false },
      latestReaderStateRef: { current: {} },
      loadPersistedReaderState: vi.fn(),
      markUserInteracted: vi.fn(),
      persistReaderState: vi.fn(),
      setChapterIndex: vi.fn(),
      setMode: vi.fn(),
    },
    snapshot: surfaceMocks.sessionSnapshot,
  }),
}));

vi.mock('../useReaderLifecycleController', () => ({
  useReaderLifecycleController: () => surfaceMocks.lifecycle,
}));

vi.mock('../useReaderNavigation', () => ({
  useReaderNavigation: () => surfaceMocks.navigation,
}));

describe('useReaderReadingSurfaceController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    surfaceMocks.sessionSnapshot.mode = 'summary';
    surfaceMocks.sessionSnapshot.viewMode = 'summary';
    surfaceMocks.sessionSnapshot.isPagedMode = false;
    surfaceMocks.scrollController.renderableScrollLayouts = [];
  });

  it('builds summary content props and registers restore-settled handling', () => {
    const { Wrapper } = createReaderContextWrapper({
      registerRestoreSettledHandler: surfaceMocks.registerRestoreSettledHandler,
    });
    const analysisController = {
      analyzeChapter: vi.fn(),
      getChapterAnalysis: vi.fn(),
      getStatus: vi.fn(),
      renderSummaryPanel: vi.fn(() => 'summary-panel'),
    };

    const { result } = renderHook(() => useReaderReadingSurfaceController({
      analysisController,
      novelId: 1,
      preferences: surfaceMocks.preferences,
    }), {
      wrapper: Wrapper,
    });

    const contentProps = result.current.viewport.buildContentProps({
      imageHandlers: {
        onImageActivate: vi.fn(),
        onRegisterImageElement: vi.fn(),
      },
      interactionLocked: false,
    });

    expect(contentProps.summaryContentProps).toMatchObject({
      analysisPanel: 'summary-panel',
      chapter: surfaceMocks.chapter,
      headerBgClassName: 'bg-header',
    });
    expect(contentProps.scrollContentProps).toBeUndefined();
    expect(surfaceMocks.registerRestoreSettledHandler)
      .toHaveBeenCalledWith(surfaceMocks.lifecycle.handleRestoreSettled);

    result.current.viewport.handleViewportScroll();
    expect(surfaceMocks.restoreFlow.handleContentScroll).toHaveBeenCalledTimes(1);
    expect(surfaceMocks.scrollController.handleContentScroll).not.toHaveBeenCalled();
  });

  it('builds scroll content props and dispatches viewport scroll to the scroll controller', () => {
    surfaceMocks.sessionSnapshot.mode = 'scroll';
    surfaceMocks.sessionSnapshot.viewMode = 'original';
    surfaceMocks.scrollController.renderableScrollLayouts = [{
      chapter: surfaceMocks.chapter,
      index: 0,
      layout: { textWidth: 420 },
    }];

    const { Wrapper } = createReaderContextWrapper();
    const { result } = renderHook(() => useReaderReadingSurfaceController({
      analysisController: {
        analyzeChapter: vi.fn(),
        getChapterAnalysis: vi.fn(),
        getStatus: vi.fn(),
        renderSummaryPanel: vi.fn(() => 'summary-panel'),
      },
      novelId: 1,
      preferences: surfaceMocks.preferences,
    }), {
      wrapper: Wrapper,
    });

    const contentProps = result.current.viewport.buildContentProps({
      imageHandlers: {
        onImageActivate: vi.fn(),
        onRegisterImageElement: vi.fn(),
      },
      interactionLocked: true,
    });

    expect(contentProps.scrollContentProps).toMatchObject({
      chapters: surfaceMocks.scrollController.renderableScrollLayouts,
      headerBgClassName: 'bg-header',
      novelId: 1,
      readerTheme: 'paper',
    });
    expect(contentProps.summaryContentProps).toBeUndefined();

    result.current.viewport.handleViewportScroll();
    expect(surfaceMocks.scrollController.handleContentScroll).toHaveBeenCalledTimes(1);
    expect(surfaceMocks.restoreFlow.handleContentScroll).not.toHaveBeenCalled();
  });

  it('retries reader restore when debug retry event is dispatched', () => {
    const { Wrapper } = createReaderContextWrapper();

    renderHook(() => useReaderReadingSurfaceController({
      analysisController: {
        analyzeChapter: vi.fn(),
        getChapterAnalysis: vi.fn(),
        getStatus: vi.fn(),
        renderSummaryPanel: vi.fn(() => 'summary-panel'),
      },
      novelId: 1,
      preferences: surfaceMocks.preferences,
    }), {
      wrapper: Wrapper,
    });

    window.dispatchEvent(new CustomEvent(DEBUG_RETRY_READER_RESTORE_EVENT));

    expect(surfaceMocks.restoreFlow.retryLastFailedRestore).toHaveBeenCalledTimes(1);
  });
});
