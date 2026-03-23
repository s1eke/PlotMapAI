import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ChapterContent } from '../../api/reader';
import { cn } from '../../utils/cn';
import PagedReaderContent from './PagedReaderContent';
import ScrollReaderContent from './ScrollReaderContent';
import SummaryReaderContent from './SummaryReaderContent';

interface ReaderViewportProps {
  contentRef: React.RefObject<HTMLDivElement | null>;
  isPagedMode: boolean;
  viewMode: 'original' | 'summary';
  renderableChapter: ChapterContent | null;
  showLoadingOverlay: boolean;
  isRestoringPosition: boolean;
  onContentClick: React.MouseEventHandler<HTMLDivElement>;
  onContentScroll: React.UIEventHandler<HTMLDivElement>;
  emptyHref: string;
  emptyLabel: string;
  goBackLabel: string;
  pagedContentProps?: React.ComponentProps<typeof PagedReaderContent>;
  scrollContentProps?: React.ComponentProps<typeof ScrollReaderContent>;
  summaryContentProps?: React.ComponentProps<typeof SummaryReaderContent>;
}

export default function ReaderViewport({
  contentRef,
  isPagedMode,
  viewMode,
  renderableChapter,
  showLoadingOverlay,
  isRestoringPosition,
  onContentClick,
  onContentScroll,
  emptyHref,
  emptyLabel,
  goBackLabel,
  pagedContentProps,
  scrollContentProps,
  summaryContentProps,
}: ReaderViewportProps) {
  return (
    <div
      ref={contentRef}
      className={cn('h-full w-full relative cursor-pointer', isPagedMode ? 'overflow-hidden' : 'overflow-y-auto hide-scrollbar')}
      onClick={onContentClick}
      onScroll={onContentScroll}
    >
      {renderableChapter ? (
        <div className={cn('h-full transition-opacity duration-150', isRestoringPosition && 'opacity-0 pointer-events-none select-none')}>
          {isPagedMode ? (
            pagedContentProps ? <PagedReaderContent {...pagedContentProps} /> : null
          ) : viewMode === 'summary' ? (
            summaryContentProps ? <SummaryReaderContent {...summaryContentProps} /> : null
          ) : (
            scrollContentProps ? <ScrollReaderContent {...scrollContentProps} /> : null
          )}
        </div>
      ) : !showLoadingOverlay ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-text-secondary">
          <p>{emptyLabel}</p>
          <Link to={emptyHref} className="text-accent underline mt-4 flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            {goBackLabel}
          </Link>
        </div>
      ) : null}
      {showLoadingOverlay && (
        <div
          role="status"
          aria-label="Loading reader content"
          className="absolute inset-0 flex items-center justify-center"
        >
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      )}
    </div>
  );
}
