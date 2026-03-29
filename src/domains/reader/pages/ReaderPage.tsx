import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { appPaths } from '@app/router/paths';
import { useChapterAnalysis } from '@domains/analysis';
import { translateAppError, type AppError } from '@shared/errors';

import type { Chapter, ChapterContent } from '../api/readerApi';
import ReaderSidebar from '../components/reader/ReaderSidebar';
import ReaderTopBar from '../components/reader/ReaderTopBar';
import ReaderViewport from '../components/reader/ReaderViewport';
import ReaderToolbar from '../components/ReaderToolbar';
import { isPagedPageTurnMode, type ReaderPageTurnMode } from '../constants/pageTurnMode';
import { cn } from '@shared/utils/cn';
import { useReaderPreferences } from '../hooks/useReaderPreferences';
import { useReaderStatePersistence } from '../hooks/useReaderStatePersistence';
import type { PageTarget } from '../hooks/useReaderStatePersistence';
import { useSidebarDrag } from '../hooks/useSidebarDrag';
import { useReaderNavigation } from '../hooks/useReaderNavigation';
import { useReaderInput } from '../hooks/useReaderInput';
import { useScrollModeChapters } from '../hooks/useScrollModeChapters';
import type { ScrollModeAnchor } from '../hooks/useScrollModeChapters';
import { useContentClick } from '../hooks/useContentClick';
import { useReaderRestoreFlow } from '../hooks/useReaderRestoreFlow';
import { useReaderChapterData } from '../hooks/useReaderChapterData';
import { usePagedReaderLayout } from '../hooks/usePagedReaderLayout';
import { useReaderMobileBack } from '../hooks/useReaderMobileBack';
import {
  getReaderSessionSnapshot,
  setChapterIndex as setSessionChapterIndex,
  setMode as setSessionMode,
  useReaderSessionSelector,
} from '../hooks/sessionStore';
import { clearReaderImageResourcesForNovel } from '../utils/readerImageResourceCache';

