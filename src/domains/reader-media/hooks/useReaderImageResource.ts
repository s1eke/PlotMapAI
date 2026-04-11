import { useEffect, useState } from 'react';
import { useReaderContentRuntime } from '@shared/reader-runtime';

import {
  acquireReaderImageResource,
  peekReaderImageResource,
  releaseReaderImageResource,
} from '../utils/readerImageResourceCache';

export function useReaderImageResource(novelId: number, imageKey: string): string | null {
  const readerContentRuntime = useReaderContentRuntime();
  const resourceKey = novelId > 0 && imageKey ? `${novelId}:${imageKey}` : '';
  const cachedUrl = resourceKey ? peekReaderImageResource(novelId, imageKey) : null;
  const [resourceState, setResourceState] = useState<{ key: string; url: string | null }>({
    key: '',
    url: null,
  });

  useEffect(() => {
    if (!novelId || !imageKey) {
      return;
    }

    let cancelled = false;

    acquireReaderImageResource(readerContentRuntime, novelId, imageKey).then((nextUrl) => {
      if (!cancelled) {
        setResourceState({
          key: `${novelId}:${imageKey}`,
          url: nextUrl,
        });
      }
    }).catch(() => {
      if (!cancelled) {
        setResourceState({
          key: `${novelId}:${imageKey}`,
          url: null,
        });
      }
    });

    return () => {
      cancelled = true;
      releaseReaderImageResource(novelId, imageKey);
    };
  }, [imageKey, novelId, readerContentRuntime]);

  if (cachedUrl !== undefined) {
    return cachedUrl;
  }

  return resourceState.key === resourceKey ? resourceState.url : null;
}
