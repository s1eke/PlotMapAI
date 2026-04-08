import type { ComponentProps } from 'react';
import type { UseReaderChapterDataResult } from '@domains/reader-content';
import type {
  UseReaderRestoreControllerResult,
  UseReaderSessionResult,
} from '@domains/reader-session';
import type {
  ReaderAnalysisBridgeState,
  UseReaderPreferencesResult,
} from '@domains/reader-shell';

import type { UseReaderLifecycleControllerResult } from '../hooks/useReaderLifecycleController';
import type { UseReaderNavigationResult } from '../hooks/useReaderNavigation';
import type {
  UsePagedReaderControllerResult,
} from '../hooks/usePagedReaderController';
import type {
  UseScrollReaderControllerResult,
} from '../hooks/useScrollReaderController';

import { useEffect } from 'react';
import PagedReaderContent from '../components/reader/PagedReaderContent';
import ScrollReaderContent from '../components/reader/ScrollReaderContent';
import SummaryReaderContent from '../components/reader/SummaryReaderContent';
import { useReaderPersistenceRuntime } from '@shared/reader-runtime';
import { usePagedReaderController } from '../hooks/usePagedReaderController';
import {
  useReaderLifecycleController,
} from '../hooks/useReaderLifecycleController';
import { useReaderNavigation } from '../hooks/useReaderNavigation';
import { useScrollReaderController } from '../hooks/useScrollReaderController';
import { resolveReaderContentRootProps } from '../utils/readerContentStyling';

interface ReaderLayoutControllerImageHandlers extends Pick<
  ComponentProps<typeof PagedReaderContent>,
  'onImageActivate' | 'onRegisterImageElement'
> {}

interface UseReaderLayoutControllerParams {
  analysis: Pick<
    ReaderAnalysisBridgeState,
    'isChapterAnalysisLoading' | 'summaryPanel' | 'summaryRestoreSignal'
  >;
  chapterDataRevision: number;
  chapterData: UseReaderChapterDataResult;
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
  restoreFlow: UseReaderRestoreControllerResult;
  session: Pick<UseReaderSessionResult, 'commands' | 'snapshot'>;
}

export interface ReaderLayoutEngineController {
  lifecycle: UseReaderLifecycleControllerResult;
  navigation: UseReaderNavigationResult;
  restore: Pick<
    UseReaderRestoreControllerResult,
    'handleSetContentMode' | 'handleSetViewMode'
  >;
  viewport: {
    buildContentProps: (options: {
      imageHandlers: ReaderLayoutControllerImageHandlers;
      interactionLocked: boolean;
    }) => {
      pagedContentProps?: ComponentProps<typeof PagedReaderContent>;
      scrollContentProps?: ComponentProps<typeof ScrollReaderContent>;
      summaryContentProps?: ComponentProps<typeof SummaryReaderContent>;
    };
    handleViewportScroll: () => void;
    renderableChapter: UseReaderLifecycleControllerResult['renderableChapter'];
  };
}

function buildPagedContentProps(
  pagedController: UsePagedReaderControllerResult,
  preferences: UseReaderLayoutControllerParams['preferences'],
  navigation: UseReaderNavigationResult,
  renderableChapter: UseReaderLifecycleControllerResult['renderableChapter'],
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
  scrollController: UseScrollReaderControllerResult,
  preferences: UseReaderLayoutControllerParams['preferences'],
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
  analysis: UseReaderLayoutControllerParams['analysis'],
  preferences: UseReaderLayoutControllerParams['preferences'],
  renderableChapter: UseReaderLifecycleControllerResult['renderableChapter'],
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

export function useReaderLayoutController({
  analysis,
  chapterDataRevision,
  chapterData,
  novelId,
  preferences,
  restoreFlow,
  session,
}: UseReaderLayoutControllerParams): ReaderLayoutEngineController {
  const persistence = useReaderPersistenceRuntime();
  const { commands: sessionCommands, snapshot: sessionSnapshot } = session;
  const { chapterIndex, isPagedMode, mode, viewMode } = sessionSnapshot;
  const scrollController = useScrollReaderController({
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
    clearPendingRestoreTarget: restoreFlow.clearPendingRestoreTarget,
    stopRestoreMask: restoreFlow.stopRestoreMask,
  });

  const pagedController = usePagedReaderController({
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
    pendingRestoreTargetRef: restoreFlow.pendingRestoreTargetRef,
    clearPendingRestoreTarget: restoreFlow.clearPendingRestoreTarget,
    stopRestoreMask: restoreFlow.stopRestoreMask,
    beforeChapterChange: restoreFlow.handleBeforeChapterChange,
  });

  const lifecycle = useReaderLifecycleController({
    novelId,
    chapterIndex,
    mode,
    currentPagedLayoutChapterIndex: pagedController.currentPagedLayoutChapterIndex,
    chapterData,
    restoreFlow,
  });

  useEffect(() => {
    return persistence.registerRestoreSettledHandler(lifecycle.handleRestoreSettled);
  }, [lifecycle.handleRestoreSettled, persistence]);

  const navigation = useReaderNavigation({
    chapters: chapterData.chapters,
    currentChapter: chapterData.currentChapter,
    sessionSnapshot,
    sessionCommands,
    pagedNavigation: {
      goToChapter: pagedController.goToChapter,
      goToNextPage: pagedController.goToNextPage,
      goToPrevPage: pagedController.goToPrevPage,
      goToNextPageSilently: pagedController.goToNextPageSilently,
      goToPrevPageSilently: pagedController.goToPrevPageSilently,
      handleNext: pagedController.handleNext,
      handlePrev: pagedController.handlePrev,
      toolbarHasPrev: pagedController.toolbarHasPrev,
      toolbarHasNext: pagedController.toolbarHasNext,
      pageTurnDirection: pagedController.pageTurnDirection,
      pageTurnToken: pagedController.pageTurnToken,
    },
    beforeChapterChange: restoreFlow.handleBeforeChapterChange,
  });

  const renderableChapter = mode === 'scroll'
    ? chapterData.currentChapter ?? scrollController.renderableScrollLayouts[0]?.chapter ?? null
    : lifecycle.renderableChapter;

  return {
    lifecycle,
    navigation,
    restore: {
      handleSetContentMode: restoreFlow.handleSetContentMode,
      handleSetViewMode: restoreFlow.handleSetViewMode,
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
