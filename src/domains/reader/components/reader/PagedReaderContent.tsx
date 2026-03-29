import type { ChapterContent } from '../../api/readerApi';
import type { ReaderPageTurnMode } from '../../constants/pageTurnMode';
import type { AnimationPlaybackControls, PanInfo, Variants } from 'motion/react';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';
import { cn } from '@shared/utils/cn';

import {
  getPageTurnAnimation,
  getPageTurnSettleDuration,
  type PageTurnDirection,
} from '../../animations/pageTurnAnimations';
import { getPagedPageCount, getPagedScrollLeft } from '../../hooks/usePagedReaderLayout';
import {
  clampDragOffset,
  getPagedDragLayerOffsets,
  shouldCommitPageTurnDrag,
} from '../../utils/pagedDrag';
import { extractImageKeysFromText } from '../../utils/chapterImages';
import { preloadReaderImageResources } from '../../utils/readerImageResourceCache';
import ReaderChapterSection from './ReaderChapterSection';

const DRAG_START_THRESHOLD_PX = 8;

interface PagedReaderContentProps {
  chapter: ChapterContent;
  novelId: number;
  pageIndex: number;
  pageCount: number;
  pagedViewportRef: React.RefObject<HTMLDivElement | null>;
  pagedContentRef: React.RefObject<HTMLDivElement | null>;
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
  readerTheme: string;
  textClassName: string;
  headerBgClassName: string;
  pageBgClassName?: string;
  fitsTwoColumns: boolean;
  pageTurnStep?: number;
  twoColumnWidth: number | undefined;
  twoColumnGap: number;
  pageTurnMode: ReaderPageTurnMode;
  pageTurnDirection: PageTurnDirection;
  pageTurnToken: number;
  previousChapterPreview?: ChapterContent | null;
  nextChapterPreview?: ChapterContent | null;
  onRequestPrevPage?: () => void;
  onRequestNextPage?: () => void;
  disableAnimation?: boolean;
  interactionLocked?: boolean;
}

interface PagedContentBodyProps {
  chapter: ChapterContent;
  novelId: number;
  contentRef?: React.RefObject<HTMLDivElement | null>;
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
  twoColumnGap: number;
  twoColumnWidth: number | undefined;
  fitsTwoColumns: boolean;
  pageOffset?: number;
}

interface LayoutMetrics {
  scrollWidth: number;
  viewportWidth: number;
}

interface PreviewMeasurements {
  previousScrollWidth: number;
  nextScrollWidth: number;
}

interface PagePreviewTarget {
  chapter: ChapterContent;
  pageOffset: number;
  pageIndex: number;
  pageCount: number;
}

interface CommittedDragTransition {
  current: PagePreviewTarget;
  preview: PagePreviewTarget;
  direction: PageTurnDirection;
  mode: Extract<ReaderPageTurnMode, 'cover' | 'slide'>;
}

interface PagedPageFrameProps extends PagedContentBodyProps {
  chapter: ChapterContent;
  pageIndex: number;
  pageCount: number;
  readerTheme: string;
  textClassName: string;
  headerBgClassName: string;
  pageBgClassName?: string;
  viewportRef?: React.RefObject<HTMLDivElement | null>;
  viewportTestId?: string;
  showHeaderContent?: boolean;
}

function getLastPageOffset(scrollWidth: number, viewportWidth: number, pageTurnStep: number): number {
  const pageCount = getPagedPageCount(scrollWidth, viewportWidth, pageTurnStep);
  return getPagedScrollLeft(
    pageCount - 1,
    pageTurnStep,
    Math.max(0, scrollWidth - viewportWidth),
  );
}

