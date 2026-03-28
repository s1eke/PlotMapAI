import { ArrowLeft, AlignLeft, Bot, Menu, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { cn } from '@shared/utils/cn';

import { appPaths } from '@app/router/paths';

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
  isChromeVisible: boolean;
  isSidebarOpen: boolean;
  novelId: number;
  viewMode: 'original' | 'summary';
  onMobileBack: () => void;
  onToggleSidebar: () => void;
  onSetViewMode: (viewMode: 'original' | 'summary') => void;
}

export default function ReaderTopBar({
  isChromeVisible,
  isSidebarOpen,
  novelId,
  viewMode,
  onMobileBack,
  onToggleSidebar,
  onSetViewMode,
}: ReaderTopBarProps) {
  const { t } = useTranslation();

  return (
    <motion.header
      initial={false}
      animate={isChromeVisible ? 'visible' : 'hidden'}
      variants={READER_TOP_BAR_VARIANTS}
      className={cn(
        'absolute left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border-color/20 glass px-4 sm:px-6',
        !isChromeVisible && 'pointer-events-none',
      )}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileBack}
          aria-label={t('reader.exit')}
          className="md:hidden p-2 rounded-full hover:bg-white/10 transition-colors text-text-primary"
          title={t('reader.exit')}
          type="button"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button onClick={onToggleSidebar} className="hidden md:flex p-2 rounded-full hover:bg-white/10 transition-colors text-text-primary" title={t('reader.contents')}>
          {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <Link to={appPaths.novel(novelId)} className="text-sm font-medium hover:text-accent transition-colors hidden md:block text-text-primary">
          {t('reader.exit')}
        </Link>
      </div>
      <div className="flex bg-muted-bg rounded-lg p-1 border border-border-color/50 shadow-inner">
        <button onClick={() => onSetViewMode('original')} className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2', viewMode === 'original' ? 'bg-accent text-white shadow' : 'text-text-secondary hover:text-text-primary')}>
          <AlignLeft className="w-4 h-4" /> {t('reader.original')}
        </button>
        <button onClick={() => onSetViewMode('summary')} className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2', viewMode === 'summary' ? 'bg-accent text-white shadow' : 'text-text-secondary hover:text-text-primary')}>
          <Bot className="w-4 h-4" /> {t('reader.summary')}
        </button>
      </div>
    </motion.header>
  );
}
