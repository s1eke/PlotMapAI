import type { MouseEvent } from 'react';
import type { ReaderPageViewModel } from './types';
import type { ReaderAnalysisBridgeController, ReaderPageTurnMode } from '@domains/reader-shell';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { analyzeChapter } from '@application/use-cases/analysis';
import { loadReaderSession } from '@application/use-cases/reader';
import { appPaths } from '@shared/routing/appPaths';
import { ChapterAnalysisPanel, analysisService } from '@domains/analysis';
import {
  useContentClick,
  useReaderInput,
  useReaderMobileBack,
  useSidebarDrag,
} from '@domains/reader-interaction';
import { useReaderPageImageOverlay } from '@domains/reader-media';
import { useReaderPreferences } from '@domains/reader-shell';
import { AppErrorCode } from '@shared/errors';
import { isReaderTraceEnabled, recordReaderTrace } from '@shared/reader-trace';
import { useReaderViewportContext } from '@shared/reader-runtime';
import { resolveContentModeFromPageTurnMode } from '@shared/utils/readerMode';
import { useReaderReparseRecoveryController } from './useReaderReparseRecoveryController';
import { useReaderReadingSurfaceController } from './useReaderReadingSurfaceController';

const readerAnalysisController: ReaderAnalysisBridgeController = {
  analyzeChapter,
  getChapterAnalysis: analysisService.getChapterAnalysis,
  getStatus: analysisService.getStatus,
  renderSummaryPanel: ({
    analysis,
    isAnalyzingChapter,
    isLoading,
    job,
    novelId,
    onAnalyzeChapter,
  }) => (
    <ChapterAnalysisPanel
      analysis={analysis}
      job={job}
      isLoading={isLoading}
      onAnalyzeChapter={onAnalyzeChapter}
      isAnalyzingChapter={isAnalyzingChapter}
      progressHref={appPaths.novel(novelId)}
      settingsHref={appPaths.settings()}
    />
  ),
};

