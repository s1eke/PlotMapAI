import type { ChapterContent } from '../../api/readerApi';
import type { ReaderPageTurnMode } from '../../constants/pageTurnMode';
import type { PageTarget } from '../../hooks/useReaderStatePersistence';
import type { AnimationPlaybackControls, PanInfo, Variants } from 'motion/react';
import type { PageSlice, PaginatedChapterLayout } from '../../utils/readerLayout';
import type {
  ReaderImageActivationPayload,
  ReaderImageGalleryEntry,
} from '../../utils/readerImageGallery';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';

import { cn } from '@shared/utils/cn';

import {
  getPageTurnAnimation,
  getPageTurnSettleDuration,
  type PageTurnDirection,
} from '../../animations/pageTurnAnimations';
import {
  clampDragOffset,
  getPagedDragLayerOffsets,
  shouldCommitPageTurnDrag,
} from '../../utils/pagedDrag';
import {
  getEffectivePagedRenderPageIndex,
  shouldClearPendingCommittedPageOverride,
  type PendingCommittedPageOverride,
} from '../../utils/pagedDragRenderState';
import { extractImageKeysFromText } from '../../utils/chapterImages';
import { preloadReaderImageResources } from '../../utils/readerImageResourceCache';
import { PAGED_VIEWPORT_TOP_PADDING_PX } from '../../utils/readerLayout';
import ReaderFlowBlock from './ReaderFlowBlock';

const DRAG_START_THRESHOLD_PX = 8;

interface PagedReaderContentProps {
  chapter: ChapterContent;
  currentLayout?: PaginatedChapterLayout | null;
  disableAnimation?: boolean;
  fitsTwoColumns?: boolean;
  headerBgClassName: string;
  interactionLocked?: boolean;
  nextChapterPreview?: ChapterContent | null;
  nextLayout?: PaginatedChapterLayout | null;
  novelId: number;
  onImageActivate?: (payload: ReaderImageActivationPayload) => void;
  onRegisterImageElement?: (
    entry: Pick<ReaderImageGalleryEntry, 'blockIndex' | 'chapterIndex' | 'imageKey'>,
    element: HTMLButtonElement | null,
  ) => void;
  onRequestNextPage?: () => void;
  onRequestPrevPage?: () => void;
  pageBgClassName?: string;
  pageIndex: number;
  pendingPageTarget?: PageTarget | null;
  pagedContentRef?: React.Ref<HTMLDivElement>;
  pagedViewportRef?: React.Ref<HTMLDivElement>;
  pageTurnDirection: PageTurnDirection;
  pageTurnMode: ReaderPageTurnMode;
  pageTurnToken: number;
  previousChapterPreview?: ChapterContent | null;
  previousLayout?: PaginatedChapterLayout | null;
  readerTheme: string;
  textClassName: string;
  twoColumnGap?: number;
  twoColumnWidth?: number;
}

interface PagePreviewTarget {
  chapter: ChapterContent;
  layout: PaginatedChapterLayout;
  pageIndex: number;
  pageSlice: PageSlice;
}

interface CommittedDragTransition {
  current: PagePreviewTarget;
  direction: PageTurnDirection;
  mode: Extract<ReaderPageTurnMode, 'cover' | 'slide'>;
  preview: PagePreviewTarget;
}

interface ViewportSize {
  height: number;
  width: number;
}

const EMPTY_VIEWPORT_SIZE: ViewportSize = {
  height: 0,
  width: 0,
};

function getFallbackViewportWidth(
  layout: PaginatedChapterLayout | null | undefined,
  fitsTwoColumns: boolean,
  twoColumnGap: number,
  twoColumnWidth?: number,
): number {
  if (layout) {
    return layout.columnWidth * layout.columnCount
      + layout.columnGap * Math.max(0, layout.columnCount - 1);
  }

  const defaultColumnWidth = twoColumnWidth ?? 600;
  return fitsTwoColumns
    ? defaultColumnWidth * 2 + twoColumnGap
    : defaultColumnWidth;
}

function assignPagedViewportRef(
  ref: React.Ref<HTMLDivElement> | undefined,
  element: HTMLDivElement | null,
): void {
  if (!ref) {
    return;
  }

  if (typeof ref === 'function') {
    ref(element);
    return;
  }

  const targetRef = ref as React.MutableRefObject<HTMLDivElement | null>;
  targetRef.current = element;
}

