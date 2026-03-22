import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { Loader2, Menu, X, ArrowLeft, AlignLeft, Bot } from 'lucide-react';
import { readerApi } from '../api/reader';
import type { Chapter, ChapterContent } from '../api/reader';
import ChapterAnalysisPanel from '../components/ChapterAnalysisPanel';
import ChapterList from '../components/ChapterList';
import ChapterParagraph from '../components/ChapterParagraph';
import ReaderToolbar from '../components/ReaderToolbar';
import { cn } from '../utils/cn';
import { useReaderPreferences } from '../hooks/useReaderPreferences';
import type { PageTarget } from '../hooks/useReaderStatePersistence';
import { useSidebarDrag } from '../hooks/useSidebarDrag';
import { useChapterAnalysis } from '../hooks/useChapterAnalysis';
import { useReaderNavigation } from '../hooks/useReaderNavigation';
import { useReaderInput } from '../hooks/useReaderInput';
import { useScrollModeChapters } from '../hooks/useScrollModeChapters';
import { useContentClick } from '../hooks/useContentClick';

const TWO_COLUMN_GAP = 48;
const MIN_COLUMN_WIDTH = 260;

type StoredReaderState = {
  chapterIndex?: number;
  viewMode?: 'original' | 'summary';
  isTwoColumn?: boolean;
};

function getReaderStateKey(novelId: number) {
  return `reader-state:${novelId}`;
}

