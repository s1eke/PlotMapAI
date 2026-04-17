import { useEffect } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ChapterContent, RestoreStatus } from '@shared/contracts/reader';
import {
  PagedReaderContent,
  ScrollReaderContent,
  SummaryReaderContent,
} from '@domains/reader-layout-engine';
import { isReaderTraceEnabled, recordReaderTrace } from '@shared/reader-trace';
import { cn } from '@shared/utils/cn';

interface ReaderViewportProps {
  contentRef: React.RefObject<HTMLDivElement | null>;
  isPagedMode: boolean;
  interactionLocked?: boolean;
  viewMode: 'original' | 'summary';
  renderableChapter: ChapterContent | null;
  showLoadingOverlay: boolean;
  isRestoringPosition: boolean;
  restoreStatus?: RestoreStatus;
  loadingLabel?: string | null;
  onBlockedInteraction?: () => void;
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
  interactionLocked = false,
  viewMode,
  renderableChapter,
  showLoadingOverlay,
  isRestoringPosition,
  restoreStatus,
  loadingLabel,
  onBlockedInteraction,
  onContentClick,
  onContentScroll,
  emptyHref,
  emptyLabel,
  goBackLabel,
  pagedContentProps,
  scrollContentProps,
  summaryContentProps,
}: ReaderViewportProps) {
  let content: React.ReactNode = null;
  if (isPagedMode) {
    content = pagedContentProps ? <PagedReaderContent {...pagedContentProps} /> : null;
  } else if (viewMode === 'summary') {
    content = summaryContentProps ? <SummaryReaderContent {...summaryContentProps} /> : null;
  } else {
    content = scrollContentProps ? <ScrollReaderContent {...scrollContentProps} /> : null;
  }

  useEffect(() => {
    const viewport = contentRef.current;
    if (!viewport) {
      return;
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (!interactionLocked) {
        return;
      }

      event.preventDefault();
      onBlockedInteraction?.();
    };

    viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      viewport.removeEventListener('touchmove', handleTouchMove);
    };
  }, [contentRef, interactionLocked, onBlockedInteraction]);

  useEffect(() => {
    if (!isReaderTraceEnabled()) {
      return;
    }

    let branch: 'paged' | 'scroll' | 'summary' = 'scroll';
    if (isPagedMode) {
      branch = 'paged';
    } else if (viewMode === 'summary') {
      branch = 'summary';
    }
    const pagedChapter = pagedContentProps?.chapter?.index ?? null;
    const renderChapterIndex = renderableChapter?.index ?? pagedChapter;

    recordReaderTrace('viewport_branch_rendered', {
      chapterIndex: renderChapterIndex,
      mode: branch,
      restoreStatus: restoreStatus ?? null,
      details: {
        branch,
        isPagedMode,
        isRestoringPosition,
        pageIndex: pagedContentProps?.pageIndex ?? null,
        showLoadingOverlay,
        viewMode,
      },
    });
  }, [
    isPagedMode,
    isRestoringPosition,
    pagedContentProps?.chapter?.index,
    pagedContentProps?.pageIndex,
    renderableChapter?.index,
    restoreStatus,
    showLoadingOverlay,
    viewMode,
  ]);

  return (
    <div
      ref={contentRef}
      data-testid="reader-viewport"
      className={cn(
        'h-full w-full relative cursor-pointer',
        isPagedMode || interactionLocked ? 'overflow-hidden' : 'overflow-y-auto hide-scrollbar',
      )}
      onWheelCapture={(event) => {
        if (!interactionLocked) {
          return;
        }

        event.preventDefault();
        onBlockedInteraction?.();
      }}
      onPointerMoveCapture={(event) => {
        if (!interactionLocked || !isPagedMode || event.buttons === 0) {
          return;
        }

        event.preventDefault();
        onBlockedInteraction?.();
      }}
      onClick={onContentClick}
      onScroll={onContentScroll}
    >
      {renderableChapter && (
        <div className={cn('h-full transition-opacity duration-150', isRestoringPosition && 'opacity-0 pointer-events-none select-none')}>
          {content}
        </div>
      )}
      {!renderableChapter && !showLoadingOverlay && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-text-secondary">
          <p>{emptyLabel}</p>
          <Link to={emptyHref} className="text-accent underline mt-4 flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            {goBackLabel}
          </Link>
        </div>
      )}
      {showLoadingOverlay && (
        <div
          role="status"
          aria-label="Loading reader content"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3"
        >
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          {loadingLabel ? <p className="text-sm text-text-secondary">{loadingLabel}</p> : null}
        </div>
      )}
    </div>
  );
}
