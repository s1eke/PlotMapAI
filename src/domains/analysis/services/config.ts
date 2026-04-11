import type { RuntimeAnalysisConfig } from './types';

import { AppErrorCode } from '@shared/errors';
import { MIN_CONTEXT_SIZE } from './constants';
import { AnalysisConfigError } from './errors';
import {
  isAnalysisProviderId,
} from '../providers';
import { cleanText, coerceContextSize } from './text';

export interface RuntimeAnalysisProviderConfigInput {
  apiBaseUrl?: unknown;
  apiKey?: unknown;
  modelName?: unknown;
}

export interface RuntimeAnalysisConfigInput {
  providerId?: unknown;
  contextSize?: unknown;
  providerConfig?: RuntimeAnalysisProviderConfigInput | null;
}

export function maskApiKey(apiKey: string): string {
  if (!apiKey) return '';
  if (apiKey.length <= 8) return '*'.repeat(apiKey.length);
  return `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(4, apiKey.length - 8))}${apiKey.slice(-4)}`;
}

export function normalizeBaseUrl(value: unknown): string {
  const url = cleanText(value, 512);
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    throw new AnalysisConfigError('AI 接口地址必须以 http:// 或 https:// 开头。', {
      code: AppErrorCode.AI_BASE_URL_INVALID,
      userMessageKey: 'errors.AI_BASE_URL_INVALID',
    });
  }
  return url.replace(/\/+$/, '');
}

export function validateAnalysisConfig(config: RuntimeAnalysisConfig): void {
  if (!config) {
    throw new AnalysisConfigError('请先在设置中完成 AI 接口配置。', {
      code: AppErrorCode.ANALYSIS_CONFIG_INVALID,
      userMessageKey: 'errors.ANALYSIS_CONFIG_INVALID',
    });
  }
  if (!isAnalysisProviderId(config.providerId)) {
    throw new AnalysisConfigError('不支持的 AI Provider。', {
      code: AppErrorCode.AI_PROVIDER_UNSUPPORTED,
      userMessageKey: 'errors.AI_PROVIDER_UNSUPPORTED',
    });
  }

  if (!cleanText(config.providerConfig.apiBaseUrl)) {
    throw new AnalysisConfigError('AI 接口地址不能为空。', {
      code: AppErrorCode.AI_BASE_URL_REQUIRED,
      userMessageKey: 'errors.AI_BASE_URL_REQUIRED',
    });
  }
  if (!cleanText(config.providerConfig.apiKey)) {
    throw new AnalysisConfigError('AI Token 未配置，请先在设置中保存。', {
      code: AppErrorCode.AI_API_KEY_REQUIRED,
      userMessageKey: 'errors.AI_API_KEY_REQUIRED',
    });
  }
  if (!cleanText(config.providerConfig.modelName)) {
    throw new AnalysisConfigError('AI 模型名称不能为空。', {
      code: AppErrorCode.AI_MODEL_NAME_REQUIRED,
      userMessageKey: 'errors.AI_MODEL_NAME_REQUIRED',
    });
  }
  if (coerceContextSize(config.contextSize, MIN_CONTEXT_SIZE) < MIN_CONTEXT_SIZE) {
    throw new AnalysisConfigError(`上下文大小不能小于 ${MIN_CONTEXT_SIZE}。`, {
      code: AppErrorCode.AI_CONTEXT_SIZE_TOO_SMALL,
      userMessageKey: 'errors.AI_CONTEXT_SIZE_TOO_SMALL',
      userMessageParams: { min: MIN_CONTEXT_SIZE },
    });
  }
}

function resolveProviderId(value: unknown) {
  if (!isAnalysisProviderId(value)) {
    throw new AnalysisConfigError('不支持的 AI Provider。', {
      code: AppErrorCode.AI_PROVIDER_UNSUPPORTED,
      userMessageKey: 'errors.AI_PROVIDER_UNSUPPORTED',
    });
  }

  return value;
}

function getProviderField(
  input: RuntimeAnalysisConfigInput,
  field: 'apiBaseUrl' | 'apiKey' | 'modelName',
): unknown {
  const nested = input.providerConfig;
  if (nested && typeof nested === 'object') {
    return nested[field];
  }
  return undefined;
}

export function buildRuntimeAnalysisConfig(
  input: RuntimeAnalysisConfigInput | null | undefined,
): RuntimeAnalysisConfig {
  if (!input) {
    throw new AnalysisConfigError('请先在设置中完成 AI 接口配置。', {
      code: AppErrorCode.ANALYSIS_CONFIG_INVALID,
      userMessageKey: 'errors.ANALYSIS_CONFIG_INVALID',
    });
  }
  const config: RuntimeAnalysisConfig = {
    providerId: resolveProviderId(input.providerId),
    contextSize: Number(input.contextSize) || 0,
    providerConfig: {
      apiBaseUrl: normalizeBaseUrl(getProviderField(input, 'apiBaseUrl')),
      apiKey: cleanText(getProviderField(input, 'apiKey')),
      modelName: cleanText(getProviderField(input, 'modelName')),
    },
  };
  validateAnalysisConfig(config);
  return config;
}
