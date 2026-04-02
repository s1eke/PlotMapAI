export { readerApi, loadAndPurifyChapters } from './api/readerApi';
export type { Chapter, ChapterContent } from './api/readerApi';
export type { ReadingProgress } from './reader-session';
export { useReaderPreferences } from './hooks/useReaderPreferences';
export {
  clearReaderRenderCacheMemoryForNovel,
} from './utils/readerRenderCache';
export {
  useReaderSessionSelector,
  resetReaderSessionStoreForTests,
} from './hooks/sessionStore';

export function loadReaderPage() {
  return import('./pages/ReaderPage');
}
