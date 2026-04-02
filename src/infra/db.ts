import Dexie from 'dexie';

import { ANALYSIS_DB_SCHEMA, type AnalysisTables } from './db/analysis';
import { LIBRARY_DB_SCHEMA, type LibraryTables } from './db/library';
import { READER_DB_SCHEMA, type ReaderTables } from './db/reader';
import { SETTINGS_DB_SCHEMA, type SettingsTables } from './db/settings';

export const PLOTMAPAI_DB_NAME = 'PlotMapAI';
const CURRENT_DB_VERSION = 1;

const CURRENT_SCHEMA = {
  ...LIBRARY_DB_SCHEMA,
  ...SETTINGS_DB_SCHEMA,
  ...ANALYSIS_DB_SCHEMA,
  ...READER_DB_SCHEMA,
} as const;

interface PlotMapAIDatabase
  extends Dexie, LibraryTables, SettingsTables, AnalysisTables, ReaderTables {}

const db = new Dexie(PLOTMAPAI_DB_NAME) as PlotMapAIDatabase;

db.version(CURRENT_DB_VERSION).stores(CURRENT_SCHEMA);

function isLegacyDatabaseVersionError(error: unknown): boolean {
  return error instanceof Dexie.DexieError && error.name === Dexie.errnames.Version;
}

async function clearLegacyDatabase(): Promise<void> {
  db.close();
  await db.delete();
}

export async function prepareDatabase(): Promise<void> {
  if (db.isOpen()) {
    return;
  }

  try {
    await db.open();
  } catch (error) {
    if (!isLegacyDatabaseVersionError(error)) {
      throw error;
    }

    await clearLegacyDatabase();
    await db.open();
  }
}

export { db };
