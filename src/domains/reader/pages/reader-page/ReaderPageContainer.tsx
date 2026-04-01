import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appPaths } from '@app/router/paths';
import { useChapterAnalysis } from '@domains/analysis';

import { type ReaderPageTurnMode } from '../../constants/pageTurnMode';
import { useContentClick } from '../../hooks/useContentClick';
import { usePagedReaderController } from '../../hooks/usePagedReaderController';
import { useReaderChapterData } from '../../hooks/useReaderChapterData';
import { useReaderInput } from '../../hooks/useReaderInput';
import { useReaderLifecycleController } from '../../hooks/useReaderLifecycleController';
import { useReaderMobileBack } from '../../hooks/useReaderMobileBack';
import { useReaderNavigation } from '../../hooks/useReaderNavigation';
import { useReaderPreferences } from '../../hooks/useReaderPreferences';
import { useReaderRestoreFlow } from '../../hooks/useReaderRestoreFlow';
import { useScrollReaderController } from '../../hooks/useScrollReaderController';
import { useSidebarDrag } from '../../hooks/useSidebarDrag';
import type { ChapterChangeSource } from '../../hooks/navigationTypes';
import {
  getReaderSessionSnapshot,
  setChapterIndex as setSessionChapterIndex,
  setMode as setSessionMode,
  useReaderSessionSelector,
  type ReaderMode,
} from '../../hooks/sessionStore';
import {
  getReaderViewMode,
  isPagedReaderMode,
  resolveContentModeFromPageTurnMode,
} from '../../utils/readerMode';
import ReaderPageLayout from './ReaderPageLayout';
import { useReaderPageContext } from './ReaderPageContext';
import { useReaderPageImageOverlay } from './useReaderPageImageOverlay';

