import { APP_SETTING_KEYS, SECURE_KEYS, storage } from '@infra/storage';
import { DEFAULT_ANALYSIS_PROVIDER_ID, isAnalysisProviderId } from '@shared/contracts';

import type { StorageMigration } from './types';

const STORAGE_MIGRATION_LEDGER_KEY = 'infra.storageMigrations';
const LEGACY_AI_CONFIG_CACHE_KEY = 'plotmapai_ai_config';
const LEGACY_AI_API_KEY = 'plotmapai_encrypted_api_key';

interface StoredAiConfigRecord {
  providerId: string;
  apiBaseUrl: string;
  modelName: string;
  contextSize: number;
}

interface StorageMigrationLedger {
  completedIds: string[];
  updatedAt: string;
}

function isStorageMigrationLedger(value: unknown): value is StorageMigrationLedger {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const parsed = value as Record<string, unknown>;
  return Array.isArray(parsed.completedIds)
    && typeof parsed.updatedAt === 'string';
}

function sanitizeAiConfigRecord(raw: unknown): StoredAiConfigRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const parsed = raw as Record<string, unknown>;
  if (
    typeof parsed.apiBaseUrl !== 'string'
    || typeof parsed.modelName !== 'string'
    || typeof parsed.contextSize !== 'number'
  ) {
    return null;
  }

  return {
    providerId: isAnalysisProviderId(parsed.providerId)
      ? parsed.providerId
      : DEFAULT_ANALYSIS_PROVIDER_ID,
    apiBaseUrl: parsed.apiBaseUrl,
    modelName: parsed.modelName,
    contextSize: parsed.contextSize,
  };
}

async function readMigrationLedger(): Promise<StorageMigrationLedger> {
  const stored = await storage.primary.settings.get<StorageMigrationLedger>(
    STORAGE_MIGRATION_LEDGER_KEY,
  );
  if (isStorageMigrationLedger(stored)) {
    return stored;
  }

  return {
    completedIds: [],
    updatedAt: new Date(0).toISOString(),
  };
}

async function markMigrationCompleted(id: string): Promise<void> {
  const ledger = await readMigrationLedger();
  if (ledger.completedIds.includes(id)) {
    return;
  }

  await storage.primary.settings.set(STORAGE_MIGRATION_LEDGER_KEY, {
    completedIds: [...ledger.completedIds, id],
    updatedAt: new Date().toISOString(),
  } satisfies StorageMigrationLedger);
}

async function migrateLegacyAiConfigStorage(): Promise<void> {
  const raw = storage.cache.getString(LEGACY_AI_CONFIG_CACHE_KEY);
  if (raw) {
    try {
      const parsed = sanitizeAiConfigRecord(JSON.parse(raw) as unknown);
      if (parsed) {
        await storage.primary.settings.set(APP_SETTING_KEYS.aiConfig, parsed);
      }
    } catch {
      // Ignore malformed legacy payloads and clear them below.
    }
  }

  storage.cache.remove(LEGACY_AI_CONFIG_CACHE_KEY);

  const legacyApiKey = await storage.secure.get(LEGACY_AI_API_KEY);
  if (legacyApiKey !== null) {
    await storage.secure.set(SECURE_KEYS.aiApiKey, legacyApiKey);
  }
  await storage.secure.remove(LEGACY_AI_API_KEY);
}

const STORAGE_MIGRATIONS: StorageMigration[] = [{
  id: 'storage.ai-config.v1',
  introducedIn: '1.1.0',
  removeByVersion: '1.2.0',
  run: migrateLegacyAiConfigStorage,
}];

export async function runStorageMigrations(): Promise<void> {
  const ledger = await readMigrationLedger();
  const completedIds = new Set(ledger.completedIds);

  for (const migration of STORAGE_MIGRATIONS) {
    if (completedIds.has(migration.id)) {
      continue;
    }

    await migration.run();
    await markMigrationCompleted(migration.id);
    completedIds.add(migration.id);
  }
}
