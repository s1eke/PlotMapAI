import type { ReactNode } from 'react';
import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

import { cn } from '../utils/cn';

const MODAL_BACKDROP_TRANSITION = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1],
} as const;

const MODAL_PANEL_VARIANTS = {
  hidden: {
    opacity: 0,
    y: 24,
    scale: 0.98,
    transition: {
      duration: 0.22,
      ease: [0.32, 0.72, 0, 1],
    },
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 360,
      damping: 32,
      mass: 0.9,
    },
  },
} as const;

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export default function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  const titleId = useId();

  // Prevent body scroll when open
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

  return createPortal(
    <AnimatePresence initial={false}>
      {isOpen ? (
        <div className="fixed inset-0 z-[80] overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-3 sm:items-center sm:p-4">
            <motion.div
              data-slot="modal-backdrop"
              className="absolute inset-0 bg-brand-900/80 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={MODAL_BACKDROP_TRANSITION}
              onClick={onClose}
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              variants={MODAL_PANEL_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className={cn(
                'relative z-10 my-6 flex w-full max-w-2xl flex-col text-left shadow-2xl glass rounded-2xl p-4 sm:my-0 sm:p-6 max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] will-change-transform',
                className,
              )}
            >
              <div className="mb-5 flex shrink-0 items-center justify-between gap-4">
                <h3 id={titleId} className="text-xl font-medium leading-6 text-text-primary">
                  {title}
                </h3>
                <button
                  onClick={onClose}
                  className="rounded-full p-2 text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors focus:outline-none shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="hide-scrollbar flex-1 overflow-y-auto">
                {children}
              </div>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
