import type { DbSchemaMigration } from './types';

import Dexie from 'dexie';

import { ANALYSIS_DB_SCHEMA } from '@infra/db/analysis';
import { LIBRARY_DB_SCHEMA } from '@infra/db/library';
import { READER_DB_SCHEMA } from '@infra/db/reader';
import { SETTINGS_DB_SCHEMA } from '@infra/db/settings';

const DB_SCHEMA_V7 = {
  ...LIBRARY_DB_SCHEMA,
  ...SETTINGS_DB_SCHEMA,
  ...ANALYSIS_DB_SCHEMA,
  readingProgress: '++id, novelId',
  readerProgress: READER_DB_SCHEMA.readerProgress,
  readerRenderCache: READER_DB_SCHEMA.readerRenderCache,
} as const;

const DB_SCHEMA_V8 = {
  ...LIBRARY_DB_SCHEMA,
  ...SETTINGS_DB_SCHEMA,
  ...ANALYSIS_DB_SCHEMA,
  readerProgress: READER_DB_SCHEMA.readerProgress,
  readerRenderCache: READER_DB_SCHEMA.readerRenderCache,
  readingProgress: null,
} as const;

const CURRENT_DB_SCHEMA = {
  ...LIBRARY_DB_SCHEMA,
  ...SETTINGS_DB_SCHEMA,
  ...ANALYSIS_DB_SCHEMA,
  ...READER_DB_SCHEMA,
} as const;

const DB_SCHEMA_V9 = {
  ...CURRENT_DB_SCHEMA,
  readingProgress: null,
} as const;

export const DB_SCHEMA_MIGRATIONS: readonly DbSchemaMigration[] = [{
  version: 7,
  scope: 'db-schema',
  description: 'Reader progress core baseline with dedicated readerProgress storage and cleared legacy progress snapshots.',
  retireWhen: {
    condition: 'Superseded by v8 schema without legacy reader progress storage.',
  },
  stores: DB_SCHEMA_V7,
}, {
  version: 8,
  scope: 'db-schema',
  description: 'Reader progress core baseline without legacy readingProgress storage.',
  retireWhen: {
    condition: 'Superseded by v9 schema with persisted reader pretext metrics.',
  },
  stores: DB_SCHEMA_V8,
}, {
  version: 9,
  scope: 'db-schema',
  description: 'Persisted reader pretext metrics cache for shared original manifest derivation.',
  retireWhen: {
    condition: 'Current supported schema baseline.',
  },
  stores: DB_SCHEMA_V9,
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