function readStoredReaderState(novelId: number): StoredReaderState | null {
  if (!novelId) return null;
  try {
    const raw = localStorage.getItem(getReaderStateKey(novelId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredReaderState;
    return {
      chapterIndex: typeof parsed.chapterIndex === 'number' ? parsed.chapterIndex : undefined,
      viewMode: parsed.viewMode === 'summary' || parsed.viewMode === 'original' ? parsed.viewMode : undefined,
      isTwoColumn: typeof parsed.isTwoColumn === 'boolean' ? parsed.isTwoColumn : undefined,
    };
  } catch { return null; }
}

function writeStoredReaderState(novelId: number, state: StoredReaderState) {
  if (!novelId) return;
  localStorage.setItem(getReaderStateKey(novelId), JSON.stringify(state));
}

export default function ReaderPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const novelId = Number(id);
  const initialStoredState = readStoredReaderState(novelId);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState<ChapterContent | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isTwoColumn, setIsTwoColumn] = useState<boolean>(() => initialStoredState?.isTwoColumn ?? false);
  const [viewMode, setViewMode] = useState<'original' | 'summary'>(() => initialStoredState?.viewMode ?? 'original');
  const [chapterIndex, setChapterIndex] = useState<number>(() => initialStoredState?.chapterIndex ?? 0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [scrollModeChapters, setScrollModeChapters] = useState<number[]>([]);
  const [pagedViewportSize, setPagedViewportSize] = useState({ width: 0, height: 0 });
  const [hasHydratedReaderState, setHasHydratedReaderState] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const pagedViewportRef = useRef<HTMLDivElement>(null);
  const pagedContentRef = useRef<HTMLDivElement>(null);
  const pageTargetRef = useRef<PageTarget>('start');
  const wheelDeltaRef = useRef(0);
  const pageTurnLockedRef = useRef(false);
  const latestReaderStateRef = useRef<StoredReaderState>({
    chapterIndex: initialStoredState?.chapterIndex ?? 0,
    viewMode: initialStoredState?.viewMode ?? 'original',
    isTwoColumn: initialStoredState?.isTwoColumn ?? false,
  });
  const hasUserInteractedRef = useRef(false);
  const chapterCacheRef = useRef<Map<number, ChapterContent>>(new Map());

  // Use extracted hooks
  const preferences = useReaderPreferences();
  const sidebar = useSidebarDrag();
  const scrollMode = useScrollModeChapters(
    contentRef, isTwoColumn && viewMode === 'original', viewMode,
    chapters, chapterCacheRef,
    async (idx: number) => {
      const cached = chapterCacheRef.current.get(idx);
      if (cached) return cached;
      const data = await readerApi.getChapterContent(novelId, idx);
      chapterCacheRef.current.set(idx, data);
      return data;
    },
    (idx: number, prune = true) => {
      const toPreload: number[] = [];
      for (let offset = -3; offset <= 3; offset++) {
        if (offset === 0) continue;
        const adj = idx + offset;
        if (adj < 0 || adj >= chapters.length) continue;
        if (chapterCacheRef.current.has(adj)) continue;
        toPreload.push(adj);
      }
      let delay = 50;
      for (const adjIdx of toPreload) {
        window.setTimeout(() => {
          if (chapterCacheRef.current.has(adjIdx)) return;
          readerApi.getChapterContent(novelId, adjIdx).then(d => chapterCacheRef.current.set(adjIdx, d)).catch(() => {});
        }, delay);
        delay += 80;
      }
      if (prune) {
        for (const key of chapterCacheRef.current.keys()) {
          if (Math.abs(key - idx) > 3) chapterCacheRef.current.delete(key);
        }
      }
    },
    scrollModeChapters,
    setScrollModeChapters,
  );

  const isPagedMode = isTwoColumn && viewMode === 'original';
  const chapterParagraphs = currentChapter?.content.split('\n') ?? [];
  const firstNonEmptyIndex = chapterParagraphs.findIndex(p => p.trim().length > 0);
  const skipLineIndex = firstNonEmptyIndex !== -1 && currentChapter && chapterParagraphs[firstNonEmptyIndex].trim() === currentChapter.title.trim() ? firstNonEmptyIndex : -1;

  const persistReaderState = useCallback((nextState: StoredReaderState) => {
    const mergedState: StoredReaderState = {
      chapterIndex: nextState.chapterIndex ?? latestReaderStateRef.current.chapterIndex ?? 0,
      viewMode: nextState.viewMode ?? latestReaderStateRef.current.viewMode ?? 'original',
      isTwoColumn: nextState.isTwoColumn ?? latestReaderStateRef.current.isTwoColumn ?? false,
    };
    latestReaderStateRef.current = mergedState;
    writeStoredReaderState(novelId, mergedState);
  }, [novelId]);

  const handleSetIsTwoColumn = useCallback((twoColumn: boolean) => {
    hasUserInteractedRef.current = true;
    setIsTwoColumn(twoColumn);
    persistReaderState({ isTwoColumn: twoColumn });
  }, [persistReaderState]);

  const handleSetViewMode = useCallback((nextViewMode: 'original' | 'summary') => {
    hasUserInteractedRef.current = true;
    setViewMode(nextViewMode);
    persistReaderState({ viewMode: nextViewMode });
  }, [persistReaderState]);

  const preloadAdjacent = useCallback((idx: number, prune = true) => {
    const toPreload: number[] = [];
    for (let offset = -3; offset <= 3; offset++) {
      if (offset === 0) continue;
      const adjacentIdx = idx + offset;
      if (adjacentIdx < 0 || adjacentIdx >= chapters.length) continue;
      if (chapterCacheRef.current.has(adjacentIdx)) continue;
      toPreload.push(adjacentIdx);
    }
    let delay = 50;
    for (const adjIdx of toPreload) {
      window.setTimeout(() => {
        if (chapterCacheRef.current.has(adjIdx)) return;
        readerApi.getChapterContent(novelId, adjIdx).then(data => chapterCacheRef.current.set(adjIdx, data)).catch(() => {});
      }, delay);
      delay += 80;
    }
    if (prune) {
      for (const key of chapterCacheRef.current.keys()) {
        if (Math.abs(key - idx) > 3) chapterCacheRef.current.delete(key);
      }
    }
  }, [novelId, chapters.length]);

  // Original init effect
  useEffect(() => {
    if (!novelId) return;
    let cancelled = false;
    const init = async () => {
      setIsLoading(true);
      setHasHydratedReaderState(false);
      hasUserInteractedRef.current = false;
      const storedState = readStoredReaderState(novelId);
      const nextStoredState: StoredReaderState = {
        chapterIndex: storedState?.chapterIndex ?? 0,
        viewMode: storedState?.viewMode ?? 'original',
        isTwoColumn: storedState?.isTwoColumn ?? false,
      };
      latestReaderStateRef.current = nextStoredState;
      setIsTwoColumn(nextStoredState.isTwoColumn ?? false);
      setViewMode(nextStoredState.viewMode ?? 'original');
      setChapterIndex(nextStoredState.chapterIndex ?? 0);
      try {
        const [toc, progress] = await Promise.all([
          readerApi.getChapters(novelId),
          readerApi.getProgress(novelId).catch(() => null),
        ]);
        if (cancelled) return;
        setChapters(toc);
        if (!hasUserInteractedRef.current) {
          const fallbackIndex = toc.length > 0 ? toc[0].index : 0;
          const nextChapterIndex = storedState?.chapterIndex ?? progress?.chapterIndex ?? fallbackIndex;
          const nextViewMode = storedState?.viewMode ?? progress?.viewMode ?? 'original';
          const hasChapter = toc.some((chapter) => chapter.index === nextChapterIndex);
          const resolvedChapterIndex = hasChapter ? nextChapterIndex : fallbackIndex;
          latestReaderStateRef.current = { chapterIndex: resolvedChapterIndex, viewMode: nextViewMode, isTwoColumn: nextStoredState.isTwoColumn };
          setViewMode(nextViewMode);
          setChapterIndex(resolvedChapterIndex);
        }
      } catch (err) {
        if (!cancelled) console.error('Failed to load reader init data:', err);
      } finally {
        if (!cancelled) setHasHydratedReaderState(true);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [novelId]);

  // Original fetch effect
  useEffect(() => {
    if (!novelId || chapterIndex === undefined) return;
    let cancelled = false;
    const fetchContent = async () => {
      const cached = chapterCacheRef.current.get(chapterIndex);
      if (cached) {
        if (cancelled) return;
        setCurrentChapter(cached);
        setPageIndex(0);
        setPageCount(1);
        wheelDeltaRef.current = 0;
        pageTurnLockedRef.current = false;
        if (!isPagedMode) setScrollModeChapters([chapterIndex]);
        if (contentRef.current) { contentRef.current.scrollTop = 0; contentRef.current.scrollLeft = 0; }
        if (pagedViewportRef.current) pagedViewportRef.current.scrollLeft = 0;
        preloadAdjacent(chapterIndex);
        readerApi.saveProgress(novelId, { chapterIndex, viewMode }).catch(console.error);
        return;
      }
      setIsLoading(true);
      try {
        const data = await readerApi.getChapterContent(novelId, chapterIndex);
        if (cancelled) return;
        chapterCacheRef.current.set(chapterIndex, data);
        setCurrentChapter(data);
        setPageIndex(0);
        setPageCount(1);
        wheelDeltaRef.current = 0;
        pageTurnLockedRef.current = false;
        if (!isPagedMode) setScrollModeChapters([chapterIndex]);
        if (contentRef.current) { contentRef.current.scrollTop = 0; contentRef.current.scrollLeft = 0; }
        if (pagedViewportRef.current) pagedViewportRef.current.scrollLeft = 0;
        preloadAdjacent(chapterIndex);
        readerApi.saveProgress(novelId, { chapterIndex, viewMode }).catch(console.error);
      } catch (err) {
        if (!cancelled) console.error('Failed to load chapter content', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchContent();
    return () => { cancelled = true; };
  }, [novelId, chapterIndex, viewMode, isPagedMode, preloadAdjacent]);

  // Analysis effects
  const analysis = useChapterAnalysis(novelId, chapterIndex);

  // Persist effect
  useEffect(() => {
    if (!novelId || !hasHydratedReaderState) return;
    persistReaderState({ chapterIndex, viewMode, isTwoColumn });
  }, [chapterIndex, hasHydratedReaderState, isTwoColumn, novelId, persistReaderState, viewMode]);

  // Sync ref
  useEffect(() => {
    latestReaderStateRef.current = { chapterIndex, viewMode, isTwoColumn };
  }, [chapterIndex, isTwoColumn, viewMode]);

  // Navigation
  const navigation = useReaderNavigation(
    chapterIndex, setChapterIndex, currentChapter, isPagedMode,
    pageIndex, setPageIndex, pageCount, persistReaderState, pageTargetRef,
    chapters, scrollModeChapters, hasUserInteractedRef,
  );

  // Input
  useReaderInput(contentRef, isPagedMode, navigation.goToNextPage, navigation.goToPrevPage, navigation.goToChapter, chapterIndex, currentChapter, isLoading, wheelDeltaRef, pageTurnLockedRef);

  // Content click
  const contentClick = useContentClick(isPagedMode, navigation.handlePrev, navigation.handleNext);

  // Sidebar drag (already extracted above)

  // Toolbar state
  const toolbarHasPrev = isPagedMode
    ? pageIndex > 0 || Boolean(currentChapter?.hasPrev)
    : scrollModeChapters.length > 0 ? scrollModeChapters[0] > 0 : Boolean(currentChapter?.hasPrev);
  const toolbarHasNext = isPagedMode
    ? pageIndex < pageCount - 1 || Boolean(currentChapter?.hasNext)
    : scrollModeChapters.length > 0 ? scrollModeChapters[scrollModeChapters.length - 1] < chapters.length - 1 : Boolean(currentChapter?.hasNext);

  const handleSelectChapter = (idx: number) => { navigation.goToChapter(idx, 'start'); sidebar.setIsSidebarOpen(false); };

  // Paged helpers
  const twoColumnWidth = pagedViewportSize.width ? (pagedViewportSize.width >= 2 * MIN_COLUMN_WIDTH + TWO_COLUMN_GAP ? Math.max((pagedViewportSize.width - TWO_COLUMN_GAP) / 2, MIN_COLUMN_WIDTH) : pagedViewportSize.width) : undefined;
  const fitsTwoColumns = twoColumnWidth ? pagedViewportSize.width >= 2 * twoColumnWidth + TWO_COLUMN_GAP : false;
  const pageTurnStep = pagedViewportSize.width ? pagedViewportSize.width + (fitsTwoColumns ? TWO_COLUMN_GAP : 0) : 0;

  // Paged viewport size effect
  useEffect(() => {
    if (!isPagedMode || isLoading || !currentChapter) {
      if (!isPagedMode) setPagedViewportSize({ width: 0, height: 0 });
      return;
    }
    const viewport = pagedViewportRef.current;
    if (!viewport) return;
    const updateViewportSize = () => setPagedViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    const frameId = requestAnimationFrame(updateViewportSize);
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);
    return () => { cancelAnimationFrame(frameId); observer.disconnect(); };
  }, [currentChapter, isLoading, isPagedMode]);

  // Page count effect
  useEffect(() => {
    if (isLoading || !isPagedMode || !pagedViewportSize.width || !pagedViewportSize.height || !currentChapter) { setPageCount(1); return; }
    const frameId = requestAnimationFrame(() => {
      const content = pagedContentRef.current;
      if (!content || !pageTurnStep) return;
      const nextPageCount = Math.max(1, Math.ceil((content.scrollWidth + (fitsTwoColumns ? TWO_COLUMN_GAP : 0)) / pageTurnStep));
      const targetPage = pageTargetRef.current === 'end' ? nextPageCount - 1 : Math.min(pageIndex, nextPageCount - 1);
      setPageCount(nextPageCount);
      setPageIndex(targetPage);
      pageTargetRef.current = 'start';
    });
    return () => cancelAnimationFrame(frameId);
  }, [currentChapter, fitsTwoColumns, preferences.fontSize, preferences.lineSpacing, isLoading, isPagedMode, pageIndex, pageTurnStep, pagedViewportSize.height, pagedViewportSize.width]);

  // Scroll left sync
  useLayoutEffect(() => {
    if (!isPagedMode || !pagedViewportRef.current || !pageTurnStep) return;
    pagedViewportRef.current.scrollLeft = pageIndex * pageTurnStep;
  }, [isPagedMode, pageIndex, pageTurnStep]);

  // Touch drag (from sidebar hook, used inline for the sidebar header)
  const handleDragStart = sidebar.handleDragStart;
  const handleDragMove = sidebar.handleDragMove;
  const handleDragEnd = sidebar.handleDragEnd;

  return (
    <div className={cn('flex h-screen w-full overflow-hidden transition-colors duration-300', preferences.currentTheme.bg)}>
      <div
        className={cn(
          'fixed inset-0 bg-black/40 z-40 backdrop-blur-[2px] transition-all duration-300 md:hidden',
          sidebar.isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={() => sidebar.setIsSidebarOpen(false)}
      />

      <aside
        className={cn(
          'flex flex-col transition-all duration-300 ease-in-out overflow-hidden z-50 text-text-primary',
          preferences.currentTheme.sidebarBg,
          'fixed inset-0 md:inset-y-0 md:left-0 md:bottom-auto md:inset-x-auto md:relative',
          sidebar.isSidebarOpen
            ? 'translate-y-0 md:translate-x-0 w-full md:w-72 md:border-r md:border-border-color/30'
            : 'translate-y-full md:translate-y-0 md:-translate-x-full w-full md:w-0 md:border-r-0',
          sidebar.dragOffset > 0 && 'transition-none',
        )}
        style={sidebar.dragOffset > 0 ? { transform: `translateY(${sidebar.dragOffset}px)` } : undefined}
      >
        <div className="w-full md:w-72 flex flex-col h-full shrink-0">
          <header
            className="h-14 flex items-center justify-between px-4 border-b border-border-color/20 shrink-0 glass z-10 touch-none"
            onTouchStart={handleDragStart} onTouchMove={handleDragMove} onTouchEnd={handleDragEnd} onTouchCancel={handleDragEnd}
          >
            <span className="font-semibold text-lg text-text-primary flex items-center gap-2">
              <Menu className="w-5 h-5 text-accent" /> {t('reader.contents')}
            </span>
            <button onClick={() => sidebar.setIsSidebarOpen(false)} className="p-1 rounded-full hover:bg-white/10 text-text-secondary transition-colors">
              <X className="w-5 h-5" />
            </button>
          </header>
          <div className="flex-1 overflow-hidden min-h-0">
            <ChapterList chapters={chapters} currentIndex={chapterIndex} onSelect={handleSelectChapter} contentTextColor={preferences.currentTheme.text} />
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 relative text-text-primary">
        <header className={cn(
          'h-14 flex items-center justify-between px-4 sm:px-6 border-b border-border-color/20 glass z-30 absolute top-0 left-0 right-0 transition-all duration-300',
          !contentClick.isChromeVisible && '-translate-y-full opacity-0 pointer-events-none',
        )}>
          <div className="flex items-center gap-3">
            <Link to="/" className="md:hidden p-2 rounded-full hover:bg-white/10 transition-colors text-text-primary" title={t('reader.exit')}>
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <button onClick={sidebar.toggleSidebar} className="hidden md:flex p-2 rounded-full hover:bg-white/10 transition-colors text-text-primary" title={t('reader.contents')}>
              {sidebar.isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link to={`/novel/${novelId}`} className="text-sm font-medium hover:text-accent transition-colors hidden md:block text-text-primary">
              {t('reader.exit')}
            </Link>
          </div>
          <div className="flex bg-muted-bg rounded-lg p-1 border border-border-color/50 shadow-inner">
            <button onClick={() => handleSetViewMode('original')} className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2', viewMode === 'original' ? 'bg-accent text-white shadow' : 'text-text-secondary hover:text-text-primary')}>
              <AlignLeft className="w-4 h-4" /> {t('reader.original')}
            </button>
            <button onClick={() => handleSetViewMode('summary')} className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2', viewMode === 'summary' ? 'bg-accent text-white shadow' : 'text-text-secondary hover:text-text-primary')}>
              <Bot className="w-4 h-4" /> {t('reader.summary')}
            </button>
          </div>
        </header>

        <div
          ref={contentRef}
          className={cn('h-full w-full relative cursor-pointer', isPagedMode ? 'overflow-hidden' : 'overflow-y-auto hide-scrollbar')}
          onClick={contentClick.handleContentClick}
          onScroll={scrollMode.handleScroll}
        >
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : currentChapter ? (
            isPagedMode ? (
              <div className={cn('h-full max-w-[1400px] mx-auto w-full px-4 sm:px-8 md:px-12 flex flex-col', preferences.currentTheme.text)}>
                <div className={cn('flex items-center justify-between gap-4 py-3 mb-4 shrink-0 border-b border-border-color/20', preferences.headerBg)}>
                  <h1 className={cn('text-sm font-medium truncate transition-colors', preferences.readerTheme === 'auto' ? 'text-text-secondary' : 'opacity-60')}>
                    {currentChapter.title}
                  </h1>
                  {pageCount > 1 && <div className="text-xs font-medium text-text-secondary whitespace-nowrap">{pageIndex + 1} / {pageCount}</div>}
                </div>
                <div ref={pagedViewportRef} className="flex-1 min-h-0 overflow-hidden">
                  <div ref={pagedContentRef} className="h-full font-serif text-justify md:text-left selection:bg-accent/30 tracking-wide opacity-90" style={{ fontSize: `${preferences.fontSize}px`, lineHeight: String(preferences.lineSpacing), columnGap: fitsTwoColumns ? `${TWO_COLUMN_GAP}px` : '0px', columnWidth: twoColumnWidth ? `${twoColumnWidth}px` : undefined, columnFill: 'auto', columnRule: fitsTwoColumns ? '1px solid var(--border-color)' : undefined }}>
                    <h2 className="text-xl sm:text-2xl font-bold text-center mb-8 mt-2 break-inside-avoid" style={{ lineHeight: '1.4' }}>{currentChapter.title}</h2>
                    {chapterParagraphs.map((paragraph, i) => {
                      if (i === skipLineIndex) return null;
                      if (!paragraph.trim()) return <div key={i} className="break-inside-avoid" style={{ height: preferences.paragraphSpacing }} aria-hidden="true" />;
                      return <ChapterParagraph key={i} text={paragraph} novelId={novelId} marginBottom={preferences.paragraphSpacing} className="indent-8 break-inside-avoid" />;
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className={cn('px-4 sm:px-8 md:px-12 max-w-[1200px] mx-auto w-full relative', preferences.currentTheme.text)}>
                {viewMode === 'summary' ? (
                  <>
                    <div className={cn('sticky top-0 z-10 -mx-4 sm:-mx-8 md:-mx-12 px-4 sm:px-8 md:px-12 py-3 border-b border-border-color/20 backdrop-blur-sm', preferences.headerBg)}>
                      <h1 className={cn('text-sm font-medium truncate transition-colors', preferences.readerTheme === 'auto' ? 'text-text-secondary' : 'opacity-60')}>{currentChapter.title}</h1>
                    </div>
                    <div className="pt-6">
                      <ChapterAnalysisPanel novelId={novelId} analysis={analysis.chapterAnalysis} job={analysis.analysisStatus?.job ?? null} isLoading={analysis.isChapterAnalysisLoading} onAnalyzeChapter={analysis.handleAnalyzeChapter} isAnalyzingChapter={analysis.isAnalyzingChapter} />
                    </div>
                  </>
                ) : (
                  <div className="pt-6">
                    {scrollModeChapters.map((chIdx) => {
                      const chData = chapterCacheRef.current.get(chIdx);
                      if (!chData) return null;
                      const chParagraphs = chData.content.split('\n');
                      const chFirstNonEmpty = chParagraphs.findIndex(p => p.trim().length > 0);
                      const chSkipLine = chFirstNonEmpty !== -1 && chParagraphs[chFirstNonEmpty].trim() === chData.title.trim() ? chFirstNonEmpty : -1;
                      return (
                        <div key={chIdx} ref={el => { if (el) scrollMode.scrollChapterElementsRef.current.set(chIdx, el); else scrollMode.scrollChapterElementsRef.current.delete(chIdx); }} className="mb-12">
                          <div className={cn('sticky top-0 z-10 -mx-4 sm:-mx-8 md:-mx-12 px-4 sm:px-8 md:px-12 py-3 border-b border-border-color/20 backdrop-blur-sm', preferences.headerBg)}>
                            <h1 className={cn('text-sm font-medium truncate transition-colors', preferences.readerTheme === 'auto' ? 'text-text-secondary' : 'opacity-60')}>{chData.title}</h1>
                          </div>
                          <div className="leading-relaxed font-serif mx-auto w-full transition-all text-justify md:text-left selection:bg-accent/30 tracking-wide opacity-90" style={{ fontSize: `${preferences.fontSize}px`, maxWidth: '800px', lineHeight: String(preferences.lineSpacing) }}>
                            <h2 className="text-xl sm:text-2xl font-bold text-center mb-8 mt-2" style={{ lineHeight: '1.4' }}>{chData.title}</h2>
                            {chParagraphs.map((paragraph, i) => {
                              if (i === chSkipLine) return null;
                              if (!paragraph.trim()) return <div key={i} style={{ height: preferences.paragraphSpacing }} aria-hidden="true" />;
                              return <ChapterParagraph key={i} text={paragraph} novelId={novelId} marginBottom={preferences.paragraphSpacing} className="indent-8" />;
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-text-secondary">
              <p>{t('reader.noChapters')}</p>
              <Link to={`/novel/${novelId}`} className="text-accent underline mt-4 flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" /> {t('reader.goBack')}
              </Link>
            </div>
          )}
        </div>

        {currentChapter && (
          <ReaderToolbar
            sliders={{ fontSize: preferences.fontSize, setFontSize: preferences.setFontSize, lineSpacing: preferences.lineSpacing, setLineSpacing: preferences.setLineSpacing, paragraphSpacing: preferences.paragraphSpacing, setParagraphSpacing: preferences.setParagraphSpacing }}
            isTwoColumn={isTwoColumn} setIsTwoColumn={handleSetIsTwoColumn}
            hasPrev={toolbarHasPrev} hasNext={toolbarHasNext}
            onPrev={navigation.handlePrev} onNext={navigation.handleNext}
            navigationMode={isPagedMode ? 'page' : 'chapter'}
            readerTheme={preferences.readerTheme} setReaderTheme={preferences.setReaderTheme}
            hidden={!contentClick.isChromeVisible}
            isSidebarOpen={sidebar.isSidebarOpen} onToggleSidebar={sidebar.toggleSidebar}
          />
        )}
      </main>
    </div>
  );
}
