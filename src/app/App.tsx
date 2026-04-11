import type { StartupState } from '@app/bootstrap/startup';

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { isDebugMode } from '@shared/debug';
import {
  initializeAppSafely,
  resetDatabaseAndReinitialize,
} from '@app/bootstrap/startup';
import {
  loadBookDetailPage,
  loadBookshelfPage,
  loadCharacterGraphPage,
  loadReaderPage,
  loadSettingsPage,
} from '@application/pages';
import InstallPrompt from './components/InstallPrompt';
import ReloadPrompt from './components/ReloadPrompt';
import StartupRecoveryScreen from './bootstrap/StartupRecoveryScreen';
import { registerPwaDebugTools } from './debug/pwaDebugTools';
import DebugPanel from './debug/DebugPanel';
import { AppErrorBoundary, registerGlobalErrorHandlers } from './errors';
import Layout from './layout/Layout';
import { FileHandlingProvider } from './providers/FileHandlingContext';
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
  startupState?: StartupState;
}

function App({ startupState: initialStartupState = { kind: 'ready' } }: AppProps) {
  const [startupState, setStartupState] = useState<StartupState>(initialStartupState);
  const [isResolvingStartup, setIsResolvingStartup] = useState(false);

  useEffect(() => {
    if (!isDebugMode()) {
      return undefined;
    }

    return registerPwaDebugTools();
  }, []);

  useEffect(() => {
    return registerGlobalErrorHandlers();
  }, []);

  const handleRetryStartup = useCallback(async (): Promise<void> => {
    setIsResolvingStartup(true);
    try {
      setStartupState(await initializeAppSafely());
    } finally {
      setIsResolvingStartup(false);
    }
  }, []);

  const handleResetDatabase = useCallback(async (): Promise<void> => {
    setIsResolvingStartup(true);
    try {
      setStartupState(await resetDatabaseAndReinitialize());
    } finally {
      setIsResolvingStartup(false);
    }
  }, []);

  const initialError = startupState.kind === 'error' ? startupState.error : null;

  return (
    <ThemeProvider>
      <AppErrorBoundary initialError={initialError}>
        {startupState.kind === 'recovery-required' ? (
          <StartupRecoveryScreen
            error={startupState.error}
            isWorking={isResolvingStartup}
            onRetry={handleRetryStartup}
            onReset={handleResetDatabase}
          />
        ) : (
          <Router>
            <FileHandlingProvider>
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
            </FileHandlingProvider>
          </Router>
        )}
      </AppErrorBoundary>
      {isDebugMode() && <DebugPanel />}
      {startupState.kind === 'ready' && <InstallPrompt />}
      {startupState.kind === 'ready' && <ReloadPrompt />}
    </ThemeProvider>
  );
}

export default App;
