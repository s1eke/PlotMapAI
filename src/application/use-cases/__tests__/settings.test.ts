import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  aiConfigRepository,
  getAiConfig,
  getAiProviderSettings,
  saveAiConfig,
} from '@domains/settings/aiConfigRepository';
import {
  buildRuntimeAnalysisConfig,
  testAiProviderConnection,
} from '@domains/analysis';

import {
  exportAiProviderSettings,
  importAiProviderSettings,
  saveAiProviderSettings,
  testAiProviderSettings,
} from '../settings';

vi.mock('@domains/analysis', () => ({
  buildRuntimeAnalysisConfig: vi.fn(),
  testAiProviderConnection: vi.fn(),
}));

vi.mock('@domains/settings/aiConfigRepository', () => ({
  aiConfigRepository: {
    exportAiConfig: vi.fn(),
    importAiConfig: vi.fn(),
  },
  getAiConfig: vi.fn(),
  getAiProviderSettings: vi.fn(),
  saveAiConfig: vi.fn(),
}));

describe('application settings use-cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAiConfig).mockResolvedValue({
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'saved-token',
      contextSize: 32000,
      modelName: 'gpt-saved',
      providerId: 'openai-compatible',
    });
    vi.mocked(buildRuntimeAnalysisConfig).mockImplementation((input) => ({
      contextSize: input.contextSize,
      providerConfig: {
        apiBaseUrl: input.apiBaseUrl,
        apiKey: input.apiKey,
        modelName: input.modelName,
      },
      providerId: input.providerId,
    }));
    vi.mocked(getAiProviderSettings).mockResolvedValue({
      apiBaseUrl: 'http://localhost:9000',
      contextSize: 48000,
      hasApiKey: true,
      maskedApiKey: 'sk-t******6789',
      modelName: 'gpt-next',
      providerId: 'openai-compatible',
      updatedAt: null,
    });
    vi.mocked(testAiProviderConnection).mockResolvedValue({
      message: 'Connection ok',
      preview: 'pong',
    });
  });

  it('saveAiProviderSettings validates through the analysis runtime builder and persists the merged config', async () => {
    const result = await saveAiProviderSettings({
      apiBaseUrl: 'http://localhost:9000',
      apiKey: '',
      contextSize: 48000,
      keepExistingApiKey: true,
      modelName: 'gpt-next',
      providerId: 'openai-compatible',
    });

    expect(buildRuntimeAnalysisConfig).toHaveBeenCalledWith({
      apiBaseUrl: 'http://localhost:9000',
      apiKey: 'saved-token',
      contextSize: 48000,
      modelName: 'gpt-next',
      providerId: 'openai-compatible',
    });
    expect(saveAiConfig).toHaveBeenCalledWith({
      apiBaseUrl: 'http://localhost:9000',
      apiKey: 'saved-token',
      contextSize: 48000,
      modelName: 'gpt-next',
      providerId: 'openai-compatible',
    });
    expect(result).toMatchObject({
      apiBaseUrl: 'http://localhost:9000',
      modelName: 'gpt-next',
    });
  });

  it('testAiProviderSettings reuses the saved key when the form keeps it empty', async () => {
    const result = await testAiProviderSettings({
      apiBaseUrl: 'http://localhost:9000',
      apiKey: '',
      contextSize: 48000,
      keepExistingApiKey: true,
      modelName: 'gpt-next',
      providerId: 'openai-compatible',
    });

    expect(buildRuntimeAnalysisConfig).toHaveBeenCalledWith({
      apiBaseUrl: 'http://localhost:9000',
      apiKey: 'saved-token',
      contextSize: 48000,
      modelName: 'gpt-next',
      providerId: 'openai-compatible',
    });
    expect(testAiProviderConnection).toHaveBeenCalledWith({
      contextSize: 48000,
      providerConfig: {
        apiBaseUrl: 'http://localhost:9000',
        apiKey: 'saved-token',
        modelName: 'gpt-next',
      },
      providerId: 'openai-compatible',
    });
    expect(result).toEqual({
      message: 'Connection ok',
      preview: 'pong',
    });
  });

  it('proxies ai config export and import through the settings repository', async () => {
    const file = new File(['encrypted'], 'plotmapai-ai-config.enc', {
      type: 'application/octet-stream',
    });
    vi.mocked(aiConfigRepository.exportAiConfig).mockResolvedValue('encrypted');
    vi.mocked(aiConfigRepository.importAiConfig).mockResolvedValue(undefined);

    await expect(exportAiProviderSettings('secret')).resolves.toBe('encrypted');
    await expect(importAiProviderSettings(file, 'secret')).resolves.toBeUndefined();

    expect(aiConfigRepository.exportAiConfig).toHaveBeenCalledWith('secret');
    expect(aiConfigRepository.importAiConfig).toHaveBeenCalledWith(file, 'secret');
  });
});
