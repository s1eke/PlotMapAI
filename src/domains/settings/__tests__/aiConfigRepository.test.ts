import { beforeEach, describe, expect, it } from 'vitest';

import {
  APP_SETTING_KEYS,
  LEGACY_CACHE_KEYS,
  LEGACY_SECURE_KEYS,
  SECURE_KEYS,
  storage,
} from '@infra/storage';
import { DEFAULT_ANALYSIS_PROVIDER_ID } from '@shared/contracts';

import {
  exportAiConfig,
  getAiConfig,
  getAiProviderSettings,
  importAiConfig,
  resetDeviceKeyForTesting,
  saveAiConfig,
} from '../aiConfigRepository';

describe('aiConfigRepository', () => {
  beforeEach(async () => {
    localStorage.clear();
    await storage.primary.settings.remove(APP_SETTING_KEYS.aiConfig);
    await storage.secure.remove(SECURE_KEYS.aiApiKey);
    await storage.secure.remove(LEGACY_SECURE_KEYS.aiApiKey);
    resetDeviceKeyForTesting();
  });

  it('returns empty default provider settings when no config exists', async () => {
    const settings = await getAiProviderSettings();

    expect(settings).toMatchObject({
      apiBaseUrl: '',
      contextSize: 32000,
      hasApiKey: false,
      maskedApiKey: '',
      modelName: '',
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
    });
  });

  it('saves runtime config and exposes masked provider settings', async () => {
    await saveAiConfig({
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'sk-test12345678',
      contextSize: 32000,
      modelName: 'gpt-4',
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
    });

    await expect(getAiConfig()).resolves.toMatchObject({
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'sk-test12345678',
      contextSize: 32000,
      modelName: 'gpt-4',
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
    });
    await expect(getAiProviderSettings()).resolves.toMatchObject({
      apiBaseUrl: 'http://localhost:5000',
      hasApiKey: true,
      maskedApiKey: 'sk-t*******5678',
    });
  });

  it('defaults providerId for legacy primary-storage records', async () => {
    await storage.primary.settings.set(APP_SETTING_KEYS.aiConfig, {
      apiBaseUrl: 'http://legacy-host:5000',
      contextSize: 64000,
      modelName: 'legacy-model',
    });
    await storage.secure.set(SECURE_KEYS.aiApiKey, 'sk-legacy-secret');

    const settings = await getAiProviderSettings();

    expect(settings.providerId).toBe(DEFAULT_ANALYSIS_PROVIDER_ID);
  });

  it('migrates legacy ai config from cache and legacy secure storage', async () => {
    localStorage.setItem(LEGACY_CACHE_KEYS.aiConfig, JSON.stringify({
      apiBaseUrl: 'http://legacy-host:5000',
      contextSize: 64000,
      modelName: 'legacy-model',
    }));
    await storage.secure.set(LEGACY_SECURE_KEYS.aiApiKey, 'sk-legacy-secret');

    const settings = await getAiProviderSettings();

    expect(settings).toMatchObject({
      apiBaseUrl: 'http://legacy-host:5000',
      contextSize: 64000,
      hasApiKey: true,
      modelName: 'legacy-model',
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
    });
    await expect(storage.primary.settings.get(APP_SETTING_KEYS.aiConfig)).resolves.toEqual({
      apiBaseUrl: 'http://legacy-host:5000',
      contextSize: 64000,
      modelName: 'legacy-model',
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
    });
    expect(localStorage.getItem(LEGACY_CACHE_KEYS.aiConfig)).toBeNull();
    expect(localStorage.getItem(LEGACY_SECURE_KEYS.aiApiKey)).toBeNull();
  });

  it('exports and re-imports encrypted ai config', async () => {
    await saveAiConfig({
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'sk-test-secret-key-12345',
      contextSize: 32000,
      modelName: 'gpt-4',
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
    });

    const exported = await exportAiConfig('password');
    await storage.primary.settings.remove(APP_SETTING_KEYS.aiConfig);
    await storage.secure.remove(SECURE_KEYS.aiApiKey);

    await importAiConfig(
      new File([exported], 'plotmapai-ai-config.enc', { type: 'application/octet-stream' }),
      'password',
    );

    await expect(getAiConfig()).resolves.toMatchObject({
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'sk-test-secret-key-12345',
      contextSize: 32000,
      modelName: 'gpt-4',
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
    });
  });
});
