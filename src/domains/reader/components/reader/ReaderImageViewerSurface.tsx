import type { ReaderImageGalleryEntry } from '../../utils/readerImageGallery';
import type { ReaderImageViewerViewportSize } from '../../utils/readerImageViewerTypes';

import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

import { cn } from '@shared/utils/cn';

import { useReaderImageViewerGesture } from '../../hooks/useReaderImageViewerGesture';
import { useReaderImageResource } from '../../hooks/useReaderImageResource';
import {
  buildAnchoredTransform,
  TRANSFORM_ANIMATION_MS,
  TRANSFORM_EASE,
} from '../../utils/readerImageViewerTransform';

interface ReaderImageViewerSurfaceProps {
  activeEntry: ReaderImageGalleryEntry;
  activeIndex: number;
  canNavigateNext: boolean;
  canNavigatePrev: boolean;
  consumeDeferredStageClick: () => boolean;
  entries: ReaderImageGalleryEntry[];
  entryTransitionMode: 'anchor' | 'none';
  getOriginRect: (entry: ReaderImageGalleryEntry | null) => DOMRect | null;
  novelId: number;
  onClearNavigationTransition: () => void;
  onPrepareNavigationTransition: (direction: -1 | 1, targetEntryId: string) => void;
  onRequestClose: () => void;
  onRequestNavigate: (direction: 'next' | 'prev') => Promise<boolean>;
  originRect: DOMRect | null;
  suppressDeferredStageClick: () => void;
  viewportSize: ReaderImageViewerViewportSize;
}

export default function ReaderImageViewerSurface({
  activeEntry,
  activeIndex,
  canNavigateNext,
  canNavigatePrev,
  consumeDeferredStageClick,
  entries,
  entryTransitionMode,
  getOriginRect,
  novelId,
  onClearNavigationTransition,
  onPrepareNavigationTransition,
  onRequestClose,
  onRequestNavigate,
  originRect,
  suppressDeferredStageClick,
  viewportSize,
}: ReaderImageViewerSurfaceProps) {
  const imageUrl = useReaderImageResource(novelId, activeEntry.imageKey);
  const {
    handleImageLoad,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleStageClick,
    handleStageDoubleClick,
    handleStageWheel,
    isTransformAnimating,
    targetRect,
    transformState,
  } = useReaderImageViewerGesture({
    activeEntry,
    activeIndex,
    canNavigateNext,
    canNavigatePrev,
    consumeDeferredStageClick,
    entries,
    hasImageResource: Boolean(imageUrl),
    novelId,
    onClearNavigationTransition,
    onPrepareNavigationTransition,
    onRequestClose,
    onRequestNavigate,
    suppressDeferredStageClick,
    viewportSize,
  });

  return (
    <div
      data-reader-image-stage=""
      className="absolute inset-0 touch-none"
      onClick={handleStageClick}
      onDoubleClick={handleStageDoubleClick}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleStageWheel}
    >
      <motion.div
        className="absolute inset-0"
        data-reader-image-transition-mode={entryTransitionMode}
        initial={entryTransitionMode === 'anchor'
          ? buildAnchoredTransform(originRect, targetRect) as Record<string, number>
          : false}
        animate={{
          opacity: 1,
          scale: 1,
          scaleX: 1,
          scaleY: 1,
          x: 0,
          y: 0,
        }}
        exit={entryTransitionMode === 'anchor'
          ? buildAnchoredTransform(getOriginRect(activeEntry), targetRect) as Record<string, number>
          : {
            opacity: 1,
            scale: 1,
            scaleX: 1,
            scaleY: 1,
            x: 0,
            y: 0,
          }}
        transition={{
          duration: 0.24,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <div
          data-reader-image-surface=""
          className="absolute"
          style={{
            height: targetRect.height,
            left: targetRect.left,
            top: targetRect.top,
            width: targetRect.width,
          }}
        >
          <div
            className={cn(
              'relative h-full w-full origin-center',
              isTransformAnimating && 'transition-transform',
            )}
            style={{
              transform: `translate3d(${transformState.translateX}px, ${transformState.translateY}px, 0) scale(${transformState.scale})`,
              transitionDuration: isTransformAnimating ? `${TRANSFORM_ANIMATION_MS}ms` : undefined,
              transitionProperty: isTransformAnimating ? 'transform' : undefined,
              transitionTimingFunction: isTransformAnimating ? TRANSFORM_EASE : undefined,
            }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                className="h-full w-full select-none object-contain"
                draggable={false}
                onLoad={handleImageLoad}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-2xl bg-white/6 text-white/75">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
