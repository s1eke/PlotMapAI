export {
  registerReaderContentController,
  type ReaderContentController,
  type ReaderTextProcessingOptions,
} from './readerContentController';
export { readerContentService } from './readerContentService';
export type { Chapter, ChapterContent } from '@shared/contracts/reader';
export { useReaderChapterData } from './hooks/useReaderChapterData';
export type {
  ReaderChapterCacheApi,
  ReaderHydrateDataResult,
  ReaderLoadActiveChapterParams,
  ReaderLoadActiveChapterResult,
  ReaderLoadActiveChapterRuntime,
  UseReaderChapterDataResult,
} from './hooks/useReaderChapterData';