function PagedContentBody({
  chapter,
  novelId,
  contentRef,
  fontSize,
  lineSpacing,
  paragraphSpacing,
  twoColumnGap,
  twoColumnWidth,
  fitsTwoColumns,
  pageOffset = 0,
}: PagedContentBodyProps) {
  return (
    <div
      ref={contentRef}
      data-testid="paged-reader-content-body"
      className="h-full text-justify tracking-wide selection:bg-accent/30 md:text-left"
      style={{
        fontSize: `${fontSize}px`,
        lineHeight: String(lineSpacing),
        columnGap: fitsTwoColumns ? `${twoColumnGap}px` : '0px',
        columnWidth: twoColumnWidth ? `${twoColumnWidth}px` : undefined,
        columnFill: 'auto',
        columnRule: fitsTwoColumns ? '1px solid var(--border-color)' : undefined,
        transform: pageOffset > 0 ? `translateX(-${pageOffset}px)` : undefined,
      }}
    >
      <ReaderChapterSection
        title={chapter.title}
        content={chapter.content}
        novelId={novelId}
        paragraphSpacing={paragraphSpacing}
        imageRenderMode="paged"
        headingClassName="text-xl sm:text-2xl font-bold text-center mb-8 mt-2 break-inside-avoid"
        headingStyle={{ lineHeight: '1.4' }}
        mixedParagraphClassName="break-inside-avoid"
      />
    </div>
  );
}

