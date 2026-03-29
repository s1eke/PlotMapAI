import { ArrowLeft, AlignLeft, Bot, Menu, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { cn } from '@shared/utils/cn';

import { appPaths } from '@app/router/paths';
import { getReaderChromeThemeClasses } from '../../utils/readerChromeTheme';

const READER_TOP_BAR_VARIANTS = {
  hidden: {
    y: '-100%',
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: [0.32, 0.72, 0, 1],
    },
  },
  visible: {
    y: '0%',
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 420,
      damping: 34,
      mass: 0.9,
    },
  },
} as const;

interface ReaderTopBarProps {
  readerTheme: string;
  headerBgClassName: string;
  textClassName: string;
  isChromeVisible: boolean;
  isSidebarOpen: boolean;
  novelId: number;
  viewMode: 'original' | 'summary';
  onMobileBack: () => void;
  onToggleSidebar: () => void;
  onSetViewMode: (viewMode: 'original' | 'summary') => void;
}

export default function ReaderTopBar({
  readerTheme,
  headerBgClassName,
  textClassName,
  isChromeVisible,
  isSidebarOpen,
  novelId,
  viewMode,
  onMobileBack,
  onToggleSidebar,
  onSetViewMode,
}: ReaderTopBarProps) {
  const { t } = useTranslation();
  const {
    borderClassName,
    hoverClassName,
    segmentedControlClassName,
  } = getReaderChromeThemeClasses(readerTheme);

  return (
    <motion.header
      initial={false}
      animate={isChromeVisible ? 'visible' : 'hidden'}
      variants={READER_TOP_BAR_VARIANTS}
      className={cn(
        'absolute left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b px-4 sm:px-6',
        headerBgClassName,
        borderClassName,
        !isChromeVisible && 'pointer-events-none',
      )}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileBack}
          aria-label={t('reader.exit')}
          className={cn('rounded-full p-2 transition-colors md:hidden', textClassName, hoverClassName)}
          title={t('reader.exit')}
          type="button"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          onClick={onToggleSidebar}
          className={cn('hidden rounded-full p-2 transition-colors md:flex', textClassName, hoverClassName)}
          title={t('reader.contents')}
          type="button"
        >
          {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <Link
          to={appPaths.novel(novelId)}
          className={cn('hidden text-sm font-medium transition-colors hover:text-accent md:block', textClassName)}
        >
          {t('reader.exit')}
        </Link>
      </div>
      <div className={cn('flex rounded-lg border p-1', segmentedControlClassName)}>
        <button
          onClick={() => onSetViewMode('original')}
          className={cn(
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
            viewMode === 'original'
              ? 'bg-accent text-white shadow'
              : cn(textClassName, 'opacity-70 hover:opacity-100'),
          )}
          type="button"
        >
          <AlignLeft className="w-4 h-4" /> {t('reader.original')}
        </button>
        <button
          onClick={() => onSetViewMode('summary')}
          className={cn(
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
            viewMode === 'summary'
              ? 'bg-accent text-white shadow'
              : cn(textClassName, 'opacity-70 hover:opacity-100'),
          )}
          type="button"
        >
          <Bot className="w-4 h-4" /> {t('reader.summary')}
        </button>
      </div>
    </motion.header>
  );
}
