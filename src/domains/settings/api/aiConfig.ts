import {
  APP_SETTING_KEYS,
  LEGACY_CACHE_KEYS,
  LEGACY_SECURE_KEYS,
  SECURE_KEYS,
  storage,
} from '@infra/storage';
import {
  AppErrorCode,
  createAppError,
} from '@shared/errors';
import {
  DEFAULT_ANALYSIS_PROVIDER_ID,
  type AnalysisProviderId,
  buildRuntimeAnalysisConfig,
  maskApiKey,
  testAiProviderConnection,
} from '@domains/analysis';
import type { AiProviderSettings, AiProviderSettingsPayload } from './types';

interface StoredAiConfigRecord {
  providerId: AnalysisProviderId;
  apiBaseUrl: string;
  modelName: string;
  contextSize: number;
}

interface RuntimeAiConfig {
  providerId: AnalysisProviderId;
  apiBaseUrl: string;
  apiKey: string;
  modelName: string;
  contextSize: number;
}

function sanitizeAiConfigRecord(raw: unknown): StoredAiConfigRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Record<string, unknown>;
  return {
    providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
    apiBaseUrl: typeof parsed.apiBaseUrl === 'string' ? parsed.apiBaseUrl : '',
    modelName: typeof parsed.modelName === 'string' ? parsed.modelName : '',
    contextSize: typeof parsed.contextSize === 'number' ? parsed.contextSize : 32000,
  };
}

async function migrateLegacyAiConfig(): Promise<StoredAiConfigRecord | null> {
  const raw = storage.cache.getString(LEGACY_CACHE_KEYS.aiConfig);
  if (!raw) return null;
  try {
    const config = sanitizeAiConfigRecord(JSON.parse(raw) as unknown);
    storage.cache.remove(LEGACY_CACHE_KEYS.aiConfig);
    if (!config) return null;
    await storage.primary.settings.set(APP_SETTING_KEYS.aiConfig, config);
    return config;
  } catch {
    storage.cache.remove(LEGACY_CACHE_KEYS.aiConfig);
    return null;
  }
}

async function getStoredAiConfigRecord(): Promise<StoredAiConfigRecord | null> {
  const stored = sanitizeAiConfigRecord(
    await storage.primary.settings.get<StoredAiConfigRecord>(APP_SETTING_KEYS.aiConfig),
  );
  if (stored) {
    storage.cache.remove(LEGACY_CACHE_KEYS.aiConfig);
    return stored;
  }
  return migrateLegacyAiConfig();
}

async function getStoredAiApiKey(): Promise<string> {
  const current = await storage.secure.get(SECURE_KEYS.aiApiKey);
  if (current !== null) {
    await storage.secure.remove(LEGACY_SECURE_KEYS.aiApiKey);
    return current;
  }
  const legacy = await storage.secure.get(LEGACY_SECURE_KEYS.aiApiKey);
  if (legacy === null) return '';
  await storage.secure.set(SECURE_KEYS.aiApiKey, legacy);
  await storage.secure.remove(LEGACY_SECURE_KEYS.aiApiKey);
  return legacy;
}

async function setAiConfig(config: RuntimeAiConfig): Promise<void> {
  await storage.primary.settings.set(APP_SETTING_KEYS.aiConfig, {
    providerId: config.providerId,
    apiBaseUrl: config.apiBaseUrl,
    modelName: config.modelName,
    contextSize: config.contextSize,
  } satisfies StoredAiConfigRecord);
  if (config.apiKey) {
    await storage.secure.set(SECURE_KEYS.aiApiKey, config.apiKey);
  } else {
    await storage.secure.remove(SECURE_KEYS.aiApiKey);
  }
  storage.cache.remove(LEGACY_CACHE_KEYS.aiConfig);
  await storage.secure.remove(LEGACY_SECURE_KEYS.aiApiKey);
}

export async function getAiConfig(): Promise<RuntimeAiConfig | null> {
  const stored = await getStoredAiConfigRecord();
  if (!stored) return null;
  return {
    providerId: stored.providerId,
    apiBaseUrl: stored.apiBaseUrl,
    apiKey: await getStoredAiApiKey(),
    modelName: stored.modelName,
    contextSize: stored.contextSize,
  };
}

export function resetDeviceKeyForTesting(): void {
  storage.secure.resetForTesting();
}

