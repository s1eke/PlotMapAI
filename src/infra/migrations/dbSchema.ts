import type { ChapterRecord, NovelRecord } from '@infra/db/library';
import type { DbSchemaMigration } from './types';

import Dexie, { type Transaction } from 'dexie';

import { ANALYSIS_DB_SCHEMA } from '@infra/db/analysis';
import {
  LEGACY_LIBRARY_DB_SCHEMA,
  LIBRARY_DB_SCHEMA,
} from '@infra/db/library';
import { READER_DB_SCHEMA } from '@infra/db/reader';
import { SETTINGS_DB_SCHEMA } from '@infra/db/settings';

const LEGACY_BASELINE_DB_SCHEMA = {
  ...LEGACY_LIBRARY_DB_SCHEMA,
  ...SETTINGS_DB_SCHEMA,
  ...ANALYSIS_DB_SCHEMA,
  ...READER_DB_SCHEMA,
} as const;

const CURRENT_DB_SCHEMA = {
  ...LIBRARY_DB_SCHEMA,
  ...SETTINGS_DB_SCHEMA,
  ...ANALYSIS_DB_SCHEMA,
  ...READER_DB_SCHEMA,
} as const;

interface LegacyNovelRecord extends Omit<NovelRecord, 'chapterCount'> {
  chapterCount?: number;
}

function buildChapterCountMap(chapters: ChapterRecord[]): Map<number, number> {
  return chapters.reduce<Map<number, number>>((counts, chapter) => {
    counts.set(chapter.novelId, (counts.get(chapter.novelId) ?? 0) + 1);
    return counts;
  }, new Map());
}

async function backfillNovelChapterCounts(transaction: Transaction): Promise<void> {
  const chapters = await transaction.table<ChapterRecord, 'id'>('chapters').toArray();
  const chapterCounts = buildChapterCountMap(chapters);

  await transaction
    .table<LegacyNovelRecord, 'id'>('novels')
    .toCollection()
    .modify((novel: LegacyNovelRecord) => {
      const legacyNovel = novel;
      legacyNovel.chapterCount = chapterCounts.get(legacyNovel.id) ?? 0;
    });
}

export const DB_SCHEMA_MIGRATIONS: readonly DbSchemaMigration[] = [{
  version: 1,
  scope: 'db-schema',
  description: 'Initial PlotMapAI local-first database schema baseline.',
  retireWhen: {
    condition: 'Keep while any supported client may still open a version 1 database.',
  },
  stores: LEGACY_BASELINE_DB_SCHEMA,
}, {
  version: 2,
  scope: 'db-schema',
  description: 'Backfill novel chapterCount from chapters for legacy version 1 novels.',
  retireWhen: {
    condition: 'Remove once version 1 databases are no longer supported in the field.',
  },
  stores: LEGACY_BASELINE_DB_SCHEMA,
  upgrade: backfillNovelChapterCounts,
}, {
  version: 3,
  scope: 'db-schema',
  description: 'Add chapterRichContents for structured rich chapter storage.',
  retireWhen: {
    condition: 'Keep while any supported client may still open a version 2 database.',
  },
  stores: CURRENT_DB_SCHEMA,
}] as const;

export const CURRENT_DB_SCHEMA_VERSION = DB_SCHEMA_MIGRATIONS.at(-1)?.version ?? 1;

export function toNativeDatabaseVersion(version: number): number {
  return Math.round(version * 10);
}

export function registerDbSchemaMigrations(database: Dexie): void {
  for (const migration of DB_SCHEMA_MIGRATIONS) {
    const version = database.version(migration.version).stores(migration.stores);
    if (migration.upgrade) {
      version.upgrade(migration.upgrade);
    }
  }
}
