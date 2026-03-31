export const DEFAULT_ANALYSIS_PROVIDER_ID = 'openai-compatible';

export type AnalysisProviderId = typeof DEFAULT_ANALYSIS_PROVIDER_ID;

export interface OpenAiCompatibleProviderConfig {
  apiBaseUrl: string;
  apiKey: string;
  modelName: string;
}

export type AnalysisProviderConfig = OpenAiCompatibleProviderConfig;

export interface AnalysisProviderRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxOutputTokens: number;
}

export interface AnalysisProviderAdapter {
  generateText: (
    config: AnalysisProviderConfig,
    request: AnalysisProviderRequest,
    signal?: AbortSignal,
  ) => Promise<string>;
  testConnection: (
    config: AnalysisProviderConfig,
    signal?: AbortSignal,
  ) => Promise<string>;
}

export function isAnalysisProviderId(value: unknown): value is AnalysisProviderId {
  return value === DEFAULT_ANALYSIS_PROVIDER_ID;
}
