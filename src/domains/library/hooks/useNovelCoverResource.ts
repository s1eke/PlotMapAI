import { useEffect, useState } from 'react';

import {
  acquireNovelCoverResource,
  peekNovelCoverResource,
  releaseNovelCoverResource,
} from '../utils/novelCoverResourceCache';

export function useNovelCoverResource(novelId: number, enabled: boolean): string | null {
  const resourceKey = enabled && novelId > 0 ? `${novelId}` : '';
  const cachedUrl = resourceKey ? peekNovelCoverResource(novelId) : null;
  const [resourceState, setResourceState] = useState<{ key: string; url: string | null }>({
    key: '',
    url: null,
  });

  useEffect(() => {
    if (!enabled || !novelId) {
      return;
    }

    let cancelled = false;

    acquireNovelCoverResource(novelId)
      .then((nextUrl) => {
        if (!cancelled) {
          setResourceState({
            key: `${novelId}`,
            url: nextUrl,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResourceState({
            key: `${novelId}`,
            url: null,
          });
        }
      });

    return () => {
      cancelled = true;
      releaseNovelCoverResource(novelId);
    };
  }, [enabled, novelId]);

  if (cachedUrl !== undefined) {
    return cachedUrl;
  }

  return resourceState.key === resourceKey ? resourceState.url : null;
}
