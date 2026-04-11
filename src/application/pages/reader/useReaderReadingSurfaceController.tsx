import type { ComponentProps } from 'react';
import type { ChapterContent } from '@shared/contracts/reader';
import type { ReaderAnalysisBridgeController, UseReaderPreferencesResult } from '@domains/reader-shell';
import type { UseReaderSessionResult } from '@domains/reader-session';

import { useEffect, useState } from 'react';

import {
  PagedReaderContent,
  ScrollReaderContent,
  SummaryReaderContent,
  resolveReaderContentRootProps,
  usePagedReaderViewportController,
  useScrollReaderViewportController,
} from '@domains/reader-layout-engine';
import { useReaderChapterData } from '@domains/reader-content';
import { useReaderAnalysisBridge } from '@domains/reader-shell';
import {
  useReaderRestoreController,
  useReaderSession,
} from '@domains/reader-session';
import { DEBUG_RETRY_READER_RESTORE_EVENT } from '@app/debug/pwaDebugTools';
import { useReaderPersistenceRuntime } from '@shared/reader-runtime';

import type {
  ReaderLayoutControllerImageHandlers,
  ReaderNavigationControllerResult,
  ReaderReadingSurfaceController,
} from './types';

import { useReaderLifecycleController } from './useReaderLifecycleController';
import { useReaderNavigation } from './useReaderNavigation';

interface UseReaderReadingSurfaceControllerParams {
  analysisController: ReaderAnalysisBridgeController;
  novelId: number;
  preferences: Pick<
    UseReaderPreferencesResult,
    | 'currentTheme'
    | 'fontSize'
    | 'headerBg'
    | 'lineSpacing'
    | 'pageTurnMode'
    | 'paragraphSpacing'
    | 'readerTheme'
  >;
  resetInteractionState?: () => void;
}

function buildPagedContentProps(
  pagedController: ReturnType<typeof usePagedReaderViewportController>,
  preferences: UseReaderReadingSurfaceControllerParams['preferences'],
  navigation: ReaderNavigationControllerResult,
  renderableChapter: ChapterContent | null,
  novelId: number,
  imageHandlers: ReaderLayoutControllerImageHandlers,
  interactionLocked: boolean,
  isPagedMode: boolean,
  isRestoringPosition: boolean,
): ComponentProps<typeof PagedReaderContent> | undefined {
  if (!renderableChapter || !isPagedMode) {
    return undefined;
  }

  return {
    ...resolveReaderContentRootProps({
      contentWidth: pagedController.currentPagedLayout?.columnWidth ?? 0,
      fontSize: preferences.fontSize,
      lineSpacing: preferences.lineSpacing,
      mode: 'paged',
      paragraphSpacing: preferences.paragraphSpacing,
      readerTheme: preferences.readerTheme,
      theme: preferences.currentTheme,
    }),
    chapter: renderableChapter,
    currentLayout: pagedController.currentPagedLayout,
    disableAnimation: isRestoringPosition,
    headerBgClassName: preferences.headerBg,
    interactionLocked,
    nextChapterPreview: pagedController.nextChapterPreview,
    nextLayout: pagedController.nextPagedLayout,
    novelId,
    onImageActivate: imageHandlers.onImageActivate,
    onRegisterImageElement: imageHandlers.onRegisterImageElement,
    onRequestNextPage: navigation.goToNextPageSilently,
    onRequestPrevPage: navigation.goToPrevPageSilently,
    pageBgClassName: preferences.currentTheme.bg,
    pageIndex: pagedController.pageIndex,
    pagedContentRef: pagedController.handlePagedContentRef,
    pagedViewportRef: pagedController.handlePagedViewportRef,
    pageTurnDirection: navigation.pageTurnDirection,
    pageTurnMode: preferences.pageTurnMode,
    pageTurnToken: navigation.pageTurnToken,
    pendingPageTarget: pagedController.pendingPageTarget,
    previousChapterPreview: pagedController.previousChapterPreview,
    previousLayout: pagedController.previousPagedLayout,
    readerTheme: preferences.readerTheme,
    textClassName: preferences.currentTheme.text,
  };
}

