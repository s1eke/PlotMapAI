import type { DbSchemaMigration } from './types';

import Dexie from 'dexie';

import { ANALYSIS_DB_SCHEMA } from '@infra/db/analysis';
import { LIBRARY_DB_SCHEMA } from '@infra/db/library';
import { READER_DB_SCHEMA } from '@infra/db/reader';
import { SETTINGS_DB_SCHEMA } from '@infra/db/settings';

const CURRENT_DB_SCHEMA = {
  ...LIBRARY_DB_SCHEMA,
  ...SETTINGS_DB_SCHEMA,
  ...ANALYSIS_DB_SCHEMA,
  ...READER_DB_SCHEMA,
} as const;

export const DB_SCHEMA_MIGRATIONS: readonly DbSchemaMigration[] = [{
  version: 5,
  scope: 'db-schema',
  description: 'Current PlotMapAI schema baseline with structured chapter content and reader cache storage.',
  retireWhen: {
    condition: 'Current supported schema baseline.',
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
