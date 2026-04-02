import { db } from '@infra/db';

import { clearReaderRenderCacheMemoryForNovel } from './utils/readerRenderCache';

export async function deleteReaderArtifacts(novelId: number): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.readingProgress,
      db.readerRenderCache,
    ],
    async () => {
      await db.readingProgress.where('novelId').equals(novelId).delete();
      await db.readerRenderCache.where('novelId').equals(novelId).delete();
    },
  );

  clearReaderRenderCacheMemoryForNovel(novelId);
}
