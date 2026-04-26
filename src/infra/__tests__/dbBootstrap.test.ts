import Dexie from 'dexie';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '@shared/errors';

const { mockDebugLog, mockReportAppError } = vi.hoisted(() => ({
  mockDebugLog: vi.fn(),
  mockReportAppError: vi.fn(),
}));

vi.mock('@shared/debug', () => ({
  debugLog: mockDebugLog,
  reportAppError: mockReportAppError,
}));

import {
  db,
  PLOTMAPAI_DB_NAME,
  prepareDatabase,
  resetDatabaseForRecovery,
} from '@infra/db';
import { ANALYSIS_DB_SCHEMA } from '@infra/db/analysis';
import { LEGACY_LIBRARY_DB_SCHEMA, LIBRARY_DB_SCHEMA } from '@infra/db/library';
import { READER_DB_SCHEMA } from '@infra/db/reader';
import { SETTINGS_DB_SCHEMA } from '@infra/db/settings';

const LEGACY_READER_DB_SCHEMA_V5 = {
  readingProgress: '++id, novelId',
  readerRenderCache: READER_DB_SCHEMA.readerRenderCache,
} as const;

const LEGACY_READER_DB_SCHEMA_V7 = {
  readingProgress: '++id, novelId',
  readerProgress: READER_DB_SCHEMA.readerProgress,
  readerRenderCache: READER_DB_SCHEMA.readerRenderCache,
} as const;

const LEGACY_BASELINE_SCHEMA = {
  ...LEGACY_LIBRARY_DB_SCHEMA,
  ...SETTINGS_DB_SCHEMA,
  ...ANALYSIS_DB_SCHEMA,
  ...LEGACY_READER_DB_SCHEMA_V5,
} as const;

const MANAGED_V6_SCHEMA = {
  ...LIBRARY_DB_SCHEMA,
  ...SETTINGS_DB_SCHEMA,
  ...ANALYSIS_DB_SCHEMA,
  readingProgress: '++id, novelId',
  readerRenderCache: READER_DB_SCHEMA.readerRenderCache,
} as const;

const MANAGED_V7_SCHEMA = {
  ...LIBRARY_DB_SCHEMA,
  ...SETTINGS_DB_SCHEMA,
  ...ANALYSIS_DB_SCHEMA,
  ...LEGACY_READER_DB_SCHEMA_V7,
} as const;

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

async function createVersionOneDatabaseWithLegacyNovel(): Promise<void> {
  const legacyDb = new Dexie(PLOTMAPAI_DB_NAME);
  legacyDb.version(1).stores(LEGACY_BASELINE_SCHEMA);
  await legacyDb.open();

  const novelId = await legacyDb.table('novels').add({
    author: '',
    coverPath: '',
    createdAt: '2026-04-01T00:00:00.000Z',
    description: '',
    fileHash: 'legacy-db-hash',
    fileType: 'txt',
    originalEncoding: 'utf-8',
    originalFilename: 'legacy-db.txt',
    tags: [],
    title: 'Legacy DB Novel',
    totalWords: 200,
  });
  await legacyDb.table('chapters').bulkAdd([
    {
      chapterIndex: 0,
      content: 'Chapter one',
      novelId,
      title: 'Chapter 1',
      wordCount: 11,
    },
    {
      chapterIndex: 1,
      content: 'Chapter two',
      novelId,
      title: 'Chapter 2',
      wordCount: 11,
    },
  ]);

  legacyDb.close();
}

async function createVersionTwoDatabaseWithPlainNovel(): Promise<void> {
  const legacyDb = new Dexie(PLOTMAPAI_DB_NAME);
  legacyDb.version(2).stores(LEGACY_BASELINE_SCHEMA);
  await legacyDb.open();

  const novelId = await legacyDb.table('novels').add({
    author: '',
    chapterCount: 1,
    coverPath: '',
    createdAt: '2026-04-02T00:00:00.000Z',
    description: '',
    fileHash: 'legacy-v2-hash',
    fileType: 'txt',
    originalEncoding: 'utf-8',
    originalFilename: 'legacy-v2.txt',
    tags: [],
    title: 'Legacy V2 Novel',
    totalWords: 100,
  });
  await legacyDb.table('chapters').add({
    chapterIndex: 0,
    content: 'Plain chapter only',
    novelId,
    title: 'Chapter 1',
    wordCount: 17,
  });

  legacyDb.close();
}

async function createVersionSixDatabaseWithReaderProgress(): Promise<number> {
  const legacyDb = new Dexie(PLOTMAPAI_DB_NAME);
  legacyDb.version(6).stores(MANAGED_V6_SCHEMA);
  await legacyDb.open();

  const novelId = await legacyDb.table('novels').add({
    author: '',
    chapterCount: 1,
    coverPath: '',
    createdAt: '2026-04-03T00:00:00.000Z',
    description: '',
    fileHash: 'legacy-v5-hash',
    fileType: 'txt',
    originalEncoding: 'utf-8',
    originalFilename: 'legacy-v5.txt',
    tags: [],
    title: 'Legacy V5 Novel',
    totalWords: 100,
  });
  await legacyDb.table('readingProgress').add({
    novelId,
    canonical: {
      chapterIndex: 4,
      edge: 'start',
    },
    chapterProgress: 0.55,
    contentMode: 'paged',
    viewMode: 'summary',
    revision: 3,
    updatedAt: '2026-04-03T00:00:00.000Z',
  });

  legacyDb.close();
  return novelId as number;
}

