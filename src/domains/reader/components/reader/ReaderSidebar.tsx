import type { Chapter } from '../../api/readerApi';

import { Menu, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

import BottomSheet from '@shared/components/BottomSheet';
import { cn } from '@shared/utils/cn';

import ChapterList from '../ChapterList';

const DESKTOP_SIDEBAR_WIDTH = 288;
const READER_SIDEBAR_VARIANTS = {
  closed: {
    width: 0,
    x: -24,
    opacity: 0,
    transition: {
      width: {
        duration: 0.22,
        ease: [0.32, 0.72, 0, 1],
      },
      x: {
        duration: 0.2,
        ease: [0.32, 0.72, 0, 1],
      },
      opacity: {
        duration: 0.16,
      },
    },
  },
  open: {
    width: DESKTOP_SIDEBAR_WIDTH,
    x: 0,
    opacity: 1,
    transition: {
      width: {
        type: 'spring',
        stiffness: 420,
        damping: 34,
        mass: 0.9,
      },
      x: {
        type: 'spring',
        stiffness: 420,
        damping: 34,
        mass: 0.9,
      },
      opacity: {
        duration: 0.18,
      },
    },
  },
} as const;

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
        maxHeight="calc(100dvh - env(safe-area-inset-top, 0px) - 76px - env(safe-area-inset-bottom, 0px))"
        containerClassName="fixed inset-x-0 top-0 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-40 md:hidden"
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

      <motion.aside
        initial={false}
        animate={isSidebarOpen ? 'open' : 'closed'}
        variants={READER_SIDEBAR_VARIANTS}
        className={cn(
          'hidden overflow-hidden text-text-primary md:flex md:h-full md:flex-col will-change-transform',
          sidebarBgClassName,
          isSidebarOpen ? 'md:border-r md:border-border-color/30' : 'pointer-events-none md:border-r-0',
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
      </motion.aside>
    </>
  );
}
