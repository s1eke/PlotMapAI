import yaml from 'js-yaml';
import { db } from '../services/db';

function unescapeReplacement(raw: string): string {
  return raw.replace(/\\([nrt\\])/g, (_, ch: string) => {
    if (ch === 'n') return '\n';
    if (ch === 'r') return '\r';
    if (ch === 't') return '\t';
    return '\\';
  });
}

import {
  buildRuntimeAnalysisConfig,
  maskApiKey,
  testAiProviderConnection,
} from '../services/aiAnalysis';
import { debugLog } from '../services/debug';

export interface TocRule {
  id: number;
  name: string;
  rule: string;
  example: string;
  priority: number;
  isEnabled: boolean;
  isDefault: boolean;
  createdAt?: string;
}

export interface PurificationRule {
  id: number;
  externalId?: number;
  name: string;
  group: string;
  pattern: string;
  replacement: string;
  isRegex: boolean;
  isEnabled: boolean;
  order: number;
  scopeTitle: boolean;
  scopeContent: boolean;
  bookScope?: string;
  excludeBookScope?: string;
  timeoutMs: number;
  createdAt?: string;
}

export interface AiProviderSettings {
  apiBaseUrl: string;
  modelName: string;
  contextSize: number;
  hasApiKey: boolean;
  maskedApiKey: string;
  updatedAt?: string | null;
}

export interface AiProviderSettingsPayload {
  apiBaseUrl: string;
  apiKey?: string;
  modelName: string;
  contextSize: number;
  keepExistingApiKey?: boolean;
}

const AI_CONFIG_KEY = 'plotmapai_ai_config';
const ENCRYPTED_API_KEY_STORAGE_KEY = 'plotmapai_encrypted_api_key';
const DEVICE_KEY_STORAGE_KEY = 'plotmapai_device_key';

// ── Device AES key for localStorage apiKey encryption ──────────────────

let deviceCryptoKey: CryptoKey | null = null;
let deviceKeyPromise: Promise<CryptoKey> | null = null;

function toB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(s);
  const arr = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) arr[i] = decoded.charCodeAt(i);
  return arr as Uint8Array<ArrayBuffer>;
}

function getDeviceCryptoKey(): Promise<CryptoKey> {
  if (deviceCryptoKey) return Promise.resolve(deviceCryptoKey);
  if (deviceKeyPromise) return deviceKeyPromise;

  deviceKeyPromise = (async (): Promise<CryptoKey> => {
    const existing = localStorage.getItem(DEVICE_KEY_STORAGE_KEY);
    if (existing) {
      deviceCryptoKey = await crypto.subtle.importKey(
        'raw', fromB64(existing), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'],
      );
    } else {
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
      );
      const exported = await crypto.subtle.exportKey('raw', key);
      localStorage.setItem(DEVICE_KEY_STORAGE_KEY, toB64(new Uint8Array(exported)));
      deviceCryptoKey = key;
    }
    return deviceCryptoKey;
  })().catch((err: unknown) => {
    deviceKeyPromise = null;
    throw err;
  });

  return deviceKeyPromise;
}

async function encryptApiKey(apiKey: string): Promise<string> {
  const key = await getDeviceCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(apiKey);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return `${toB64(iv)}.${toB64(new Uint8Array(ciphertext))}`;
}

async function decryptApiKey(payload: string): Promise<string> {
  const key = await getDeviceCryptoKey();
  const dot = payload.indexOf('.');
  if (dot < 0) throw new Error('Invalid encrypted payload');
  const iv = fromB64(payload.slice(0, dot));
  const ciphertext = fromB64(payload.slice(dot + 1));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ── Config read/write ──────────────────────────────────────────────────

export async function getAiConfig(): Promise<{ apiBaseUrl: string; apiKey: string; modelName: string; contextSize: number } | null> {
  const raw = localStorage.getItem(AI_CONFIG_KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw);
    let apiKey = '';
    const enc = localStorage.getItem(ENCRYPTED_API_KEY_STORAGE_KEY);
    if (enc) {
      try {
        apiKey = await decryptApiKey(enc);
      } catch {
        // Corrupt or un-decryptable — treat as missing
      }
    }
    return {
      apiBaseUrl: stored.apiBaseUrl ?? '',
      apiKey,
      modelName: stored.modelName ?? '',
      contextSize: stored.contextSize ?? 32000,
    };
  } catch {
    return null;
  }
}

async function setAiConfig(config: { apiBaseUrl: string; apiKey: string; modelName: string; contextSize: number }): Promise<void> {
  if (config.apiKey) {
    const encrypted = await encryptApiKey(config.apiKey);
    localStorage.setItem(ENCRYPTED_API_KEY_STORAGE_KEY, encrypted);
  } else {
    localStorage.removeItem(ENCRYPTED_API_KEY_STORAGE_KEY);
  }
  const { apiKey: _ignored, ...rest } = config;
  void _ignored;
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(rest));
}

