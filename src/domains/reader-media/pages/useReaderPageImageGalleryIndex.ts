import type { MutableRefObject } from 'react';
import type { ReaderImageGalleryEntry } from '@shared/contracts/reader';

import { startTransition, useCallback, useEffect, useRef, useState } from 'react';

import { useReaderContentRuntime } from '@shared/reader-runtime';

interface UseReaderPageImageGalleryIndexResult {
  entries: ReaderImageGalleryEntry[];
  entriesRef: MutableRefObject<ReaderImageGalleryEntry[]>;
  ensureImageGalleryEntriesLoaded: () => Promise<boolean>;
  isIndexLoading: boolean;
  isIndexResolved: boolean;
}

export function useReaderPageImageGalleryIndex(
  novelId: number,
): UseReaderPageImageGalleryIndexResult {
  const readerContentRuntime = useReaderContentRuntime();
  const [entries, setEntries] = useState<ReaderImageGalleryEntry[]>([]);
  const [isIndexResolved, setIsIndexResolved] = useState(false);
  const [isIndexLoading, setIsIndexLoading] = useState(false);

  const entriesRef = useRef<ReaderImageGalleryEntry[]>([]);
  const imageGalleryIndexLoadTokenRef = useRef(0);
  const imageGalleryIndexPromiseRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    entriesRef.current = [];
    imageGalleryIndexLoadTokenRef.current += 1;
    imageGalleryIndexPromiseRef.current = null;
    startTransition(() => {
      setEntries([]);
      setIsIndexLoading(false);
      setIsIndexResolved(false);
    });
  }, [novelId]);

  useEffect(() => () => {
    imageGalleryIndexLoadTokenRef.current += 1;
    imageGalleryIndexPromiseRef.current = null;
  }, []);

  const ensureImageGalleryEntriesLoaded = useCallback(async (): Promise<boolean> => {
    if (isIndexResolved) {
      return true;
    }

    const existingPromise = imageGalleryIndexPromiseRef.current;
    if (existingPromise) {
      return existingPromise;
    }

    const loadToken = imageGalleryIndexLoadTokenRef.current;
    setIsIndexLoading(true);

    const loadPromise = readerContentRuntime.getImageGalleryEntries(novelId)
      .then((loadedEntries) => {
        if (imageGalleryIndexLoadTokenRef.current !== loadToken) {
          return false;
        }

        entriesRef.current = loadedEntries;
        setEntries(loadedEntries);
        setIsIndexResolved(true);
        return true;
      })
      .catch(() => false);

    const trackedPromise = loadPromise.finally(() => {
      if (imageGalleryIndexPromiseRef.current === trackedPromise) {
        imageGalleryIndexPromiseRef.current = null;
      }
      if (imageGalleryIndexLoadTokenRef.current === loadToken) {
        setIsIndexLoading(false);
      }
    });

    imageGalleryIndexPromiseRef.current = trackedPromise;
    return trackedPromise;
  }, [isIndexResolved, novelId, readerContentRuntime]);

  return {
    entries,
    entriesRef,
    ensureImageGalleryEntriesLoaded,
    isIndexLoading,
    isIndexResolved,
  };
}
