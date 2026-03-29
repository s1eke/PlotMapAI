import type { AnalysisProviderId } from '@domains/analysis';

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
  exclusiveGroup?: string;
  isDefault: boolean;
  timeoutMs: number;
  createdAt?: string;
}

export interface AiProviderSettings {
  providerId: AnalysisProviderId;
  apiBaseUrl: string;
  modelName: string;
  contextSize: number;
  hasApiKey: boolean;
  maskedApiKey: string;
  updatedAt?: string | null;
}

export interface AiProviderSettingsPayload {
  providerId: AnalysisProviderId;
  apiBaseUrl: string;
  apiKey?: string;
  modelName: string;
  contextSize: number;
  keepExistingApiKey?: boolean;
}
