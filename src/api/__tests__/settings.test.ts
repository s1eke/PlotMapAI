import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../services/db';
import { settingsApi, resetDeviceKeyForTesting } from '../settings';

describe('settingsApi', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
    resetDeviceKeyForTesting();
  });

  describe('TOC rules', () => {
    it('getTocRules returns empty array when no rules', async () => {
      const rules = await settingsApi.getTocRules();
      expect(rules).toEqual([]);
    });

    it('createTocRule creates a new rule', async () => {
      const rule = await settingsApi.createTocRule({
        name: 'New Rule',
        rule: '^Chapter',
        example: 'Chapter 1',
        priority: 5,
        isEnabled: true,
      });
      expect(rule.name).toBe('New Rule');
      expect(rule.rule).toBe('^Chapter');
      expect(rule.isDefault).toBe(false);
    });

    it('updateTocRule updates an existing rule', async () => {
      const created = await settingsApi.createTocRule({
        name: 'Original', rule: '^old', example: '', priority: 10, isEnabled: true,
      });
      const updated = await settingsApi.updateTocRule(created.id, { name: 'Updated', isEnabled: false });
      expect(updated.name).toBe('Updated');
      expect(updated.isEnabled).toBe(false);
    });

    it('deleteTocRule deletes non-default rules', async () => {
      const created = await settingsApi.createTocRule({
        name: 'Delete Me', rule: '^del', example: '', priority: 10, isEnabled: true,
      });
      const result = await settingsApi.deleteTocRule(created.id);
      expect(result.message).toBe('Rule deleted');
      const rules = await settingsApi.getTocRules();
      expect(rules.find(r => r.id === created.id)).toBeUndefined();
    });

    it('deleteTocRule throws for default rules', async () => {
      await db.tocRules.add({
        id: undefined as unknown as number,
        name: 'Default',
        rule: '^def',
        example: '',
        serialNumber: 0,
        enable: true,
        isDefault: true,
        createdAt: new Date().toISOString(),
      });
      const rules = await db.tocRules.toArray();
      await expect(settingsApi.deleteTocRule(rules[0].id)).rejects.toThrow('Cannot delete default rules');
    });

    it('exportTocRulesYaml returns YAML string', async () => {
      await settingsApi.createTocRule({
        name: 'Rule1', rule: '^R', example: 'R1', priority: 1, isEnabled: true,
      });
      const yaml = await settingsApi.exportTocRulesYaml();
      expect(yaml).toContain('Rule1');
      expect(yaml).toContain('^R');
    });
  });

  describe('Purification rules', () => {
    it('getPurificationRules returns empty array when no rules', async () => {
      const rules = await settingsApi.getPurificationRules();
      expect(rules).toEqual([]);
    });

    it('createPurificationRule creates a new rule', async () => {
      const rule = await settingsApi.createPurificationRule({
        name: 'Purify Rule',
        pattern: 'foo',
        replacement: 'bar',
      });
      expect(rule.name).toBe('Purify Rule');
      expect(rule.pattern).toBe('foo');
      expect(rule.replacement).toBe('bar');
    });

    it('createPurificationRule throws without name or pattern', async () => {
      await expect(settingsApi.createPurificationRule({})).rejects.toThrow('Missing field');
    });

    it('updatePurificationRule updates fields', async () => {
      const created = await settingsApi.createPurificationRule({
        name: 'Original', pattern: 'old', replacement: 'new',
      });
      const updated = await settingsApi.updatePurificationRule(created.id, { name: 'Updated' });
      expect(updated.name).toBe('Updated');
    });

    it('deletePurificationRule deletes rule', async () => {
      const created = await settingsApi.createPurificationRule({
        name: 'Delete', pattern: 'd', replacement: '',
      });
      const result = await settingsApi.deletePurificationRule(created.id);
      expect(result.message).toBe('Rule deleted');
    });

    it('clearAllPurificationRules clears all', async () => {
      await settingsApi.createPurificationRule({ name: 'A', pattern: 'a', replacement: '' });
      await settingsApi.createPurificationRule({ name: 'B', pattern: 'b', replacement: '' });
      await settingsApi.clearAllPurificationRules();
      const rules = await settingsApi.getPurificationRules();
      expect(rules.length).toBe(0);
    });

    it('exportPurificationRulesYaml returns YAML string', async () => {
      await settingsApi.createPurificationRule({ name: 'Test', pattern: 't', replacement: 'r' });
      const yaml = await settingsApi.exportPurificationRulesYaml();
      expect(yaml).toContain('Test');
      expect(yaml).toContain('t');
    });
  });

  describe('AI provider settings', () => {
    it('getAiProviderSettings returns empty config when not set', async () => {
      const settings = await settingsApi.getAiProviderSettings();
      expect(settings.apiBaseUrl).toBe('');
      expect(settings.hasApiKey).toBe(false);
      expect(settings.maskedApiKey).toBe('');
    });

    it('updateAiProviderSettings saves config', async () => {
      const settings = await settingsApi.updateAiProviderSettings({
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
      await settingsApi.updateAiProviderSettings({
        apiBaseUrl: 'http://localhost:5000',
        apiKey: 'sk-original1234',
        modelName: 'gpt-4',
        contextSize: 32000,
      });
      const settings = await settingsApi.updateAiProviderSettings({
        apiBaseUrl: 'http://localhost:8080',
        keepExistingApiKey: true,
        modelName: 'gpt-4',
        contextSize: 32000,
      });
      expect(settings.apiBaseUrl).toBe('http://localhost:8080');
      expect(settings.hasApiKey).toBe(true);
    });

    it('updateAiProviderSettings throws for invalid config', async () => {
      await expect(settingsApi.updateAiProviderSettings({
        apiBaseUrl: '',
        apiKey: '',
        modelName: '',
        contextSize: 100,
      })).rejects.toThrow();
    });
  });

  describe('AI config export/import', () => {
    beforeEach(async () => {
      await settingsApi.updateAiProviderSettings({
        apiBaseUrl: 'http://localhost:5000',
        apiKey: 'sk-test-secret-key-12345',
        modelName: 'gpt-4',
        contextSize: 32000,
      });
    });

    it('exportAiConfig throws without config', async () => {
      localStorage.removeItem('plotmapai_ai_config');
      await expect(settingsApi.exportAiConfig('password')).rejects.toThrow('No AI config');
    });

    it('exportAiConfig throws with short password', async () => {
      await expect(settingsApi.exportAiConfig('ab')).rejects.toThrow('at least 4 characters');
    });

    it('exportAiConfig returns encrypted JSON string', async () => {
      const result = await settingsApi.exportAiConfig('testpassword');
      const parsed = JSON.parse(result);
      expect(parsed.v).toBe(1);
      expect(parsed.salt).toBeDefined();
      expect(parsed.iv).toBeDefined();
      expect(parsed.data).toBeDefined();
    });

    it('export and import round-trip works', async () => {
      const exported = await settingsApi.exportAiConfig('mypassword123');
      localStorage.clear();
      resetDeviceKeyForTesting();

      const file = new File([exported], 'config.enc', { type: 'application/octet-stream' });
      await settingsApi.importAiConfig(file, 'mypassword123');

      const settings = await settingsApi.getAiProviderSettings();
      expect(settings.apiBaseUrl).toBe('http://localhost:5000');
      expect(settings.hasApiKey).toBe(true);
      expect(settings.maskedApiKey).toContain('sk-t');
      expect(settings.modelName).toBe('gpt-4');
      expect(settings.contextSize).toBe(32000);
    });

    it('import fails with wrong password', async () => {
      const exported = await settingsApi.exportAiConfig('correctpassword');
      const file = new File([exported], 'config.enc', { type: 'application/octet-stream' });
      await expect(settingsApi.importAiConfig(file, 'wrongpassword')).rejects.toThrow('Decryption failed');
    });

    it('import fails with invalid file', async () => {
      const file = new File(['not json'], 'bad.enc', { type: 'application/octet-stream' });
      await expect(settingsApi.importAiConfig(file, 'password')).rejects.toThrow('Invalid config file');
    });

    it('import fails with invalid envelope structure', async () => {
      const file = new File([JSON.stringify({ v: 2, salt: 'x', iv: 'y', data: 'z' })], 'bad.enc', { type: 'application/octet-stream' });
      await expect(settingsApi.importAiConfig(file, 'password')).rejects.toThrow('Invalid config file structure');
    });

    it('import fails without password', async () => {
      const file = new File(['{}'], 'config.enc', { type: 'application/octet-stream' });
      await expect(settingsApi.importAiConfig(file, '')).rejects.toThrow('Password is required');
    });

    it('export produces different ciphertext each time', async () => {
      const a = await settingsApi.exportAiConfig('samepassword');
      const b = await settingsApi.exportAiConfig('samepassword');
      expect(a).not.toBe(b); // Different salt and IV each time
    });
  });
});
