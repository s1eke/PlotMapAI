export {
  DEFAULT_ANALYSIS_PROVIDER_ID,
  isAnalysisProviderId,
} from '@shared/contracts';
export type { AnalysisProviderId } from '@shared/contracts';

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
