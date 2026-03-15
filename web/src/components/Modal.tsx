import { useEffect } from 'react';
import type { ReactNode } from 'react';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 opacity-100 transition-opacity">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-brand-900/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div className={cn(
        "relative w-full max-w-2xl transform rounded-2xl glass p-6 text-left shadow-2xl transition-all flex flex-col max-h-[90vh]",
        className
      )}>
        <div className="flex items-center justify-between mb-5 shrink-0">
          <h3 className="text-xl font-medium leading-6 text-text-primary">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors focus:outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="overflow-y-auto hide-scrollbar flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
