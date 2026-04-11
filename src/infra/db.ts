import type { AnalysisTables } from './db/analysis';
import type { LibraryTables } from './db/library';
import type { ReaderTables } from './db/reader';
import type { SettingsTables } from './db/settings';

import Dexie from 'dexie';

import { AppErrorCode, createAppError } from '@shared/errors';
import { debugLog, reportAppError } from '@shared/debug';

import {
  DB_SCHEMA_MIGRATIONS,
  CURRENT_DB_SCHEMA_VERSION,
  registerDbSchemaMigrations,
  toNativeDatabaseVersion,
} from './migrations/dbSchema';

export const PLOTMAPAI_DB_NAME = 'PlotMapAI';

interface PlotMapAIDatabase
  extends Dexie, LibraryTables, SettingsTables, AnalysisTables, ReaderTables {}

const db = new Dexie(PLOTMAPAI_DB_NAME) as PlotMapAIDatabase;

registerDbSchemaMigrations(db);

const KNOWN_NATIVE_DATABASE_VERSIONS = new Set(
  DB_SCHEMA_MIGRATIONS.map((migration) => toNativeDatabaseVersion(migration.version)),
);
const KNOWN_STORE_SIGNATURES = new Set(
  DB_SCHEMA_MIGRATIONS.map((migration) => Object.keys(migration.stores).sort().join('|')),
);

function isLegacyDatabaseVersionError(error: unknown): boolean {
  return error instanceof Dexie.DexieError && error.name === Dexie.errnames.Version;
}

interface ExistingDatabaseInspection {
  nativeVersion: number;
  storeNames: string[];
}

function buildStoreSignature(storeNames: readonly string[]): string {
  return [...storeNames].sort().join('|');
}

async function inspectExistingDatabase(): Promise<ExistingDatabaseInspection | null> {
  if (!(await Dexie.exists(PLOTMAPAI_DB_NAME))) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PLOTMAPAI_DB_NAME);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const { result } = request;
      const inspection: ExistingDatabaseInspection = {
        nativeVersion: result.version,
        storeNames: Array.from(result.objectStoreNames),
      };
      result.close();
      resolve(inspection);
    };
  });
}

function createDatabaseRecoveryRequiredError(error: unknown) {
  return createAppError({
    code: AppErrorCode.DATABASE_RECOVERY_REQUIRED,
    kind: 'storage',
    source: 'storage',
    retryable: true,
    userMessageKey: 'errors.DATABASE_RECOVERY_REQUIRED',
    debugMessage: 'Detected an incompatible local database version that requires explicit recovery.',
    details: {
      databaseName: PLOTMAPAI_DB_NAME,
      errorName: error instanceof Dexie.DexieError ? error.name : 'unknown',
      legacyVersionError: isLegacyDatabaseVersionError(error),
      targetVersion: CURRENT_DB_SCHEMA_VERSION,
    },
    cause: error,
  });
}

function createDatabaseRecoveryRequiredErrorFromInspection(
  inspection: ExistingDatabaseInspection,
) {
  const installedSignature = buildStoreSignature(inspection.storeNames);
  const installedNativeVersion = inspection.nativeVersion;

  return createAppError({
    code: AppErrorCode.DATABASE_RECOVERY_REQUIRED,
    kind: 'storage',
    source: 'storage',
    retryable: true,
    userMessageKey: 'errors.DATABASE_RECOVERY_REQUIRED',
    debugMessage: 'Detected an incompatible local database layout that is outside the managed migration lineage.',
    details: {
      databaseName: PLOTMAPAI_DB_NAME,
      expectedNativeVersion: toNativeDatabaseVersion(CURRENT_DB_SCHEMA_VERSION),
      installedNativeVersion,
      installedStoreNames: inspection.storeNames,
      recognizedNativeVersion: KNOWN_NATIVE_DATABASE_VERSIONS.has(installedNativeVersion),
      recognizedStoreSignature: KNOWN_STORE_SIGNATURES.has(installedSignature),
      targetVersion: CURRENT_DB_SCHEMA_VERSION,
    },
  });
}

async function requireCompatibleDatabase(): Promise<void> {
  const inspection = await inspectExistingDatabase();
  if (!inspection) {
    return;
  }

  if (
    !KNOWN_NATIVE_DATABASE_VERSIONS.has(inspection.nativeVersion)
    || !KNOWN_STORE_SIGNATURES.has(buildStoreSignature(inspection.storeNames))
  ) {
    const recoveryError = createDatabaseRecoveryRequiredErrorFromInspection(inspection);
    debugLog('Storage', 'Database recovery required', recoveryError.details ?? {});
    reportAppError(recoveryError);
    throw recoveryError;
  }
}

export async function resetDatabaseForRecovery(): Promise<void> {
  db.close();
  await Dexie.delete(PLOTMAPAI_DB_NAME);
}

export async function prepareDatabase(): Promise<void> {
  if (db.isOpen()) {
    return;
  }

  await requireCompatibleDatabase();

  try {
    await db.open();
  } catch (error) {
    if (!isLegacyDatabaseVersionError(error)) {
      throw error;
    }

    const recoveryError = createDatabaseRecoveryRequiredError(error);
    debugLog('Storage', 'Database recovery required', recoveryError.details ?? {});
    reportAppError(recoveryError);
    throw recoveryError;
  }
}

export { db };
