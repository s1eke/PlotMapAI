import { useState, useEffect, useCallback, useLayoutEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { Loader2, Menu, X, ArrowLeft, AlignLeft, Bot } from 'lucide-react';
import { analysisApi } from '../api/analysis';
import type { AnalysisStatusResponse, ChapterAnalysisResult } from '../api/analysis';
import { readerApi } from '../api/reader';
import type { Chapter, ChapterContent } from '../api/reader';
import ChapterAnalysisPanel from '../components/ChapterAnalysisPanel';
import ChapterList from '../components/ChapterList';
import ReaderToolbar from '../components/ReaderToolbar';
import { cn } from '../utils/cn';
import { READER_THEMES } from '../constants/readerThemes';

const IMG_PATTERN = /\[IMG:([^\]]+)\]/g;

interface TextSegment {
  type: 'text' | 'image';
  value: string;
}

function parseParagraphSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  IMG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMG_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'image', value: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}

function InlineImage({ novelId, imageKey }: { novelId: number; imageKey: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    readerApi.getImageUrl(novelId, imageKey).then(result => {
      if (!revoked) {
        objectUrl = result;
        setUrl(result);
      } else if (result) {
        URL.revokeObjectURL(result);
      }
    });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [novelId, imageKey]);

  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      className="max-w-full mx-auto my-4 rounded-lg shadow-md"
      loading="lazy"
    />
  );
}

