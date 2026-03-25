import { lazy, Suspense, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { BookDetailPage, BookshelfPage } from '@domains/library';
import { CharacterGraphPage } from '@domains/character-graph';
import { ReaderPage } from '@domains/reader';
import { SettingsPage } from '@domains/settings';

import InstallPrompt from './components/InstallPrompt';
import ReloadPrompt from './components/ReloadPrompt';
import { isDebugMode, registerDebugHelpers } from './debug/service';
import DebugPanel from './debug/DebugPanel';
import Layout from './layout/Layout';
import { ThemeProvider } from './providers/ThemeContext';
import { appPaths } from './router/paths';

const LazyBookshelfPage = lazy(async () => ({ default: BookshelfPage }));
const LazyBookDetailPage = lazy(async () => ({ default: BookDetailPage }));
const LazyReaderPage = lazy(async () => ({ default: ReaderPage }));
const LazySettingsPage = lazy(async () => ({ default: SettingsPage }));
const LazyCharacterGraphPage = lazy(async () => ({ default: CharacterGraphPage }));

function RouteFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-accent" />
    </div>
  );
}

function App() {
  useEffect(() => {
    if (!isDebugMode()) {
      return undefined;
    }

    return registerDebugHelpers();
  }, []);

  return (
    <ThemeProvider>
      <Router>
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
      </Router>
      {isDebugMode() && <DebugPanel />}
      <InstallPrompt />
      <ReloadPrompt />
    </ThemeProvider>
  );
}

export default App;