export default function ReaderPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const novelId = Number(id);
  const {
    hasHydratedReaderState,
    setHasHydratedReaderState,
    latestReaderStateRef,
    hasUserInteractedRef,
    markUserInteracted,
    persistReaderState,
    loadPersistedReaderState,
  } = useReaderStatePersistence(novelId);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState<ChapterContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [readerError, setReaderError] = useState<AppError | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [scrollModeChapters, setScrollModeChapters] = useState<number[]>([]);
  const [scrollReaderChapters, setScrollReaderChapters] = useState<Array<{ index: number; chapter: ChapterContent }>>([]);
  const [chapterCacheSnapshotState, setChapterCacheSnapshotState] = useState<{
    novelId: number;
    snapshot: Map<number, ChapterContent>;
  }>({
    novelId,
    snapshot: new Map(),
  });
  const [scrollContentVersion, setScrollContentVersion] = useState(0);

  const contentRef = useRef<HTMLDivElement>(null);
  const pagedViewportRef = useRef<HTMLDivElement>(null);
  const pagedContentRef = useRef<HTMLDivElement>(null);
  const pageTargetRef = useRef<PageTarget>('start');
  const wheelDeltaRef = useRef(0);
  const pageTurnLockedRef = useRef(false);
  const chapterCacheRef = useRef<Map<number, ChapterContent>>(new Map());
  const scrollChapterElementsBridgeRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const getCurrentAnchorRef = useRef<() => ScrollModeAnchor | null>(() => null);
  const handleScrollModeScrollRef = useRef<() => void>(() => {});
  const readingAnchorHandlerRef = useRef<(anchor: ScrollModeAnchor) => void>(() => {});

  const preferences = useReaderPreferences();
  const sidebar = useSidebarDrag();
  const closeSidebar = useCallback(() => {
    sidebar.setIsSidebarOpen(false);
  }, [sidebar]);
  const { chapterIndex, restoreStatus, viewMode } = useReaderSessionSelector(state => ({
    chapterIndex: state.chapterIndex,
    restoreStatus: state.restoreStatus,
    viewMode: state.viewMode,
  }));
  const analysis = useChapterAnalysis(novelId, viewMode === 'summary' ? chapterIndex : -1);
  const isTwoColumn = isPagedPageTurnMode(preferences.pageTurnMode);
  const isPagedMode = isTwoColumn && viewMode === 'original';
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

  const setViewMode = useCallback((nextState: React.SetStateAction<'original' | 'summary'>) => {
    const currentViewMode = getReaderSessionSnapshot().viewMode;
    const nextValue = typeof nextState === 'function'
      ? nextState(currentViewMode)
      : nextState;
    const nextMode = nextValue === 'summary'
      ? 'summary'
      : isPagedPageTurnMode(preferences.pageTurnMode) ? 'paged' : 'scroll';
    setSessionMode(nextMode, { persistRemote: false });
  }, [preferences.pageTurnMode]);

  const setIsTwoColumn = useCallback((nextState: React.SetStateAction<boolean>) => {
    const currentSnapshot = getReaderSessionSnapshot();
    const currentValue = currentSnapshot.isTwoColumn;
    const nextValue = typeof nextState === 'function'
      ? nextState(currentValue)
      : nextState;
    if (currentSnapshot.viewMode === 'summary') {
      return;
    }
    setSessionMode(nextValue ? 'paged' : 'scroll', { persistRemote: false });
  }, []);

  const restoreFlow = useReaderRestoreFlow({
    novelId,
    chapterIndex,
    setChapterIndex,
    viewMode,
    setViewMode,
    isTwoColumn,
    setIsTwoColumn,
    isPagedMode,
    pageIndex,
    pageCount,
    currentChapter,
    isLoading,
    scrollModeChapters,
    contentRef,
    scrollChapterElementsRef: scrollChapterElementsBridgeRef,
    latestReaderStateRef,
    hasHydratedReaderState,
    markUserInteracted,
    persistReaderState,
    getCurrentAnchorRef,
    handleScrollModeScrollRef,
    readingAnchorHandlerRef,
    summaryRestoreSignal: analysis.chapterAnalysis,
    isChapterAnalysisLoading: analysis.isChapterAnalysisLoading,
  });

  const handleScrollContentResolved = useCallback(() => {
    setChapterCacheSnapshotState({
      novelId,
      snapshot: new Map(chapterCacheRef.current),
    });
    setScrollContentVersion(prev => prev + 1);
  }, [novelId]);

  const chapterData = useReaderChapterData({
    novelId,
    chapterIndex,
    viewMode,
    isPagedMode,
    isTwoColumn,
    chapters,
    setChapters,
    setCurrentChapter,
    setCurrentChapterWindow: setScrollModeChapters,
    setIsLoading,
    setChapterIndex,
    setViewMode,
    setIsTwoColumn,
    setPageIndex,
    setPageCount,
    setReaderError,
    contentRef,
    pagedViewportRef,
    chapterCacheRef,
    latestReaderStateRef,
    hasUserInteractedRef,
    wheelDeltaRef,
    pageTurnLockedRef,
    pageTargetRef,
    chapterChangeSourceRef: restoreFlow.chapterChangeSourceRef,
    loadPersistedReaderState,
    setHasHydratedReaderState,
    setPendingRestoreState: restoreFlow.setPendingRestoreState,
    clearPendingRestoreState: restoreFlow.clearPendingRestoreState,
    suppressScrollSyncTemporarily: restoreFlow.suppressScrollSyncTemporarily,
    startRestoreMaskForState: restoreFlow.startRestoreMaskForState,
    stopRestoreMask: restoreFlow.stopRestoreMask,
    setLoadingMessage,
    onChapterContentResolved: handleScrollContentResolved,
  });

  const handleReadingAnchorChange = useCallback((anchor: ScrollModeAnchor) => {
    readingAnchorHandlerRef.current(anchor);
  }, []);

  const scrollMode = useScrollModeChapters(
    contentRef,
    isPagedMode,
    viewMode,
    chapters,
    chapterData.fetchChapterContent,
    chapterData.preloadAdjacent,
    scrollModeChapters,
    setScrollModeChapters,
    scrollContentVersion,
    handleReadingAnchorChange,
  );

  useEffect(() => {
    getCurrentAnchorRef.current = scrollMode.getCurrentAnchor;
    handleScrollModeScrollRef.current = scrollMode.handleScroll;
    return () => {
      getCurrentAnchorRef.current = () => null;
      handleScrollModeScrollRef.current = () => {};
    };
  }, [scrollMode]);

  useEffect(() => {
    setScrollReaderChapters(
      scrollModeChapters
        .map((index) => {
          const chapter = chapterCacheRef.current.get(index);
          return chapter ? { index, chapter } : null;
        })
        .filter((item): item is { index: number; chapter: ChapterContent } => Boolean(item)),
    );
  }, [currentChapter, scrollContentVersion, scrollModeChapters]);

  useEffect(() => {
    return () => {
      clearReaderImageResourcesForNovel(novelId);
    };
  }, [novelId]);

  const chapterCacheSnapshot = chapterCacheSnapshotState.novelId === novelId
    ? chapterCacheSnapshotState.snapshot
    : new Map<number, ChapterContent>();

  const previousChapterPreview = currentChapter?.hasPrev
    ? chapterCacheSnapshot.get(chapterIndex - 1) ?? null
    : null;
  const nextChapterPreview = currentChapter?.hasNext
    ? chapterCacheSnapshot.get(chapterIndex + 1) ?? null
    : null;

  const pagedLayout = usePagedReaderLayout({
    chapterIndex,
    currentChapter,
    isLoading,
    isPagedMode,
    pagedViewportRef,
    pagedContentRef,
    pageIndex,
    pageTargetRef,
    pendingRestoreStateRef: restoreFlow.pendingRestoreStateRef,
    clearPendingRestoreState: restoreFlow.clearPendingRestoreState,
    stopRestoreMask: restoreFlow.stopRestoreMask,
    setPageCount,
    setPageIndex,
    fontSize: preferences.fontSize,
    lineSpacing: preferences.lineSpacing,
    paragraphSpacing: preferences.paragraphSpacing,
  });

  const isChapterNavigationReady = !isLoading
    && currentChapter?.index === chapterIndex
    && (!isPagedMode || pagedLayout.readyChapterIndex === chapterIndex);

  const navigation = useReaderNavigation(
    chapterIndex,
    setChapterIndex,
    currentChapter,
    isPagedMode,
    pageIndex,
    setPageIndex,
    pageCount,
    persistReaderState,
    pageTargetRef,
    chapters,
    scrollModeChapters,
    hasUserInteractedRef,
    restoreFlow.chapterChangeSourceRef,
    isChapterNavigationReady,
    restoreFlow.handleBeforeChapterChange,
  );

  const {
    isChromeVisible,
    setIsChromeVisible,
    handleContentClick,
  } = useContentClick(isPagedMode, navigation.handlePrev, navigation.handleNext);
  const isContentInteractionLocked = isChromeVisible || sidebar.isSidebarOpen;

  useReaderInput(
    contentRef,
    isPagedMode,
    navigation.goToNextPage,
    navigation.goToPrevPage,
    navigation.goToChapter,
    chapterIndex,
    currentChapter,
    isLoading,
    isContentInteractionLocked,
    wheelDeltaRef,
    pageTurnLockedRef,
  );

  const handleSetPageTurnMode = useCallback((nextMode: ReaderPageTurnMode) => {
    if (nextMode === preferences.pageTurnMode) {
      return;
    }

    const currentIsPagedMode = isPagedPageTurnMode(preferences.pageTurnMode);
    const nextIsPagedMode = isPagedPageTurnMode(nextMode);

    preferences.setPageTurnMode(nextMode);

    if (viewMode !== 'original') {
      return;
    }

    if (currentIsPagedMode !== nextIsPagedMode) {
      restoreFlow.handleSetIsTwoColumn(nextIsPagedMode);
    }
  }, [preferences, restoreFlow, viewMode]);

  const handleViewportClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (sidebar.isSidebarOpen) {
      closeSidebar();
      setIsChromeVisible(false);
      return;
    }

    handleContentClick(event);
  }, [closeSidebar, handleContentClick, setIsChromeVisible, sidebar.isSidebarOpen]);
  const toolbarHasPrev = navigation.toolbarHasPrev;
  const toolbarHasNext = navigation.toolbarHasNext;

  const handleSelectChapter = useCallback((index: number) => {
    navigation.goToChapter(index, 'start');
    sidebar.setIsSidebarOpen(false);
  }, [navigation, sidebar]);

  const handleScrollChapterElement = useCallback((index: number, element: HTMLDivElement | null) => {
    if (element) {
      scrollMode.scrollChapterElementsRef.current.set(index, element);
      scrollChapterElementsBridgeRef.current.set(index, element);
      return;
    }

    scrollMode.scrollChapterElementsRef.current.delete(index);
    scrollChapterElementsBridgeRef.current.delete(index);
  }, [scrollMode.scrollChapterElementsRef]);

  const renderableChapter = !isLoading ? currentChapter : null;
  const showLoadingOverlay = isLoading || restoreStatus === 'restoring';

  if (readerError) {
    return (
      <div className={cn('flex h-screen w-full items-center justify-center px-6 transition-colors duration-300', preferences.currentTheme.bg)}>
        <div className="w-full max-w-lg rounded-3xl border border-red-500/20 bg-card-bg/90 p-8 text-center shadow-xl">
          <p className="text-lg font-semibold text-text-primary">
            {translateAppError(readerError, t, 'reader.loadError')}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              {t('common.actions.retry')}
            </button>
            <Link
              to={appPaths.novel(novelId)}
              className="rounded-xl border border-border-color/30 px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/5"
            >
              {t('reader.goBack')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-screen w-full overflow-hidden transition-colors duration-300', preferences.currentTheme.bg)}>
      <ReaderSidebar
        chapters={chapters}
        currentIndex={chapterIndex}
        contentTextColor={preferences.currentTheme.text}
        isSidebarOpen={sidebar.isSidebarOpen}
        sidebarBgClassName={preferences.currentTheme.sidebarBg}
        onClose={closeSidebar}
        onSelectChapter={handleSelectChapter}
      />

      <main className="flex-1 flex flex-col min-w-0 relative text-text-primary">
        <ReaderTopBar
          readerTheme={preferences.readerTheme}
          headerBgClassName={preferences.headerBg}
          textClassName={preferences.currentTheme.text}
          isChromeVisible={isChromeVisible}
          isSidebarOpen={sidebar.isSidebarOpen}
          novelId={novelId}
          viewMode={viewMode}
          onMobileBack={handleMobileBack}
          onToggleSidebar={sidebar.toggleSidebar}
          onSetViewMode={restoreFlow.handleSetViewMode}
        />

        <ReaderViewport
          contentRef={contentRef}
          isPagedMode={isPagedMode}
          interactionLocked={isContentInteractionLocked}
          viewMode={viewMode}
          renderableChapter={renderableChapter}
          showLoadingOverlay={showLoadingOverlay}
          isRestoringPosition={restoreFlow.isRestoringPosition}
          loadingLabel={restoreStatus === 'restoring' ? t('reader.restoringPosition') : loadingMessage}
          onContentClick={handleViewportClick}
          onContentScroll={restoreFlow.handleContentScroll}
          emptyHref={appPaths.novel(novelId)}
          emptyLabel={t('reader.noChapters')}
          goBackLabel={t('reader.goBack')}
          pagedContentProps={renderableChapter ? {
            chapter: renderableChapter,
            novelId,
            pageIndex,
            pageCount,
            pagedViewportRef,
            pagedContentRef,
            fontSize: preferences.fontSize,
            lineSpacing: preferences.lineSpacing,
            paragraphSpacing: preferences.paragraphSpacing,
            readerTheme: preferences.readerTheme,
            textClassName: preferences.currentTheme.text,
            headerBgClassName: preferences.headerBg,
            pageBgClassName: preferences.currentTheme.bg,
            fitsTwoColumns: pagedLayout.fitsTwoColumns,
            pageTurnStep: pagedLayout.pageTurnStep,
            twoColumnWidth: pagedLayout.twoColumnWidth,
            twoColumnGap: pagedLayout.twoColumnGap,
            pageTurnMode: preferences.pageTurnMode,
            pageTurnDirection: navigation.pageTurnDirection,
            pageTurnToken: navigation.pageTurnToken,
            previousChapterPreview,
            nextChapterPreview,
            onRequestPrevPage: navigation.goToPrevPageSilently,
            onRequestNextPage: navigation.goToNextPageSilently,
            disableAnimation: restoreFlow.isRestoringPosition,
            interactionLocked: isContentInteractionLocked,
          } : undefined}
          scrollContentProps={renderableChapter && viewMode === 'original' && !isPagedMode ? {
            chapters: scrollReaderChapters,
            novelId,
            fontSize: preferences.fontSize,
            lineSpacing: preferences.lineSpacing,
            paragraphSpacing: preferences.paragraphSpacing,
            readerTheme: preferences.readerTheme,
            textClassName: preferences.currentTheme.text,
            headerBgClassName: preferences.headerBg,
            onChapterElement: handleScrollChapterElement,
          } : undefined}
          summaryContentProps={renderableChapter && viewMode === 'summary' ? {
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
          } : undefined}
        />

        {currentChapter && !showLoadingOverlay && (
          <ReaderToolbar
            sliders={{
              fontSize: preferences.fontSize,
              setFontSize: preferences.setFontSize,
              lineSpacing: preferences.lineSpacing,
              setLineSpacing: preferences.setLineSpacing,
              paragraphSpacing: preferences.paragraphSpacing,
              setParagraphSpacing: preferences.setParagraphSpacing,
            }}
            pageTurnMode={preferences.pageTurnMode}
            setPageTurnMode={handleSetPageTurnMode}
            hasPrev={toolbarHasPrev}
            hasNext={toolbarHasNext}
            onPrev={navigation.handlePrev}
            onNext={navigation.handleNext}
            navigationMode={isPagedMode ? 'page' : 'chapter'}
            readerTheme={preferences.readerTheme}
            headerBgClassName={preferences.headerBg}
            textClassName={preferences.currentTheme.text}
            setReaderTheme={preferences.setReaderTheme}
            hidden={!isChromeVisible}
            isSidebarOpen={sidebar.isSidebarOpen}
            onToggleSidebar={sidebar.toggleSidebar}
            onCloseSidebar={closeSidebar}
          />
        )}
      </main>
    </div>
  );
}