async function createVersionSevenDatabaseWithReaderProgress(): Promise<number> {
  const legacyDb = new Dexie(PLOTMAPAI_DB_NAME);
  legacyDb.version(7).stores(MANAGED_V7_SCHEMA);
  await legacyDb.open();

  const novelId = await legacyDb.table('novels').add({
    author: '',
    chapterCount: 1,
    coverPath: '',
    createdAt: '2026-04-04T00:00:00.000Z',
    description: '',
    fileHash: 'managed-v7-hash',
    fileType: 'txt',
    originalEncoding: 'utf-8',
    originalFilename: 'managed-v7.txt',
    tags: [],
    title: 'Managed V7 Novel',
    totalWords: 100,
  });
  await legacyDb.table('readingProgress').add({
    novelId,
    canonical: {
      chapterIndex: 4,
      edge: 'start',
    },
    chapterProgress: 0.55,
    contentMode: 'paged',
    viewMode: 'summary',
    revision: 3,
    updatedAt: '2026-04-04T00:00:00.000Z',
  });
  await legacyDb.table('readerProgress').put({
    novelId,
    mode: 'scroll',
    activeChapterIndex: 2,
    position: {
      type: 'chapter-edge',
      chapterIndex: 2,
      edge: 'start',
    },
    captureQuality: 'approximate',
    updatedAt: '2026-04-04T00:00:00.000Z',
  });

  legacyDb.close();
  return novelId as number;
}

function readObjectStoreNames(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PLOTMAPAI_DB_NAME);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const names = Array.from(request.result.objectStoreNames);
      request.result.close();
      resolve(names);
    };
  });
}

describe('prepareDatabase', () => {
  beforeEach(async () => {
    db.close();
    await Dexie.delete(PLOTMAPAI_DB_NAME);
    localStorage.clear();
    mockDebugLog.mockReset();
    mockReportAppError.mockReset();
  });

  it('opens the formal v9 baseline schema in a fresh environment', async () => {
    await prepareDatabase();

    expect(db.verno).toBe(9);
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'analysisChunks',
      'analysisJobs',
      'analysisOverviews',
      'appSettings',
      'chapterAnalyses',
      'chapterImages',
      'chapterRichContents',
      'chapters',
      'coverImages',
      'novelImageGalleryEntries',
      'novels',
      'purificationRules',
      'readerPretextMetrics',
      'readerProgress',
      'readerRenderCache',
      'tocRules',
    ]);
  });

  it('requires explicit recovery for an incompatible same-name database', async () => {
    await createLegacyDatabase(9);

    await expect(prepareDatabase()).rejects.toMatchObject({
      code: AppErrorCode.DATABASE_RECOVERY_REQUIRED,
    });

    await expect(readObjectStoreNames()).resolves.toContain('legacyStore');
    expect(mockDebugLog).toHaveBeenCalledWith('Storage', 'Database recovery required', expect.objectContaining({
      databaseName: PLOTMAPAI_DB_NAME,
      expectedNativeVersion: 90,
      targetVersion: 9,
    }));
    expect(mockReportAppError).toHaveBeenCalledTimes(1);
  });

  it('deletes an incompatible database only after explicit recovery and recreates the baseline', async () => {
    await createLegacyDatabase(9);
    await expect(prepareDatabase()).rejects.toMatchObject({
      code: AppErrorCode.DATABASE_RECOVERY_REQUIRED,
    });

    await resetDatabaseForRecovery();
    await prepareDatabase();

    expect(db.verno).toBe(9);
    expect(db.tables.some((table) => table.name === 'legacyStore')).toBe(false);
    expect(db.tables.some((table) => table.name === 'novels')).toBe(true);
  });

  it('migrates v7 databases to v9 and drops only legacy reader progress storage', async () => {
    const novelId = await createVersionSevenDatabaseWithReaderProgress();

    await prepareDatabase();

    expect(db.verno).toBe(9);
    await expect(db.novels.get(novelId)).resolves.toBeDefined();
    await expect(db.readerProgress.get(novelId)).resolves.toMatchObject({
      activeChapterIndex: 2,
    });
    await expect(readObjectStoreNames()).resolves.toContain('readerPretextMetrics');
    await expect(readObjectStoreNames()).resolves.not.toContain('readingProgress');
  });

  it('requires explicit recovery for legacy v6 databases', async () => {
    await createVersionSixDatabaseWithReaderProgress();

    await expect(prepareDatabase()).rejects.toMatchObject({
      code: AppErrorCode.DATABASE_RECOVERY_REQUIRED,
      details: expect.objectContaining({
        installedNativeVersion: 60,
        recognizedNativeVersion: false,
        targetVersion: 9,
      }),
    });
  });

  it('requires explicit recovery for legacy v1 databases', async () => {
    await createVersionOneDatabaseWithLegacyNovel();

    await expect(prepareDatabase()).rejects.toMatchObject({
      code: AppErrorCode.DATABASE_RECOVERY_REQUIRED,
      details: expect.objectContaining({
        installedNativeVersion: 10,
        recognizedNativeVersion: false,
        targetVersion: 9,
      }),
    });
  });

  it('requires explicit recovery for legacy v2 plain-only databases', async () => {
    await createVersionTwoDatabaseWithPlainNovel();

    await expect(prepareDatabase()).rejects.toMatchObject({
      code: AppErrorCode.DATABASE_RECOVERY_REQUIRED,
      details: expect.objectContaining({
        installedNativeVersion: 20,
        recognizedNativeVersion: false,
        targetVersion: 9,
      }),
    });
  });
});
