import { beforeEach, describe, expect, it } from 'vitest';
import {
  APP_SETTING_KEYS,
  LEGACY_CACHE_KEYS,
  LEGACY_SECURE_KEYS,
  SECURE_KEYS,
  storage,
} from '../../infra/storage';
import { aiConfigApi, resetDeviceKeyForTesting } from '../settings/aiConfig';
import { db } from '../../services/db';

describe('aiConfigApi', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
    resetDeviceKeyForTesting();
  });

  it('getAiProviderSettings returns empty config when not set', async () => {
    const settings = await aiConfigApi.getAiProviderSettings();
    expect(settings.apiBaseUrl).toBe('');
    expect(settings.hasApiKey).toBe(false);
    expect(settings.maskedApiKey).toBe('');
  });

  it('updateAiProviderSettings saves config', async () => {
    const settings = await aiConfigApi.updateAiProviderSettings({
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'sk-test12345678',
      modelName: 'gpt-4',
      contextSize: 32000,
    });
    expect(settings.apiBaseUrl).toBe('http://localhost:5000');
    expect(settings.hasApiKey).toBe(true);
    expect(settings.maskedApiKey).toContain('sk-t');
  });

  it('updateAiProviderSettings preserves existing key when keepExistingApiKey', async () => {
    await aiConfigApi.updateAiProviderSettings({
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'sk-original1234',
      modelName: 'gpt-4',
      contextSize: 32000,
    });
    const settings = await aiConfigApi.updateAiProviderSettings({
      apiBaseUrl: 'http://localhost:8080',
      keepExistingApiKey: true,
      modelName: 'gpt-4',
      contextSize: 32000,
    });
    expect(settings.apiBaseUrl).toBe('http://localhost:8080');
    expect(settings.hasApiKey).toBe(true);
  });

  it('migrates legacy AI config from localStorage to primary and secure storage', async () => {
    localStorage.setItem(LEGACY_CACHE_KEYS.aiConfig, JSON.stringify({
      apiBaseUrl: 'http://legacy-host:5000',
      modelName: 'legacy-model',
      contextSize: 64000,
    }));
    await storage.secure.set(LEGACY_SECURE_KEYS.aiApiKey, 'sk-legacy-secret');

    const settings = await aiConfigApi.getAiProviderSettings();

    expect(settings.apiBaseUrl).toBe('http://legacy-host:5000');
    expect(settings.modelName).toBe('legacy-model');
    expect(settings.contextSize).toBe(64000);
    expect(settings.hasApiKey).toBe(true);
    expect(await storage.primary.settings.get(APP_SETTING_KEYS.aiConfig)).toEqual({
      apiBaseUrl: 'http://legacy-host:5000',
      modelName: 'legacy-model',
      contextSize: 64000,
    });
    expect(await storage.secure.get(SECURE_KEYS.aiApiKey)).toBe('sk-legacy-secret');
    expect(localStorage.getItem(LEGACY_CACHE_KEYS.aiConfig)).toBeNull();
    expect(localStorage.getItem(LEGACY_SECURE_KEYS.aiApiKey)).toBeNull();
  });

  it('updateAiProviderSettings throws for invalid config', async () => {
    await expect(aiConfigApi.updateAiProviderSettings({
      apiBaseUrl: '',
      apiKey: '',
      modelName: '',
      contextSize: 100,
    })).rejects.toThrow();
  });

  describe('AI config export/import', () => {
    beforeEach(async () => {
      await aiConfigApi.updateAiProviderSettings({
        apiBaseUrl: 'http://localhost:5000',
        apiKey: 'sk-test-secret-key-12345',
        modelName: 'gpt-4',
        contextSize: 32000,
      });
    });

    it('exportAiConfig throws without config', async () => {
      await storage.primary.settings.remove(APP_SETTING_KEYS.aiConfig);
      await storage.secure.remove(SECURE_KEYS.aiApiKey);
      await expect(aiConfigApi.exportAiConfig('password')).rejects.toThrow('No AI config');
    });

    it('exportAiConfig throws with short password', async () => {
      await expect(aiConfigApi.exportAiConfig('ab')).rejects.toThrow('at least 4 characters');
    });

    it('exportAiConfig returns encrypted JSON string', async () => {
      const result = await aiConfigApi.exportAiConfig('testpassword');
      const parsed = JSON.parse(result) as { v: number; salt: string; iv: string; data: string };
      expect(parsed.v).toBe(1);
      expect(parsed.salt).toBeDefined();
      expect(parsed.iv).toBeDefined();
      expect(parsed.data).toBeDefined();
    });

    it('export and import round-trip works', async () => {
      const exported = await aiConfigApi.exportAiConfig('mypassword123');
      localStorage.clear();
      await storage.primary.settings.remove(APP_SETTING_KEYS.aiConfig);
      await storage.secure.remove(SECURE_KEYS.aiApiKey);
      resetDeviceKeyForTesting();

      const file = new File([exported], 'config.enc', { type: 'application/octet-stream' });
      await aiConfigApi.importAiConfig(file, 'mypassword123');

      const settings = await aiConfigApi.getAiProviderSettings();
      expect(settings.apiBaseUrl).toBe('http://localhost:5000');
      expect(settings.hasApiKey).toBe(true);
      expect(settings.maskedApiKey).toContain('sk-t');
      expect(settings.modelName).toBe('gpt-4');
      expect(settings.contextSize).toBe(32000);
    });

    it('import fails with wrong password', async () => {
      const exported = await aiConfigApi.exportAiConfig('correctpassword');
      const file = new File([exported], 'config.enc', { type: 'application/octet-stream' });
      await expect(aiConfigApi.importAiConfig(file, 'wrongpassword')).rejects.toThrow('Decryption failed');
    });

    it('import fails with invalid file', async () => {
      const file = new File(['not json'], 'bad.enc', { type: 'application/octet-stream' });
      await expect(aiConfigApi.importAiConfig(file, 'password')).rejects.toThrow('Invalid config file');
    });

    it('import fails with invalid envelope structure', async () => {
      const file = new File([JSON.stringify({ v: 2, salt: 'x', iv: 'y', data: 'z' })], 'bad.enc', {
        type: 'application/octet-stream',
      });
      await expect(aiConfigApi.importAiConfig(file, 'password')).rejects.toThrow('Invalid config file structure');
    });

    it('import fails without password', async () => {
      const file = new File(['{}'], 'config.enc', { type: 'application/octet-stream' });
      await expect(aiConfigApi.importAiConfig(file, '')).rejects.toThrow('Password is required');
    });

    it('export produces different ciphertext each time', async () => {
      const first = await aiConfigApi.exportAiConfig('samepassword');
      const second = await aiConfigApi.exportAiConfig('samepassword');
      expect(first).not.toBe(second);
    });
  });
});