export default function ReaderPageContainer() {
  const { t } = useTranslation();
  const {
    novelId,
    contentRef,
    pageTargetRef,
    wheelDeltaRef,
    pageTurnLockedRef,
    hasUserInteractedRef,
    persistReaderState,
  } = useReaderPageContext();
  const [chapterContentVersion, setChapterContentVersion] = useState(0);
  const restoreSettledHandlerRef = useRef<(result: 'completed' | 'skipped' | 'failed') => void>(
    () => {},
  );
  const chapterChangeSourceRef = useRef<ChapterChangeSource>(null);
  const pagedNavigationReadyRef = useRef(false);
  const pagedStateRef = useRef({ pageCount: 1, pageIndex: 0 });
  const suppressScrollSyncTemporarilyRef = useRef<() => void>(() => {});
  const handleChapterDataSuppressScrollSync = useCallback(() => {
    suppressScrollSyncTemporarilyRef.current();
  }, []);

  const preferences = useReaderPreferences();
  const sidebar = useSidebarDrag();
  const closeSidebar = useCallback(() => {
    sidebar.setIsSidebarOpen(false);
  }, [sidebar]);
  const chapterIndex = useReaderSessionSelector((state) => state.chapterIndex);
  const mode = useReaderSessionSelector((state) => state.mode);
  const viewMode = getReaderViewMode(mode);
  const isPagedMode = isPagedReaderMode(mode);
  const analysis = useChapterAnalysis(novelId, viewMode === 'summary' ? chapterIndex : -1);
  const { handleMobileBack } = useReaderMobileBack({
    isSidebarOpen: sidebar.isSidebarOpen,
    closeSidebar,
    novelId,
  });

  const setChapterIndex = useCallback((nextState: React.SetStateAction<number>) => {
    const current = getReaderSessionSnapshot().chapterIndex;
    const nextValue = typeof nextState === 'function'
      ? nextState(current)
      : nextState;
    setSessionChapterIndex(nextValue, { persistRemote: false });
  }, []);

  const setMode = useCallback((nextState: React.SetStateAction<ReaderMode>) => {
    const currentMode = getReaderSessionSnapshot().mode;
    const nextValue = typeof nextState === 'function'
      ? nextState(currentMode)
      : nextState;
    setSessionMode(nextValue, { persistRemote: false });
  }, []);

  const chapterData = useReaderChapterData({
    mode,
    setChapterIndex,
    setMode,
    chapterChangeSourceRef,
    suppressScrollSyncTemporarily: handleChapterDataSuppressScrollSync,
    onChapterContentResolved: () => {
      setChapterContentVersion((previousVersion) => previousVersion + 1);
    },
  });

  const restoreFlow = useReaderRestoreFlow({
    chapterIndex,
    setChapterIndex,
    chapterChangeSourceRef,
    mode,
    setMode,
    pagedStateRef,
    currentChapter: chapterData.currentChapter,
    summaryRestoreSignal: analysis.chapterAnalysis,
    isChapterAnalysisLoading: analysis.isChapterAnalysisLoading,
    onRestoreSettled: (result) => {
      restoreSettledHandlerRef.current(result);
    },
  });

  suppressScrollSyncTemporarilyRef.current = restoreFlow.suppressScrollSyncTemporarily;

  const scrollController = useScrollReaderController({
    enabled: mode === 'scroll',
    chapterIndex,
    chapters: chapterData.chapters,
    currentChapter: chapterData.currentChapter,
    contentVersion: chapterContentVersion,
    fetchChapterContent: chapterData.fetchChapterContent,
    preloadAdjacent: chapterData.preloadAdjacent,
    preferences: {
      fontSize: preferences.fontSize,
      lineSpacing: preferences.lineSpacing,
      paragraphSpacing: preferences.paragraphSpacing,
    },
    pendingRestoreTargetRef: restoreFlow.pendingRestoreTargetRef,
    clearPendingRestoreTarget: restoreFlow.clearPendingRestoreTarget,
    stopRestoreMask: restoreFlow.stopRestoreMask,
    suppressScrollSyncTemporarily: restoreFlow.suppressScrollSyncTemporarily,
    chapterChangeSourceRef,
    setChapterIndex,
    persistReaderState,
    onRestoreSettled: (result) => {
      restoreSettledHandlerRef.current(result);
    },
  });

  const pagedController = usePagedReaderController({
    enabled: mode === 'paged',
    chapterIndex,
    chapters: chapterData.chapters,
    currentChapter: chapterData.currentChapter,
    contentVersion: chapterContentVersion,
    fetchChapterContent: chapterData.fetchChapterContent,
    preferences: {
      fontSize: preferences.fontSize,
      lineSpacing: preferences.lineSpacing,
      paragraphSpacing: preferences.paragraphSpacing,
    },
    pendingRestoreTargetRef: restoreFlow.pendingRestoreTargetRef,
    clearPendingRestoreTarget: restoreFlow.clearPendingRestoreTarget,
    stopRestoreMask: restoreFlow.stopRestoreMask,
    persistReaderState,
    chapterChangeSourceRef,
    hasUserInteractedRef,
    isChapterNavigationReady: pagedNavigationReadyRef.current,
    setChapterIndex: (nextChapterIndex) => {
      setChapterIndex(nextChapterIndex);
    },
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

  restoreSettledHandlerRef.current = lifecycle.handleRestoreSettled;
  pagedNavigationReadyRef.current = lifecycle.isChapterNavigationReady;
  pagedStateRef.current = {
    pageCount: pagedController.pageCount,
    pageIndex: pagedController.pageIndex,
  };

  const navigation = useReaderNavigation({
    chapterIndex,
    chapters: chapterData.chapters,
    currentChapter: chapterData.currentChapter,
    hasUserInteractedRef,
    chapterChangeSourceRef,
    mode,
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
    persistReaderState,
    pageTargetRef,
    setChapterIndex: (nextChapterIndex) => {
      setChapterIndex(nextChapterIndex);
    },
    beforeChapterChange: restoreFlow.handleBeforeChapterChange,
  });

  const {
    isChromeVisible,
    setIsChromeVisible,
    handleContentClick,
  } = useContentClick(isPagedMode, navigation.handlePrev, navigation.handleNext);
  const dismissBlockedInteraction = useCallback(() => {
    if (sidebar.isSidebarOpen) {
      closeSidebar();
    }
    if (isChromeVisible) {
      setIsChromeVisible(false);
    }
    wheelDeltaRef.current = 0;
  }, [closeSidebar, isChromeVisible, setIsChromeVisible, sidebar.isSidebarOpen, wheelDeltaRef]);

  const imageOverlay = useReaderPageImageOverlay({
    dismissBlockedInteraction,
    isEnabled: viewMode === 'original',
  });
  const isContentInteractionLocked =
    isChromeVisible || sidebar.isSidebarOpen || imageOverlay.isImageViewerOpen;

  useReaderInput(
    contentRef,
    isPagedMode,
    navigation.goToNextPage,
    navigation.goToPrevPage,
    navigation.goToChapter,
    chapterIndex,
    chapterData.currentChapter,
    lifecycle.lifecycleStatus === 'hydrating'
      || lifecycle.lifecycleStatus === 'loading-chapters'
      || lifecycle.lifecycleStatus === 'loading-chapter',
    isContentInteractionLocked,
    dismissBlockedInteraction,
    wheelDeltaRef,
    pageTurnLockedRef,
  );

  const handleSetPageTurnMode = useCallback((nextMode: ReaderPageTurnMode) => {
    if (nextMode === preferences.pageTurnMode) {
      return;
    }

    preferences.setPageTurnMode(nextMode);

    if (mode === 'summary') {
      return;
    }

    const nextContentMode = resolveContentModeFromPageTurnMode(nextMode);
    if (mode !== nextContentMode) {
      restoreFlow.handleSetContentMode(nextContentMode);
    }
  }, [mode, preferences, restoreFlow]);

  const handleViewportClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (sidebar.isSidebarOpen) {
      dismissBlockedInteraction();
      return;
    }

    handleContentClick(event);
  }, [dismissBlockedInteraction, handleContentClick, sidebar.isSidebarOpen]);

  const handleViewportScroll = useCallback(() => {
    if (mode === 'scroll') {
      scrollController.handleContentScroll();
      return;
    }

    restoreFlow.handleContentScroll();
  }, [mode, restoreFlow, scrollController]);

  const handleSelectChapter = useCallback((index: number) => {
    navigation.goToChapter(index, 'start');
    sidebar.setIsSidebarOpen(false);
  }, [navigation, sidebar]);

  const renderableChapter = mode === 'scroll'
    ? chapterData.currentChapter ?? scrollController.renderableScrollLayouts[0]?.chapter ?? null
    : lifecycle.renderableChapter;
  const pagedContentProps = renderableChapter && isPagedMode ? {
    chapter: renderableChapter,
    currentLayout: pagedController.currentPagedLayout,
    novelId,
    onImageActivate: imageOverlay.handleImageActivate,
    onRegisterImageElement: imageOverlay.handleRegisterImageElement,
    pageIndex: pagedController.pageIndex,
    pendingPageTarget: pagedController.pendingPageTarget,
    pagedContentRef: pagedController.handlePagedContentRef,
    pagedViewportRef: pagedController.handlePagedViewportRef,
    readerTheme: preferences.readerTheme,
    textClassName: preferences.currentTheme.text,
    headerBgClassName: preferences.headerBg,
    pageBgClassName: preferences.currentTheme.bg,
    pageTurnMode: preferences.pageTurnMode,
    pageTurnDirection: navigation.pageTurnDirection,
    pageTurnToken: navigation.pageTurnToken,
    previousChapterPreview: pagedController.previousChapterPreview,
    previousLayout: pagedController.previousPagedLayout,
    nextChapterPreview: pagedController.nextChapterPreview,
    nextLayout: pagedController.nextPagedLayout,
    onRequestPrevPage: navigation.goToPrevPageSilently,
    onRequestNextPage: navigation.goToNextPageSilently,
    disableAnimation: lifecycle.isRestoringPosition,
    interactionLocked: isContentInteractionLocked,
  } : undefined;

  const scrollContentProps = mode === 'scroll' && scrollController.renderableScrollLayouts.length > 0 ? {
    chapters: scrollController.renderableScrollLayouts,
    novelId,
    onImageActivate: imageOverlay.handleImageActivate,
    onRegisterImageElement: imageOverlay.handleRegisterImageElement,
    readerTheme: preferences.readerTheme,
    textClassName: preferences.currentTheme.text,
    headerBgClassName: preferences.headerBg,
    onChapterElement: scrollController.handleScrollChapterElement,
    onChapterBodyElement: scrollController.handleScrollChapterBodyElement,
    visibleBlockRangeByChapter: scrollController.visibleScrollBlockRangeByChapter,
  } : undefined;

  const summaryContentProps = renderableChapter && viewMode === 'summary' ? {
    chapter: renderableChapter,
    novelId,
    analysis: analysis.chapterAnalysis,
    job: analysis.analysisStatus?.job ?? null,
    isLoading: analysis.isChapterAnalysisLoading,
    isAnalyzingChapter: analysis.isAnalyzingChapter,
    onAnalyzeChapter: analysis.handleAnalyzeChapter,
    readerTheme: preferences.readerTheme,
    textClassName: preferences.currentTheme.text,
    headerBgClassName: preferences.headerBg,
  } : undefined;

  const toolbarProps = chapterData.currentChapter && !lifecycle.showLoadingOverlay ? {
    sliders: {
      fontSize: preferences.fontSize,
      setFontSize: preferences.setFontSize,
      lineSpacing: preferences.lineSpacing,
      setLineSpacing: preferences.setLineSpacing,
      paragraphSpacing: preferences.paragraphSpacing,
      setParagraphSpacing: preferences.setParagraphSpacing,
    },
    pageTurnMode: preferences.pageTurnMode,
    setPageTurnMode: handleSetPageTurnMode,
    hasPrev: navigation.toolbarHasPrev,
    hasNext: navigation.toolbarHasNext,
    onPrev: navigation.handlePrev,
    onNext: navigation.handleNext,
    navigationMode: isPagedMode ? 'page' as const : 'chapter' as const,
    readerTheme: preferences.readerTheme,
    headerBgClassName: preferences.headerBg,
    textClassName: preferences.currentTheme.text,
    setReaderTheme: preferences.setReaderTheme,
    hidden: !isChromeVisible,
    isSidebarOpen: sidebar.isSidebarOpen,
    onToggleSidebar: sidebar.toggleSidebar,
    onCloseSidebar: closeSidebar,
  } : undefined;

  return (
    <ReaderPageLayout
      imageViewerProps={imageOverlay.imageViewerProps}
      pageBgClassName={preferences.currentTheme.bg}
      readerError={lifecycle.readerError}
      sidebarProps={{
        chapters: chapterData.chapters,
        currentIndex: chapterIndex,
        contentTextColor: preferences.currentTheme.text,
        isSidebarOpen: sidebar.isSidebarOpen,
        sidebarBgClassName: preferences.currentTheme.sidebarBg,
        onClose: closeSidebar,
        onSelectChapter: handleSelectChapter,
      }}
      toolbarProps={toolbarProps}
      topBarProps={{
        readerTheme: preferences.readerTheme,
        headerBgClassName: preferences.headerBg,
        textClassName: preferences.currentTheme.text,
        isChromeVisible,
        isSidebarOpen: sidebar.isSidebarOpen,
        novelId,
        viewMode,
        onMobileBack: handleMobileBack,
        onToggleSidebar: sidebar.toggleSidebar,
        onSetViewMode: restoreFlow.handleSetViewMode,
      }}
      viewportProps={{
        contentRef,
        isPagedMode,
        interactionLocked: isContentInteractionLocked,
        viewMode,
        renderableChapter,
        showLoadingOverlay: lifecycle.showLoadingOverlay,
        isRestoringPosition: lifecycle.isRestoringPosition,
        loadingLabel: lifecycle.loadingLabel,
        onBlockedInteraction: dismissBlockedInteraction,
        onContentClick: handleViewportClick,
        onContentScroll: handleViewportScroll,
        emptyHref: appPaths.novel(novelId),
        emptyLabel: t('reader.noChapters'),
        goBackLabel: t('reader.goBack'),
        pagedContentProps,
        scrollContentProps,
        summaryContentProps,
      }}
      novelId={novelId}
    />
  );
}
