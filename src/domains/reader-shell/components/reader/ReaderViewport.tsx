import { useEffect, useRef } from 'react';
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

const WHEEL_DELTA_SCALE = 0.65;
const TOUCH_DELTA_SCALE = 0.9;
const TOUCH_INERTIA_VELOCITY_SCALE = 0.45;
const TOUCH_INERTIA_DECAY_PER_FRAME = 0.86;
const TOUCH_INERTIA_MIN_VELOCITY = 30;
const MAX_WHEEL_DELTA_PX = 180;
const MAX_TOUCH_DELTA_PX = 180;
const WHEEL_LINE_DELTA_PX = 18;

function clampDelta(value: number, limit: number): number {
  if (!Number.isFinite(value) || value === 0) {
    return 0;
  }

  return Math.sign(value) * Math.min(Math.abs(value), limit);
}

function normalizeWheelDeltaY(event: WheelEvent, viewport: HTMLDivElement): number {
  if (event.deltaMode === 1) {
    return event.deltaY * WHEEL_LINE_DELTA_PX;
  }

  if (event.deltaMode === 2) {
    return event.deltaY * Math.max(1, viewport.clientHeight);
  }

  return event.deltaY;
}

function applyControlledScrollDelta(
  viewport: HTMLDivElement,
  deltaY: number,
): boolean {
  if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 0.01) {
    return false;
  }

  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  const previousScrollTop = viewport.scrollTop;
  const nextScrollTop = Math.max(0, Math.min(maxScrollTop, previousScrollTop + deltaY));
  if (Math.abs(nextScrollTop - previousScrollTop) < 0.01) {
    return false;
  }

  const scrollContainer = viewport;
  scrollContainer.scrollTop = nextScrollTop;
  scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
  return true;
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
  const scrollInputStateRef = useRef<{
    frameId: number | null;
    isTouching: boolean;
    lastTime: number;
    lastY: number;
    velocity: number;
  }>({
    frameId: null,
    isTouching: false,
    lastTime: 0,
    lastY: 0,
    velocity: 0,
  });
  let branch: 'paged' | 'scroll' | 'summary' = 'scroll';
  if (isPagedMode) {
    branch = 'paged';
  } else if (viewMode === 'summary') {
    branch = 'summary';
  }

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

      // 防御性检查：某些浏览器/边缘情况下事件可能不可取消
      if (event.cancelable) {
        event.preventDefault();
      }
      onBlockedInteraction?.();
    };

    viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      viewport.removeEventListener('touchmove', handleTouchMove);
    };
  }, [contentRef, interactionLocked, onBlockedInteraction]);

  useEffect(() => {
    const viewport = contentRef.current;
    const state = scrollInputStateRef.current;
    const shouldControlScrollInput =
      branch === 'scroll' && !isPagedMode && !interactionLocked;
    if (!viewport || !shouldControlScrollInput) {
      if (state.frameId !== null) {
        window.cancelAnimationFrame(state.frameId);
        state.frameId = null;
      }
      state.isTouching = false;
      state.velocity = 0;
      return;
    }

    const stopInertia = () => {
      if (state.frameId === null) {
        return;
      }

      window.cancelAnimationFrame(state.frameId);
      state.frameId = null;
    };

    const startInertia = () => {
      let lastFrameTime = window.performance.now();

      const step = (frameTime: number) => {
        const elapsedMs = Math.max(1, frameTime - lastFrameTime);
        lastFrameTime = frameTime;

        const deltaY = state.velocity * (elapsedMs / 1000);
        const moved = applyControlledScrollDelta(viewport, deltaY);
        const frameDecay = TOUCH_INERTIA_DECAY_PER_FRAME ** (elapsedMs / 16.67);
        state.velocity *= frameDecay;

        if (!moved || Math.abs(state.velocity) < TOUCH_INERTIA_MIN_VELOCITY) {
          state.frameId = null;
          state.velocity = 0;
          return;
        }

        state.frameId = window.requestAnimationFrame(step);
      };

      if (Math.abs(state.velocity) < TOUCH_INERTIA_MIN_VELOCITY) {
        state.velocity = 0;
        return;
      }

      state.frameId = window.requestAnimationFrame(step);
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        return;
      }
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        return;
      }

      const normalizedDeltaY = normalizeWheelDeltaY(event, viewport);
      const controlledDeltaY =
        clampDelta(normalizedDeltaY, MAX_WHEEL_DELTA_PX) * WHEEL_DELTA_SCALE;
      if (Math.abs(controlledDeltaY) < 0.01) {
        return;
      }

      event.preventDefault();
      stopInertia();
      applyControlledScrollDelta(viewport, controlledDeltaY);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        state.isTouching = false;
        state.velocity = 0;
        stopInertia();
        return;
      }

      const touch = event.touches[0];
      state.isTouching = true;
      state.lastY = touch.clientY;
      state.lastTime = window.performance.now();
      state.velocity = 0;
      stopInertia();
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!state.isTouching || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      const currentTime = window.performance.now();
      const elapsedMs = Math.max(1, currentTime - state.lastTime);
      const rawDeltaY = state.lastY - touch.clientY;
      const controlledDeltaY =
        clampDelta(rawDeltaY, MAX_TOUCH_DELTA_PX) * TOUCH_DELTA_SCALE;

      // 防御性检查：某些浏览器/边缘情况下事件可能不可取消
      if (event.cancelable) {
        event.preventDefault();
      }
      applyControlledScrollDelta(viewport, controlledDeltaY);
      state.velocity =
        (controlledDeltaY / elapsedMs) * 1000 * TOUCH_INERTIA_VELOCITY_SCALE;
      state.lastY = touch.clientY;
      state.lastTime = currentTime;
    };

    const handleTouchEnd = () => {
      if (!state.isTouching) {
        return;
      }

      state.isTouching = false;
      startInertia();
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    viewport.addEventListener('touchstart', handleTouchStart, { passive: true });
    viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewport.addEventListener('touchend', handleTouchEnd, { passive: true });
    viewport.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      viewport.removeEventListener('wheel', handleWheel);
      viewport.removeEventListener('touchstart', handleTouchStart);
      viewport.removeEventListener('touchmove', handleTouchMove);
      viewport.removeEventListener('touchend', handleTouchEnd);
      viewport.removeEventListener('touchcancel', handleTouchEnd);
      stopInertia();
      state.isTouching = false;
      state.velocity = 0;
    };
  }, [branch, contentRef, interactionLocked, isPagedMode]);

  useEffect(() => {
    if (!isReaderTraceEnabled()) {
      return;
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
    branch,
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
      data-reader-branch={branch}
      data-testid="reader-viewport"
      className={cn(
        'h-full w-full relative cursor-pointer',
        branch === 'scroll' && !interactionLocked && 'overscroll-contain',
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
