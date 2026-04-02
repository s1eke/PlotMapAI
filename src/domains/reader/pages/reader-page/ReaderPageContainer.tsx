import type { ReaderPageTurnMode } from '../../constants/pageTurnMode';

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { appPaths } from '@app/router/paths';

import { useContentClick } from '../../hooks/useContentClick';
import { useReaderChapterData } from '../../hooks/useReaderChapterData';
import { useReaderInput } from '../../hooks/useReaderInput';
import { useReaderLifecycleController } from '../../hooks/useReaderLifecycleController';
import { useReaderMobileBack } from '../../hooks/useReaderMobileBack';
import { useReaderNavigation } from '../../hooks/useReaderNavigation';
import { useReaderPreferences } from '../../hooks/useReaderPreferences';
import { useReaderRestoreFlow } from '../../hooks/useReaderRestoreFlow';
import { useSidebarDrag } from '../../hooks/useSidebarDrag';
import { useReaderAnalysisBridge } from '../../reader-analysis-bridge';
import {
  usePagedReaderController,
  useScrollReaderController,
} from '../../reader-layout';
import { useReaderSession } from '../../reader-session';
import { resolveContentModeFromPageTurnMode } from '../../utils/readerMode';
import ReaderPageLayout from './ReaderPageLayout';
import { useReaderContext } from './ReaderContext';
import { useReaderPageImageOverlay } from './useReaderPageImageOverlay';

interface ReaderPageContainerProps {
  novelId: number;
}

export default function ReaderPageContainer({
  novelId,
}: ReaderPageContainerProps) {
  const { t } = useTranslation();
  const uiBridge = useReaderContext();
  const session = useReaderSession(novelId);
  const { snapshot: sessionSnapshot, commands: sessionCommands } = session;
  const {
    chapterIndex,
    isPagedMode,
    mode,
    viewMode,
  } = sessionSnapshot;
  const {
    contentRef,
    pageTurnLockedRef,
    restoreSettledHandlerRef,
    wheelDeltaRef,
  } = uiBridge;
  const [chapterContentVersion, setChapterContentVersion] = useState(0);
  const handleChapterContentResolved = useCallback(() => {
    setChapterContentVersion((previousVersion) => previousVersion + 1);
  }, []);

  const preferences = useReaderPreferences();
  const sidebar = useSidebarDrag();
  const closeSidebar = useCallback(() => {
    sidebar.setIsSidebarOpen(false);
  }, [sidebar]);
  const analysis = useReaderAnalysisBridge({
    novelId,
    chapterIndex,
    viewMode,
  });
  const { handleMobileBack } = useReaderMobileBack({
    isSidebarOpen: sidebar.isSidebarOpen,
    closeSidebar,
    novelId,
  });

  const chapterData = useReaderChapterData({
    novelId,
    sessionSnapshot,
    sessionCommands,
    uiBridge,
    onChapterContentResolved: handleChapterContentResolved,
  });

  const restoreFlow = useReaderRestoreFlow({
    sessionSnapshot,
    sessionCommands,
    uiBridge,
    currentChapter: chapterData.currentChapter,
    summaryRestoreSignal: analysis.summaryRestoreSignal,
    isChapterAnalysisLoading: analysis.isChapterAnalysisLoading,
  });

  const scrollController = useScrollReaderController({
    enabled: mode === 'scroll',
    novelId,
    chapters: chapterData.chapters,
    currentChapter: chapterData.currentChapter,
    contentVersion: chapterContentVersion,
    sessionSnapshot,
    sessionCommands,
    uiBridge,
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
    contentVersion: chapterContentVersion,
    sessionSnapshot,
    sessionCommands,
    uiBridge,
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

  restoreSettledHandlerRef.current = lifecycle.handleRestoreSettled;

  const navigation = useReaderNavigation({
    chapters: chapterData.chapters,
    currentChapter: chapterData.currentChapter,
    sessionSnapshot,
    sessionCommands,
    uiBridge,
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
    novelId,
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
    analysisPanel: analysis.summaryPanel,
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
