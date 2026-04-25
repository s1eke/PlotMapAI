import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { PageTarget, ReaderNavigationRuntimeValue } from '@shared/contracts/reader';

interface UsePagedReaderDisabledResetParams {
  enabled: boolean;
  lastPersistedPagedPageIndexRef: MutableRefObject<number | null>;
  navigation: Pick<
    ReaderNavigationRuntimeValue,
    'setPagedState' | 'setPendingPageIndex' | 'setPendingPageTarget'
  >;
  pagedContentRef: MutableRefObject<HTMLDivElement | null>;
  pagedViewportRef: MutableRefObject<HTMLDivElement | null>;
  setPageCount: Dispatch<SetStateAction<number>>;
  setPageIndex: Dispatch<SetStateAction<number>>;
  setPagedContentElement: Dispatch<SetStateAction<HTMLDivElement | null>>;
  setPagedViewportElement: Dispatch<SetStateAction<HTMLDivElement | null>>;
  setPendingPageTarget: Dispatch<SetStateAction<PageTarget | null>>;
}

export function usePagedReaderDisabledReset({
  enabled,
  lastPersistedPagedPageIndexRef,
  navigation,
  pagedContentRef,
  pagedViewportRef,
  setPageCount,
  setPageIndex,
  setPagedContentElement,
  setPagedViewportElement,
  setPendingPageTarget,
}: UsePagedReaderDisabledResetParams): void {
  useEffect(() => {
    const contentRef = pagedContentRef;
    const lastPersistedRef = lastPersistedPagedPageIndexRef;
    const viewportRef = pagedViewportRef;
    if (enabled) {
      return;
    }

    setPageIndex(0);
    setPageCount(1);
    setPendingPageTarget(null);
    navigation.setPendingPageIndex(null);
    navigation.setPendingPageTarget(null);
    navigation.setPagedState({ pageCount: 1, pageIndex: 0 });
    viewportRef.current = null;
    contentRef.current = null;
    lastPersistedRef.current = null;
    setPagedContentElement(null);
    setPagedViewportElement(null);
  }, [
    enabled,
    lastPersistedPagedPageIndexRef,
    navigation,
    pagedContentRef,
    pagedViewportRef,
    setPageCount,
    setPageIndex,
    setPagedContentElement,
    setPagedViewportElement,
    setPendingPageTarget,
  ]);
}
