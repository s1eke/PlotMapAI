import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { animate, AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';
import { X } from 'lucide-react';

import { cn } from '@shared/utils/cn';

const DRAG_CLOSE_THRESHOLD = 0.3;
const DRAG_MIN_DISTANCE = 120;
const DRAG_CLOSE_VELOCITY = 550;
const BACKDROP_MIN_OPACITY = 0.35;
const BACKDROP_FADE_DISTANCE = 240;
const PANEL_ENTER_TRANSITION = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.9,
} as const;
const PANEL_EXIT_TRANSITION = {
  duration: 0.28,
  ease: [0.32, 0.72, 0, 1],
} as const;
const PANEL_REBOUND_TRANSITION = {
  type: 'spring',
  stiffness: 560,
  damping: 40,
  mass: 0.9,
} as const;
const BACKDROP_TRANSITION = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1],
} as const;
const PANEL_SHELL_VARIANTS = {
  hidden: {
    y: '100%',
    transition: PANEL_EXIT_TRANSITION,
  },
  visible: {
    y: 0,
    transition: PANEL_ENTER_TRANSITION,
  },
} as const;

interface DragState {
  pointerId: number;
  startY: number;
  isDragging: boolean;
  lastY: number;
  lastTime: number;
  velocityY: number;
}

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: ReactNode;
  children: ReactNode;
  maxHeight?: string;
  closeOnBackdrop?: boolean;
  closeLabel?: string;
  showDragHandle?: boolean;
  containerClassName?: string;
  panelClassName?: string;
  contentClassName?: string;
}

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxHeight = '78vh',
  closeOnBackdrop = true,
  closeLabel = 'Close panel',
  showDragHandle = true,
  containerClassName,
  panelClassName,
  contentClassName,
}: BottomSheetProps) {
  const titleId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useMotionValue(0);
  const backdropOpacity = useTransform(
    dragOffset,
    [0, BACKDROP_FADE_DISTANCE],
    [1, BACKDROP_MIN_OPACITY],
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (isOpen) {
      dragOffset.set(0);
    }
  }, [dragOffset, isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleBackdropClick = useCallback(() => {
    if (closeOnBackdrop) {
      onClose();
    }
  }, [closeOnBackdrop, onClose]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      isDragging: false,
      lastY: event.clientY,
      lastTime: Date.now(),
      velocityY: 0,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const deltaY = event.clientY - drag.startY;

    if (!drag.isDragging && Math.abs(deltaY) > 8) {
      drag.isDragging = true;
      setIsDragging(true);
    }

    const now = Date.now();
    const elapsed = Math.max(1, now - drag.lastTime);
    const deltaSinceLast = event.clientY - drag.lastY;
    if (elapsed >= 16) {
      drag.velocityY = (deltaSinceLast / elapsed) * 1000;
    }
    drag.lastY = event.clientY;
    drag.lastTime = now;

    if (drag.isDragging && deltaY > 0) {
      dragOffset.set(deltaY);
      event.preventDefault();
    }
  }, [dragOffset]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    dragRef.current = null;
    setIsDragging(false);

    const panelHeight = Math.max(1, panelRef.current?.getBoundingClientRect().height ?? 0);
    const threshold = Math.max(DRAG_MIN_DISTANCE, panelHeight * DRAG_CLOSE_THRESHOLD);
    const shouldClose = drag.isDragging && (
      dragOffset.get() >= threshold
      || drag.velocityY >= DRAG_CLOSE_VELOCITY
    );

    if (shouldClose) {
      onClose();
      return;
    }

    animate(dragOffset, 0, PANEL_REBOUND_TRANSITION);
  }, [dragOffset, onClose]);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    dragRef.current = null;
    setIsDragging(false);
    animate(dragOffset, 0, PANEL_REBOUND_TRANSITION);
  }, [dragOffset]);

  const handleExitComplete = useCallback(() => {
    dragRef.current = null;
    dragOffset.set(0);
    setIsDragging(false);
  }, [dragOffset]);

  const hasHeader = Boolean(title || subtitle);

  return (
    <AnimatePresence initial={false} onExitComplete={handleExitComplete}>
      {isOpen && (
        <div data-slot="sheet-root" className={cn('absolute inset-0 z-30 flex items-end', containerClassName)}>
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_TRANSITION}
          >
            <motion.button
              data-slot="sheet-backdrop"
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              onPointerDown={handleBackdropClick}
              className="absolute inset-0 bg-[#18202a]/18 backdrop-blur-[2px]"
              style={{ opacity: backdropOpacity }}
            />
          </motion.div>

          <motion.div
            className="relative w-full"
            variants={PANEL_SHELL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <motion.div
              ref={panelRef}
              data-slot="sheet-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              className={cn(
                'relative flex w-full touch-pan-y flex-col overflow-hidden rounded-t-[30px] border-t border-[#ddd7cc] bg-[#fffdfa]/98 shadow-[0_-20px_56px_rgba(24,32,42,0.16)] will-change-transform',
                panelClassName,
              )}
              style={{ maxHeight, y: dragOffset }}
            >
              {showDragHandle && (
                <div
                  data-slot="sheet-handle-area"
                  className={cn(
                    'flex touch-none select-none justify-center pt-5 pb-1',
                    isDragging ? 'cursor-grabbing' : 'cursor-grab',
                  )}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                >
                  <span data-slot="sheet-drag-handle" className="h-1.5 w-12 rounded-full bg-[#d8d1c6]" />
                </div>
              )}

              {hasHeader && (
                <div data-slot="sheet-header" className="flex items-start justify-between gap-3 px-4 pb-4 pt-3">
                  <div className="min-w-0">
                    {title && (
                      <p
                        id={titleId}
                        data-slot="sheet-title"
                        className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#34527a]"
                      >
                        {title}
                      </p>
                    )}
                    {subtitle && (
                      <div data-slot="sheet-subtitle" className={title ? 'mt-2' : ''}>
                        {typeof subtitle === 'string'
                          ? <p className="text-sm leading-6 text-[#5f6b79]">{subtitle}</p>
                          : subtitle}
                      </div>
                    )}
                  </div>
                  <button
                    data-slot="sheet-close"
                    type="button"
                    onClick={onClose}
                    aria-label={closeLabel}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#ddd7cc] bg-[#f8f7f3] text-[#697384]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div data-slot="sheet-content" className={cn('min-h-0 flex-1 overflow-y-auto px-4 pb-6', contentClassName)}>
                {children}
              </div>
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
