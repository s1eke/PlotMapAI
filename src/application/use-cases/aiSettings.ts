import type { AiProviderSettings, AiProviderSettingsPayload } from '@domains/settings';

import { buildRuntimeAnalysisConfig, testAiProviderConnection } from '@domains/analysis';
import {
  aiConfigRepository,
  getAiConfig,
  getAiProviderSettings,
  saveAiConfig,
} from '@domains/settings';
import { DEFAULT_ANALYSIS_PROVIDER_ID } from '@shared/contracts';

function resolveApiKey(
  payload: Partial<AiProviderSettingsPayload>,
  existing: Awaited<ReturnType<typeof getAiConfig>>,
): string {
  const keepExisting = payload.keepExistingApiKey !== false;
  const nextApiKey = payload.apiKey ?? '';
  if (!nextApiKey && keepExisting && existing) {
    return existing.apiKey;
  }

  return nextApiKey;
}

export async function saveAiProviderSettings(
  payload: AiProviderSettingsPayload,
): Promise<AiProviderSettings> {
  const existing = await getAiConfig();
  const config = buildRuntimeAnalysisConfig({
    providerId: payload.providerId || existing?.providerId || DEFAULT_ANALYSIS_PROVIDER_ID,
    contextSize: payload.contextSize ?? existing?.contextSize ?? 32000,
    providerConfig: {
      apiBaseUrl: payload.apiBaseUrl ?? existing?.apiBaseUrl ?? '',
      apiKey: resolveApiKey(payload, existing),
      modelName: payload.modelName ?? existing?.modelName ?? '',
    },
  });

  await saveAiConfig({
    apiBaseUrl: config.providerConfig.apiBaseUrl,
    apiKey: config.providerConfig.apiKey,
    contextSize: config.contextSize,
    modelName: config.providerConfig.modelName,
    providerId: config.providerId,
  });

  return getAiProviderSettings();
}

export async function testAiProviderSettings(
  payload: Partial<AiProviderSettingsPayload>,
): Promise<{ message: string; preview: string }> {
  const existing = await getAiConfig();
  const config = buildRuntimeAnalysisConfig({
    providerId: payload.providerId ?? existing?.providerId ?? DEFAULT_ANALYSIS_PROVIDER_ID,
    contextSize: payload.contextSize ?? existing?.contextSize ?? 32000,
    providerConfig: {
      apiBaseUrl: payload.apiBaseUrl ?? existing?.apiBaseUrl ?? '',
      apiKey: resolveApiKey(payload, existing),
      modelName: payload.modelName ?? existing?.modelName ?? '',
    },
  });

  return testAiProviderConnection(config);
}

export async function exportAiProviderSettings(password: string): Promise<string> {
  return aiConfigRepository.exportAiConfig(password);
}

export async function importAiProviderSettings(file: File, password: string): Promise<void> {
  await aiConfigRepository.importAiConfig(file, password);
}
