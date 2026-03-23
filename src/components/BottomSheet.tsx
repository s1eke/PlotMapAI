import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { X } from 'lucide-react';

const EXIT_DURATION_MS = 250;
const DRAG_CLOSE_THRESHOLD = 0.3;
const DRAG_MIN_DISTANCE = 120;

interface DragState {
  pointerId: number;
  startY: number;
  isDragging: boolean;
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
}: BottomSheetProps) {
  const titleId = useId();
  const [mounted, setMounted] = useState(() => isOpen);
  const [closing, setClosing] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const dragRef = useRef<DragState | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isOpen) {
      timerRef.current = setTimeout(() => {
        setClosing(false);
        setMounted(true);
        timerRef.current = null;
      }, 0);
    } else {
      timerRef.current = setTimeout(() => {
        setClosing(true);
        timerRef.current = setTimeout(() => {
          setMounted(false);
          setClosing(false);
          timerRef.current = null;
        }, EXIT_DURATION_MS);
      }, 0);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (mounted) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted || closing) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mounted, closing, onClose]);

  const handleBackdropClick = useCallback(() => {
    if (closeOnBackdrop) {
      onClose();
    }
  }, [closeOnBackdrop, onClose]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    if (!panel) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      isDragging: false,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    panel.style.transition = 'none';
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const deltaY = event.clientY - drag.startY;

    if (!drag.isDragging && Math.abs(deltaY) > 8) {
      drag.isDragging = true;
      setIsDragging(true);
    }

    if (drag.isDragging && deltaY > 0) {
      setDragOffset(deltaY);
      event.preventDefault();
    }
  }, []);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    dragRef.current = null;
    setIsDragging(false);

    const panel = panelRef.current;
    if (!panel) {
      setDragOffset(0);
      return;
    }

    const threshold = Math.max(DRAG_MIN_DISTANCE, panel.getBoundingClientRect().height * DRAG_CLOSE_THRESHOLD);

    if (drag.isDragging && dragOffset >= threshold) {
      setDragOffset(0);
      panel.style.transition = '';
      onClose();
    } else {
      panel.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
      setDragOffset(0);
    }
  }, [dragOffset, onClose]);

  const handlePointerCancel = useCallback(() => {
    const panel = panelRef.current;
    dragRef.current = null;
    setIsDragging(false);
    if (panel) {
      panel.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
    }
    setDragOffset(0);
  }, []);

  if (!mounted) return null;

  const hasHeader = Boolean(title || subtitle);
  const animationClass = isDragging
    ? ''
    : closing
      ? 'animate-sheet-down'
      : 'animate-sheet-up';
  const backdropAnimation = closing ? 'animate-fade-out' : 'animate-fade-in';

  return (
    <div className="absolute inset-0 z-30 flex items-end">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onPointerDown={handleBackdropClick}
        className={`absolute inset-0 bg-[#18202a]/18 backdrop-blur-[2px] ${backdropAnimation}`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`relative flex w-full flex-col overflow-hidden rounded-t-[30px] border-t border-[#ddd7cc] bg-[#fffdfa]/98 shadow-[0_-20px_56px_rgba(24,32,42,0.16)] ${animationClass}`}
        style={{
          maxHeight,
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
        }}
      >
        {showDragHandle && (
          <div
            className="flex touch-none select-none justify-center pt-5 pb-1"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <span className="h-1.5 w-12 rounded-full bg-[#d8d1c6]" />
          </div>
        )}

        {hasHeader && (
          <div className="flex items-start justify-between gap-3 px-4 pb-4 pt-3">
            <div className="min-w-0">
              {title && (
                <p
                  id={titleId}
                  className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#34527a]"
                >
                  {title}
                </p>
              )}
              {subtitle && (
                <div className={title ? 'mt-2' : ''}>
                  {typeof subtitle === 'string'
                    ? <p className="text-sm leading-6 text-[#5f6b79]">{subtitle}</p>
                    : subtitle}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#ddd7cc] bg-[#f8f7f3] text-[#697384]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}