function ChapterParagraph({ text, novelId, marginBottom, className, style }: {
  text: string;
  novelId: number;
  marginBottom: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const segments = useMemo(() => parseParagraphSegments(text), [text]);

  if (segments.length === 1 && segments[0].type === 'text') {
    return (
      <p className={className} style={{ marginBottom, ...style }}>
        {text}
      </p>
    );
  }

  return (
    <div style={{ marginBottom }}>
      {segments.map((seg, i) =>
        seg.type === 'image' ? (
          <InlineImage key={i} novelId={novelId} imageKey={seg.value} />
        ) : (
          seg.value.trim() ? (
            <p key={i} className={className} style={style}>
              {seg.value}
            </p>
          ) : null
        ),
      )}
    </div>
  );
}

const PAGE_TURN_LOCK_MS = 280;
const PAGE_TURN_THRESHOLD = 48;
const TWO_COLUMN_GAP = 48;
const MIN_COLUMN_WIDTH = 260;

type PageTarget = 'start' | 'end';

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
  } catch {
    return null;
  }
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
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatusResponse | null>(null);
  const [chapterAnalysis, setChapterAnalysis] = useState<ChapterAnalysisResult | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isChapterAnalysisLoading, setIsChapterAnalysisLoading] = useState(false);
  const [isAnalyzingChapter, setIsAnalyzingChapter] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [isTwoColumn, setIsTwoColumn] = useState<boolean>(() => initialStoredState?.isTwoColumn ?? false);
  const [viewMode, setViewMode] = useState<'original' | 'summary'>(() => initialStoredState?.viewMode ?? 'original');
  const [chapterIndex, setChapterIndex] = useState<number>(() => initialStoredState?.chapterIndex ?? 0);
  const [readerTheme, setReaderTheme] = useState<string>(() => localStorage.getItem('readerTheme') || 'auto');
  const [lineSpacing, setLineSpacing] = useState<number>(() => {
    const saved = localStorage.getItem('readerLineSpacing');
    return saved ? Number(saved) : 1.8;
  });
  const [paragraphSpacing, setParagraphSpacing] = useState<number>(() => {
    const saved = localStorage.getItem('readerParagraphSpacing');
    return saved ? Number(saved) : 16;
  });
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [isChromeVisible, setIsChromeVisible] = useState(false);
  const [pagedViewportSize, setPagedViewportSize] = useState({ width: 0, height: 0 });
  const [hasHydratedReaderState, setHasHydratedReaderState] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const pagedViewportRef = useRef<HTMLDivElement>(null);
  const pagedContentRef = useRef<HTMLDivElement>(null);
  const scrollKeys = useRef<Set<string>>(new Set());
  const animationFrameId = useRef<number | null>(null);
  const pageTargetRef = useRef<PageTarget>('start');
  const wheelDeltaRef = useRef(0);
  const wheelUnlockTimeoutRef = useRef<number | null>(null);
  const pageTurnLockedRef = useRef(false);
  const latestReaderStateRef = useRef<StoredReaderState>({
    chapterIndex: initialStoredState?.chapterIndex ?? 0,
    viewMode: initialStoredState?.viewMode ?? 'original',
    isTwoColumn: initialStoredState?.isTwoColumn ?? false,
  });
  const hasUserInteractedRef = useRef(false);

  const currentTheme = READER_THEMES[readerTheme] || READER_THEMES.auto;
  const chapterParagraphs = currentChapter?.content.split('\n') ?? [];
  const firstHeadingIndex = chapterParagraphs.findIndex(p => p.trim().length > 0);
  const hasBodyHeading = firstHeadingIndex !== -1
    && currentChapter
    && chapterParagraphs[firstHeadingIndex].trim() === currentChapter.title.trim();
  const isPagedMode = isTwoColumn && viewMode === 'original';
  const HEADER_BG_MAP: Record<string, string> = {
    auto: 'bg-bg-primary',
    paper: 'bg-white',
    parchment: 'bg-[#f4ecd8]',
    green: 'bg-[#c7edcc]',
    night: 'bg-[#1a1a1a]',
  };
  const headerBg = HEADER_BG_MAP[readerTheme] || HEADER_BG_MAP.auto;
  const toolbarHasPrev = isPagedMode ? pageIndex > 0 || Boolean(currentChapter?.hasPrev) : Boolean(currentChapter?.hasPrev);
  const toolbarHasNext = isPagedMode ? pageIndex < pageCount - 1 || Boolean(currentChapter?.hasNext) : Boolean(currentChapter?.hasNext);
  const twoColumnWidth = pagedViewportSize.width
    ? (pagedViewportSize.width >= 2 * MIN_COLUMN_WIDTH + TWO_COLUMN_GAP
      ? Math.max((pagedViewportSize.width - TWO_COLUMN_GAP) / 2, MIN_COLUMN_WIDTH)
      : pagedViewportSize.width)
    : undefined;
  const fitsTwoColumns = twoColumnWidth
    ? pagedViewportSize.width >= 2 * twoColumnWidth + TWO_COLUMN_GAP
    : false;
  const pageTurnStep = pagedViewportSize.width
    ? pagedViewportSize.width + (fitsTwoColumns ? TWO_COLUMN_GAP : 0)
    : 0;

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

  const loadAnalysisStatus = useCallback(async () => {
    if (!novelId) return;

    try {
      const data = await analysisApi.getStatus(novelId);
      setAnalysisStatus(data);
    } catch (err) {
      console.error('Failed to load analysis status', err);
      setAnalysisStatus(null);
    }
  }, [novelId]);

  const loadChapterAnalysis = useCallback(async (silent = false) => {
    if (!novelId || chapterIndex === undefined) return;

    if (!silent) setIsChapterAnalysisLoading(true);
    try {
      const data = await analysisApi.getChapterAnalysis(novelId, chapterIndex);
      setChapterAnalysis(data.analysis);
    } catch (err) {
      console.error('Failed to load chapter analysis', err);
      setChapterAnalysis(null);
    } finally {
      if (!silent) setIsChapterAnalysisLoading(false);
    }
  }, [chapterIndex, novelId]);

  const handleAnalyzeChapter = useCallback(async () => {
    if (!novelId || chapterIndex === undefined) return;
    setIsAnalyzingChapter(true);
    try {
      const result = await analysisApi.analyzeChapter(novelId, chapterIndex);
      setChapterAnalysis(result.analysis);
    } catch (err) {
      console.error('Failed to analyze chapter', err);
    } finally {
      setIsAnalyzingChapter(false);
    }
  }, [chapterIndex, novelId]);

  const unlockPageTurn = useCallback(() => {
    if (wheelUnlockTimeoutRef.current) {
      window.clearTimeout(wheelUnlockTimeoutRef.current);
    }

    wheelUnlockTimeoutRef.current = window.setTimeout(() => {
      pageTurnLockedRef.current = false;
      wheelUnlockTimeoutRef.current = null;
    }, PAGE_TURN_LOCK_MS);
  }, []);

  const stopContinuousScroll = useCallback(() => {
    scrollKeys.current.clear();
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('readerTheme', readerTheme);
  }, [readerTheme]);

  useEffect(() => {
    localStorage.setItem('readerLineSpacing', String(lineSpacing));
  }, [lineSpacing]);

  useEffect(() => {
    localStorage.setItem('readerParagraphSpacing', String(paragraphSpacing));
  }, [paragraphSpacing]);

  useEffect(() => {
    latestReaderStateRef.current = {
      chapterIndex,
      viewMode,
      isTwoColumn,
    };
  }, [chapterIndex, isTwoColumn, viewMode]);

  useEffect(() => {
    if (!novelId || !hasHydratedReaderState) return;

    persistReaderState({ chapterIndex, viewMode, isTwoColumn });
  }, [chapterIndex, hasHydratedReaderState, isTwoColumn, novelId, persistReaderState, viewMode]);

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

          latestReaderStateRef.current = {
            chapterIndex: resolvedChapterIndex,
            viewMode: nextViewMode,
            isTwoColumn: nextStoredState.isTwoColumn,
          };

          setViewMode(nextViewMode);
          setChapterIndex(resolvedChapterIndex);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load reader init data:', err);
        }
      } finally {
        if (!cancelled) {
          setHasHydratedReaderState(true);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [novelId]);

  useEffect(() => {
    if (!novelId || chapterIndex === undefined) return;

    let cancelled = false;

    const fetchContent = async () => {
      setIsLoading(true);
      try {
        const data = await readerApi.getChapterContent(novelId, chapterIndex);
        if (cancelled) return;

        setCurrentChapter(data);
        setPageIndex(0);
        setPageCount(1);
        setIsChromeVisible(false);
        wheelDeltaRef.current = 0;
        pageTurnLockedRef.current = false;

        if (contentRef.current) {
          contentRef.current.scrollTop = 0;
          contentRef.current.scrollLeft = 0;
        }

        if (pagedViewportRef.current) {
          pagedViewportRef.current.scrollLeft = 0;
        }

        readerApi.saveProgress(novelId, { chapterIndex, viewMode }).catch(console.error);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load chapter content', err);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchContent();

    return () => {
      cancelled = true;
    };
  }, [novelId, chapterIndex, viewMode]);

  useEffect(() => {
    if (!novelId) return;
    loadAnalysisStatus();
  }, [loadAnalysisStatus, novelId]);

  useEffect(() => {
    if (!novelId || chapterIndex === undefined) return;
    loadChapterAnalysis();
  }, [chapterIndex, loadChapterAnalysis, novelId]);

  useEffect(() => {
    const status = analysisStatus?.job.status;
    if (!novelId || (status !== 'running' && status !== 'pausing')) return;

    const timer = window.setInterval(() => {
      loadAnalysisStatus();
      loadChapterAnalysis(true);
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [analysisStatus?.job.status, loadAnalysisStatus, loadChapterAnalysis, novelId]);

  const goToChapter = useCallback((targetIndex: number, pageTarget: PageTarget = 'start') => {
    hasUserInteractedRef.current = true;
    pageTargetRef.current = pageTarget;
    setChapterIndex(targetIndex);
    persistReaderState({ chapterIndex: targetIndex });
  }, [persistReaderState]);

  const goToNextPage = useCallback(() => {
    if (!currentChapter) return;

    if (pageIndex < pageCount - 1) {
      setPageIndex((prev) => prev + 1);
      return;
    }

    if (currentChapter.hasNext) {
      goToChapter(chapterIndex + 1, 'start');
    }
  }, [chapterIndex, currentChapter, goToChapter, pageCount, pageIndex]);

  const goToPrevPage = useCallback(() => {
    if (!currentChapter) return;

    if (pageIndex > 0) {
      setPageIndex((prev) => prev - 1);
      return;
    }

    if (currentChapter.hasPrev) {
      goToChapter(chapterIndex - 1, 'end');
    }
  }, [chapterIndex, currentChapter, goToChapter, pageIndex]);

  const scrollLoop = useCallback(() => {
    if (!contentRef.current) return;

    let scrollAmount = 0;
    if (scrollKeys.current.has('ArrowDown')) scrollAmount += 10;
    if (scrollKeys.current.has('ArrowUp')) scrollAmount -= 10;

    if (scrollAmount !== 0) {
      contentRef.current.scrollTop += scrollAmount;
      animationFrameId.current = requestAnimationFrame(scrollLoop);
    } else {
      animationFrameId.current = null;
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!currentChapter || isLoading) return;

    if (isPagedMode && (e.key === 'ArrowDown' || e.key === 'PageDown')) {
      e.preventDefault();
      goToNextPage();
      return;
    }

    if (isPagedMode && (e.key === 'ArrowUp' || e.key === 'PageUp')) {
      e.preventDefault();
      goToPrevPage();
      return;
    }

    if (e.key === 'ArrowRight' && currentChapter.hasNext) {
      goToChapter(chapterIndex + 1, 'start');
    } else if (e.key === 'ArrowLeft' && currentChapter.hasPrev) {
      goToChapter(chapterIndex - 1, 'start');
    } else if (!isPagedMode && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      if (!scrollKeys.current.has(e.key)) {
        scrollKeys.current.add(e.key);
        if (!animationFrameId.current) {
          animationFrameId.current = requestAnimationFrame(scrollLoop);
        }
      }
    }
  }, [chapterIndex, currentChapter, goToChapter, goToNextPage, goToPrevPage, isLoading, isPagedMode, scrollLoop]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (!isPagedMode && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      scrollKeys.current.delete(e.key);
    }
  }, [isPagedMode]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      stopContinuousScroll();
    };
  }, [handleKeyDown, handleKeyUp, stopContinuousScroll]);

  useEffect(() => {
    if (!isPagedMode || isLoading || !currentChapter) {
      if (!isPagedMode) {
        setPagedViewportSize({ width: 0, height: 0 });
      }
      return;
    }

    stopContinuousScroll();

    const viewport = pagedViewportRef.current;
    if (!viewport) return;

    const updateViewportSize = () => {
      setPagedViewportSize({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });
    };

    const frameId = requestAnimationFrame(updateViewportSize);
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [currentChapter, isLoading, isPagedMode, stopContinuousScroll]);

  useEffect(() => {
    if (isLoading || !isPagedMode || !pagedViewportSize.width || !pagedViewportSize.height || !currentChapter) {
      setPageCount(1);
      return;
    }

    const frameId = requestAnimationFrame(() => {
      const content = pagedContentRef.current;
      if (!content || !pageTurnStep) return;

      const nextPageCount = Math.max(1, Math.ceil((content.scrollWidth + (fitsTwoColumns ? TWO_COLUMN_GAP : 0)) / pageTurnStep));
      const targetPage = pageTargetRef.current === 'end'
        ? nextPageCount - 1
        : Math.min(pageIndex, nextPageCount - 1);

      setPageCount(nextPageCount);
      setPageIndex(targetPage);
      pageTargetRef.current = 'start';
    });

    return () => cancelAnimationFrame(frameId);
  }, [currentChapter, fitsTwoColumns, fontSize, lineSpacing, isLoading, isPagedMode, pageIndex, pageTurnStep, pagedViewportSize.height, pagedViewportSize.width]);

  useLayoutEffect(() => {
    if (!isPagedMode || !pagedViewportRef.current || !pageTurnStep) return;

    pagedViewportRef.current.scrollLeft = pageIndex * pageTurnStep;
  }, [isPagedMode, pageIndex, pageTurnStep]);

  useEffect(() => {
    return () => {
      if (wheelUnlockTimeoutRef.current) {
        window.clearTimeout(wheelUnlockTimeoutRef.current);
      }
    };
  }, []);

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);

  const handleSelectChapter = (idx: number) => {
    goToChapter(idx, 'start');
    setIsSidebarOpen(false);
  };

  const handleNext = useCallback(() => {
    if (isPagedMode) {
      goToNextPage();
      return;
    }

    if (currentChapter?.hasNext) {
      goToChapter(chapterIndex + 1, 'start');
    }
  }, [isPagedMode, goToNextPage, currentChapter, goToChapter, chapterIndex]);

  const handlePrev = useCallback(() => {
    if (isPagedMode) {
      goToPrevPage();
      return;
    }

    if (currentChapter?.hasPrev) {
      goToChapter(chapterIndex - 1, 'start');
    }
  }, [isPagedMode, goToPrevPage, currentChapter, goToChapter, chapterIndex]);

  const isPagedModeRef = useRef(isPagedMode);
  isPagedModeRef.current = isPagedMode;

  const handlePagedWheel = useCallback((e: WheelEvent) => {
    if (!isPagedModeRef.current) return;

    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;

    e.preventDefault();
    wheelDeltaRef.current += e.deltaY;

    if (pageTurnLockedRef.current || Math.abs(wheelDeltaRef.current) < PAGE_TURN_THRESHOLD) {
      return;
    }

    pageTurnLockedRef.current = true;

    if (wheelDeltaRef.current > 0) {
      goToNextPage();
    } else {
      goToPrevPage();
    }

    wheelDeltaRef.current = 0;
    unlockPageTurn();
  }, [goToNextPage, goToPrevPage, unlockPageTurn]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.addEventListener('wheel', handlePagedWheel, { passive: false });
    return () => el.removeEventListener('wheel', handlePagedWheel);
  }, [handlePagedWheel]);

  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPagedMode) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;

    if (ratio < 0.25) {
      handlePrev();
    } else if (ratio > 0.75) {
      handleNext();
    } else {
      setIsChromeVisible(prev => !prev);
    }
  }, [isPagedMode, handlePrev, handleNext]);

  return (
    <div className={cn('flex h-screen w-full overflow-hidden transition-colors duration-300', currentTheme.bg)}>
      <div
        className={cn(
          'fixed inset-0 bg-black/40 z-40 backdrop-blur-[2px] transition-all duration-300 md:hidden',
          isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={() => setIsSidebarOpen(false)}
      />

      <aside
        className={cn(
          'flex flex-col transition-all duration-300 ease-in-out overflow-hidden z-50 text-text-primary',
          currentTheme.sidebarBg,
          'fixed inset-y-0 left-0 md:relative md:translate-x-0 h-full',
          isSidebarOpen
            ? 'w-72 translate-x-0 shadow-2xl md:shadow-none border-r border-border-color/30'
            : 'w-0 -translate-x-full md:translate-x-0 border-r-0',
        )}
      >
        <div className="w-72 flex flex-col h-full shrink-0">
          <header className="h-14 flex items-center justify-between px-4 border-b border-border-color/20 shrink-0 glass z-10">
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="font-semibold text-lg text-text-primary flex items-center gap-2 hover:opacity-70 transition-opacity cursor-pointer text-left"
              title={t('reader.contents')}
            >
              <Menu className="w-5 h-5 text-accent" /> {t('reader.contents')}
            </button>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 rounded-full hover:bg-white/10 text-text-secondary transition-colors">
              <X className="w-5 h-5" />
            </button>
          </header>
          <div className="flex-1 overflow-hidden min-h-0">
            <ChapterList
              chapters={chapters}
              currentIndex={chapterIndex}
              onSelect={handleSelectChapter}
              contentTextColor={currentTheme.text}
            />
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 relative text-text-primary">
        <header className={cn(
          'h-14 flex items-center justify-between px-4 sm:px-6 shrink-0 border-b border-border-color/20 glass z-10 sticky top-0 transition-all duration-300',
          isPagedMode && !isChromeVisible && '-translate-y-full opacity-0 pointer-events-none',
        )}>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-full hover:bg-white/10 transition-colors text-text-primary"
              title={t('reader.contents')}
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link to={`/novel/${novelId}`} className="text-sm font-medium hover:text-accent transition-colors hidden sm:block text-text-primary">
              {t('reader.exit')}
            </Link>
          </div>

          <div className="flex bg-muted-bg rounded-lg p-1 border border-border-color/50 shadow-inner">
            <button
              onClick={() => handleSetViewMode('original')}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2',
                viewMode === 'original' ? 'bg-accent text-white shadow' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              <AlignLeft className="w-4 h-4" /> {t('reader.original')}
            </button>
            <button
              onClick={() => handleSetViewMode('summary')}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2',
                viewMode === 'summary' ? 'bg-accent text-white shadow' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              <Bot className="w-4 h-4" /> {t('reader.summary')}
            </button>
          </div>
        </header>

        <div
          ref={contentRef}
          className={cn('flex-1 w-full relative', isPagedMode ? 'overflow-hidden cursor-pointer' : 'overflow-y-auto pb-32')}
          onClick={handleContentClick}
          onScroll={() => {
            if (isPagedMode || !contentRef.current) return;
          }}
        >
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : currentChapter ? (
            isPagedMode ? (
              <div className={cn('h-full max-w-[1400px] mx-auto w-full px-4 sm:px-8 md:px-12 flex flex-col', currentTheme.text)}>
                <div className={cn('flex items-center justify-between gap-4 py-3 mb-4 shrink-0 border-b border-border-color/20', headerBg)}>
                  <h1
                    className={cn(
                      'text-sm font-medium truncate transition-colors',
                      readerTheme === 'auto' ? 'text-text-secondary' : 'opacity-60',
                    )}
                  >
                    {currentChapter.title}
                  </h1>
                  {pageCount > 1 && (
                    <div className="text-xs font-medium text-text-secondary whitespace-nowrap">
                      {pageIndex + 1} / {pageCount}
                    </div>
                  )}
                </div>

                <div
                  ref={pagedViewportRef}
                  className="flex-1 min-h-0 overflow-hidden"
                >
                  <div
                    ref={pagedContentRef}
                    className="h-full font-serif text-justify md:text-left selection:bg-accent/30 tracking-wide opacity-90 pb-24"
                    style={{
                      fontSize: `${fontSize}px`,
                      lineHeight: String(lineSpacing),
                      columnGap: fitsTwoColumns ? `${TWO_COLUMN_GAP}px` : '0px',
                      columnWidth: twoColumnWidth ? `${twoColumnWidth}px` : undefined,
                      columnFill: 'auto',
                      columnRule: fitsTwoColumns ? '1px solid var(--border-color)' : undefined,
                    }}
                  >
                    {chapterParagraphs.map((paragraph, i) => {
                      if (!paragraph.trim()) {
                        return <div key={i} className="break-inside-avoid" style={{ height: paragraphSpacing }} aria-hidden="true" />;
                      }
                      if (hasBodyHeading && i === firstHeadingIndex) {
                        return (
                          <h2
                            key={i}
                            className="text-xl sm:text-2xl font-bold text-center mb-8 mt-2 break-inside-avoid"
                            style={{ lineHeight: '1.4' }}
                          >
                            {paragraph.trim()}
                          </h2>
                        );
                      }
                      return (
                        <ChapterParagraph
                          key={i}
                          text={paragraph}
                          novelId={novelId}
                          marginBottom={paragraphSpacing}
                          className="indent-8 break-inside-avoid"
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className={cn('px-4 sm:px-8 md:px-12 max-w-[1200px] mx-auto w-full relative', currentTheme.text)}>
                <div className={cn('sticky top-0 z-10 -mx-4 sm:-mx-8 md:-mx-12 px-4 sm:px-8 md:px-12 py-3 border-b border-border-color/20 backdrop-blur-sm', headerBg)}>
                  <h1
                    className={cn(
                      'text-sm font-medium truncate transition-colors',
                      readerTheme === 'auto' ? 'text-text-secondary' : 'opacity-60',
                    )}
                  >
                    {currentChapter.title}
                  </h1>
                </div>
                <div className="pt-6 pb-32">

                {viewMode === 'summary' ? (
                  <ChapterAnalysisPanel
                    novelId={novelId}
                    analysis={chapterAnalysis}
                    job={analysisStatus?.job ?? null}
                    isLoading={isChapterAnalysisLoading}
                    onAnalyzeChapter={handleAnalyzeChapter}
                    isAnalyzingChapter={isAnalyzingChapter}
                  />
                ) : (
                  <div
                    className="leading-relaxed font-serif mx-auto w-full transition-all text-justify md:text-left selection:bg-accent/30 tracking-wide opacity-90"
                    style={{
                      fontSize: `${fontSize}px`,
                      maxWidth: '800px',
                      lineHeight: String(lineSpacing),
                    }}
                  >
                    {chapterParagraphs.map((paragraph, i) => {
                      if (!paragraph.trim()) {
                        return <div key={i} style={{ height: paragraphSpacing }} aria-hidden="true" />;
                      }
                      if (hasBodyHeading && i === firstHeadingIndex) {
                        return (
                          <h2
                            key={i}
                            className="text-xl sm:text-2xl font-bold text-center mb-8 mt-2"
                            style={{ lineHeight: '1.4' }}
                          >
                            {paragraph.trim()}
                          </h2>
                        );
                      }
                      return (
                        <ChapterParagraph
                          key={i}
                          text={paragraph}
                          novelId={novelId}
                          marginBottom={paragraphSpacing}
                          className="indent-8"
                        />
                      );
                    })}
                  </div>
                )}
                </div>
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
            fontSize={fontSize}
            setFontSize={setFontSize}
            lineSpacing={lineSpacing}
            setLineSpacing={setLineSpacing}
            paragraphSpacing={paragraphSpacing}
            setParagraphSpacing={setParagraphSpacing}
            isTwoColumn={isTwoColumn}
            setIsTwoColumn={handleSetIsTwoColumn}
            hasPrev={toolbarHasPrev}
            hasNext={toolbarHasNext}
            onPrev={handlePrev}
            onNext={handleNext}
            navigationMode={isPagedMode ? 'page' : 'chapter'}
            readerTheme={readerTheme}
            setReaderTheme={setReaderTheme}
            hidden={isPagedMode && !isChromeVisible}
          />
        )}
      </main>
    </div>
  );
}
