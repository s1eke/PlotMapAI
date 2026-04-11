import {
  APP_SETTING_KEYS,
  SECURE_KEYS,
  storage,
} from '@infra/storage';
import { DEFAULT_ANALYSIS_PROVIDER_ID, isAnalysisProviderId, type AnalysisProviderId } from '@shared/contracts';
import { AppErrorCode, createAppError } from '@shared/errors';

import type { AiProviderSettings, RuntimeAiConfig } from './types';

interface StoredAiConfigRecord {
  providerId: AnalysisProviderId;
  apiBaseUrl: string;
  modelName: string;
  contextSize: number;
}

const DEFAULT_CONTEXT_SIZE = 32000;
const MIN_CONTEXT_SIZE = 12000;

function maskApiKey(apiKey: string): string {
  if (!apiKey) return '';
  if (apiKey.length <= 8) return '*'.repeat(apiKey.length);
  return `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(4, apiKey.length - 8))}${apiKey.slice(-4)}`;
}

function sanitizeAiConfigRecord(raw: unknown): StoredAiConfigRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Record<string, unknown>;
  if (!isAnalysisProviderId(parsed.providerId)) {
    return null;
  }

  return {
    providerId: parsed.providerId,
    apiBaseUrl: typeof parsed.apiBaseUrl === 'string' ? parsed.apiBaseUrl : '',
    modelName: typeof parsed.modelName === 'string' ? parsed.modelName : '',
    contextSize: typeof parsed.contextSize === 'number' ? parsed.contextSize : DEFAULT_CONTEXT_SIZE,
  };
}

function assertImportedAiConfig(raw: unknown): RuntimeAiConfig {
  if (!raw || typeof raw !== 'object') {
    throw createAppError({
      code: AppErrorCode.AI_CONFIG_MISSING_FIELDS,
      kind: 'validation',
      source: 'settings',
      userMessageKey: 'errors.AI_CONFIG_MISSING_FIELDS',
      debugMessage: 'Imported AI config is missing required fields',
    });
  }

  const parsed = raw as Record<string, unknown>;
  if (!isAnalysisProviderId(parsed.providerId)) {
    throw createAppError({
      code: AppErrorCode.AI_CONFIG_MISSING_FIELDS,
      kind: 'validation',
      source: 'settings',
      userMessageKey: 'errors.AI_CONFIG_MISSING_FIELDS',
      debugMessage: 'Imported AI config is missing required fields',
    });
  }

  const config: RuntimeAiConfig = {
    providerId: parsed.providerId,
    apiBaseUrl: typeof parsed.apiBaseUrl === 'string' ? parsed.apiBaseUrl.trim() : '',
    apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '',
    modelName: typeof parsed.modelName === 'string' ? parsed.modelName.trim() : '',
    contextSize: typeof parsed.contextSize === 'number' ? parsed.contextSize : 0,
  };

  const hasValidBaseUrl = /^https?:\/\//i.test(config.apiBaseUrl);
  if (
    !config.apiBaseUrl ||
    !hasValidBaseUrl ||
    !config.apiKey ||
    !config.modelName ||
    !Number.isFinite(config.contextSize) ||
    config.contextSize < MIN_CONTEXT_SIZE
  ) {
    throw createAppError({
      code: AppErrorCode.AI_CONFIG_MISSING_FIELDS,
      kind: 'validation',
      source: 'settings',
      userMessageKey: 'errors.AI_CONFIG_MISSING_FIELDS',
      debugMessage: 'Imported AI config is missing required fields',
    });
  }

  return config;
}

async function getStoredAiConfigRecord(): Promise<StoredAiConfigRecord | null> {
  return sanitizeAiConfigRecord(
    await storage.primary.settings.get<StoredAiConfigRecord>(APP_SETTING_KEYS.aiConfig),
  );
}

async function getStoredAiApiKey(): Promise<string> {
  return (await storage.secure.get(SECURE_KEYS.aiApiKey)) ?? '';
}

export async function saveAiConfig(config: RuntimeAiConfig): Promise<void> {
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

export async function getAiProviderSettings(): Promise<AiProviderSettings> {
  const config = await getAiConfig();
  if (!config) {
    return {
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: '',
      modelName: '',
      contextSize: DEFAULT_CONTEXT_SIZE,
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
    hasApiKey: Boolean(config.apiKey),
    maskedApiKey: maskApiKey(config.apiKey),
    updatedAt: null,
  };
}

export function resetDeviceKeyForTesting(): void {
  storage.secure.resetForTesting();
}

export async function exportAiConfig(password: string): Promise<string> {
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
}

export async function importAiConfig(file: File, password: string): Promise<void> {
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

  const decode64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
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
    config = assertImportedAiConfig(JSON.parse(new TextDecoder().decode(plaintext)) as unknown);
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      throw error;
    }

    throw createAppError({
      code: AppErrorCode.AI_CONFIG_JSON_INVALID,
      kind: 'validation',
      source: 'settings',
      userMessageKey: 'errors.AI_CONFIG_JSON_INVALID',
      debugMessage: 'Decrypted data is not valid JSON',
      cause: error,
    });
  }

  await saveAiConfig(config);
}

export const aiConfigRepository = {
  exportAiConfig,
  getAiConfig,
  getAiProviderSettings,
  importAiConfig,
  saveAiConfig,
};
