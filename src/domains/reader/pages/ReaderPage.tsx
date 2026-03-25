import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { appPaths } from '@app/router/paths';
import { useChapterAnalysis } from '@domains/analysis';

import type { Chapter, ChapterContent } from '../api/readerApi';
import ReaderSidebar from '../components/reader/ReaderSidebar';
import ReaderTopBar from '../components/reader/ReaderTopBar';
import ReaderViewport from '../components/reader/ReaderViewport';
import ReaderToolbar from '../components/ReaderToolbar';
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
import {
  getReaderSessionSnapshot,
  setChapterIndex as setSessionChapterIndex,
  setMode as setSessionMode,
  useReaderSessionSelector,
} from '../hooks/sessionStore';

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
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [scrollModeChapters, setScrollModeChapters] = useState<number[]>([]);
  const [scrollReaderChapters, setScrollReaderChapters] = useState<Array<{ index: number; chapter: ChapterContent }>>([]);

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
  const { chapterIndex, isTwoColumn, restoreStatus, viewMode } = useReaderSessionSelector(state => ({
    chapterIndex: state.chapterIndex,
    isTwoColumn: state.isTwoColumn,
    restoreStatus: state.restoreStatus,
    viewMode: state.viewMode,
  }));
  const analysis = useChapterAnalysis(novelId, viewMode === 'summary' ? chapterIndex : -1);
  const isPagedMode = isTwoColumn && viewMode === 'original';

  const setChapterIndex = useCallback((nextState: React.SetStateAction<number>) => {
    const current = getReaderSessionSnapshot().chapterIndex;
    const nextValue = typeof nextState === 'function'
      ? nextState(current)
      : nextState;
    setSessionChapterIndex(nextValue, { persistRemote: false });
  }, []);

  const setViewMode = useCallback((nextState: React.SetStateAction<'original' | 'summary'>) => {
    const currentSnapshot = getReaderSessionSnapshot();
    const currentViewMode = currentSnapshot.viewMode;
    const nextValue = typeof nextState === 'function'
      ? nextState(currentViewMode)
      : nextState;
    const nextMode = nextValue === 'summary'
      ? 'summary'
      : currentSnapshot.lastContentMode;
    setSessionMode(nextMode, { persistRemote: false });
  }, []);

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
  });

  const handleReadingAnchorChange = useCallback((anchor: ScrollModeAnchor) => {
    readingAnchorHandlerRef.current(anchor);
  }, []);

  const scrollMode = useScrollModeChapters(
    contentRef,
    isPagedMode,
    viewMode,
    chapters,
    chapterCacheRef,
    chapterData.fetchChapterContent,
    chapterData.preloadAdjacent,
    scrollModeChapters,
    setScrollModeChapters,
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
  }, [currentChapter, scrollModeChapters]);

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
  });

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
    restoreFlow.handleBeforeChapterChange,
  );

  useReaderInput(
    contentRef,
    isPagedMode,
    navigation.goToNextPage,
    navigation.goToPrevPage,
    navigation.goToChapter,
    chapterIndex,
    currentChapter,
    isLoading,
    wheelDeltaRef,
    pageTurnLockedRef,
  );

  const contentClick = useContentClick(isPagedMode, navigation.handlePrev, navigation.handleNext);
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

  return (
    <div className={cn('flex h-screen w-full overflow-hidden transition-colors duration-300', preferences.currentTheme.bg)}>
      <ReaderSidebar
        chapters={chapters}
        currentIndex={chapterIndex}
        contentTextColor={preferences.currentTheme.text}
        isSidebarOpen={sidebar.isSidebarOpen}
        dragOffset={sidebar.dragOffset}
        sidebarBgClassName={preferences.currentTheme.sidebarBg}
        onClose={() => sidebar.setIsSidebarOpen(false)}
        onSelectChapter={handleSelectChapter}
        onDragStart={sidebar.handleDragStart}
        onDragMove={sidebar.handleDragMove}
        onDragEnd={sidebar.handleDragEnd}
      />

      <main className="flex-1 flex flex-col min-w-0 relative text-text-primary">
        <ReaderTopBar
          isChromeVisible={contentClick.isChromeVisible}
          isSidebarOpen={sidebar.isSidebarOpen}
          novelId={novelId}
          viewMode={viewMode}
          onToggleSidebar={sidebar.toggleSidebar}
          onSetViewMode={restoreFlow.handleSetViewMode}
        />

        <ReaderViewport
          contentRef={contentRef}
          isPagedMode={isPagedMode}
          viewMode={viewMode}
          renderableChapter={renderableChapter}
          showLoadingOverlay={showLoadingOverlay}
          isRestoringPosition={restoreFlow.isRestoringPosition}
          onContentClick={contentClick.handleContentClick}
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
            fitsTwoColumns: pagedLayout.fitsTwoColumns,
            twoColumnWidth: pagedLayout.twoColumnWidth,
            twoColumnGap: pagedLayout.twoColumnGap,
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
            isTwoColumn={isTwoColumn}
            setIsTwoColumn={restoreFlow.handleSetIsTwoColumn}
            hasPrev={toolbarHasPrev}
            hasNext={toolbarHasNext}
            onPrev={navigation.handlePrev}
            onNext={navigation.handleNext}
            navigationMode={isPagedMode ? 'page' : 'chapter'}
            readerTheme={preferences.readerTheme}
            setReaderTheme={preferences.setReaderTheme}
            hidden={!contentClick.isChromeVisible}
            isSidebarOpen={sidebar.isSidebarOpen}
            onToggleSidebar={sidebar.toggleSidebar}
          />
        )}
      </main>
    </div>
  );
}
