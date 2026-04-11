import type { ReactNode } from 'react';
import type {
  ChapterChangeSource,
  Chapter,
  ChapterContent,
  PageTarget,
  ReaderLocator,
  ReaderImageGalleryEntry,
  RestoreSettledResult,
  ScrollModeAnchor,
} from '@shared/contracts/reader';
import type { BookChapter } from '@shared/contracts';

import {
  ReaderContextProvider,
  type ReaderContextValue as ShellReaderContextValue,
} from '@domains/reader-shell/pages/reader-page/ReaderContext';

function createNoopCleanup(): () => void {
  return () => {};
}

async function resolveEmptyChapters(): Promise<Chapter[]> {
  return [];
}

async function resolveMissingChapter(): Promise<ChapterContent> {
  throw new Error('No reader content runtime stub configured for getChapterContent().');
}

async function resolveMissingImageBlob(): Promise<Blob | null> {
  return null;
}

async function resolveEmptyImageGallery(): Promise<ReaderImageGalleryEntry[]> {
  return [];
}

async function resolveEmptyPurifiedBookChapters(): Promise<BookChapter[]> {
  return [];
}

export function createReaderContextValue(
  overrides: Partial<ShellReaderContextValue> = {},
): ShellReaderContextValue {
  const contentRef = overrides.contentRef ?? { current: null };
  const pagedViewportRef = overrides.pagedViewportRef ?? { current: null };
  const scrollChapterElements = new Map<number, HTMLDivElement>();
  const scrollChapterBodyElements = new Map<number, HTMLDivElement>();
  const beforeFlushHandlers = new Set<() => void>();
  let chapterChangeSource: ChapterChangeSource = null;
  let pendingPageTarget: PageTarget | null = null;
  let pagedState = { pageCount: 1, pageIndex: 0 };
  let currentAnchorResolver: () => ScrollModeAnchor | null = () => null;
  let currentOriginalLocatorResolver: () => ReaderLocator | null = () => null;
  let currentPagedLocatorResolver: () => ReaderLocator | null = () => null;
  let scrollLocatorOffsetResolver: (locator: ReaderLocator) => number | null = () => null;
  let restoreSettledHandler: (result: RestoreSettledResult) => void = () => {};
  let scrollSyncSuppressed = false;

  return {
    contentRef,
    pagedViewportRef,
    getChapters: overrides.getChapters ?? resolveEmptyChapters,
    getChapterContent: overrides.getChapterContent ?? resolveMissingChapter,
    getImageBlob: overrides.getImageBlob ?? resolveMissingImageBlob,
    getImageGalleryEntries: overrides.getImageGalleryEntries ?? resolveEmptyImageGallery,
    loadPurifiedBookChapters:
      overrides.loadPurifiedBookChapters ?? resolveEmptyPurifiedBookChapters,
    getChapterChangeSource: overrides.getChapterChangeSource ?? (() => chapterChangeSource),
    setChapterChangeSource: overrides.setChapterChangeSource ?? ((nextSource) => {
      chapterChangeSource = nextSource;
    }),
    getPendingPageTarget: overrides.getPendingPageTarget ?? (() => pendingPageTarget),
    setPendingPageTarget: overrides.setPendingPageTarget ?? ((nextTarget) => {
      pendingPageTarget = nextTarget;
    }),
    getPagedState: overrides.getPagedState ?? (() => pagedState),
    setPagedState: overrides.setPagedState ?? ((nextState) => {
      pagedState = nextState;
    }),
    clearScrollChapterBodyElements: overrides.clearScrollChapterBodyElements ?? (() => {
      scrollChapterBodyElements.clear();
    }),
    clearScrollChapterElements: overrides.clearScrollChapterElements ?? (() => {
      scrollChapterElements.clear();
    }),
    getCurrentAnchor: overrides.getCurrentAnchor ?? (() => currentAnchorResolver()),
    getCurrentOriginalLocator: overrides.getCurrentOriginalLocator
      ?? (() => currentOriginalLocatorResolver()),
    getCurrentPagedLocator: overrides.getCurrentPagedLocator
      ?? (() => currentPagedLocatorResolver()),
    getScrollChapterBodyElement: overrides.getScrollChapterBodyElement
      ?? ((index) => scrollChapterBodyElements.get(index) ?? null),
    getScrollChapterElement: overrides.getScrollChapterElement
      ?? ((index) => scrollChapterElements.get(index) ?? null),
    hasScrollChapterBodyElement: overrides.hasScrollChapterBodyElement
      ?? ((index) => scrollChapterBodyElements.has(index)),
    registerCurrentAnchorResolver: overrides.registerCurrentAnchorResolver ?? ((resolver) => {
      currentAnchorResolver = resolver;
      return createNoopCleanup();
    }),
    registerCurrentOriginalLocatorResolver:
      overrides.registerCurrentOriginalLocatorResolver ?? ((resolver) => {
        currentOriginalLocatorResolver = resolver;
        return createNoopCleanup();
      }),
    registerCurrentPagedLocatorResolver:
      overrides.registerCurrentPagedLocatorResolver ?? ((resolver) => {
        currentPagedLocatorResolver = resolver;
        return createNoopCleanup();
      }),
    registerScrollChapterBodyElement:
      overrides.registerScrollChapterBodyElement ?? ((index, element) => {
        if (element) {
          scrollChapterBodyElements.set(index, element);
          return;
        }

        scrollChapterBodyElements.delete(index);
      }),
    registerScrollChapterElement: overrides.registerScrollChapterElement ?? ((index, element) => {
      if (element) {
        scrollChapterElements.set(index, element);
        return;
      }

      scrollChapterElements.delete(index);
    }),
    registerScrollLocatorOffsetResolver:
      overrides.registerScrollLocatorOffsetResolver ?? ((resolver) => {
        scrollLocatorOffsetResolver = resolver;
        return createNoopCleanup();
      }),
    resolveScrollLocatorOffset: overrides.resolveScrollLocatorOffset
      ?? ((locator) => scrollLocatorOffsetResolver(locator)),
    isScrollSyncSuppressed: overrides.isScrollSyncSuppressed ?? (() => scrollSyncSuppressed),
    notifyRestoreSettled: overrides.notifyRestoreSettled ?? ((result) => {
      restoreSettledHandler(result);
    }),
    registerBeforeFlush: overrides.registerBeforeFlush ?? ((handler) => {
      beforeFlushHandlers.add(handler);
      return () => {
        beforeFlushHandlers.delete(handler);
      };
    }),
    registerRestoreSettledHandler: overrides.registerRestoreSettledHandler ?? ((handler) => {
      restoreSettledHandler = handler;
      return createNoopCleanup();
    }),
    runBeforeFlush: overrides.runBeforeFlush ?? (() => {
      for (const handler of beforeFlushHandlers) {
        handler();
      }
    }),
    suppressScrollSyncTemporarily: overrides.suppressScrollSyncTemporarily ?? (() => {
      scrollSyncSuppressed = true;
    }),
    ...overrides,
  };
}

export function createReaderContextWrapper(
  overrides: Partial<ShellReaderContextValue> = {},
): {
    value: ShellReaderContextValue;
    Wrapper: ({ children }: { children: ReactNode }) => ReactNode;
  } {
  const value = createReaderContextValue(overrides);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ReaderContextProvider value={value}>{children}</ReaderContextProvider>
    );
  }

  return { value, Wrapper };
}

export type { ShellReaderContextValue as ReaderContextValue };
