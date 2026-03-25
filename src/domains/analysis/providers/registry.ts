import { AppErrorCode } from '@shared/errors';
import { AnalysisConfigError } from '../services/errors';
import { openAiCompatibleAnalysisProvider } from './openaiCompatible';
import { DEFAULT_ANALYSIS_PROVIDER_ID } from './types';
import type { AnalysisProviderAdapter, AnalysisProviderId } from './types';

const ANALYSIS_PROVIDER_REGISTRY: Record<AnalysisProviderId, AnalysisProviderAdapter> = {
  [DEFAULT_ANALYSIS_PROVIDER_ID]: openAiCompatibleAnalysisProvider,
};

export function resolveAnalysisProviderAdapter(providerId: AnalysisProviderId): AnalysisProviderAdapter {
  const adapter = ANALYSIS_PROVIDER_REGISTRY[providerId];
  if (!adapter) {
    throw new AnalysisConfigError(`不支持的 AI Provider：${providerId}`, {
      code: AppErrorCode.AI_PROVIDER_UNSUPPORTED,
      userMessageKey: 'errors.AI_PROVIDER_UNSUPPORTED',
      details: { providerId },
    });
  }
  return adapter;
}