export function resetDeviceKeyForTesting(): void {
  deviceCryptoKey = null;
  deviceKeyPromise = null;
}

function tocRuleToApi(rule: import('../services/db').TocRule): TocRule {
  return {
    id: rule.id,
    name: rule.name,
    rule: rule.rule,
    example: rule.example,
    priority: rule.serialNumber,
    isEnabled: rule.enable,
    isDefault: rule.isDefault,
    createdAt: rule.createdAt,
  };
}

function purRuleToApi(rule: import('../services/db').PurificationRule): PurificationRule {
  return {
    id: rule.id,
    externalId: rule.externalId ?? undefined,
    name: rule.name,
    group: rule.group,
    pattern: rule.pattern,
    replacement: rule.replacement,
    isRegex: rule.isRegex,
    isEnabled: rule.isEnabled,
    order: rule.order,
    scopeTitle: rule.scopeTitle,
    scopeContent: rule.scopeContent,
    bookScope: rule.bookScope || undefined,
    excludeBookScope: rule.excludeBookScope || undefined,
    timeoutMs: rule.timeoutMs,
    createdAt: rule.createdAt,
  };
}

export const settingsApi = {
  getTocRules: async (): Promise<TocRule[]> => {
    const rules = await db.tocRules.orderBy('serialNumber').toArray();
    return rules.map(tocRuleToApi);
  },

  createTocRule: async (data: Omit<TocRule, 'id' | 'isDefault'>): Promise<TocRule> => {
    const now = new Date().toISOString();
    const last = await db.tocRules.orderBy('serialNumber').last();
    const id = await db.tocRules.add({
      id: undefined as unknown as number,
      name: data.name,
      rule: data.rule,
      example: data.example || '',
      serialNumber: data.priority ?? (last?.serialNumber ?? -1) + 1,
      enable: data.isEnabled ?? true,
      isDefault: false,
      createdAt: now,
    });
    const rule = await db.tocRules.get(id);
    return tocRuleToApi(rule!);
  },

  updateTocRule: async (id: number, data: Partial<TocRule>): Promise<TocRule> => {
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.rule !== undefined) updates.rule = data.rule;
    if (data.example !== undefined) updates.example = data.example;
    if (data.isEnabled !== undefined) updates.enable = data.isEnabled;
    if (data.priority !== undefined) updates.serialNumber = data.priority;
    await db.tocRules.update(id, updates);
    const rule = await db.tocRules.get(id);
    if (!rule) throw new Error('Rule not found');
    return tocRuleToApi(rule);
  },

  deleteTocRule: async (id: number): Promise<{ message: string }> => {
    const rule = await db.tocRules.get(id);
    if (!rule) throw new Error('Rule not found');
    if (rule.isDefault) throw new Error('Cannot delete default rules');
    await db.tocRules.delete(id);
    return { message: 'Rule deleted' };
  },

  uploadTocRulesYaml: async (file: File): Promise<TocRule[]> => {
    const text = await file.text();
    let rules: Array<Record<string, unknown>>;
    try {
      const parsed = yaml.load(text);
      rules = Array.isArray(parsed) ? parsed : ((parsed as Record<string, unknown>)?.rules as Array<Record<string, unknown>>) || [];
    } catch (e) {
      throw new Error(`Invalid YAML file: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!Array.isArray(rules)) throw new Error('Rules must be a YAML array');

    const existing = await db.tocRules.toArray();
    const existingRules = new Set(existing.map(r => r.rule));
    const now = new Date().toISOString();
    let added = 0;
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (typeof r !== 'object' || r === null) continue;
      const obj = r as Record<string, unknown>;
      const ruleText = (obj.rule || obj.pattern) as string;
      if (!ruleText || existingRules.has(ruleText)) continue;
      existingRules.add(ruleText);
      await db.tocRules.add({
        id: undefined as unknown as number,
        name: (obj.name as string) || `Imported Rule ${i}`,
        rule: ruleText,
        example: (obj.example as string) || '',
        serialNumber: (obj.serialNumber ?? obj.priority ?? obj.serial_number ?? i) as number,
        enable: (obj.enable ?? obj.isEnabled ?? true) as boolean,
        isDefault: false,
        createdAt: now,
      });
      added++;
    }
    debugLog('Settings', `uploadTocRulesYaml: ${rules.length} parsed, ${added} added`);
    return settingsApi.getTocRules();
  },

  exportTocRulesYaml: async (): Promise<string> => {
    const rules = await db.tocRules.toArray();
    const exportData = rules.map((r, i) => ({
      name: r.name,
      rule: r.rule,
      example: r.example || '',
      serialNumber: r.serialNumber ?? i,
      enable: r.enable,
    }));
    return yaml.dump(exportData, { lineWidth: 200, noRefs: true });
  },

  getPurificationRules: async (): Promise<PurificationRule[]> => {
    const rules = await db.purificationRules.orderBy('order').toArray();
    return rules.map(purRuleToApi);
  },

  createPurificationRule: async (data: Partial<PurificationRule>): Promise<PurificationRule> => {
    if (!data.name || !data.pattern) throw new Error('Missing field: name or pattern');
    const now = new Date().toISOString();
    const id = await db.purificationRules.add({
      id: undefined as unknown as number,
      externalId: null,
      name: data.name,
      group: data.group || 'Purification',
      pattern: data.pattern,
      replacement: unescapeReplacement(data.replacement || ''),
      isRegex: data.isRegex ?? true,
      isEnabled: data.isEnabled ?? true,
      order: data.order ?? 10,
      scopeTitle: data.scopeTitle ?? true,
      scopeContent: data.scopeContent ?? true,
      bookScope: data.bookScope || '',
      excludeBookScope: data.excludeBookScope || '',
      timeoutMs: data.timeoutMs ?? 3000,
      createdAt: now,
    });
    const rule = await db.purificationRules.get(id);
    return purRuleToApi(rule!);
  },

  updatePurificationRule: async (id: number, data: Partial<PurificationRule>): Promise<PurificationRule> => {
    const updates: Record<string, unknown> = {};
    const fields = ['name', 'group', 'pattern', 'isRegex', 'isEnabled',
      'order', 'scopeTitle', 'scopeContent', 'bookScope', 'excludeBookScope', 'timeoutMs'] as const;
    for (const f of fields) {
      if (data[f] !== undefined) updates[f] = data[f];
    }
    if (data.replacement !== undefined) {
      updates.replacement = unescapeReplacement(data.replacement);
    }
    await db.purificationRules.update(id, updates);
    const rule = await db.purificationRules.get(id);
    if (!rule) throw new Error('Rule not found');
    return purRuleToApi(rule);
  },

  deletePurificationRule: async (id: number): Promise<{ message: string }> => {
    const rule = await db.purificationRules.get(id);
    if (!rule) throw new Error('Rule not found');
    await db.purificationRules.delete(id);
    return { message: 'Rule deleted' };
  },

  clearAllPurificationRules: async (): Promise<{ message: string }> => {
    await db.purificationRules.clear();
    return { message: 'All rules cleared' };
  },

  uploadPurificationRulesYaml: async (file: File): Promise<PurificationRule[]> => {
    const text = await file.text();
    debugLog('Settings', `upload purify rules file: ${file.name}, size=${file.size}, text length=${text.length}`);
    let parsed: unknown[];
    try {
      const loaded = yaml.load(text);
      parsed = Array.isArray(loaded) ? loaded : [];
    } catch (e) {
      throw new Error(`Invalid YAML file: ${e instanceof Error ? e.message : String(e)}`);
    }
    debugLog('Settings', `parsed ${parsed.length} rules`);
    const existing = await db.purificationRules.toArray();
    const existingKeys = new Set(existing.map(r => `${r.pattern}\u0000${r.isRegex}`));
    const now = new Date().toISOString();
    let added = 0;
    for (let i = 0; i < parsed.length; i++) {
      const r = parsed[i];
      if (typeof r !== 'object' || r === null) continue;
      const obj = r as Record<string, unknown>;
      const pattern = (obj.pattern as string) || '';
      const isRegex = (obj.is_regex ?? obj.isRegex ?? true) as boolean;
      const name = (obj.name as string) || `Imported Rule ${i}`;
      const key = `${pattern}\u0000${isRegex}`;
      if (!pattern || existingKeys.has(key)) {
        debugLog('Settings', `    skip duplicate: "${name}"`);
        continue;
      }
      existingKeys.add(key);
      const record = {
        id: undefined as unknown as number,
        externalId: null,
        name,
        group: (obj.group as string) || 'Purification',
        pattern,
        replacement: unescapeReplacement((obj.replacement as string) || ''),
        isRegex,
        isEnabled: (obj.is_enabled ?? obj.isEnabled ?? true) as boolean,
        order: (obj.order as number) ?? 10,
        scopeTitle: (obj.scope_title ?? obj.scopeTitle ?? true) as boolean,
        scopeContent: (obj.scope_content ?? obj.scopeContent ?? true) as boolean,
        bookScope: (obj.book_scope ?? obj.bookScope ?? '') as string,
        excludeBookScope: (obj.exclude_book_scope ?? obj.excludeBookScope ?? '') as string,
        timeoutMs: 3000,
        createdAt: now,
      };
      await db.purificationRules.add(record);
      added++;
    }
    debugLog('Settings', `uploadPurificationRulesYaml: ${parsed.length} parsed, ${added} added`);
    return settingsApi.getPurificationRules();
  },

  exportPurificationRulesYaml: async (): Promise<string> => {
    const rules = await db.purificationRules.orderBy('order').toArray();
    const exportData = rules.map(r => ({
      name: r.name,
      group: r.group || 'Purification',
      pattern: r.pattern,
      replacement: r.replacement,
      is_regex: r.isRegex,
      is_enabled: r.isEnabled,
      order: r.order,
      scope_title: r.scopeTitle,
      scope_content: r.scopeContent,
      book_scope: r.bookScope || '',
      exclude_book_scope: r.excludeBookScope || '',
    }));
    return yaml.dump(exportData, { lineWidth: 200, noRefs: true });
  },

  getAiProviderSettings: async (): Promise<AiProviderSettings> => {
    const config = await getAiConfig();
    if (!config) {
      return {
        apiBaseUrl: '',
        modelName: '',
        contextSize: 32000,
        hasApiKey: false,
        maskedApiKey: '',
        updatedAt: null,
      };
    }
    return {
      apiBaseUrl: config.apiBaseUrl,
      modelName: config.modelName,
      contextSize: config.contextSize,
      hasApiKey: !!config.apiKey,
      maskedApiKey: maskApiKey(config.apiKey),
      updatedAt: null,
    };
  },

  updateAiProviderSettings: async (payload: AiProviderSettingsPayload): Promise<AiProviderSettings> => {
    const existing = await getAiConfig();
    const keepExisting = payload.keepExistingApiKey !== false;
    let apiKey = payload.apiKey || '';
    if (!apiKey && keepExisting && existing) {
      apiKey = existing.apiKey;
    }
    const config = buildRuntimeAnalysisConfig({
      apiBaseUrl: payload.apiBaseUrl || existing?.apiBaseUrl || '',
      apiKey,
      modelName: payload.modelName || existing?.modelName || '',
      contextSize: payload.contextSize || existing?.contextSize || 32000,
    });
    await setAiConfig(config);
    return settingsApi.getAiProviderSettings();
  },

  testAiProviderSettings: async (payload: Partial<AiProviderSettingsPayload>): Promise<{ message: string; preview: string }> => {
    const existing = await getAiConfig();
    const config = buildRuntimeAnalysisConfig({
      apiBaseUrl: payload.apiBaseUrl || existing?.apiBaseUrl || '',
      apiKey: payload.apiKey || existing?.apiKey || '',
      modelName: payload.modelName || existing?.modelName || '',
      contextSize: payload.contextSize || existing?.contextSize || 32000,
    });
    return testAiProviderConnection(config);
  },

  exportAiConfig: async (password: string): Promise<string> => {
    const config = await getAiConfig();
    if (!config) throw new Error('No AI config to export');
    if (!password || password.length < 4) throw new Error('Password must be at least 4 characters');

    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const keyMaterial = await crypto.subtle.importKey(
      'raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );

    const plaintext = encoder.encode(JSON.stringify(config));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      plaintext,
    );

    const payload = {
      v: 1,
      salt: btoa(String.fromCharCode(...salt)),
      iv: btoa(String.fromCharCode(...iv)),
      data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    };
    return JSON.stringify(payload);
  },

  importAiConfig: async (file: File, password: string): Promise<void> => {
    if (!password) throw new Error('Password is required');

    const text = await file.text();
    let envelope: { v: number; salt: string; iv: string; data: string };
    try {
      envelope = JSON.parse(text);
    } catch {
      throw new Error('Invalid config file format');
    }
    if (envelope.v !== 1 || !envelope.salt || !envelope.iv || !envelope.data) {
      throw new Error('Invalid config file structure');
    }

    const decode64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const salt = decode64(envelope.salt);
    const iv = decode64(envelope.iv);
    const ciphertext = decode64(envelope.data);

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );

    let plaintext: ArrayBuffer;
    try {
      plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext,
      );
    } catch {
      throw new Error('Decryption failed. Please check your password.');
    }

    const decoder = new TextDecoder();
    let config: { apiBaseUrl: string; apiKey: string; modelName: string; contextSize: number };
    try {
      config = JSON.parse(decoder.decode(plaintext));
    } catch {
      throw new Error('Decrypted data is not valid JSON');
    }

    if (!config.apiBaseUrl || !config.apiKey || !config.modelName || !config.contextSize) {
      throw new Error('Config file is missing required fields');
    }

    await setAiConfig(config);
  },
};