export const aiConfigApi = {
  getAiProviderSettings: async (): Promise<AiProviderSettings> => {
    const config = await getAiConfig();
    if (!config) {
      return {
        providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
        apiBaseUrl: '',
        modelName: '',
        contextSize: 32000,
        hasApiKey: false,
        maskedApiKey: '',
        updatedAt: null,
      };
    }
    return {
      providerId: config.providerId,
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
      providerId: payload.providerId || existing?.providerId || DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: payload.apiBaseUrl || existing?.apiBaseUrl || '',
      apiKey,
      modelName: payload.modelName || existing?.modelName || '',
      contextSize: payload.contextSize || existing?.contextSize || 32000,
    });
    await setAiConfig({
      providerId: config.providerId,
      apiBaseUrl: config.providerConfig.apiBaseUrl,
      apiKey: config.providerConfig.apiKey,
      modelName: config.providerConfig.modelName,
      contextSize: config.contextSize,
    });
    return aiConfigApi.getAiProviderSettings();
  },

  testAiProviderSettings: async (payload: Partial<AiProviderSettingsPayload>): Promise<{ message: string; preview: string }> => {
    const existing = await getAiConfig();
    const config = buildRuntimeAnalysisConfig({
      providerId: payload.providerId || existing?.providerId || DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: payload.apiBaseUrl || existing?.apiBaseUrl || '',
      apiKey: payload.apiKey || existing?.apiKey || '',
      modelName: payload.modelName || existing?.modelName || '',
      contextSize: payload.contextSize || existing?.contextSize || 32000,
    });
    return testAiProviderConnection(config);
  },

  exportAiConfig: async (password: string): Promise<string> => {
    const config = await getAiConfig();
    if (!config) {
      throw createAppError({
        code: AppErrorCode.AI_CONFIG_EXPORT_MISSING,
        kind: 'not-found',
        source: 'settings',
        userMessageKey: 'errors.AI_CONFIG_EXPORT_MISSING',
        debugMessage: 'No AI config to export',
      });
    }
    if (!password || password.length < 4) {
      throw createAppError({
        code: AppErrorCode.AI_CONFIG_PASSWORD_TOO_SHORT,
        kind: 'validation',
        source: 'settings',
        userMessageKey: 'errors.AI_CONFIG_PASSWORD_TOO_SHORT',
        debugMessage: 'Password must be at least 4 characters',
      });
    }

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

    const plaintext = encoder.encode(JSON.stringify(config));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return JSON.stringify({
      v: 1,
      salt: btoa(String.fromCharCode(...salt)),
      iv: btoa(String.fromCharCode(...iv)),
      data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    });
  },

  importAiConfig: async (file: File, password: string): Promise<void> => {
    if (!password) {
      throw createAppError({
        code: AppErrorCode.AI_CONFIG_PASSWORD_REQUIRED,
        kind: 'validation',
        source: 'settings',
        userMessageKey: 'errors.AI_CONFIG_PASSWORD_REQUIRED',
        debugMessage: 'Password is required',
      });
    }
    const text = await file.text();
    let envelope: { v: number; salt: string; iv: string; data: string };
    try {
      envelope = JSON.parse(text);
    } catch {
      throw createAppError({
        code: AppErrorCode.AI_CONFIG_FILE_FORMAT_INVALID,
        kind: 'validation',
        source: 'settings',
        userMessageKey: 'errors.AI_CONFIG_FILE_FORMAT_INVALID',
        debugMessage: 'Invalid config file format',
      });
    }
    if (envelope.v !== 1 || !envelope.salt || !envelope.iv || !envelope.data) {
      throw createAppError({
        code: AppErrorCode.AI_CONFIG_FILE_STRUCTURE_INVALID,
        kind: 'validation',
        source: 'settings',
        userMessageKey: 'errors.AI_CONFIG_FILE_STRUCTURE_INVALID',
        debugMessage: 'Invalid config file structure',
      });
    }

    const decode64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
    const salt = decode64(envelope.salt);
    const iv = decode64(envelope.iv);
    const ciphertext = decode64(envelope.data);
    const encoder = new TextEncoder();
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
      ['decrypt'],
    );

    let plaintext: ArrayBuffer;
    try {
      plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    } catch {
      throw createAppError({
        code: AppErrorCode.AI_CONFIG_DECRYPT_FAILED,
        kind: 'validation',
        source: 'settings',
        userMessageKey: 'errors.AI_CONFIG_DECRYPT_FAILED',
        debugMessage: 'Decryption failed. Please check your password.',
      });
    }

    let config: RuntimeAiConfig;
    try {
      config = JSON.parse(new TextDecoder().decode(plaintext)) as RuntimeAiConfig;
    } catch {
      throw createAppError({
        code: AppErrorCode.AI_CONFIG_JSON_INVALID,
        kind: 'validation',
        source: 'settings',
        userMessageKey: 'errors.AI_CONFIG_JSON_INVALID',
        debugMessage: 'Decrypted data is not valid JSON',
      });
    }

    let runtimeConfig;
    try {
      runtimeConfig = buildRuntimeAnalysisConfig({
        providerId: config.providerId,
        apiBaseUrl: config.apiBaseUrl,
        apiKey: config.apiKey,
        modelName: config.modelName,
        contextSize: config.contextSize,
      });
    } catch (error) {
      throw createAppError({
        code: AppErrorCode.AI_CONFIG_MISSING_FIELDS,
        kind: 'validation',
        source: 'settings',
        userMessageKey: 'errors.AI_CONFIG_MISSING_FIELDS',
        debugMessage: 'Imported AI config is missing required fields',
        cause: error,
      });
    }
    await setAiConfig({
      providerId: runtimeConfig.providerId,
      apiBaseUrl: runtimeConfig.providerConfig.apiBaseUrl,
      apiKey: runtimeConfig.providerConfig.apiKey,
      modelName: runtimeConfig.providerConfig.modelName,
      contextSize: runtimeConfig.contextSize,
    });
  },
};
