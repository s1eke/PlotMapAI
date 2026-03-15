import { Minimize2, Maximize2, Type, ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../utils/cn';

interface ReaderToolbarProps {
  fontSize: number;
  setFontSize: (size: number) => void;
  isTwoColumn: boolean;
  setIsTwoColumn: (two: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export default function ReaderToolbar({
  fontSize,
  setFontSize,
  isTwoColumn,
  setIsTwoColumn,
  onPrev,
  onNext,
  hasPrev,
  hasNext
}: ReaderToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-bg-secondary/90 backdrop-blur-xl rounded-full px-6 py-3 flex items-center gap-6 shadow-2xl border border-border-color z-40 transition-all hover:bg-bg-secondary">
      
      <div className="flex items-center gap-2 border-r border-border-color/50 pr-6">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="p-2 rounded-full hover:bg-muted-bg disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-text-primary"
          title={t('reader.prev')}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          onClick={onNext}
          disabled={!hasNext}
          className="p-2 rounded-full hover:bg-muted-bg disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-text-primary"
          title={t('reader.next')}
        >
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-4 border-r border-border-color/50 pr-6">
        <button
          onClick={() => setFontSize(Math.max(14, fontSize - 2))}
          className="p-1 rounded hover:bg-muted-bg transition-colors text-text-primary"
          title={t('reader.fontSize')}
        >
          <Type className="w-4 h-4" />
        </button>
        <span className="text-text-primary/80 text-sm font-medium min-w-[3ch] text-center">
          {fontSize}
        </span>
        <button
          onClick={() => setFontSize(Math.min(32, fontSize + 2))}
          className="p-1 rounded hover:bg-muted-bg transition-colors text-text-primary"
          title={t('reader.fontSize')}
        >
          <Type className="w-6 h-6" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsTwoColumn(false)}
          className={cn(
            "p-2 rounded-full transition-colors",
            !isTwoColumn ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-primary hover:bg-muted-bg"
          )}
          title={t('reader.singleColumn')}
        >
          <Minimize2 className="w-5 h-5" />
        </button>
        <button
          onClick={() => setIsTwoColumn(true)}
          className={cn(
            "p-2 rounded-full transition-colors hidden md:block",
            isTwoColumn ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-primary hover:bg-muted-bg"
          )}
          title={t('reader.twoColumn')}
        >
          <Maximize2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