function buildScrollContentProps(
  scrollController: ReturnType<typeof useScrollReaderViewportController>,
  preferences: UseReaderReadingSurfaceControllerParams['preferences'],
  novelId: number,
  imageHandlers: ReaderLayoutControllerImageHandlers,
  mode: UseReaderSessionResult['snapshot']['mode'],
): ComponentProps<typeof ScrollReaderContent> | undefined {
  if (mode !== 'scroll' || scrollController.renderableScrollLayouts.length === 0) {
    return undefined;
  }

  return {
    ...resolveReaderContentRootProps({
      contentWidth: scrollController.renderableScrollLayouts[0]?.layout.textWidth ?? 0,
      fontSize: preferences.fontSize,
      lineSpacing: preferences.lineSpacing,
      mode: 'scroll',
      paragraphSpacing: preferences.paragraphSpacing,
      readerTheme: preferences.readerTheme,
      theme: preferences.currentTheme,
    }),
    chapters: scrollController.renderableScrollLayouts,
    headerBgClassName: preferences.headerBg,
    novelId,
    onChapterBodyElement: scrollController.handleScrollChapterBodyElement,
    onChapterElement: scrollController.handleScrollChapterElement,
    onImageActivate: imageHandlers.onImageActivate,
    onRegisterImageElement: imageHandlers.onRegisterImageElement,
    readerTheme: preferences.readerTheme,
    textClassName: preferences.currentTheme.text,
    visibleBlockRangeByChapter: scrollController.visibleScrollBlockRangeByChapter,
  };
}

function buildSummaryContentProps(
  analysis: ReturnType<typeof useReaderAnalysisBridge>,
  preferences: UseReaderReadingSurfaceControllerParams['preferences'],
  renderableChapter: ChapterContent | null,
  viewMode: UseReaderSessionResult['snapshot']['viewMode'],
): ComponentProps<typeof SummaryReaderContent> | undefined {
  if (!renderableChapter || viewMode !== 'summary') {
    return undefined;
  }

  return {
    analysisPanel: analysis.summaryPanel,
    chapter: renderableChapter,
    headerBgClassName: preferences.headerBg,
    readerTheme: preferences.readerTheme,
    textClassName: preferences.currentTheme.text,
  };
}

