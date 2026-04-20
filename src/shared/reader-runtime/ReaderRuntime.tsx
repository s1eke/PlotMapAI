/* eslint-disable react-refresh/only-export-components */

import type { ReactNode } from 'react';
import type {
  ReaderContentRuntimeValue,
  ReaderLayoutQueriesValue,
  ReaderNavigationRuntimeValue,
  ReaderPersistenceRuntimeValue,
  ReaderViewportContextValue,
  RestoreSettledResult,
} from '@shared/contracts/reader';
import type { ReaderLocator, ScrollModeAnchor } from '@shared/contracts/reader';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';

interface ReaderRuntimeProviderProps {
  children: ReactNode;
}

const ReaderViewportContext =
  createContext<ReaderViewportContextValue | undefined>(undefined);
const ReaderContentRuntimeContext =
  createContext<ReaderContentRuntimeValue | undefined>(undefined);
const ReaderNavigationRuntimeContext =
  createContext<ReaderNavigationRuntimeValue | undefined>(undefined);
const ReaderLayoutQueriesContext =
  createContext<ReaderLayoutQueriesValue | undefined>(undefined);
const ReaderPersistenceRuntimeContext =
  createContext<ReaderPersistenceRuntimeValue | undefined>(undefined);

interface ReaderScopedProviderProps<T> {
  children: ReactNode;
  value: T;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return false;
  }

  return typeof (value as { then?: unknown }).then === 'function';
}

function assertSynchronousBeforeFlushHandler(result: unknown): void {
  if (!(import.meta.env.DEV || import.meta.env.MODE === 'test')) {
    return;
  }

  if (!isPromiseLike(result)) {
    return;
  }

  throw new Error(
    'registerBeforeFlush handlers must stay synchronous. Capture async state ahead of flush and read it synchronously during runBeforeFlush().',
  );
}

export function ReaderViewportContextProvider({
  children,
  value,
}: ReaderScopedProviderProps<ReaderViewportContextValue>) {
  return (
    <ReaderViewportContext.Provider value={value}>
      {children}
    </ReaderViewportContext.Provider>
  );
}

export function ReaderContentRuntimeContextProvider({
  children,
  value,
}: ReaderScopedProviderProps<ReaderContentRuntimeValue>) {
  return (
    <ReaderContentRuntimeContext.Provider value={value}>
      {children}
    </ReaderContentRuntimeContext.Provider>
  );
}

export function ReaderNavigationRuntimeContextProvider({
  children,
  value,
}: ReaderScopedProviderProps<ReaderNavigationRuntimeValue>) {
  return (
    <ReaderNavigationRuntimeContext.Provider value={value}>
      {children}
    </ReaderNavigationRuntimeContext.Provider>
  );
}

export function ReaderLayoutQueriesContextProvider({
  children,
  value,
}: ReaderScopedProviderProps<ReaderLayoutQueriesValue>) {
  return (
    <ReaderLayoutQueriesContext.Provider value={value}>
      {children}
    </ReaderLayoutQueriesContext.Provider>
  );
}

export function ReaderPersistenceRuntimeContextProvider({
  children,
  value,
}: ReaderScopedProviderProps<ReaderPersistenceRuntimeValue>) {
  return (
    <ReaderPersistenceRuntimeContext.Provider value={value}>
      {children}
    </ReaderPersistenceRuntimeContext.Provider>
  );
}

