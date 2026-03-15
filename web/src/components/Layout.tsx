import type { ReactNode } from 'react';
import { BookOpen, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const isReader = location.pathname.includes('/read');

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header - hide in reader mode for immersion */}
      {!isReader && (
        <header className="sticky top-0 z-50 glass border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-xl font-bold text-accent hover:text-accent-hover transition-colors">
              <BookOpen className="w-6 h-6" />
              <span>{t('common.appName')}</span>
            </Link>

            <nav className="flex items-center gap-2 sm:gap-4">
              <ThemeToggle />
              <LanguageSwitcher />
              <Link 
                to="/settings" 
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
      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  );
}
