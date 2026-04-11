import type { ChapterContent, PageTarget } from '@shared/contracts/reader';
import type { Variants } from 'motion/react';
import type { PaginatedChapterLayout } from '../../layout-core/internal';
import type {
  ReaderImageActivationPayload,
  ReaderImageGalleryEntry,
} from '../../layout-core/internal';
import type {
  PendingCommittedPageOverride,
  ReaderPageTurnMode,
} from '../../paged-runtime/internal';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { cn } from '@shared/utils/cn';

import {
  getPageTurnAnimation,
  type PageTurnDirection,
  getPagedDragLayerOffsets,
  getEffectivePagedRenderPageIndex,
  getFallbackViewportWidth,
  PagedPageFrame,
  shouldClearPendingCommittedPageOverride,
  type PagePreviewTarget,
  usePagedReaderDrag,
  usePagedReaderImagePrewarm,
  usePagedViewportBridge,
} from '../../paged-runtime/internal';

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
  rootClassName: string;
  rootStyle: React.CSSProperties;
  textClassName: string;
  twoColumnGap?: number;
  twoColumnWidth?: number;
}

function resolveCurrentPreviewTarget(params: {
  chapter: ChapterContent;
  currentLayout: PaginatedChapterLayout | null;
  effectivePageIndex: number;
}): PagePreviewTarget | null {
  if (!params.currentLayout) {
    return null;
  }

  const pageSlice = params.currentLayout.pageSlices[params.effectivePageIndex];
  if (!pageSlice) {
    return null;
  }

  return {
    chapter: params.chapter,
    layout: params.currentLayout,
    pageIndex: params.effectivePageIndex,
    pageSlice,
  };
}

function resolvePreviousPreviewTarget(params: {
  chapter: ChapterContent;
  currentLayout: PaginatedChapterLayout | null;
  effectivePageIndex: number;
  previousChapterPreview?: ChapterContent | null;
  previousLayout?: PaginatedChapterLayout | null;
}): PagePreviewTarget | null {
  const {
    chapter,
    currentLayout,
    effectivePageIndex,
    previousChapterPreview,
    previousLayout,
  } = params;
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
}

