import type { MutableRefObject } from 'react';
import type { TextProcessingProgress } from '@shared/text-processing';

import type { BookChapter } from '../book';
import type { Chapter, ChapterContent } from './content';
import type { ReaderLocator, ScrollModeAnchor } from './layout';
import type { ReaderImageGalleryEntry } from './media';
import type { PageTarget, ChapterChangeSource } from './session';

export type RestoreSettledResult = 'completed' | 'skipped' | 'failed';

export interface ReaderTextProcessingOptions {
  signal?: AbortSignal;
  onProgress?: (progress: TextProcessingProgress) => void;
}

export interface ReaderViewportContextValue {
  contentRef: MutableRefObject<HTMLDivElement | null>;
  pagedViewportRef: MutableRefObject<HTMLDivElement | null>;
}

export interface ReaderContentRuntimeValue {
  getChapters: (
    novelId: number,
    options?: ReaderTextProcessingOptions,
  ) => Promise<Chapter[]>;
  getChapterContent: (
    novelId: number,
    chapterIndex: number,
    options?: ReaderTextProcessingOptions,
  ) => Promise<ChapterContent>;
  getImageBlob: (novelId: number, imageKey: string) => Promise<Blob | null>;
  getImageGalleryEntries: (novelId: number) => Promise<ReaderImageGalleryEntry[]>;
  loadPurifiedBookChapters: (
    novelId: number,
    options?: ReaderTextProcessingOptions,
  ) => Promise<BookChapter[]>;
}

export interface ReaderNavigationRuntimeValue {
  getChapterChangeSource: () => ChapterChangeSource;
  setChapterChangeSource: (nextSource: ChapterChangeSource) => void;
  getPendingPageTarget: () => PageTarget | null;
  setPendingPageTarget: (nextTarget: PageTarget | null) => void;
  getPagedState: () => { pageCount: number; pageIndex: number };
  setPagedState: (nextState: { pageCount: number; pageIndex: number }) => void;
}

export interface ReaderLayoutQueriesValue {
  clearScrollChapterBodyElements: () => void;
  clearScrollChapterElements: () => void;
  getCurrentAnchor: () => ScrollModeAnchor | null;
  getCurrentOriginalLocator: () => ReaderLocator | null;
  getCurrentPagedLocator: () => ReaderLocator | null;
  getScrollChapterBodyElement: (index: number) => HTMLDivElement | null;
  getScrollChapterElement: (index: number) => HTMLDivElement | null;
  hasScrollChapterBodyElement: (index: number) => boolean;
  registerCurrentAnchorResolver: (
    resolver: () => ScrollModeAnchor | null,
  ) => () => void;
  registerCurrentOriginalLocatorResolver: (
    resolver: () => ReaderLocator | null,
  ) => () => void;
  registerCurrentPagedLocatorResolver: (
    resolver: () => ReaderLocator | null,
  ) => () => void;
  registerScrollChapterBodyElement: (
    index: number,
    element: HTMLDivElement | null,
  ) => void;
  registerScrollChapterElement: (
    index: number,
    element: HTMLDivElement | null,
  ) => void;
  registerScrollLocatorOffsetResolver: (
    resolver: (locator: ReaderLocator) => number | null,
  ) => () => void;
  resolveScrollLocatorOffset: (locator: ReaderLocator) => number | null;
}

export interface ReaderPersistenceRuntimeValue {
  isScrollSyncSuppressed: () => boolean;
  notifyRestoreSettled: (result: RestoreSettledResult) => void;
  registerBeforeFlush: (handler: () => void) => () => void;
  registerRestoreSettledHandler: (
    handler: (result: RestoreSettledResult) => void,
  ) => () => void;
  runBeforeFlush: () => void;
  suppressScrollSyncTemporarily: () => void;
}
