export const DEFAULT_ANALYSIS_PROVIDER_ID = 'openai-compatible';

export type AnalysisProviderId = typeof DEFAULT_ANALYSIS_PROVIDER_ID;

export function isAnalysisProviderId(value: unknown): value is AnalysisProviderId {
  return value === DEFAULT_ANALYSIS_PROVIDER_ID;
}