export function useReaderReadingSurfaceController({
  analysisController,
  novelId,
  preferences,
  resetInteractionState,
}: UseReaderReadingSurfaceControllerParams): ReaderReadingSurfaceController {
  const persistence = useReaderPersistenceRuntime();
  const session = useReaderSession(novelId);
  const { snapshot: sessionSnapshot, commands: sessionCommands } = session;
  const { chapterIndex, isPagedMode, lastContentMode, mode, viewMode } = sessionSnapshot;
  const [chapterDataRevision, setChapterDataRevision] = useState(0);

  const chapterData = useReaderChapterData({
    novelId,
    onChapterContentResolved: () => {
      setChapterDataRevision((previousVersion) => previousVersion + 1);
    },
    resetInteractionState,
    sessionCommands,
    sessionSnapshot,
  });
  const analysis = useReaderAnalysisBridge({
    controller: analysisController,
    chapterIndex,
    novelId,
    viewMode,
  });
  const restoreFlow = useReaderRestoreController({
    currentChapter: chapterData.currentChapter,
    isChapterAnalysisLoading: analysis.isChapterAnalysisLoading,
    sessionCommands,
    sessionSnapshot,
    summaryRestoreSignal: analysis.summaryRestoreSignal,
  });
  const { retryLastFailedRestore } = restoreFlow;
  const scrollController = useScrollReaderViewportController({
    enabled: mode === 'scroll',
    novelId,
    chapters: chapterData.chapters,
    currentChapter: chapterData.currentChapter,
    chapterDataRevision,
    sessionSnapshot,
    sessionCommands,
    cache: chapterData.cache,
    fetchChapterContent: chapterData.fetchChapterContent,
    preloadAdjacent: chapterData.preloadAdjacent,
    preferences: {
      fontSize: preferences.fontSize,
      lineSpacing: preferences.lineSpacing,
      paragraphSpacing: preferences.paragraphSpacing,
    },
    pendingRestoreTarget: restoreFlow.pendingRestoreTarget,
    pendingRestoreTargetRef: restoreFlow.pendingRestoreTargetRef,
    getRestoreAttempt: restoreFlow.getRestoreAttempt,
    recordRestoreResult: restoreFlow.recordRestoreResult,
    clearPendingRestoreTarget: restoreFlow.clearPendingRestoreTarget,
    stopRestoreMask: restoreFlow.stopRestoreMask,
  });
  const pagedController = usePagedReaderViewportController({
    enabled: mode === 'paged',
    novelId,
    chapters: chapterData.chapters,
    currentChapter: chapterData.currentChapter,
    chapterDataRevision,
    sessionSnapshot,
    sessionCommands,
    cache: chapterData.cache,
    fetchChapterContent: chapterData.fetchChapterContent,
    preferences: {
      fontSize: preferences.fontSize,
      lineSpacing: preferences.lineSpacing,
      paragraphSpacing: preferences.paragraphSpacing,
    },
    pendingRestoreTarget: restoreFlow.pendingRestoreTarget,
    pendingRestoreTargetRef: restoreFlow.pendingRestoreTargetRef,
    getRestoreAttempt: restoreFlow.getRestoreAttempt,
    recordRestoreResult: restoreFlow.recordRestoreResult,
    clearPendingRestoreTarget: restoreFlow.clearPendingRestoreTarget,
    stopRestoreMask: restoreFlow.stopRestoreMask,
    beforeChapterChange: restoreFlow.handleBeforeChapterChange,
  });
  const lifecycle = useReaderLifecycleController({
    chapterData,
    chapterIndex,
    currentPagedLayoutChapterIndex: pagedController.currentPagedLayoutChapterIndex,
    mode,
    novelId,
    restoreFlow,
  });

  useEffect(() => {
    return persistence.registerRestoreSettledHandler(lifecycle.handleRestoreSettled);
  }, [lifecycle.handleRestoreSettled, persistence]);

  useEffect(() => {
    const handleDebugRetryReaderRestore = () => {
      retryLastFailedRestore();
    };

    window.addEventListener(
      DEBUG_RETRY_READER_RESTORE_EVENT,
      handleDebugRetryReaderRestore,
    );
    return () => {
      window.removeEventListener(
        DEBUG_RETRY_READER_RESTORE_EVENT,
        handleDebugRetryReaderRestore,
      );
    };
  }, [retryLastFailedRestore]);

  const navigation = useReaderNavigation({
    beforeChapterChange: restoreFlow.handleBeforeChapterChange,
    chapters: chapterData.chapters,
    currentChapter: chapterData.currentChapter,
    pagedNavigation: {
      goToChapter: pagedController.goToChapter,
      goToNextPage: pagedController.goToNextPage,
      goToNextPageSilently: pagedController.goToNextPageSilently,
      goToPrevPage: pagedController.goToPrevPage,
      goToPrevPageSilently: pagedController.goToPrevPageSilently,
      handleNext: pagedController.handleNext,
      handlePrev: pagedController.handlePrev,
      pageTurnDirection: pagedController.pageTurnDirection,
      pageTurnToken: pagedController.pageTurnToken,
      toolbarHasNext: pagedController.toolbarHasNext,
      toolbarHasPrev: pagedController.toolbarHasPrev,
    },
    sessionCommands,
    sessionSnapshot,
  });

  const renderableChapter = mode === 'scroll'
    ? chapterData.currentChapter ?? scrollController.renderableScrollLayouts[0]?.chapter ?? null
    : lifecycle.renderableChapter;

  return {
    chapterData: {
      chapters: chapterData.chapters,
      currentChapter: chapterData.currentChapter,
    },
    lifecycle: {
      ...lifecycle,
      renderableChapter,
    },
    navigation,
    restore: {
      switchMode: restoreFlow.switchMode,
    },
    sessionSnapshot: {
      chapterIndex,
      isPagedMode,
      lastContentMode,
      mode,
      viewMode,
    },
    viewport: {
      buildContentProps: ({ imageHandlers, interactionLocked }) => ({
        pagedContentProps: buildPagedContentProps(
          pagedController,
          preferences,
          navigation,
          renderableChapter,
          novelId,
          imageHandlers,
          interactionLocked,
          isPagedMode,
          lifecycle.isRestoringPosition,
        ),
        scrollContentProps: buildScrollContentProps(
          scrollController,
          preferences,
          novelId,
          imageHandlers,
          mode,
        ),
        summaryContentProps: buildSummaryContentProps(
          analysis,
          preferences,
          renderableChapter,
          viewMode,
        ),
      }),
      handleViewportScroll: () => {
        if (mode === 'scroll') {
          scrollController.handleContentScroll();
          return;
        }

        restoreFlow.handleContentScroll();
      },
      renderableChapter,
    },
  };
}