export function ReaderRuntimeProvider({
  children,
}: ReaderRuntimeProviderProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const pagedViewportRef = useRef<HTMLDivElement>(null);
  const chapterChangeSourceRef = useRef<import('@shared/contracts/reader').ChapterChangeSource>(null);
  const pendingPageTargetRef = useRef<import('@shared/contracts/reader').PageTarget | null>(null);
  const pagedStateRef = useRef({ pageCount: 1, pageIndex: 0 });
  const currentAnchorResolverRef = useRef<() => ScrollModeAnchor | null>(() => null);
  const currentOriginalLocatorResolverRef = useRef<() => ReaderLocator | null>(() => null);
  const currentPagedLocatorResolverRef = useRef<() => ReaderLocator | null>(() => null);
  const pagedLocatorPageIndexResolverRef = useRef<(locator: ReaderLocator) => number | null>(
    () => null,
  );
  const scrollLocatorOffsetResolverRef = useRef<(locator: ReaderLocator) => number | null>(
    () => null,
  );
  const scrollChapterElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollChapterBodyElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const beforeFlushHandlersRef = useRef<Set<() => void>>(new Set());
  const restoreSettledHandlerRef = useRef<(result: RestoreSettledResult) => void>(() => {});
  const isScrollSyncSuppressedRef = useRef(false);
  const scrollSyncReleaseFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (scrollSyncReleaseFrameRef.current !== null) {
        cancelAnimationFrame(scrollSyncReleaseFrameRef.current);
      }
    };
  }, []);

  const viewportValue = useMemo<ReaderViewportContextValue>(() => ({
    contentRef,
    pagedViewportRef,
  }), []);

  const navigationValue = useMemo<ReaderNavigationRuntimeValue>(() => ({
    getChapterChangeSource: () => chapterChangeSourceRef.current,
    setChapterChangeSource: (nextSource) => {
      chapterChangeSourceRef.current = nextSource;
    },
    getPendingPageTarget: () => pendingPageTargetRef.current,
    setPendingPageTarget: (nextTarget) => {
      pendingPageTargetRef.current = nextTarget;
    },
    getPagedState: () => pagedStateRef.current,
    setPagedState: (nextState) => {
      pagedStateRef.current = nextState;
    },
  }), []);

  const layoutQueriesValue = useMemo<ReaderLayoutQueriesValue>(() => ({
    clearScrollChapterBodyElements: () => {
      scrollChapterBodyElementsRef.current.clear();
    },
    clearScrollChapterElements: () => {
      scrollChapterElementsRef.current.clear();
    },
    getCurrentAnchor: () => currentAnchorResolverRef.current(),
    getCurrentOriginalLocator: () => currentOriginalLocatorResolverRef.current(),
    getCurrentPagedLocator: () => currentPagedLocatorResolverRef.current(),
    getScrollChapterBodyElement: (index) => scrollChapterBodyElementsRef.current.get(index) ?? null,
    getScrollChapterElement: (index) => scrollChapterElementsRef.current.get(index) ?? null,
    hasScrollChapterBodyElement: (index) => scrollChapterBodyElementsRef.current.has(index),
    registerCurrentAnchorResolver: (resolver) => {
      currentAnchorResolverRef.current = resolver;
      return () => {
        if (currentAnchorResolverRef.current === resolver) {
          currentAnchorResolverRef.current = () => null;
        }
      };
    },
    registerCurrentOriginalLocatorResolver: (resolver) => {
      currentOriginalLocatorResolverRef.current = resolver;
      return () => {
        if (currentOriginalLocatorResolverRef.current === resolver) {
          currentOriginalLocatorResolverRef.current = () => null;
        }
      };
    },
    registerCurrentPagedLocatorResolver: (resolver) => {
      currentPagedLocatorResolverRef.current = resolver;
      return () => {
        if (currentPagedLocatorResolverRef.current === resolver) {
          currentPagedLocatorResolverRef.current = () => null;
        }
      };
    },
    registerPagedLocatorPageIndexResolver: (resolver) => {
      pagedLocatorPageIndexResolverRef.current = resolver;
      return () => {
        if (pagedLocatorPageIndexResolverRef.current === resolver) {
          pagedLocatorPageIndexResolverRef.current = () => null;
        }
      };
    },
    registerScrollChapterBodyElement: (index, element) => {
      if (element) {
        scrollChapterBodyElementsRef.current.set(index, element);
        return;
      }

      scrollChapterBodyElementsRef.current.delete(index);
    },
    registerScrollChapterElement: (index, element) => {
      if (element) {
        scrollChapterElementsRef.current.set(index, element);
        return;
      }

      scrollChapterElementsRef.current.delete(index);
    },
    registerScrollLocatorOffsetResolver: (resolver) => {
      scrollLocatorOffsetResolverRef.current = resolver;
      return () => {
        if (scrollLocatorOffsetResolverRef.current === resolver) {
          scrollLocatorOffsetResolverRef.current = () => null;
        }
      };
    },
    resolvePagedLocatorPageIndex: (locator) => pagedLocatorPageIndexResolverRef.current(locator),
    resolveScrollLocatorOffset: (locator) => scrollLocatorOffsetResolverRef.current(locator),
  }), []);

  const suppressScrollSyncTemporarily = useCallback(() => {
    isScrollSyncSuppressedRef.current = true;

    if (scrollSyncReleaseFrameRef.current !== null) {
      cancelAnimationFrame(scrollSyncReleaseFrameRef.current);
      scrollSyncReleaseFrameRef.current = null;
    }

    const releaseAfterLayout = () => {
      scrollSyncReleaseFrameRef.current = requestAnimationFrame(() => {
        isScrollSyncSuppressedRef.current = false;
        scrollSyncReleaseFrameRef.current = null;
      });
    };

    scrollSyncReleaseFrameRef.current = requestAnimationFrame(releaseAfterLayout);
  }, []);

  const persistenceValue = useMemo<ReaderPersistenceRuntimeValue>(() => ({
    isScrollSyncSuppressed: () => isScrollSyncSuppressedRef.current,
    notifyRestoreSettled: (result) => {
      restoreSettledHandlerRef.current(result);
    },
    registerBeforeFlush: (handler) => {
      beforeFlushHandlersRef.current.add(handler);
      return () => {
        beforeFlushHandlersRef.current.delete(handler);
      };
    },
    registerRestoreSettledHandler: (handler) => {
      restoreSettledHandlerRef.current = handler;
      return () => {
        if (restoreSettledHandlerRef.current === handler) {
          restoreSettledHandlerRef.current = () => {};
        }
      };
    },
    runBeforeFlush: () => {
      for (const handler of beforeFlushHandlersRef.current) {
        assertSynchronousBeforeFlushHandler(handler());
      }
    },
    suppressScrollSyncTemporarily,
  }), [suppressScrollSyncTemporarily]);

  return (
    <ReaderViewportContextProvider value={viewportValue}>
      <ReaderNavigationRuntimeContextProvider value={navigationValue}>
        <ReaderLayoutQueriesContextProvider value={layoutQueriesValue}>
          <ReaderPersistenceRuntimeContextProvider value={persistenceValue}>
            {children}
          </ReaderPersistenceRuntimeContextProvider>
        </ReaderLayoutQueriesContextProvider>
      </ReaderNavigationRuntimeContextProvider>
    </ReaderViewportContextProvider>
  );
}

function useRequiredContext<T>(
  contextValue: T | undefined,
  hookName: string,
): T {
  if (!contextValue) {
    throw new Error(`${hookName} must be used within a ReaderRuntimeProvider`);
  }

  return contextValue;
}

export function useReaderViewportContext(): ReaderViewportContextValue {
  return useRequiredContext(useContext(ReaderViewportContext), 'useReaderViewportContext');
}

export function useReaderContentRuntime(): ReaderContentRuntimeValue {
  return useRequiredContext(
    useContext(ReaderContentRuntimeContext),
    'useReaderContentRuntime',
  );
}

export function useReaderNavigationRuntime(): ReaderNavigationRuntimeValue {
  return useRequiredContext(
    useContext(ReaderNavigationRuntimeContext),
    'useReaderNavigationRuntime',
  );
}

export function useReaderLayoutQueries(): ReaderLayoutQueriesValue {
  return useRequiredContext(useContext(ReaderLayoutQueriesContext), 'useReaderLayoutQueries');
}

export function useReaderPersistenceRuntime(): ReaderPersistenceRuntimeValue {
  return useRequiredContext(
    useContext(ReaderPersistenceRuntimeContext),
    'useReaderPersistenceRuntime',
  );
}
