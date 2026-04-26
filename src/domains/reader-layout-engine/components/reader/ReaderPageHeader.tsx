import { READER_CONTENT_CLASS_NAMES } from '@shared/reader-rendering';
import { cn } from '@shared/utils/cn';

interface ReaderPageHeaderProps {
  className?: string;
  headerBgClassName: string;
  indicatorPageCount?: number;
  indicatorPageIndex?: number;
  pageCount?: number;
  pageIndex?: number;
  readerTheme: string;
  showPageIndicator?: boolean;
  textClassName: string;
  title: string;
}

export default function ReaderPageHeader({
  className,
  headerBgClassName,
  indicatorPageCount,
  indicatorPageIndex,
  pageCount,
  pageIndex,
  readerTheme,
  showPageIndicator = true,
  textClassName,
  title,
}: ReaderPageHeaderProps) {
  const hasIndicatorPage =
    typeof indicatorPageCount === 'number'
    && typeof indicatorPageIndex === 'number'
    && indicatorPageCount > 0;
  const displayPageCount = hasIndicatorPage ? indicatorPageCount : pageCount;
  const displayPageIndex = hasIndicatorPage ? indicatorPageIndex : pageIndex;
  const shouldShowPageIndicator =
    showPageIndicator
    &&
    typeof displayPageCount === 'number'
    && typeof displayPageIndex === 'number'
    && displayPageCount > 0;

  return (
    <div
      className={cn(
        READER_CONTENT_CLASS_NAMES.chapterHeader,
        'w-full shrink-0 border-b border-border-color/20 backdrop-blur-sm',
        headerBgClassName,
        className,
      )}
    >
      <div className={cn('mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 py-2 sm:px-8 md:px-12', textClassName)}>
        <h1 className={cn('min-w-0 flex-1 truncate text-sm font-medium transition-colors', readerTheme === 'auto' ? 'text-text-secondary' : 'opacity-60')}>
          {title}
        </h1>
        {shouldShowPageIndicator ? (
          <div className="shrink-0 whitespace-nowrap text-xs font-medium text-text-secondary">
            {displayPageIndex + 1} / {displayPageCount}
          </div>
        ) : null}
      </div>
    </div>
  );
}
