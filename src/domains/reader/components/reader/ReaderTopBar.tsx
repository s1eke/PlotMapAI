import { ArrowLeft, AlignLeft, Bot, Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { cn } from '@shared/utils/cn';

import { appPaths } from '@app/router/paths';

interface ReaderTopBarProps {
  isChromeVisible: boolean;
  isSidebarOpen: boolean;
  novelId: number;
  viewMode: 'original' | 'summary';
  onToggleSidebar: () => void;
  onSetViewMode: (viewMode: 'original' | 'summary') => void;
}

export default function ReaderTopBar({
  isChromeVisible,
  isSidebarOpen,
  novelId,
  viewMode,
  onToggleSidebar,
  onSetViewMode,
}: ReaderTopBarProps) {
  const { t } = useTranslation();

  return (
    <header className={cn(
      'h-14 flex items-center justify-between px-4 sm:px-6 border-b border-border-color/20 glass z-30 absolute top-0 left-0 right-0 transition-all duration-300',
      !isChromeVisible && '-translate-y-full opacity-0 pointer-events-none',
    )}>
      <div className="flex items-center gap-3">
        <Link to={appPaths.bookshelf()} className="md:hidden p-2 rounded-full hover:bg-white/10 transition-colors text-text-primary" title={t('reader.exit')}>
          <ArrowLeft className="w-5 h-5" />
        </Link>
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
    </header>
  );
}
