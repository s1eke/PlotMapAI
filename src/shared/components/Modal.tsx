import { useEffect, useId } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../utils/cn';

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

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-3 sm:items-center sm:p-4">
        <div
          className="absolute inset-0 bg-brand-900/80 backdrop-blur-sm"
          onClick={onClose}
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            'relative z-10 my-6 w-full max-w-2xl rounded-2xl glass p-4 sm:my-0 sm:p-6 text-left shadow-2xl transition-all flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] animate-slide-up',
            className,
          )}
        >
          <div className="flex items-center justify-between mb-5 shrink-0 gap-4">
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

          <div className="overflow-y-auto hide-scrollbar flex-1">
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
