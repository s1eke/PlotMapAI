import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { Loader2, Menu, X, ArrowLeft, AlignLeft, Bot } from 'lucide-react';
import { readerApi } from '../api/reader';
import type { Chapter, ChapterContent } from '../api/reader';
import ChapterList from '../components/ChapterList';
import ReaderToolbar from '../components/ReaderToolbar';
import { cn } from '../utils/cn';

export default function ReaderPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const novelId = Number(id);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState<ChapterContent | null>(null);
  
  // Settings & State
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [isTwoColumn, setIsTwoColumn] = useState(false);
  const [viewMode, setViewMode] = useState<'original' | 'summary'>('original');
  const [chapterIndex, setChapterIndex] = useState<number>(0);

  const contentRef = useRef<HTMLDivElement>(null);

  // Load TOC and Progress exactly once on mount
  useEffect(() => {
    if (!novelId) return;

    const init = async () => {
      setIsLoading(true);
      try {
        const [toc, progress] = await Promise.all([
          readerApi.getChapters(novelId),
          readerApi.getProgress(novelId).catch(() => null)
        ]);
        
        setChapters(toc);
        
        let startIdx = 0;
        if (progress) {
          startIdx = progress.chapterIndex;
          setViewMode(progress.viewMode);
        } else if (toc.length > 0) {
          startIdx = toc[0].index;
        }

        setChapterIndex(startIdx);
        
      } catch (err) {
        console.error('Failed to load reader init data:', err);
      }
    };
    
    init();
  }, [novelId]);

  // Fetch chapter content when chapterIndex changes
  useEffect(() => {
    if (!novelId || chapterIndex === undefined) return;
    
    const fetchContent = async () => {
      setIsLoading(true);
      try {
        const data = await readerApi.getChapterContent(novelId, chapterIndex);
        setCurrentChapter(data);
        
        // Scroll to top when changing chapters unless we have a saved position
        if (contentRef.current) {
          contentRef.current.scrollTop = 0;
        }

        // Save progress instantly
        readerApi.saveProgress(novelId, { chapterIndex, viewMode }).catch(console.error);

      } catch (err) {
        console.error('Failed to load chapter content', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchContent();
  }, [novelId, chapterIndex, viewMode]);

  // Setup Keyboard Navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!currentChapter || isLoading) return;
    if (e.key === 'ArrowRight' && currentChapter.hasNext) {
      setChapterIndex(prev => prev + 1);
    } else if (e.key === 'ArrowLeft' && currentChapter.hasPrev) {
      setChapterIndex(prev => prev - 1);
    }
  }, [currentChapter, isLoading]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);
  const handleSelectChapter = (idx: number) => {
    setChapterIndex(idx);
    setIsSidebarOpen(false);
  };

  const handleNext = () => currentChapter?.hasNext && setChapterIndex(prev => prev + 1);
  const handlePrev = () => currentChapter?.hasPrev && setChapterIndex(prev => prev - 1);

  return (
    <div className="flex h-screen w-full bg-bg-primary text-text-primary overflow-hidden">
      
      {/* Mobile Sidebar Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/40 z-40 backdrop-blur-[2px] transition-all duration-300 md:hidden",
          isSidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* Sidebar TOC - Layout adaptive (pushes content on desktop) */}
      <aside 
        className={cn(
          "bg-bg-secondary flex flex-col transition-all duration-300 ease-in-out overflow-hidden z-20",
          "fixed inset-y-0 left-0 md:relative md:translate-x-0 h-full",
          isSidebarOpen 
            ? "w-72 translate-x-0 shadow-2xl md:shadow-none border-r border-border-color/30" 
            : "w-0 -translate-x-full md:translate-x-0 border-r-0"
        )}
      >
        <div className="w-72 flex flex-col h-full shrink-0">
          <div className="flex items-center justify-between p-4 border-b border-border-color/20 shrink-0">
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="font-semibold text-lg text-text-primary flex items-center gap-2 hover:opacity-70 transition-opacity cursor-pointer text-left"
              title={t('reader.contents')}
            >
              <Menu className="w-5 h-5 text-accent" /> {t('reader.contents')}
            </button>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 rounded-full hover:bg-muted-bg text-text-secondary">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
             <ChapterList 
                chapters={chapters} 
                currentIndex={chapterIndex} 
                onSelect={handleSelectChapter} 
             />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Top Header */}
        <header className="h-14 flex items-center justify-between px-4 sm:px-6 shrink-0 border-b border-border-color/20 glass z-10 sticky top-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={toggleSidebar} 
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              title={t('reader.contents')}
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link to={`/novel/${novelId}`} className="text-sm font-medium hover:text-accent transition-colors hidden sm:block">
              {t('reader.exit')}
            </Link>
          </div>

          <div className="flex bg-muted-bg rounded-lg p-1 border border-border-color/50 shadow-inner">
            <button
              onClick={() => setViewMode('original')}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                viewMode === 'original' ? "bg-accent text-white shadow" : "text-text-secondary hover:text-text-primary"
              )}
            >
              <AlignLeft className="w-4 h-4" /> {t('reader.original')}
            </button>
            <button
              onClick={() => setViewMode('summary')}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                viewMode === 'summary' ? "bg-accent text-white shadow" : "text-text-secondary hover:text-text-primary"
              )}
            >
              <Bot className="w-4 h-4" /> {t('reader.summary')}
            </button>
          </div>
        </header>

        {/* Scrollable Reading Area */}
        <div 
          ref={contentRef}
          className="flex-1 overflow-y-auto w-full relative pb-32"
          onScroll={() => {
             // Save scroll position for returning later (throttled/debounced in full impl)
             if (!contentRef.current) return;
             // readerApi.saveProgress(novelId, { scrollPosition: contentRef.current.scrollTop })
          }}
        >
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
               <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : currentChapter ? (
            <div className="h-full px-4 sm:px-8 md:px-12 py-8 max-w-[1200px] mx-auto w-full relative">
              
              <h1 className="text-3xl sm:text-4xl font-bold mb-12 text-center text-text-primary leading-tight font-serif pt-8">
                {currentChapter.title}
              </h1>

              {viewMode === 'summary' ? (
                <div className="max-w-3xl mx-auto bg-card-bg rounded-2xl p-8 border border-border-color/20 text-center animate-fade-in shadow-xl">
                  <div className="w-16 h-16 bg-muted-bg rounded-full flex items-center justify-center mx-auto mb-6">
                    <Bot className="w-8 h-8 text-accent opacity-80" />
                  </div>
                  <h3 className="text-xl font-medium mb-4 text-text-primary">{t('reader.aiSummaryPlaceholder')}</h3>
                  <p className="text-text-secondary leading-relaxed max-w-xl mx-auto">
                    {t('reader.aiSummaryHint')}
                  </p>
                </div>
              ) : (
                <div 
                  className={cn(
                    "text-text-primary/90 leading-relaxed font-serif mx-auto w-full transition-all text-justify md:text-left selection:bg-accent/30 tracking-wide",
                    isTwoColumn && "md:columns-2 md:gap-16 [column-rule:1px_solid_var(--border-color)]"
                  )}
                  style={{
                     fontSize: `${fontSize}px`,
                     maxWidth: isTwoColumn ? '100%' : '800px',
                     lineHeight: '1.8'
                  }}
                >
                  {currentChapter.content.split('\n').map((paragraph, i) => (
                    paragraph.trim() ? (
                       <p key={i} className={cn("indent-8 mb-4 sm:mb-6", isTwoColumn && "break-inside-avoid")}>
                         {paragraph}
                       </p>
                    ) : (
                       <div key={i} className="h-4 sm:h-6" aria-hidden="true" />
                    )
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-text-secondary">
               <p>{t('reader.noChapters')}</p>
               <Link to={`/novel/${novelId}`} className="text-accent underline mt-4 flex items-center gap-2">
                 <ArrowLeft className="w-4 h-4" /> {t('reader.goBack')}
               </Link>
            </div>
          )}
        </div>

        {/* Floating Toolbar */}
        {currentChapter && (
          <ReaderToolbar 
            fontSize={fontSize}
            setFontSize={setFontSize}
            isTwoColumn={isTwoColumn}
            setIsTwoColumn={setIsTwoColumn}
            hasPrev={currentChapter.hasPrev}
            hasNext={currentChapter.hasNext}
            onPrev={handlePrev}
            onNext={handleNext}
          />
        )}
      </main>
    </div>
  );
}
