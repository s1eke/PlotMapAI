import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import { ThemeProvider } from './context/ThemeContext';
import DebugPanel from './components/DebugPanel';
import { isDebugMode } from './services/debug';

const BookshelfPage = lazy(() => import('./pages/BookshelfPage'));
const BookDetailPage = lazy(() => import('./pages/BookDetailPage'));
const ReaderPage = lazy(() => import('./pages/ReaderPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CharacterGraphPage = lazy(() => import('./pages/CharacterGraphPage'));

function RouteFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-accent" />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <Router>
        <Layout>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<BookshelfPage />} />
              <Route path="/novel/:id" element={<BookDetailPage />} />
              <Route path="/novel/:id/read" element={<ReaderPage />} />
              <Route path="/novel/:id/graph" element={<CharacterGraphPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Suspense>
        </Layout>
      </Router>
      {isDebugMode() && <DebugPanel />}
    </ThemeProvider>
  );
}

export default App;
