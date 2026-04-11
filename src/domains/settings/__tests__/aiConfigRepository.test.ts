import { beforeEach, describe, expect, it } from 'vitest';

import {
  APP_SETTING_KEYS,
  SECURE_KEYS,
  storage,
} from '@infra/storage';
import { DEFAULT_ANALYSIS_PROVIDER_ID } from '@shared/contracts';
import { AppErrorCode } from '@shared/errors';

import {
  exportAiConfig,
  getAiConfig,
  getAiProviderSettings,
  importAiConfig,
  resetDeviceKeyForTesting,
  saveAiConfig,
} from '../aiConfigRepository';

async function createEncryptedConfigFile(payload: unknown, password: string): Promise<File> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );

  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const envelope = JSON.stringify({
    v: 1,
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  });

  return new File([envelope], 'plotmapai-ai-config.enc', {
    type: 'application/octet-stream',
  });
}

describe('aiConfigRepository', () => {
  beforeEach(async () => {
    localStorage.clear();
    await storage.primary.settings.remove(APP_SETTING_KEYS.aiConfig);
    await storage.secure.remove(SECURE_KEYS.aiApiKey);
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

  it('ignores non-canonical primary-storage records', async () => {
    await storage.primary.settings.set(APP_SETTING_KEYS.aiConfig, {
      apiBaseUrl: 'http://legacy-host:5000',
      contextSize: 64000,
      modelName: 'legacy-model',
    });

    await expect(getAiConfig()).resolves.toBeNull();
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

  it('rejects imported configs without a valid providerId', async () => {
    const file = await createEncryptedConfigFile({
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'sk-test-secret-key-12345',
      contextSize: 32000,
      modelName: 'gpt-4',
    }, 'password');

    await expect(importAiConfig(file, 'password')).rejects.toMatchObject({
      code: AppErrorCode.AI_CONFIG_MISSING_FIELDS,
    });
  });
});