function resolveDragDirection(offset: number): PageTurnDirection | null {
  if (offset > 0) {
    return 'prev';
  }
  if (offset < 0) {
    return 'next';
  }
  return null;
}

function resolveDragCommitOffset(
  shouldCommit: boolean,
  direction: PageTurnDirection,
  viewportWidth: number,
): number {
  if (!shouldCommit) {
    return 0;
  }
  if (direction === 'next') {
    return -viewportWidth;
  }
  return viewportWidth;
}

function PagedPageFrame({
  chapter,
  layout,
  novelId,
  pageBgClassName,
  pageIndex,
  pageSlice,
  pageCount,
  pagedContentRef,
  pagedViewportRef,
  readerTheme,
  textClassName,
  headerBgClassName,
  onImageActivate,
  onRegisterImageElement,
}: {
  chapter: ChapterContent;
  layout: PaginatedChapterLayout;
  novelId: number;
  pageBgClassName?: string;
  pageIndex: number;
  pageSlice: PageSlice;
  pageCount: number;
  pagedContentRef?: React.Ref<HTMLDivElement>;
  pagedViewportRef?: React.Ref<HTMLDivElement>;
  readerTheme: string;
  textClassName: string;
  headerBgClassName: string;
  onImageActivate?: (payload: ReaderImageActivationPayload) => void;
  onRegisterImageElement?: (
    entry: Pick<ReaderImageGalleryEntry, 'blockIndex' | 'chapterIndex' | 'imageKey'>,
    element: HTMLButtonElement | null,
  ) => void;
}) {
  return (
    <div data-testid="paged-reader-page-frame" className="flex h-full w-full flex-col">
      <div className={cn('w-full shrink-0 border-b border-border-color/20 backdrop-blur-sm', headerBgClassName)}>
        <div className={cn('mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-8 md:px-12', textClassName)}>
          <h1 className={cn('truncate text-sm font-medium transition-colors', readerTheme === 'auto' ? 'text-text-secondary' : 'opacity-60')}>
            {chapter.title}
          </h1>
          {pageCount > 1 ? (
            <div className="whitespace-nowrap text-xs font-medium text-text-secondary">
              {pageIndex + 1} / {pageCount}
            </div>
          ) : null}
        </div>
      </div>

      <div className={cn('min-h-0 flex-1', pageBgClassName ?? headerBgClassName)}>
        <div className={cn('mx-auto h-full w-full max-w-[1400px] px-4 sm:px-8 md:px-12', textClassName)}>
          <div
            ref={pagedViewportRef}
            data-testid="paged-reader-measurement-viewport"
            className="h-full overflow-hidden"
            style={{ paddingTop: `${PAGED_VIEWPORT_TOP_PADDING_PX}px` }}
          >
            <div
              ref={pagedContentRef}
              data-testid="paged-reader-content-body"
              className="flex h-full"
              style={{
                gap: layout.columnCount > 1 ? `${layout.columnGap}px` : '0px',
              }}
            >
              {pageSlice.columns.map((column) => (
                <div
                  key={[
                    pageIndex,
                    column.items[0]?.key ?? 'empty',
                    column.items[column.items.length - 1]?.key ?? 'empty',
                  ].join(':')}
                  className="flex min-w-0 flex-1 flex-col overflow-hidden selection:bg-accent/30"
                  style={{
                    width: `${layout.columnWidth}px`,
                  }}
                >
                  {column.items.map((item) => (
                    <ReaderFlowBlock
                      key={item.key}
                      imageRenderMode="paged"
                      item={item}
                      novelId={novelId}
                      onImageActivate={onImageActivate}
                      onRegisterImageElement={onRegisterImageElement}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PagedReaderContent({
  chapter,
  currentLayout = null,
  disableAnimation = false,
  fitsTwoColumns = false,
  headerBgClassName,
  interactionLocked = false,
  nextChapterPreview = null,
  nextLayout = null,
  novelId,
  onImageActivate,
  onRegisterImageElement,
  onRequestNextPage,
  onRequestPrevPage,
  pageBgClassName,
  pageIndex,
  pendingPageTarget = null,
  pagedContentRef,
  pagedViewportRef,
  pageTurnDirection,
  pageTurnMode,
  pageTurnToken,
  previousChapterPreview = null,
  previousLayout = null,
  readerTheme,
  textClassName,
  twoColumnGap = 48,
  twoColumnWidth,
}: PagedReaderContentProps) {
  const [viewportSize, setViewportSize] = useState<ViewportSize>(EMPTY_VIEWPORT_SIZE);
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  const [dragDirection, setDragDirection] = useState<PageTurnDirection | null>(null);
  const [committedDragTransition, setCommittedDragTransition] =
    useState<CommittedDragTransition | null>(null);
  const [pendingCommittedPageOverride, setPendingCommittedPageOverride] =
    useState<PendingCommittedPageOverride | null>(null);
  const dragAnimationRef = useRef<AnimationPlaybackControls | null>(null);
  const suppressNextClickRef = useRef(false);
  const dragOffset = useMotionValue(0);
  const handlePagedViewportRef = useCallback((element: HTMLDivElement | null) => {
    setViewportElement(element);
    assignPagedViewportRef(pagedViewportRef, element);
  }, [pagedViewportRef]);
  const fallbackViewportWidth = useMemo(
    () => getFallbackViewportWidth(currentLayout, fitsTwoColumns, twoColumnGap, twoColumnWidth),
    [currentLayout, fitsTwoColumns, twoColumnGap, twoColumnWidth],
  );
  const resolvedViewportWidth = viewportSize.width || fallbackViewportWidth;

  useEffect(() => {
    const imageKeys = new Set<string>();
    for (const renderableChapter of [chapter, previousChapterPreview, nextChapterPreview]) {
      if (!renderableChapter) {
        continue;
      }
      for (const imageKey of extractImageKeysFromText(renderableChapter.content)) {
        imageKeys.add(imageKey);
      }
    }
    if (imageKeys.size === 0) {
      return;
    }
    preloadReaderImageResources(novelId, Array.from(imageKeys.values()));
  }, [chapter, nextChapterPreview, novelId, previousChapterPreview]);

  useEffect(() => {
    const viewport = viewportElement;
    if (!viewport) {
      return;
    }

    const updateViewportSize = () => {
      setViewportSize({
        height: viewport.clientHeight,
        width: viewport.clientWidth,
      });
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, [viewportElement]);

  useEffect(() => {
    if (!shouldClearPendingCommittedPageOverride({
      currentChapterIndex: chapter.index,
      currentLayout,
      pageIndex,
      pendingOverride: pendingCommittedPageOverride,
    })) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      setPendingCommittedPageOverride(null);
    });

    return () => cancelAnimationFrame(frameId);
  }, [chapter.index, currentLayout, pageIndex, pendingCommittedPageOverride]);

  const effectivePageIndex = useMemo(() => getEffectivePagedRenderPageIndex({
    currentChapterIndex: chapter.index,
    currentLayout,
    pageIndex,
    pendingPageTarget,
    pendingOverride: pendingCommittedPageOverride,
  }), [chapter.index, currentLayout, pageIndex, pendingCommittedPageOverride, pendingPageTarget]);

  const currentPreviewTarget = useMemo<PagePreviewTarget | null>(() => {
    if (!currentLayout) {
      return null;
    }

    const pageSlice = currentLayout.pageSlices[effectivePageIndex];
    if (!pageSlice) {
      return null;
    }

    return {
      chapter,
      layout: currentLayout,
      pageIndex: effectivePageIndex,
      pageSlice,
    };
  }, [chapter, currentLayout, effectivePageIndex]);

  const previousPreviewTarget = useMemo<PagePreviewTarget | null>(() => {
    if (!currentLayout) {
      return null;
    }

    if (effectivePageIndex > 0) {
      return {
        chapter,
        layout: currentLayout,
        pageIndex: effectivePageIndex - 1,
        pageSlice: currentLayout.pageSlices[effectivePageIndex - 1],
      };
    }

    if (!previousChapterPreview || !previousLayout || previousLayout.pageSlices.length === 0) {
      return null;
    }

    const previousPageIndex = previousLayout.pageSlices.length - 1;
    return {
      chapter: previousChapterPreview,
      layout: previousLayout,
      pageIndex: previousPageIndex,
      pageSlice: previousLayout.pageSlices[previousPageIndex],
    };
  }, [chapter, currentLayout, effectivePageIndex, previousChapterPreview, previousLayout]);

  const nextPreviewTarget = useMemo<PagePreviewTarget | null>(() => {
    if (!currentLayout) {
      return null;
    }

    if (effectivePageIndex < currentLayout.pageSlices.length - 1) {
      return {
        chapter,
        layout: currentLayout,
        pageIndex: effectivePageIndex + 1,
        pageSlice: currentLayout.pageSlices[effectivePageIndex + 1],
      };
    }

    if (!nextChapterPreview || !nextLayout || nextLayout.pageSlices.length === 0) {
      return null;
    }

    return {
      chapter: nextChapterPreview,
      layout: nextLayout,
      pageIndex: 0,
      pageSlice: nextLayout.pageSlices[0],
    };
  }, [chapter, currentLayout, effectivePageIndex, nextChapterPreview, nextLayout]);

  const canDragPrev = previousPreviewTarget !== null && typeof onRequestPrevPage === 'function';
  const canDragNext = nextPreviewTarget !== null && typeof onRequestNextPage === 'function';
  const activeDragMode = committedDragTransition?.mode
    ?? (pageTurnMode === 'cover' || pageTurnMode === 'slide' ? pageTurnMode : null);
  const activeDragDirection = committedDragTransition?.direction ?? dragDirection;
  const isDragEnabled = committedDragTransition === null
    && !disableAnimation
    && !interactionLocked
    && (pageTurnMode === 'cover' || pageTurnMode === 'slide')
    && resolvedViewportWidth > 0
    && (canDragPrev || canDragNext);

  const currentLayerX = useTransform(dragOffset, (offset) => {
    if (!activeDragDirection || !activeDragMode) {
      return 0;
    }
    return getPagedDragLayerOffsets(
      activeDragMode,
      activeDragDirection,
      offset,
      resolvedViewportWidth,
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
      resolvedViewportWidth,
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
    return () => {
      stopDragAnimation();
    };
  }, [stopDragAnimation]);

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
      resolvedViewportWidth,
      canDragPrev,
      canDragNext,
    );
    if (Math.abs(nextOffset) < DRAG_START_THRESHOLD_PX) {
      dragOffset.set(0);
      setDragDirection(null);
      return;
    }

    dragOffset.set(nextOffset);
    setDragDirection(nextOffset > 0 ? 'prev' : 'next');
    suppressNextClickRef.current = true;
  }, [canDragNext, canDragPrev, dragOffset, isDragEnabled, resolvedViewportWidth]);

  const handlePanEnd = useCallback((_event: PointerEvent, info: PanInfo) => {
    if (!isDragEnabled) {
      return;
    }

    const nextOffset = clampDragOffset(
      info.offset.x,
      resolvedViewportWidth,
      canDragPrev,
      canDragNext,
    );
    const nextDirection = resolveDragDirection(nextOffset);
    if (!nextDirection || Math.abs(nextOffset) < DRAG_START_THRESHOLD_PX) {
      suppressNextClickRef.current = false;
      resetDragState();
      return;
    }

    const shouldCommit = shouldCommitPageTurnDrag(
      nextOffset,
      info.velocity.x,
      resolvedViewportWidth,
    );
    const commitPreviewTarget = nextDirection === 'prev' ? previousPreviewTarget : nextPreviewTarget;
    if (!commitPreviewTarget || !currentPreviewTarget) {
      suppressNextClickRef.current = false;
      resetDragState();
      return;
    }

    const targetOffset = resolveDragCommitOffset(
      shouldCommit,
      nextDirection,
      resolvedViewportWidth,
    );
    const animation = getPageTurnAnimation(pageTurnMode);
    const settleDuration = getPageTurnSettleDuration(
      pageTurnMode,
      nextOffset,
      targetOffset,
      resolvedViewportWidth,
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
      setPendingCommittedPageOverride(
        commitPreviewTarget.chapter.index !== currentPreviewTarget.chapter.index
          ? {
            chapterIndex: commitPreviewTarget.chapter.index,
            pageIndex: commitPreviewTarget.pageIndex,
          }
          : null,
      );
      setCommittedDragTransition({
        current: currentPreviewTarget,
        direction: nextDirection,
        mode: pageTurnMode,
        preview: commitPreviewTarget,
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
    currentPreviewTarget,
    dragOffset,
    isDragEnabled,
    nextPreviewTarget,
    onRequestNextPage,
    onRequestPrevPage,
    pageTurnMode,
    previousPreviewTarget,
    resetDragState,
    resolvedViewportWidth,
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
    center: (custom: PageTurnDirection) =>
      pageTurnAnimation.animate({ direction: custom }) as never,
    exit: (custom: PageTurnDirection) => pageTurnAnimation.exit({ direction: custom }) as never,
  };
  let livePreviewTarget = null;
  if (dragDirection === 'prev') {
    livePreviewTarget = previousPreviewTarget;
  } else if (dragDirection === 'next') {
    livePreviewTarget = nextPreviewTarget;
  }

  let activeDragTransition = committedDragTransition;
  if (
    !activeDragTransition
    && dragDirection
    && livePreviewTarget
    && (pageTurnMode === 'cover' || pageTurnMode === 'slide')
    && currentPreviewTarget
  ) {
    activeDragTransition = {
      current: currentPreviewTarget,
      direction: dragDirection,
      mode: pageTurnMode,
      preview: livePreviewTarget,
    };
  }
  const dragLayerOffsets = activeDragTransition
    ? getPagedDragLayerOffsets(
      activeDragTransition.mode,
      activeDragTransition.direction,
      0,
      resolvedViewportWidth,
    )
    : null;

  if (!currentPreviewTarget) {
    return null;
  }

  return (
    <div className="relative h-full w-full">
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
                dragLayerOffsets.isPreviewOnTop ? 'z-0' : 'z-10',
              )}
              style={{ x: currentLayerX }}
            >
              <PagedPageFrame
                chapter={activeDragTransition.current.chapter}
                layout={activeDragTransition.current.layout}
                novelId={novelId}
                pageBgClassName={pageBgClassName}
                pageCount={activeDragTransition.current.layout.pageSlices.length}
                pageIndex={activeDragTransition.current.pageIndex}
                pageSlice={activeDragTransition.current.pageSlice}
                readerTheme={readerTheme}
                textClassName={textClassName}
                headerBgClassName={headerBgClassName}
                onImageActivate={onImageActivate}
                onRegisterImageElement={onRegisterImageElement}
              />
            </motion.div>

            <motion.div
              className={cn(
                'absolute inset-0 overflow-hidden',
                dragLayerOffsets.isPreviewOnTop ? 'z-10' : 'z-0',
              )}
              style={{ x: previewLayerX }}
            >
              <PagedPageFrame
                chapter={activeDragTransition.preview.chapter}
                layout={activeDragTransition.preview.layout}
                novelId={novelId}
                pageBgClassName={pageBgClassName}
                pageCount={activeDragTransition.preview.layout.pageSlices.length}
                pageIndex={activeDragTransition.preview.pageIndex}
                pageSlice={activeDragTransition.preview.pageSlice}
                readerTheme={readerTheme}
                textClassName={textClassName}
                headerBgClassName={headerBgClassName}
                onImageActivate={onImageActivate}
                onRegisterImageElement={onRegisterImageElement}
              />
            </motion.div>
          </>
        ) : (
          <AnimatePresence custom={pageTurnDirection} initial={false} mode="sync">
            <motion.div
              key={`${chapter.index}:${effectivePageIndex}`}
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
                layout={currentPreviewTarget.layout}
                novelId={novelId}
                pageBgClassName={pageBgClassName}
                pageCount={currentPreviewTarget.layout.pageSlices.length}
                pageIndex={effectivePageIndex}
                pageSlice={currentPreviewTarget.pageSlice}
                pagedContentRef={pagedContentRef}
                pagedViewportRef={handlePagedViewportRef}
                readerTheme={readerTheme}
                textClassName={textClassName}
                headerBgClassName={headerBgClassName}
                onImageActivate={onImageActivate}
                onRegisterImageElement={onRegisterImageElement}
              />
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>
    </div>
  );
}
