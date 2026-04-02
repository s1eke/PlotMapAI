/* eslint-disable react-refresh/only-export-components */

import type { ReactNode } from 'react';
import type { ChapterContent } from '../readerContentService';
import type { ChapterChangeSource } from '../hooks/navigationTypes';
import type { ScrollModeAnchor } from '../hooks/useScrollModeChapters';
import type { PageTarget } from '../hooks/readerSessionTypes';
import type { ReaderLocator } from '../utils/readerLayout';

import { createContext, useContext, useMemo, useRef } from 'react';

type RestoreSettledResult = 'completed' | 'skipped' | 'failed';

export interface ReaderUiBridgeValue {
  contentRef: React.RefObject<HTMLDivElement | null>;
  pagedViewportRef: React.RefObject<HTMLDivElement | null>;
  pageTargetRef: React.MutableRefObject<PageTarget | null>;
  wheelDeltaRef: React.MutableRefObject<number>;
  pageTurnLockedRef: React.MutableRefObject<boolean>;
  chapterCacheRef: React.MutableRefObject<Map<number, ChapterContent>>;
  scrollChapterElementsBridgeRef: React.MutableRefObject<Map<number, HTMLDivElement>>;
  scrollChapterBodyElementsBridgeRef: React.MutableRefObject<Map<number, HTMLDivElement>>;
  chapterChangeSourceRef: React.MutableRefObject<ChapterChangeSource>;
  pagedStateRef: React.MutableRefObject<{ pageCount: number; pageIndex: number }>;
  restoreSettledHandlerRef: React.MutableRefObject<(result: RestoreSettledResult) => void>;
  isScrollSyncSuppressedRef: React.MutableRefObject<boolean>;
  suppressScrollSyncTemporarilyRef: React.MutableRefObject<() => void>;
  getCurrentAnchorRef: React.MutableRefObject<() => ScrollModeAnchor | null>;
  getCurrentOriginalLocatorRef: React.MutableRefObject<() => ReaderLocator | null>;
  getCurrentPagedLocatorRef: React.MutableRefObject<() => ReaderLocator | null>;
  resolveScrollLocatorOffsetRef: React.MutableRefObject<
    (locator: ReaderLocator) => number | null
  >;
}

const ReaderUiBridgeContext = createContext<ReaderUiBridgeValue | undefined>(undefined);

interface ReaderUiBridgeProviderProps {
  children: ReactNode;
}

interface ReaderUiBridgeContextProviderProps {
  children: ReactNode;
  value: ReaderUiBridgeValue;
}

export function ReaderUiBridgeContextProvider({
  children,
  value,
}: ReaderUiBridgeContextProviderProps) {
  return (
    <ReaderUiBridgeContext.Provider value={value}>
      {children}
    </ReaderUiBridgeContext.Provider>
  );
}

export function ReaderUiBridgeProvider({
  children,
}: ReaderUiBridgeProviderProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const pagedViewportRef = useRef<HTMLDivElement>(null);
  const pageTargetRef = useRef<PageTarget | null>(null);
  const wheelDeltaRef = useRef(0);
  const pageTurnLockedRef = useRef(false);
  const chapterCacheRef = useRef<Map<number, ChapterContent>>(new Map());
  const scrollChapterElementsBridgeRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollChapterBodyElementsBridgeRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const chapterChangeSourceRef = useRef<ChapterChangeSource>(null);
  const pagedStateRef = useRef({ pageCount: 1, pageIndex: 0 });
  const restoreSettledHandlerRef = useRef<(result: RestoreSettledResult) => void>(() => {});
  const isScrollSyncSuppressedRef = useRef(false);
  const suppressScrollSyncTemporarilyRef = useRef<() => void>(() => {});
  const getCurrentAnchorRef = useRef<() => ScrollModeAnchor | null>(() => null);
  const getCurrentOriginalLocatorRef = useRef<() => ReaderLocator | null>(() => null);
  const getCurrentPagedLocatorRef = useRef<() => ReaderLocator | null>(() => null);
  const resolveScrollLocatorOffsetRef = useRef<
    (locator: ReaderLocator) => number | null
      >(() => null);

  const value = useMemo<ReaderUiBridgeValue>(() => ({
    contentRef,
    pagedViewportRef,
    pageTargetRef,
    wheelDeltaRef,
    pageTurnLockedRef,
    chapterCacheRef,
    scrollChapterElementsBridgeRef,
    scrollChapterBodyElementsBridgeRef,
    chapterChangeSourceRef,
    pagedStateRef,
    restoreSettledHandlerRef,
    isScrollSyncSuppressedRef,
    suppressScrollSyncTemporarilyRef,
    getCurrentAnchorRef,
    getCurrentOriginalLocatorRef,
    getCurrentPagedLocatorRef,
    resolveScrollLocatorOffsetRef,
  }), []);

  return (
    <ReaderUiBridgeContextProvider value={value}>
      {children}
    </ReaderUiBridgeContextProvider>
  );
}

export function useReaderUiBridge(): ReaderUiBridgeValue {
  const context = useContext(ReaderUiBridgeContext);
  if (!context) {
    throw new Error('useReaderUiBridge must be used within a ReaderUiBridgeProvider');
  }

  return context;
}
