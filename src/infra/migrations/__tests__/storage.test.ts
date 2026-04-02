import { beforeEach, describe, expect, it } from 'vitest';

import { APP_SETTING_KEYS, SECURE_KEYS, storage } from '@infra/storage';
import { prepareDatabase } from '@infra/db';
import { DEFAULT_ANALYSIS_PROVIDER_ID } from '@shared/contracts';

import { runStorageMigrations } from '../storage';

const LEGACY_AI_CONFIG_CACHE_KEY = 'plotmapai_ai_config';
const LEGACY_AI_API_KEY = 'plotmapai_encrypted_api_key';

describe('runStorageMigrations', () => {
  beforeEach(async () => {
    localStorage.clear();
    await prepareDatabase();
    await storage.primary.settings.remove(APP_SETTING_KEYS.aiConfig);
    await storage.primary.settings.remove('infra.storageMigrations');
    await storage.secure.remove(SECURE_KEYS.aiApiKey);
    await storage.secure.remove(LEGACY_AI_API_KEY);
    storage.secure.resetForTesting();
  });

  it('migrates legacy ai config and secure api key once', async () => {
    localStorage.setItem(LEGACY_AI_CONFIG_CACHE_KEY, JSON.stringify({
      apiBaseUrl: 'http://legacy-host:5000',
      modelName: 'legacy-model',
      contextSize: 64000,
    }));
    await storage.secure.set(LEGACY_AI_API_KEY, 'sk-legacy-secret');

    await runStorageMigrations();

    await expect(storage.primary.settings.get(APP_SETTING_KEYS.aiConfig)).resolves.toEqual({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://legacy-host:5000',
      modelName: 'legacy-model',
      contextSize: 64000,
    });
    await expect(storage.secure.get(SECURE_KEYS.aiApiKey)).resolves.toBe('sk-legacy-secret');
    expect(localStorage.getItem(LEGACY_AI_CONFIG_CACHE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_AI_API_KEY)).toBeNull();
  });

  it('does not rerun completed migrations', async () => {
    localStorage.setItem(LEGACY_AI_CONFIG_CACHE_KEY, JSON.stringify({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://legacy-host:5000',
      modelName: 'legacy-model',
      contextSize: 64000,
    }));

    await runStorageMigrations();

    localStorage.setItem(LEGACY_AI_CONFIG_CACHE_KEY, JSON.stringify({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://second-host:5000',
      modelName: 'second-model',
      contextSize: 128000,
    }));

    await runStorageMigrations();

    await expect(storage.primary.settings.get(APP_SETTING_KEYS.aiConfig)).resolves.toEqual({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://legacy-host:5000',
      modelName: 'legacy-model',
      contextSize: 64000,
    });
    expect(localStorage.getItem(LEGACY_AI_CONFIG_CACHE_KEY)).not.toBeNull();
  });
});
