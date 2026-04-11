import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { BookOpen, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ensureReaderAppearanceHydrated,
  useReaderAppearanceSelector,
} from '@shared/stores/readerAppearanceStore';
import { type AppTheme, useAppThemeSelector } from '@shared/stores/appThemeStore';
import { cn } from '@shared/utils/cn';

import { appPaths } from '../router/paths';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ThemeToggle from '../components/ThemeToggle';

interface LayoutProps {
  children: ReactNode;
}

const APP_SURFACE_COLORS: Record<AppTheme, string> = {
  light: '#f8fafc',
  dark: '#0f172a',
};

const READER_SURFACE_COLORS: Record<string, string | null> = {
  auto: null,
  paper: '#ffffff',
  parchment: '#f4ecd8',
  green: '#c7edcc',
  night: '#1a1a1a',
};

function ensureMetaTag(name: string): HTMLMetaElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const existing = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (existing) {
    return existing;
  }

  const meta = document.createElement('meta');
  meta.setAttribute('name', name);
  document.head.appendChild(meta);
  return meta;
}

function resolveShellSurfaceColor(
  isReader: boolean,
  readerTheme: string,
  appTheme: AppTheme,
): string {
  if (!isReader) {
    return APP_SURFACE_COLORS[appTheme];
  }

  return READER_SURFACE_COLORS[readerTheme] ?? APP_SURFACE_COLORS[appTheme];
}

export default function Layout({ children }: LayoutProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const isReader = location.pathname.includes('/read');
  const appTheme = useAppThemeSelector((state) => state.theme);
  const readerTheme = useReaderAppearanceSelector((state) => state.readerTheme);
  const shellSurfaceColor = resolveShellSurfaceColor(isReader, readerTheme, appTheme);
  const layoutStyle: CSSProperties & Record<'--app-header-height' | '--app-header-offset', string> = {
    '--app-header-height': isReader ? '0px' : 'calc(4rem + env(safe-area-inset-top, 0px))',
    '--app-header-offset': '0px',
    backgroundColor: shellSurfaceColor,
  };

  useEffect(() => {
    ensureReaderAppearanceHydrated().catch(() => undefined);
  }, []);

  useEffect(() => {
    const themeColorMeta = ensureMetaTag('theme-color');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', shellSurfaceColor);
    }

    if (typeof document !== 'undefined') {
      document.documentElement.style.backgroundColor = shellSurfaceColor;
      document.body.style.backgroundColor = shellSurfaceColor;
    }
  }, [shellSurfaceColor]);

  return (
    <div
      data-testid="app-layout-shell"
      className="flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-bg-primary"
      style={layoutStyle}
    >
      {/* Header - hide in reader mode for immersion */}
      {!isReader && (
        <header
          className="sticky top-0 z-50 border-b border-border-color/70 bg-bg-primary shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8">
            <Link to={appPaths.bookshelf()} className="flex items-center gap-2 text-xl font-bold text-accent hover:text-accent-hover transition-colors">
              <BookOpen className="w-6 h-6" />
              <span>{t('common.appName')}</span>
            </Link>

            <nav className="flex items-center gap-2 sm:gap-4">
              <ThemeToggle />
              <LanguageSwitcher />
              <Link
                to={appPaths.settings()}
                className="p-2 rounded-full hover:bg-white/10 transition-colors text-text-secondary hover:text-text-primary"
                title={t('common.nav.settings')}
              >
                <Settings className="w-5 h-5" />
              </Link>
            </nav>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main
        data-scroll-container={isReader ? undefined : 'true'}
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          !isReader && 'hide-scrollbar overflow-y-auto overscroll-y-contain',
        )}
        style={isReader ? undefined : {
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </main>
    </div>
  );
}