function resolveNextPreviewTarget(params: {
  chapter: ChapterContent;
  currentLayout: PaginatedChapterLayout | null;
  effectivePageIndex: number;
  nextChapterPreview?: ChapterContent | null;
  nextLayout?: PaginatedChapterLayout | null;
}): PagePreviewTarget | null {
  const {
    chapter,
    currentLayout,
    effectivePageIndex,
    nextChapterPreview,
    nextLayout,
  } = params;
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
  rootClassName,
  rootStyle,
  textClassName,
  twoColumnGap = 48,
  twoColumnWidth,
}: PagedReaderContentProps) {
  const { handlePagedViewportRef, viewportSize } = usePagedViewportBridge(pagedViewportRef);
  const [pendingCommittedPageOverride, setPendingCommittedPageOverride] =
    useState<PendingCommittedPageOverride | null>(null);

  usePagedReaderImagePrewarm({
    chapter,
    nextChapterPreview,
    novelId,
    previousChapterPreview,
  });

  const fallbackViewportWidth = useMemo(
    () => getFallbackViewportWidth(currentLayout, fitsTwoColumns, twoColumnGap, twoColumnWidth),
    [currentLayout, fitsTwoColumns, twoColumnGap, twoColumnWidth],
  );
  const resolvedViewportWidth = viewportSize.width || fallbackViewportWidth;

  const effectivePageIndex = useMemo(() => getEffectivePagedRenderPageIndex({
    currentChapterIndex: chapter.index,
    currentLayout,
    pageIndex,
    pendingPageTarget,
    pendingOverride: pendingCommittedPageOverride,
  }), [chapter.index, currentLayout, pageIndex, pendingCommittedPageOverride, pendingPageTarget]);

  const currentPreviewTarget = useMemo(() => resolveCurrentPreviewTarget({
    chapter,
    currentLayout,
    effectivePageIndex,
  }), [chapter, currentLayout, effectivePageIndex]);
  const previousPreviewTarget = useMemo(() => resolvePreviousPreviewTarget({
    chapter,
    currentLayout,
    effectivePageIndex,
    previousChapterPreview,
    previousLayout,
  }), [chapter, currentLayout, effectivePageIndex, previousChapterPreview, previousLayout]);
  const nextPreviewTarget = useMemo(() => resolveNextPreviewTarget({
    chapter,
    currentLayout,
    effectivePageIndex,
    nextChapterPreview,
    nextLayout,
  }), [chapter, currentLayout, effectivePageIndex, nextChapterPreview, nextLayout]);

  const canDragPrev = previousPreviewTarget !== null && typeof onRequestPrevPage === 'function';
  const canDragNext = nextPreviewTarget !== null && typeof onRequestNextPage === 'function';
  const drag = usePagedReaderDrag({
    canDragNext,
    canDragPrev,
    currentPreviewTarget,
    disableAnimation,
    interactionLocked,
    nextPreviewTarget,
    onRequestNextPage,
    onRequestPrevPage,
    pageTurnMode,
    pageTurnToken,
    previousPreviewTarget,
    resolvedViewportWidth,
    setPendingCommittedPageOverride,
  });

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
  }, [
    chapter.index,
    currentLayout,
    pageIndex,
    pendingCommittedPageOverride,
  ]);

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
  const dragLayerOffsets = drag.activeDragTransition
    ? getPagedDragLayerOffsets(
      drag.activeDragTransition.mode,
      drag.activeDragTransition.direction,
      0,
      resolvedViewportWidth,
    )
    : null;
  const resolvedOnImageActivate = drag.shouldDisableImageActivation
    ? undefined
    : onImageActivate;
  const resolvedOnRegisterImageElement = drag.shouldDisableImageActivation
    ? undefined
    : onRegisterImageElement;

  if (!currentPreviewTarget) {
    return null;
  }

  return (
    <div className="relative h-full w-full">
      <motion.div
        data-testid="paged-reader-interactive"
        className={cn(
          'relative h-full overflow-hidden',
          drag.shouldDisableImageActivation && '[&_[data-reader-image-activate]]:pointer-events-none',
        )}
        style={drag.isDragEnabled ? { touchAction: 'pan-y' } : undefined}
        onClickCapture={drag.handleClickCapture}
        onPan={drag.handlePan}
        onPanEnd={drag.handlePanEnd}
        onPanStart={drag.handlePanStart}
      >
        {drag.activeDragTransition && dragLayerOffsets ? (
          <>
            <motion.div
              className={cn(
                'absolute inset-0 overflow-hidden',
                dragLayerOffsets.isPreviewOnTop ? 'z-0' : 'z-10',
              )}
              style={{ x: drag.currentLayerX }}
            >
              <PagedPageFrame
                chapter={drag.activeDragTransition.current.chapter}
                headerBgClassName={headerBgClassName}
                layout={drag.activeDragTransition.current.layout}
                novelId={novelId}
                onImageActivate={resolvedOnImageActivate}
                onRegisterImageElement={resolvedOnRegisterImageElement}
                pageBgClassName={pageBgClassName}
                pageCount={drag.activeDragTransition.current.layout.pageSlices.length}
                pageIndex={drag.activeDragTransition.current.pageIndex}
                pageSlice={drag.activeDragTransition.current.pageSlice}
                readerTheme={readerTheme}
                rootClassName={rootClassName}
                rootStyle={rootStyle}
                textClassName={textClassName}
              />
            </motion.div>

            <motion.div
              className={cn(
                'absolute inset-0 overflow-hidden',
                dragLayerOffsets.isPreviewOnTop ? 'z-10' : 'z-0',
              )}
              style={{ x: drag.previewLayerX }}
            >
              <PagedPageFrame
                chapter={drag.activeDragTransition.preview.chapter}
                headerBgClassName={headerBgClassName}
                layout={drag.activeDragTransition.preview.layout}
                novelId={novelId}
                onImageActivate={resolvedOnImageActivate}
                onRegisterImageElement={resolvedOnRegisterImageElement}
                pageBgClassName={pageBgClassName}
                pageCount={drag.activeDragTransition.preview.layout.pageSlices.length}
                pageIndex={drag.activeDragTransition.preview.pageIndex}
                pageSlice={drag.activeDragTransition.preview.pageSlice}
                readerTheme={readerTheme}
                rootClassName={rootClassName}
                rootStyle={rootStyle}
                textClassName={textClassName}
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
                headerBgClassName={headerBgClassName}
                layout={currentPreviewTarget.layout}
                novelId={novelId}
                onImageActivate={resolvedOnImageActivate}
                onRegisterImageElement={resolvedOnRegisterImageElement}
                pageBgClassName={pageBgClassName}
                pageCount={currentPreviewTarget.layout.pageSlices.length}
                pageIndex={effectivePageIndex}
                pageSlice={currentPreviewTarget.pageSlice}
                pagedContentRef={pagedContentRef}
                pagedViewportRef={handlePagedViewportRef}
                readerTheme={readerTheme}
                rootClassName={rootClassName}
                rootStyle={rootStyle}
                textClassName={textClassName}
              />
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>
    </div>
  );
}
