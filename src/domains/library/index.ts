export { novelRepository } from './novelRepository';
export type {
  CreateImportedNovelInput,
  DeleteNovelOptions,
} from './novelRepository';
export { default as BookCard } from './components/BookCard';
export {
  default as BookDetailActionButton,
  PRIMARY_DETAIL_ACTION_CLASS,
} from './components/BookDetailActionButton';
export { default as CharacterShareChart } from './components/CharacterShareChart';
export { default as TxtCover } from './components/TxtCover';
export { useNovelCoverResource } from './hooks/useNovelCoverResource';
export {
  acquireNovelCoverResource,
  clearNovelCoverResourcesForNovel,
  peekNovelCoverResource,
  releaseNovelCoverResource,
  resetNovelCoverResourceCacheForTests,
} from './utils/novelCoverResourceCache';
export type { NovelView } from './types';
