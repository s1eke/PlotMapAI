import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SettingsActionItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

interface SettingsActionMenuProps {
  primary?: SettingsActionItem[];
  overflow?: SettingsActionItem[];
}

function getActionButtonClassName(variant: 'default' | 'danger' = 'default'): string {
  if (variant === 'danger') {
    return 'border border-red-500/30 bg-red-500/10 hover:bg-red-500/15 text-red-300';
  }

  return 'border border-white/10 bg-white/5 hover:bg-white/10 text-text-primary';
}

function getIsDesktopViewport(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  return window.matchMedia('(min-width: 640px)').matches;
}

function subscribeToDesktopViewport(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const mediaQuery = window.matchMedia('(min-width: 640px)');
  const handleChange = () => onStoreChange();

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }

  mediaQuery.addListener(handleChange);
  return () => mediaQuery.removeListener(handleChange);
}

export default function SettingsActionMenu({
  primary = [],
  overflow = [],
}: SettingsActionMenuProps) {
  const { t } = useTranslation();
  const isDesktopViewport = useSyncExternalStore(
    subscribeToDesktopViewport,
    getIsDesktopViewport,
    () => true,
  );
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOverflowOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!overflowMenuRef.current?.contains(event.target as Node)) {
        setIsOverflowOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOverflowOpen]);

  const inlineActions = isDesktopViewport ? [...primary, ...overflow] : primary;

  if (inlineActions.length === 0 && overflow.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 min-w-max">
      {inlineActions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          aria-label={action.label}
          title={action.label}
          className={`h-9 px-2.5 sm:px-3 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm whitespace-nowrap ${getActionButtonClassName(action.variant)} disabled:opacity-40`}
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      ))}

      {!isDesktopViewport && overflow.length > 0 && (
        <div ref={overflowMenuRef} className="relative">
          <button
            type="button"
            aria-label={t('settings.common.moreActions')}
            title={t('settings.common.moreActions')}
            aria-haspopup="menu"
            aria-expanded={isOverflowOpen}
            onClick={() => setIsOverflowOpen((isOpen) => !isOpen)}
            className="h-9 w-9 rounded-lg transition-colors inline-flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/10 text-text-primary"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {isOverflowOpen && (
            <div role="menu" className="absolute right-0 top-full mt-2 z-30 min-w-40 rounded-xl border border-white/10 bg-bg-secondary/95 p-1.5 shadow-2xl backdrop-blur-md">
              {overflow.map((action) => (
                <button
                  key={`overflow:${action.label}`}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsOverflowOpen(false);
                    action.onClick();
                  }}
                  disabled={action.disabled}
                  className={`w-full px-3 py-2 rounded-lg transition-colors inline-flex items-center gap-2 text-sm whitespace-nowrap ${getActionButtonClassName(action.variant)} disabled:opacity-40`}
                >
                  {action.icon}
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type { SettingsActionItem };
