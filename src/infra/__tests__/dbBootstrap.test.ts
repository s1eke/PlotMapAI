import { beforeEach, describe, expect, it } from 'vitest';

import { db, PLOTMAPAI_DB_NAME, prepareDatabase } from '@infra/db';

function createLegacyDatabase(version: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PLOTMAPAI_DB_NAME, version);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('legacyStore')) {
        request.result.createObjectStore('legacyStore');
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
}

describe('prepareDatabase', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    localStorage.clear();
  });

  it('opens the formal v1 baseline schema in a fresh environment', async () => {
    await prepareDatabase();

    expect(db.verno).toBe(1);
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'analysisChunks',
      'analysisJobs',
      'analysisOverviews',
      'appSettings',
      'chapterAnalyses',
      'chapterImages',
      'chapters',
      'coverImages',
      'novelImageGalleryEntries',
      'novels',
      'purificationRules',
      'readerRenderCache',
      'readingProgress',
      'tocRules',
    ]);
  });

  it('deletes a legacy same-name database and recreates the v1 baseline', async () => {
    await createLegacyDatabase(9);

    await prepareDatabase();

    expect(db.verno).toBe(1);
    expect(db.tables.some((table) => table.name === 'legacyStore')).toBe(false);
    expect(db.tables.some((table) => table.name === 'novels')).toBe(true);
  });
});
