import type { Chapter } from '../../api/readerApi';

import { Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import BottomSheet from '@shared/components/BottomSheet';
import { cn } from '@shared/utils/cn';

import ChapterList from '../ChapterList';

interface ReaderSidebarProps {
  chapters: Chapter[];
  currentIndex: number;
  contentTextColor: string;
  isSidebarOpen: boolean;
  sidebarBgClassName: string;
  onClose: () => void;
  onSelectChapter: (chapterIndex: number) => void;
}

export default function ReaderSidebar({
  chapters,
  currentIndex,
  contentTextColor,
  isSidebarOpen,
  sidebarBgClassName,
  onClose,
  onSelectChapter,
}: ReaderSidebarProps) {
  const { t } = useTranslation();

  return (
    <>
      <BottomSheet
        isOpen={isSidebarOpen}
        onClose={onClose}
        title={t('reader.contents')}
        closeLabel={t('common.actions.close')}
        maxHeight="calc(100dvh - env(safe-area-inset-top, 0px) - 0.75rem)"
        containerClassName="fixed inset-0 z-50 md:hidden"
        panelClassName={cn(
          sidebarBgClassName,
          'text-text-primary border-t border-border-color/20 shadow-[0_-20px_56px_rgba(24,32,42,0.16)]',
          '[&_[data-slot=sheet-drag-handle]]:bg-border-color/50',
          '[&_[data-slot=sheet-header]]:items-center [&_[data-slot=sheet-header]]:border-b [&_[data-slot=sheet-header]]:border-border-color/20',
          '[&_[data-slot=sheet-title]]:text-sm [&_[data-slot=sheet-title]]:font-semibold [&_[data-slot=sheet-title]]:normal-case [&_[data-slot=sheet-title]]:tracking-normal [&_[data-slot=sheet-title]]:text-text-primary',
          '[&_[data-slot=sheet-close]]:border-border-color/20 [&_[data-slot=sheet-close]]:bg-transparent [&_[data-slot=sheet-close]]:text-text-primary',
        )}
        contentClassName="px-0 pb-0"
      >
        <ChapterList
          chapters={chapters}
          currentIndex={currentIndex}
          onSelect={onSelectChapter}
          contentTextColor={contentTextColor}
          isSidebarOpen={isSidebarOpen}
        />
      </BottomSheet>

      <aside
        className={cn(
          'hidden overflow-hidden text-text-primary transition-all duration-300 ease-in-out md:flex md:h-full md:flex-col',
          sidebarBgClassName,
          isSidebarOpen
            ? 'md:w-72 md:translate-x-0 md:border-r md:border-border-color/30'
            : 'md:w-0 md:-translate-x-full md:border-r-0',
        )}
      >
        <div className="flex h-full w-72 shrink-0 flex-col">
          <header className="glass z-10 flex h-14 shrink-0 items-center justify-between border-b border-border-color/20 px-4">
            <span className="font-semibold text-lg text-text-primary flex items-center gap-2">
              <Menu className="w-5 h-5 text-accent" /> {t('reader.contents')}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-text-secondary transition-colors hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden">
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
