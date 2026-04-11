import type { MotionValue } from 'motion/react';
import type { ReaderImageGalleryEntry } from '@shared/contracts/reader';
import type { ReaderImageViewerViewportSize } from '../../utils/readerImageViewerTypes';

import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

import { cn } from '@shared/utils/cn';

import { useReaderImageViewerGesture } from '../../hooks/useReaderImageViewerGesture';
import { useReaderImageResource } from '../../hooks/useReaderImageResource';
import { buildAnchoredTransform } from '../../utils/readerImageViewerTransform';

interface ReaderImageViewerSurfaceProps {
  activeEntry: ReaderImageGalleryEntry;
  activeIndex: number;
  canNavigateNext: boolean;
  canNavigatePrev: boolean;
  consumeDeferredStageClick: () => boolean;
  dismissProgress: MotionValue<number>;
  entries: ReaderImageGalleryEntry[];
  entryTransitionMode: 'anchor' | 'none';
  getOriginRect: (entry: ReaderImageGalleryEntry | null) => DOMRect | null;
  isNavigationTransitionPending: boolean;
  novelId: number;
  onClearNavigationTransition: () => void;
  onPrepareNavigationTransition: (direction: -1 | 1, targetEntryId: string) => void;
  onRequestClose: () => void;
  onRequestDismissClose: () => void;
  onRequestNavigate: (direction: 'next' | 'prev') => Promise<boolean>;
  originRect: DOMRect | null;
  suppressDeferredStageClick: () => void;
  viewportSize: ReaderImageViewerViewportSize;
}

const SURFACE_TRANSITION = {
  damping: 36,
  mass: 0.96,
  stiffness: 360,
  type: 'spring',
} as const;

export default function ReaderImageViewerSurface({
  activeEntry,
  activeIndex,
  canNavigateNext,
  canNavigatePrev,
  consumeDeferredStageClick,
  dismissProgress,
  entries,
  entryTransitionMode,
  getOriginRect,
  isNavigationTransitionPending,
  novelId,
  onClearNavigationTransition,
  onPrepareNavigationTransition,
  onRequestClose,
  onRequestDismissClose,
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
    scaleMotionValue,
    surfaceOpacity,
    targetRect,
    translateXMotionValue,
    translateYMotionValue,
  } = useReaderImageViewerGesture({
    activeEntry,
    activeIndex,
    canNavigateNext,
    canNavigatePrev,
    consumeDeferredStageClick,
    dismissProgress,
    entries,
    hasImageResource: Boolean(imageUrl),
    isNavigationTransitionPending,
    novelId,
    onClearNavigationTransition,
    onPrepareNavigationTransition,
    onRequestClose,
    onRequestDismissClose,
    onRequestNavigate,
    suppressDeferredStageClick,
    viewportSize,
  });
  const imageSurfaceStyle = {
    '--reader-image-dismiss-progress': dismissProgress,
    '--reader-image-surface-opacity': surfaceOpacity,
    opacity: 'calc((1 - var(--reader-image-dismiss-progress) * 0.08) * var(--reader-image-surface-opacity))',
  };

  return (
    <div
      data-reader-image-stage=""
      data-reader-image-navigation-pending={isNavigationTransitionPending ? '' : undefined}
      className={cn(
        'absolute inset-0 touch-none',
        isNavigationTransitionPending && 'pointer-events-none',
      )}
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
        transition={SURFACE_TRANSITION}
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
          <motion.div
            className={cn('relative h-full w-full origin-center will-change-transform')}
            style={{
              ...imageSurfaceStyle,
              scale: scaleMotionValue,
              x: translateXMotionValue,
              y: translateYMotionValue,
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
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
