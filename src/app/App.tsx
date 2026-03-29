import { lazy, Suspense, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { loadBookDetailPage, loadBookshelfPage } from '@domains/library';
import { loadCharacterGraphPage } from '@domains/character-graph';
import { loadReaderPage } from '@domains/reader';
import { loadSettingsPage } from '@domains/settings';
import type { AppError } from '@shared/errors';

import InstallPrompt from './components/InstallPrompt';
import ReloadPrompt from './components/ReloadPrompt';
import { isDebugMode, registerDebugHelpers } from './debug/service';
import DebugPanel from './debug/DebugPanel';
import { AppErrorBoundary, registerGlobalErrorHandlers } from './errors';
import Layout from './layout/Layout';
import { ThemeProvider } from './providers/ThemeContext';
import { appPaths } from './router/paths';

const LazyBookshelfPage = lazy(loadBookshelfPage);
const LazyBookDetailPage = lazy(loadBookDetailPage);
const LazyReaderPage = lazy(loadReaderPage);
const LazySettingsPage = lazy(loadSettingsPage);
const LazyCharacterGraphPage = lazy(loadCharacterGraphPage);

function RouteFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-accent" />
    </div>
  );
}

interface AppProps {
  startupError?: AppError | null;
}

function App({ startupError = null }: AppProps) {
  useEffect(() => {
    if (!isDebugMode()) {
      return undefined;
    }

    return registerDebugHelpers();
  }, []);

  useEffect(() => {
    return registerGlobalErrorHandlers();
  }, []);

  return (
    <ThemeProvider>
      <Router>
        <AppErrorBoundary initialError={startupError}>
          <Layout>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path={appPaths.bookshelf()} element={<LazyBookshelfPage />} />
                <Route path="/novel/:id" element={<LazyBookDetailPage />} />
                <Route path="/novel/:id/read" element={<LazyReaderPage />} />
                <Route path="/novel/:id/graph" element={<LazyCharacterGraphPage />} />
                <Route path={appPaths.settings()} element={<LazySettingsPage />} />
              </Routes>
            </Suspense>
          </Layout>
        </AppErrorBoundary>
      </Router>
      {isDebugMode() && <DebugPanel />}
      <InstallPrompt />
      <ReloadPrompt />
    </ThemeProvider>
  );
}

export default App;