export function useReaderPageViewModel(novelId: number): ReaderPageViewModel {
  const { t } = useTranslation();
  const novelDetailHref = appPaths.novel(novelId);
  const { contentRef } = useReaderViewportContext();
  const pageTurnLockedRef = useRef(false);
  const wheelDeltaRef = useRef(0);
  const [readerFileType, setReaderFileType] = useState('epub');
  const resetInteractionState = useCallback((): void => {
    wheelDeltaRef.current = 0;
    pageTurnLockedRef.current = false;
  }, []);

  const preferences = useReaderPreferences();
  const sidebar = useSidebarDrag();
  const closeSidebar = useCallback((): void => {
    sidebar.setIsSidebarOpen(false);
  }, [sidebar]);
  const surfaceController = useReaderReadingSurfaceController({
    analysisController: readerAnalysisController,
    novelId,
    preferences,
    resetInteractionState,
  });
  const {
    chapterData,
    lifecycle,
    modeSwitchError,
    navigation,
    restore,
    sessionSnapshot,
    viewport,
  } = surfaceController;
  const {
    chapterIndex,
    isPagedMode,
    lastContentMode,
    mode,
    viewMode,
  } = sessionSnapshot;

  useEffect(() => {
    let active = true;

    loadReaderSession(novelId)
      .then(({ novel }) => {
        if (active) {
          setReaderFileType(novel.fileType);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [novelId]);
  const reparseRecoveryController = useReaderReparseRecoveryController({
    fileType: readerFileType,
    novelId,
    onReparsed: () => {
      window.location.reload();
    },
  });

  const {
    isChromeVisible,
    setIsChromeVisible,
    handleContentClick,
  } = useContentClick(isPagedMode, navigation.handlePrev, navigation.handleNext);
  const dismissBlockedInteraction = useCallback((): void => {
    if (sidebar.isSidebarOpen) {
      closeSidebar();
    }
    if (isChromeVisible) {
      setIsChromeVisible(false);
    }
    resetInteractionState();
  }, [
    closeSidebar,
    isChromeVisible,
    resetInteractionState,
    setIsChromeVisible,
    sidebar.isSidebarOpen,
  ]);

  const imageOverlay = useReaderPageImageOverlay({
    dismissBlockedInteraction,
    isEnabled: viewMode === 'original',
    novelId,
  });
  const { handleMobileBack } = useReaderMobileBack({
    closeImageViewer: imageOverlay.closeImageViewer,
    fallbackHref: novelDetailHref,
    isImageViewerOpen: imageOverlay.isImageViewerOpen,
    isSidebarOpen: sidebar.isSidebarOpen,
    closeSidebar,
  });
  const isContentInteractionLocked =
    isChromeVisible || sidebar.isSidebarOpen || imageOverlay.isImageViewerOpen;
  const viewportContent = viewport.buildContentProps({
    imageHandlers: {
      onImageActivate: imageOverlay.handleImageActivate,
      onRegisterImageElement: imageOverlay.handleRegisterImageElement,
    },
    interactionLocked: isContentInteractionLocked,
  });

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
  const readerError = modeSwitchError ?? lifecycle.readerError;

  const handleSetPageTurnMode = useCallback((nextMode: ReaderPageTurnMode): void => {
    if (nextMode === preferences.pageTurnMode) {
      return;
    }

    const nextContentMode = resolveContentModeFromPageTurnMode(nextMode);
    if (isReaderTraceEnabled()) {
      recordReaderTrace('page_turn_mode_requested', {
        chapterIndex,
        mode,
        pageTurnMode: nextMode,
        restoreStatus: lifecycle.lifecycleStatus,
        details: {
          currentMode: mode,
          currentPageTurnMode: preferences.pageTurnMode,
          lastContentMode,
          nextContentMode,
          nextPageTurnMode: nextMode,
          viewMode,
        },
      });
    }

    preferences.setPageTurnMode(nextMode);

    if (mode === 'summary') {
      if (lastContentMode !== nextContentMode) {
        restore.setLastContentMode(nextContentMode);
      }
      return;
    }

    if (mode !== nextContentMode) {
      restore.switchMode(nextContentMode);
    }
  }, [
    chapterIndex,
    lastContentMode,
    lifecycle.lifecycleStatus,
    mode,
    preferences,
    restore,
    viewMode,
  ]);

  const handleSetViewMode = useCallback((nextViewMode: 'original' | 'summary'): void => {
    restore.switchMode(nextViewMode === 'summary' ? 'summary' : lastContentMode);
  }, [lastContentMode, restore]);

  const handleViewportClick = useCallback((event: MouseEvent<HTMLDivElement>): void => {
    if (sidebar.isSidebarOpen) {
      dismissBlockedInteraction();
      return;
    }

    handleContentClick(event);
  }, [dismissBlockedInteraction, handleContentClick, sidebar.isSidebarOpen]);

  const handleSelectChapter = useCallback((index: number): void => {
    navigation.goToChapter(index, 'start');
    sidebar.setIsSidebarOpen(false);
  }, [navigation, sidebar]);

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

  return {
    backHref: novelDetailHref,
    imageViewerProps: imageOverlay.imageViewerProps,
    pageBgClassName: preferences.currentTheme.bg,
    readerError,
    reparseRecovery: {
      ...reparseRecoveryController,
      visible: readerError?.code === AppErrorCode.CHAPTER_STRUCTURED_CONTENT_MISSING,
    },
    sidebarProps: {
      chapters: chapterData.chapters,
      currentIndex: chapterIndex,
      contentTextColor: preferences.currentTheme.text,
      isSidebarOpen: sidebar.isSidebarOpen,
      sidebarBgClassName: preferences.currentTheme.sidebarBg,
      onClose: closeSidebar,
      onSelectChapter: handleSelectChapter,
    },
    toolbarProps,
    topBarProps: {
      readerTheme: preferences.readerTheme,
      headerBgClassName: preferences.headerBg,
      textClassName: preferences.currentTheme.text,
      isChromeVisible,
      isSidebarOpen: sidebar.isSidebarOpen,
      exitHref: novelDetailHref,
      viewMode,
      onMobileBack: handleMobileBack,
      onToggleSidebar: sidebar.toggleSidebar,
      onSetViewMode: handleSetViewMode,
    },
    viewportProps: {
      contentRef,
      isPagedMode,
      interactionLocked: isContentInteractionLocked,
      viewMode,
      renderableChapter: viewport.renderableChapter,
      showLoadingOverlay: lifecycle.showLoadingOverlay,
      isRestoringPosition: lifecycle.isRestoringPosition,
      restoreStatus: lifecycle.lifecycleStatus,
      loadingLabel: lifecycle.loadingLabel,
      onBlockedInteraction: dismissBlockedInteraction,
      onContentClick: handleViewportClick,
      onContentScroll: viewport.handleViewportScroll,
      emptyHref: novelDetailHref,
      emptyLabel: t('reader.noChapters'),
      goBackLabel: t('reader.goBack'),
      pagedContentProps: viewportContent.pagedContentProps,
      scrollContentProps: viewportContent.scrollContentProps,
      summaryContentProps: viewportContent.summaryContentProps,
    },
  };
}
