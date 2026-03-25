import { Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Chapter } from '../../api/readerApi';
import ChapterList from '../ChapterList';
import { cn } from '@shared/utils/cn';

interface ReaderSidebarProps {
  chapters: Chapter[];
  currentIndex: number;
  contentTextColor: string;
  isSidebarOpen: boolean;
  dragOffset: number;
  sidebarBgClassName: string;
  onClose: () => void;
  onSelectChapter: (chapterIndex: number) => void;
  onDragStart: (event: React.TouchEvent) => void;
  onDragMove: (event: React.TouchEvent) => void;
  onDragEnd: () => void;
}

export default function ReaderSidebar({
  chapters,
  currentIndex,
  contentTextColor,
  isSidebarOpen,
  dragOffset,
  sidebarBgClassName,
  onClose,
  onSelectChapter,
  onDragStart,
  onDragMove,
  onDragEnd,
}: ReaderSidebarProps) {
  const { t } = useTranslation();

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 bg-black/40 z-40 backdrop-blur-[2px] transition-all duration-300 md:hidden',
          isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          'flex flex-col transition-all duration-300 ease-in-out overflow-hidden z-50 text-text-primary',
          sidebarBgClassName,
          'fixed inset-0 md:inset-y-0 md:left-0 md:bottom-auto md:inset-x-auto md:relative',
          isSidebarOpen
            ? 'translate-y-0 md:translate-x-0 w-full md:w-72 md:border-r md:border-border-color/30'
            : 'translate-y-full md:translate-y-0 md:-translate-x-full w-full md:w-0 md:border-r-0',
          dragOffset > 0 && 'transition-none',
        )}
        style={dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
      >
        <div className="w-full md:w-72 flex flex-col h-full shrink-0">
          <header
            className="h-14 flex items-center justify-between px-4 border-b border-border-color/20 shrink-0 glass z-10 touch-none"
            onTouchStart={onDragStart}
            onTouchMove={onDragMove}
            onTouchEnd={onDragEnd}
            onTouchCancel={onDragEnd}
          >
            <span className="font-semibold text-lg text-text-primary flex items-center gap-2">
              <Menu className="w-5 h-5 text-accent" /> {t('reader.contents')}
            </span>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 text-text-secondary transition-colors">
              <X className="w-5 h-5" />
            </button>
          </header>
          <div className="flex-1 overflow-hidden min-h-0">
            <ChapterList
              chapters={chapters}
              currentIndex={currentIndex}
              onSelect={onSelectChapter}
              contentTextColor={contentTextColor}
              isSidebarOpen={isSidebarOpen}
            />
          </div>
        </div>
      </aside>
    </>
  );
}
