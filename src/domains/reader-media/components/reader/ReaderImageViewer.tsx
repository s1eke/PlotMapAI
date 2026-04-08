import type { ReaderImageGalleryEntry } from '../../utils/readerImageGallery';
import type { ReaderImageViewerSurfaceTransition } from '../../utils/readerImageViewerTypes';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useMotionValue } from 'motion/react';

import ReaderImageViewerSurface from './ReaderImageViewerSurface';
import { useReaderImageViewerTransition } from '../../hooks/useReaderImageViewerTransition';
import { createReaderImageEntryId } from '../../utils/readerImageGallery';
import {
  buildImageSwitchTransform,
  IMAGE_SWITCH_ANIMATION_DURATION_S,
  readReaderImageViewerViewportSize,
} from '../../utils/readerImageViewerTransform';

export interface ReaderImageViewerProps {
  activeEntry: ReaderImageGalleryEntry | null;
  activeIndex: number;
  canNavigateNext: boolean;
  canNavigatePrev: boolean;
  entries: ReaderImageGalleryEntry[];
  getOriginRect: (entry: ReaderImageGalleryEntry | null) => DOMRect | null;
  isIndexResolved: boolean;
  isIndexLoading: boolean;
  isOpen: boolean;
  novelId: number;
  onRequestClose: () => void;
  onRequestNavigate: (direction: 'next' | 'prev') => Promise<boolean>;
}

const IMAGE_SWITCH_VARIANTS = {
  animate: {
    opacity: 1,
    x: 0,
  },
  exit: (transition: ReaderImageViewerSurfaceTransition) => (
    buildImageSwitchTransform(transition, -1) as Record<string, number>
  ),
  initial: (transition: ReaderImageViewerSurfaceTransition) => (
    buildImageSwitchTransform(transition, 1) as Record<string, number>
  ),
} as const;

export default function ReaderImageViewer({
  activeEntry,
  activeIndex,
  canNavigateNext,
  canNavigatePrev,
  entries,
  getOriginRect,
  isIndexResolved,
  isIndexLoading,
  isOpen,
  novelId,
  onRequestClose,
  onRequestNavigate,
}: ReaderImageViewerProps) {
  const { t } = useTranslation();
  const dragDismissProgress = useMotionValue(0);
  const backdropStyle = {
    '--reader-image-dismiss-progress': dragDismissProgress,
    opacity: 'calc(1 - var(--reader-image-dismiss-progress) * 0.82)',
  };
  const imageIndexStyle = {
    '--reader-image-dismiss-progress': dragDismissProgress,
    opacity: 'calc(1 - var(--reader-image-dismiss-progress))',
  };
  const [viewportSize, setViewportSize] = useState(() => readReaderImageViewerViewportSize());
  const originRect = useMemo(() => getOriginRect(activeEntry), [activeEntry, getOriginRect]);
  const {
    clearNavigationTransition,
    consumeDeferredStageClick,
    isNavigationTransitionPending,
    prepareNavigationTransition,
    resolvedSurfaceTransition,
    suppressDeferredStageClick,
  } = useReaderImageViewerTransition({
    activeEntry,
    viewportSize,
  });

  const handleRequestClose = useCallback(() => {
    clearNavigationTransition();
    dragDismissProgress.set(0);
    onRequestClose();
  }, [clearNavigationTransition, dragDismissProgress, onRequestClose]);

  const handleRequestDismissClose = useCallback(() => {
    clearNavigationTransition();
    onRequestClose();
  }, [clearNavigationTransition, onRequestClose]);

  useEffect(() => {
    if (isOpen) {
      dragDismissProgress.set(0);
    }
  }, [activeEntry, dragDismissProgress, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleResize = () => {
      setViewportSize(readReaderImageViewerViewportSize());
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = 'unset';
      return;
    }

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleRequestClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleRequestClose, isOpen]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence initial={false}>
      {isOpen && activeEntry ? (
        <div
          className="fixed inset-0 z-[90]"
          role="dialog"
          aria-modal="true"
          aria-label={t('reader.imageViewer.title')}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="absolute inset-0 bg-black/88 backdrop-blur-[3px]"
              style={backdropStyle}
            />
          </motion.div>

          <div className="absolute inset-0 overflow-hidden">
            <AnimatePresence initial={false} custom={resolvedSurfaceTransition}>
              <motion.div
                key={`${novelId}:${createReaderImageEntryId(activeEntry)}`}
                data-reader-image-transition-direction={resolvedSurfaceTransition.direction}
                data-reader-image-transition-kind={resolvedSurfaceTransition.kind}
                className="absolute inset-0 z-[2] overflow-hidden bg-black"
                custom={resolvedSurfaceTransition}
                variants={IMAGE_SWITCH_VARIANTS}
                initial="initial"
                animate="animate"
                exit="exit"
                onAnimationComplete={clearNavigationTransition}
                transition={{
                  duration: IMAGE_SWITCH_ANIMATION_DURATION_S,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <ReaderImageViewerSurface
                  activeEntry={activeEntry}
                  activeIndex={activeIndex}
                  canNavigateNext={canNavigateNext}
                  canNavigatePrev={canNavigatePrev}
                  consumeDeferredStageClick={consumeDeferredStageClick}
                  dismissProgress={dragDismissProgress}
                  entries={entries}
                  entryTransitionMode={isNavigationTransitionPending ? 'none' : 'anchor'}
                  getOriginRect={getOriginRect}
                  isNavigationTransitionPending={isNavigationTransitionPending}
                  novelId={novelId}
                  onClearNavigationTransition={clearNavigationTransition}
                  onPrepareNavigationTransition={prepareNavigationTransition}
                  onRequestClose={handleRequestClose}
                  onRequestDismissClose={handleRequestDismissClose}
                  onRequestNavigate={onRequestNavigate}
                  originRect={originRect}
                  suppressDeferredStageClick={suppressDeferredStageClick}
                  viewportSize={viewportSize}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          <motion.div
            data-reader-image-index=""
            className="pointer-events-none absolute inset-x-0 bottom-5 z-[2] flex justify-center"
            style={imageIndexStyle}
          >
            <div className="rounded-full bg-black/45 px-4 py-2 text-xs font-medium tracking-wide text-white/85 backdrop-blur-sm">
              {isIndexResolved || !isIndexLoading
                ? (
                  <>
                    {Math.max(activeIndex + 1, 1)} / {Math.max(entries.length, activeIndex + 1, 1)}
                    {isIndexLoading ? ` · ${t('reader.imageViewer.loadingMore')}` : ''}
                  </>
                )
                : t('reader.imageViewer.loadingMore')}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