function PagedPageFrame({
  chapter,
  novelId,
  contentRef,
  fontSize,
  lineSpacing,
  paragraphSpacing,
  twoColumnGap,
  twoColumnWidth,
  fitsTwoColumns,
  pageOffset = 0,
  pageIndex,
  pageCount,
  readerTheme,
  textClassName,
  headerBgClassName,
  pageBgClassName,
  viewportRef,
  viewportTestId,
  showHeaderContent = true,
}: PagedPageFrameProps) {
  return (
    <div data-testid="paged-reader-page-frame" className="flex h-full w-full flex-col">
      <div className={cn('w-full shrink-0 border-b border-border-color/20 backdrop-blur-sm', headerBgClassName)}>
        <div className={cn('mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-8 md:px-12', textClassName)}>
          {showHeaderContent ? (
            <h1 className={cn('truncate text-sm font-medium transition-colors', readerTheme === 'auto' ? 'text-text-secondary' : 'opacity-60')}>
              {chapter.title}
            </h1>
          ) : (
            <div className="h-5 flex-1" />
          )}
          {showHeaderContent ? (
            pageCount > 1 ? (
              <div className="whitespace-nowrap text-xs font-medium text-text-secondary">{pageIndex + 1} / {pageCount}</div>
            ) : null
          ) : (
            <div className="h-4 w-10 shrink-0" />
          )}
        </div>
      </div>

      <div className={cn('min-h-0 flex-1', pageBgClassName ?? headerBgClassName)}>
        <div className={cn('mx-auto h-full w-full max-w-[1400px] px-4 sm:px-8 md:px-12', textClassName)}>
          <div ref={viewportRef} data-testid={viewportTestId} className="h-full overflow-hidden pt-4">
            <PagedContentBody
              chapter={chapter}
              novelId={novelId}
              contentRef={contentRef}
              fontSize={fontSize}
              lineSpacing={lineSpacing}
              paragraphSpacing={paragraphSpacing}
              twoColumnGap={twoColumnGap}
              twoColumnWidth={twoColumnWidth}
              fitsTwoColumns={fitsTwoColumns}
              pageOffset={pageOffset}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PagedReaderContent({
  chapter,
  novelId,
  pageIndex,
  pageCount,
  pagedViewportRef,
  pagedContentRef,
  fontSize,
  lineSpacing,
  paragraphSpacing,
  readerTheme,
  textClassName,
  headerBgClassName,
  pageBgClassName,
  fitsTwoColumns,
  pageTurnStep,
  twoColumnWidth,
  twoColumnGap,
  pageTurnMode,
  pageTurnDirection,
  pageTurnToken,
  previousChapterPreview = null,
  nextChapterPreview = null,
  onRequestPrevPage,
  onRequestNextPage,
  disableAnimation = false,
  interactionLocked = false,
}: PagedReaderContentProps) {
  const [layoutMetrics, setLayoutMetrics] = useState<LayoutMetrics>({
    scrollWidth: 0,
    viewportWidth: 0,
  });
  const [previewMeasurements, setPreviewMeasurements] = useState<PreviewMeasurements>({
    previousScrollWidth: 0,
    nextScrollWidth: 0,
  });
  const [dragDirection, setDragDirection] = useState<PageTurnDirection | null>(null);
  const [committedDragTransition, setCommittedDragTransition] = useState<CommittedDragTransition | null>(null);
  const preloadImageKeys = useMemo(() => {
    const imageKeys = new Set<string>();
    for (const renderableChapter of [chapter, previousChapterPreview, nextChapterPreview]) {
      if (!renderableChapter) {
        continue;
      }

      for (const imageKey of extractImageKeysFromText(renderableChapter.content)) {
        imageKeys.add(imageKey);
      }
    }

    return Array.from(imageKeys);
  }, [chapter, nextChapterPreview, previousChapterPreview]);

  const previousPreviewContentRef = useRef<HTMLDivElement | null>(null);
  const nextPreviewContentRef = useRef<HTMLDivElement | null>(null);
  const dragAnimationRef = useRef<AnimationPlaybackControls | null>(null);
  const suppressNextClickRef = useRef(false);
  const activeDragMode = committedDragTransition?.mode
    ?? (pageTurnMode === 'cover' || pageTurnMode === 'slide' ? pageTurnMode : null);
  const activeDragDirection = committedDragTransition?.direction ?? dragDirection;

  const dragOffset = useMotionValue(0);
  const currentLayerX = useTransform(dragOffset, (offset) => {
    if (!activeDragDirection || !activeDragMode) {
      return 0;
    }

    return getPagedDragLayerOffsets(
      activeDragMode,
      activeDragDirection,
      offset,
      layoutMetrics.viewportWidth,
    ).currentX;
  });
  const previewLayerX = useTransform(dragOffset, (offset) => {
    if (!activeDragDirection || !activeDragMode) {
      return 0;
    }

    return getPagedDragLayerOffsets(
      activeDragMode,
      activeDragDirection,
      offset,
      layoutMetrics.viewportWidth,
    ).previewX;
  });

  const stopDragAnimation = useCallback(() => {
    dragAnimationRef.current?.stop();
    dragAnimationRef.current = null;
  }, []);

  const resetDragState = useCallback(() => {
    stopDragAnimation();
    dragOffset.set(0);
    setDragDirection(null);
  }, [dragOffset, stopDragAnimation]);

  useEffect(() => {
    const viewport = pagedViewportRef.current;
    const content = pagedContentRef.current;
    if (!viewport || !content) {
      return;
    }

    const measureLayout = () => {
      const nextMetrics = {
        scrollWidth: content.scrollWidth,
        viewportWidth: viewport.clientWidth,
      };
      setLayoutMetrics((previous) => (
        previous.scrollWidth === nextMetrics.scrollWidth
        && previous.viewportWidth === nextMetrics.viewportWidth
      )
        ? previous
        : nextMetrics);
    };

    const frameId = requestAnimationFrame(measureLayout);
    const observer = new ResizeObserver(measureLayout);
    observer.observe(viewport);
    observer.observe(content);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [
    chapter.index,
    fitsTwoColumns,
    fontSize,
    lineSpacing,
    pagedContentRef,
    pagedViewportRef,
    paragraphSpacing,
    twoColumnGap,
    twoColumnWidth,
  ]);

  useEffect(() => {
    const previousContent = previousPreviewContentRef.current;
    const nextContent = nextPreviewContentRef.current;

    const updatePreviewMeasurements = () => {
      setPreviewMeasurements((previous) => {
        const nextState = {
          previousScrollWidth: previousContent?.scrollWidth ?? 0,
          nextScrollWidth: nextContent?.scrollWidth ?? 0,
        };

        return previous.previousScrollWidth === nextState.previousScrollWidth
          && previous.nextScrollWidth === nextState.nextScrollWidth
          ? previous
          : nextState;
      });
    };

    const frameId = requestAnimationFrame(updatePreviewMeasurements);
    const observer = new ResizeObserver(updatePreviewMeasurements);
    if (previousContent) {
      observer.observe(previousContent);
    }
    if (nextContent) {
      observer.observe(nextContent);
    }

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [
    fitsTwoColumns,
    fontSize,
    lineSpacing,
    nextChapterPreview?.index,
    paragraphSpacing,
    previousChapterPreview?.index,
    twoColumnGap,
    twoColumnWidth,
  ]);

  useEffect(() => {
    return () => {
      stopDragAnimation();
    };
  }, [stopDragAnimation]);

  useEffect(() => {
    if (preloadImageKeys.length === 0) {
      return;
    }

    void preloadReaderImageResources(novelId, preloadImageKeys);
  }, [novelId, preloadImageKeys]);

  const fallbackPageTurnStep = layoutMetrics.viewportWidth
    ? layoutMetrics.viewportWidth + (fitsTwoColumns ? twoColumnGap : 0)
    : 0;
  const resolvedPageTurnStep = pageTurnStep && pageTurnStep > 0
    ? pageTurnStep
    : fallbackPageTurnStep;
  const currentMaxScrollLeft = Math.max(0, layoutMetrics.scrollWidth - layoutMetrics.viewportWidth);
  const visiblePageOffset = getPagedScrollLeft(pageIndex, resolvedPageTurnStep, currentMaxScrollLeft);

  const previousPreviewTarget = useMemo<PagePreviewTarget | null>(() => {
    if (!resolvedPageTurnStep || !layoutMetrics.viewportWidth) {
      return null;
    }

    if (pageIndex > 0) {
      return {
        chapter,
        pageOffset: getPagedScrollLeft(pageIndex - 1, resolvedPageTurnStep, currentMaxScrollLeft),
        pageIndex: pageIndex - 1,
        pageCount,
      };
    }

    if (!previousChapterPreview || previewMeasurements.previousScrollWidth <= 0) {
      return null;
    }

    const previewPageCount = getPagedPageCount(
      previewMeasurements.previousScrollWidth,
      layoutMetrics.viewportWidth,
      resolvedPageTurnStep,
    );

    return {
      chapter: previousChapterPreview,
      pageOffset: getLastPageOffset(
        previewMeasurements.previousScrollWidth,
        layoutMetrics.viewportWidth,
        resolvedPageTurnStep,
      ),
      pageIndex: Math.max(0, previewPageCount - 1),
      pageCount: previewPageCount,
    };
  }, [
    chapter,
    currentMaxScrollLeft,
    layoutMetrics.viewportWidth,
    pageCount,
    pageIndex,
    resolvedPageTurnStep,
    previewMeasurements.previousScrollWidth,
    previousChapterPreview,
  ]);

  const nextPreviewTarget = useMemo<PagePreviewTarget | null>(() => {
    if (!resolvedPageTurnStep || !layoutMetrics.viewportWidth) {
      return null;
    }

    if (pageIndex < pageCount - 1) {
      return {
        chapter,
        pageOffset: getPagedScrollLeft(pageIndex + 1, resolvedPageTurnStep, currentMaxScrollLeft),
        pageIndex: pageIndex + 1,
        pageCount,
      };
    }

    if (!nextChapterPreview || previewMeasurements.nextScrollWidth <= 0) {
      return null;
    }

    const previewPageCount = getPagedPageCount(
      previewMeasurements.nextScrollWidth,
      layoutMetrics.viewportWidth,
      resolvedPageTurnStep,
    );

    return {
      chapter: nextChapterPreview,
      pageOffset: 0,
      pageIndex: 0,
      pageCount: previewPageCount,
    };
  }, [
    chapter,
    currentMaxScrollLeft,
    layoutMetrics.viewportWidth,
    nextChapterPreview,
    pageCount,
    pageIndex,
    resolvedPageTurnStep,
    previewMeasurements.nextScrollWidth,
  ]);

  const canDragPrev = previousPreviewTarget !== null && typeof onRequestPrevPage === 'function';
  const canDragNext = nextPreviewTarget !== null && typeof onRequestNextPage === 'function';
  const isDragEnabled = committedDragTransition === null
    && !disableAnimation
    && !interactionLocked
    && (pageTurnMode === 'cover' || pageTurnMode === 'slide')
    && layoutMetrics.viewportWidth > 0
    && (canDragPrev || canDragNext);
  const livePreviewTarget = dragDirection === 'prev'
    ? previousPreviewTarget
    : dragDirection === 'next'
      ? nextPreviewTarget
      : null;
  const activeDragTransition = committedDragTransition
    ? committedDragTransition
    : dragDirection && livePreviewTarget && (pageTurnMode === 'cover' || pageTurnMode === 'slide')
      ? {
          current: {
            chapter,
            pageOffset: visiblePageOffset,
            pageIndex,
            pageCount,
          },
          preview: livePreviewTarget,
          direction: dragDirection,
          mode: pageTurnMode,
        }
      : null;
  const dragLayerOffsets = activeDragTransition
    ? getPagedDragLayerOffsets(
        activeDragTransition.mode,
        activeDragTransition.direction,
        0,
        layoutMetrics.viewportWidth,
      )
    : null;

  const handlePanStart = useCallback(() => {
    if (!isDragEnabled) {
      return;
    }

    stopDragAnimation();
  }, [isDragEnabled, stopDragAnimation]);

  const handlePan = useCallback((_event: PointerEvent, info: PanInfo) => {
    if (!isDragEnabled) {
      return;
    }

    const nextOffset = clampDragOffset(
      info.offset.x,
      layoutMetrics.viewportWidth,
      canDragPrev,
      canDragNext,
    );

    if (Math.abs(nextOffset) < DRAG_START_THRESHOLD_PX) {
      dragOffset.set(0);
      setDragDirection(null);
      return;
    }

    const nextDirection = nextOffset > 0 ? 'prev' : 'next';
    dragOffset.set(nextOffset);
    setDragDirection(previous => previous === nextDirection ? previous : nextDirection);
    suppressNextClickRef.current = true;
  }, [canDragNext, canDragPrev, dragOffset, isDragEnabled, layoutMetrics.viewportWidth]);

  const handlePanEnd = useCallback((_event: PointerEvent, info: PanInfo) => {
    if (!isDragEnabled) {
      return;
    }

    const nextOffset = clampDragOffset(
      info.offset.x,
      layoutMetrics.viewportWidth,
      canDragPrev,
      canDragNext,
    );
    const nextDirection = nextOffset > 0 ? 'prev' : nextOffset < 0 ? 'next' : null;

    if (!nextDirection || Math.abs(nextOffset) < DRAG_START_THRESHOLD_PX) {
      suppressNextClickRef.current = false;
      resetDragState();
      return;
    }

    const shouldCommit = shouldCommitPageTurnDrag(
      nextOffset,
      info.velocity.x,
      layoutMetrics.viewportWidth,
    );
    const commitPreviewTarget = nextDirection === 'prev' ? previousPreviewTarget : nextPreviewTarget;

    if (!commitPreviewTarget) {
      suppressNextClickRef.current = false;
      resetDragState();
      return;
    }

    const targetOffset = shouldCommit
      ? nextDirection === 'next'
        ? -layoutMetrics.viewportWidth
        : layoutMetrics.viewportWidth
      : 0;
    const animation = getPageTurnAnimation(pageTurnMode);
    const settleDuration = getPageTurnSettleDuration(
      pageTurnMode,
      nextOffset,
      targetOffset,
      layoutMetrics.viewportWidth,
      info.velocity.x,
    );

    dragAnimationRef.current = animate(dragOffset, targetOffset, {
      ...animation.transition,
      duration: settleDuration,
      onComplete: () => {
        dragAnimationRef.current = null;
        suppressNextClickRef.current = false;
        setCommittedDragTransition(null);
        dragOffset.set(0);
        setDragDirection(null);
      },
    });

    if (shouldCommit) {
      setCommittedDragTransition({
        current: {
          chapter,
          pageOffset: visiblePageOffset,
          pageIndex,
          pageCount,
        },
        preview: commitPreviewTarget,
        direction: nextDirection,
        mode: pageTurnMode,
      });
      setDragDirection(null);
      if (nextDirection === 'next') {
        onRequestNextPage?.();
      } else {
        onRequestPrevPage?.();
      }
    }
  }, [
    canDragNext,
    canDragPrev,
    chapter,
    dragOffset,
    isDragEnabled,
    layoutMetrics.viewportWidth,
    onRequestNextPage,
    onRequestPrevPage,
    pageIndex,
    pageCount,
    pageTurnMode,
    previousPreviewTarget,
    nextPreviewTarget,
    resetDragState,
    setCommittedDragTransition,
    visiblePageOffset,
  ]);

  const handleClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressNextClickRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressNextClickRef.current = false;
  }, []);

  const animationMode = disableAnimation || pageTurnMode === 'scroll' || pageTurnToken === 0
    ? 'none'
    : pageTurnMode;
  const pageTurnAnimation = getPageTurnAnimation(animationMode);
  const variants: Variants = {
    enter: (custom: PageTurnDirection) => pageTurnAnimation.initial({ direction: custom }) as never,
    center: (custom: PageTurnDirection) => pageTurnAnimation.animate({ direction: custom }) as never,
    exit: (custom: PageTurnDirection) => pageTurnAnimation.exit({ direction: custom }) as never,
  };

  return (
    <div className="relative h-full w-full">
      <div className="relative h-full">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden opacity-0"
        >
          <PagedPageFrame
            chapter={chapter}
            novelId={novelId}
            fontSize={fontSize}
            lineSpacing={lineSpacing}
            paragraphSpacing={paragraphSpacing}
            twoColumnGap={twoColumnGap}
            twoColumnWidth={twoColumnWidth}
            fitsTwoColumns={fitsTwoColumns}
            contentRef={pagedContentRef}
            pageIndex={pageIndex}
            pageCount={pageCount}
            readerTheme={readerTheme}
            textClassName={textClassName}
            headerBgClassName={headerBgClassName}
            pageBgClassName={pageBgClassName}
            viewportRef={pagedViewportRef}
            viewportTestId="paged-reader-measurement-viewport"
            showHeaderContent={false}
          />
        </div>

        {previousChapterPreview ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden opacity-0">
            <PagedPageFrame
              chapter={previousChapterPreview}
              novelId={novelId}
              fontSize={fontSize}
              lineSpacing={lineSpacing}
              paragraphSpacing={paragraphSpacing}
              twoColumnGap={twoColumnGap}
              twoColumnWidth={twoColumnWidth}
              fitsTwoColumns={fitsTwoColumns}
              contentRef={previousPreviewContentRef}
              pageIndex={Math.max(0, previousChapterPreview.totalChapters - 1)}
              pageCount={previousChapterPreview.totalChapters}
              readerTheme={readerTheme}
              textClassName={textClassName}
              headerBgClassName={headerBgClassName}
              pageBgClassName={pageBgClassName}
              showHeaderContent={false}
            />
          </div>
        ) : null}

        {nextChapterPreview ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden opacity-0">
            <PagedPageFrame
              chapter={nextChapterPreview}
              novelId={novelId}
              fontSize={fontSize}
              lineSpacing={lineSpacing}
              paragraphSpacing={paragraphSpacing}
              twoColumnGap={twoColumnGap}
              twoColumnWidth={twoColumnWidth}
              fitsTwoColumns={fitsTwoColumns}
              contentRef={nextPreviewContentRef}
              pageIndex={0}
              pageCount={nextChapterPreview.totalChapters}
              readerTheme={readerTheme}
              textClassName={textClassName}
              headerBgClassName={headerBgClassName}
              pageBgClassName={pageBgClassName}
              showHeaderContent={false}
            />
          </div>
        ) : null}

        <motion.div
          data-testid="paged-reader-interactive"
          className="relative h-full overflow-hidden"
          style={isDragEnabled ? { touchAction: 'pan-y' } : undefined}
          onClickCapture={handleClickCapture}
          onPan={handlePan}
          onPanEnd={handlePanEnd}
          onPanStart={handlePanStart}
        >
          {activeDragTransition && dragLayerOffsets ? (
            <>
              <motion.div
                className={cn(
                  'absolute inset-0 overflow-hidden',
                  dragLayerOffsets?.isPreviewOnTop ? 'z-0' : 'z-10',
                )}
                style={{ x: currentLayerX }}
              >
                <PagedPageFrame
                  chapter={activeDragTransition.current.chapter}
                  novelId={novelId}
                  fontSize={fontSize}
                  lineSpacing={lineSpacing}
                  paragraphSpacing={paragraphSpacing}
                  twoColumnGap={twoColumnGap}
                  twoColumnWidth={twoColumnWidth}
                  fitsTwoColumns={fitsTwoColumns}
                  pageOffset={activeDragTransition.current.pageOffset}
                  pageIndex={activeDragTransition.current.pageIndex}
                  pageCount={activeDragTransition.current.pageCount}
                  readerTheme={readerTheme}
                  textClassName={textClassName}
                  headerBgClassName={headerBgClassName}
                  pageBgClassName={pageBgClassName}
                />
              </motion.div>

              <motion.div
                className={cn(
                  'absolute inset-0 overflow-hidden',
                  dragLayerOffsets?.isPreviewOnTop ? 'z-10' : 'z-0',
                )}
                style={{ x: previewLayerX }}
              >
                <PagedPageFrame
                  chapter={activeDragTransition.preview.chapter}
                  novelId={novelId}
                  fontSize={fontSize}
                  lineSpacing={lineSpacing}
                  paragraphSpacing={paragraphSpacing}
                  twoColumnGap={twoColumnGap}
                  twoColumnWidth={twoColumnWidth}
                  fitsTwoColumns={fitsTwoColumns}
                  pageOffset={activeDragTransition.preview.pageOffset}
                  pageIndex={activeDragTransition.preview.pageIndex}
                  pageCount={activeDragTransition.preview.pageCount}
                  readerTheme={readerTheme}
                  textClassName={textClassName}
                  headerBgClassName={headerBgClassName}
                  pageBgClassName={pageBgClassName}
                />
              </motion.div>
            </>
          ) : (
            <AnimatePresence custom={pageTurnDirection} initial={false} mode="sync">
              <motion.div
                key={`${chapter.index}:${pageIndex}`}
                className="absolute inset-0 overflow-hidden"
                custom={pageTurnDirection}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={pageTurnAnimation.transition}
              >
                <PagedPageFrame
                  chapter={chapter}
                  novelId={novelId}
                  fontSize={fontSize}
                  lineSpacing={lineSpacing}
                  paragraphSpacing={paragraphSpacing}
                  twoColumnGap={twoColumnGap}
                  twoColumnWidth={twoColumnWidth}
                  fitsTwoColumns={fitsTwoColumns}
                  pageOffset={visiblePageOffset}
                  pageIndex={pageIndex}
                  pageCount={pageCount}
                  readerTheme={readerTheme}
                  textClassName={textClassName}
                  headerBgClassName={headerBgClassName}
                  pageBgClassName={pageBgClassName}
                />
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>
      </div>
    </div>
  );
}
