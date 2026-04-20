import type { RefObject } from 'react';
import { Bug } from 'lucide-react';
import { cn } from '@shared/utils/cn';

interface DebugLauncherProps {
  buttonRef: RefObject<HTMLButtonElement | null>;
  count: number;
  onOpen: () => void;
  title: string;
}

export default function DebugLauncher({
  buttonRef,
  count,
  onOpen,
  title,
}: DebugLauncherProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onOpen}
      className={cn(
        'fixed bottom-4 right-4 z-[70] flex h-11 w-11 items-center justify-center rounded-full border transition-colors',
        'border-border-color bg-bg-secondary text-text-primary shadow-[0_12px_30px_rgba(15,23,42,0.14)]',
        'hover:bg-bg-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary',
      )}
      title={title}
      aria-label={title}
    >
      <Bug className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-5 text-white shadow-sm">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
