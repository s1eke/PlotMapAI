import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  exportAiProviderSettings,
  importAiProviderSettings,
  saveAiProviderSettings,
  testAiProviderSettings,
} from '@application/use-cases/settings';
import {
  downloadFile,
  getAiProviderSettings,
} from '@domains/settings';

import { useAiSettingsManager } from '../useAiSettingsManager';

const tMock = vi.hoisted(() => (
  (key: string, options?: { preview?: string; version?: string }) => {
    if (options?.preview) {
      return `${key}:${options.preview}`;
    }

    if (options?.version) {
      return `${key} ${options.version}`;
    }

    return key;
  }
));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: tMock,
  }),
}));

vi.mock('@application/use-cases/settings', () => ({
  exportAiProviderSettings: vi.fn(),
  importAiProviderSettings: vi.fn(),
  saveAiProviderSettings: vi.fn(),
  testAiProviderSettings: vi.fn(),
}));

vi.mock('@domains/settings', () => ({
  downloadFile: vi.fn(),
  getAiProviderSettings: vi.fn(),
}));

vi.mock('@shared/errors', async () => {
  const actual = await vi.importActual<typeof import('@shared/errors')>('@shared/errors');
  return {
    ...actual,
    translateAppError: vi.fn((_error: unknown, _t: unknown, fallbackKey: string) => fallbackKey),
  };
});

const baseSettings = {
  apiBaseUrl: 'https://api.openai.com/v1',
  contextSize: 32000,
  hasApiKey: true,
  maskedApiKey: 'sk-***',
  modelName: 'gpt-4.1-mini',
  providerId: 'openai',
};

describe('useAiSettingsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAiProviderSettings).mockResolvedValue(baseSettings);
  });

  it('loads settings and syncs the editable form', async () => {
    const { result } = renderHook(() => useAiSettingsManager());

    await waitFor(() => {
      expect(result.current.settings).toEqual(baseSettings);
    });

    expect(result.current.form).toMatchObject({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      contextSize: 32000,
      keepExistingApiKey: true,
      modelName: 'gpt-4.1-mini',
      providerId: 'openai',
    });
  });

  it('surfaces load failures', async () => {
    vi.mocked(getAiProviderSettings).mockRejectedValueOnce(new Error('load failed'));

    const { result } = renderHook(() => useAiSettingsManager());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.feedback).toEqual({
      type: 'error',
      message: 'settings.ai.loadFailed',
    });
  });

  it('saves settings and resyncs the form after success', async () => {
    const savedSettings = {
      ...baseSettings,
      apiBaseUrl: 'https://example.com/v1',
      modelName: 'gpt-5-mini',
    };
    vi.mocked(saveAiProviderSettings).mockResolvedValue(savedSettings);

    const { result } = renderHook(() => useAiSettingsManager());

    await waitFor(() => {
      expect(result.current.settings).toEqual(baseSettings);
    });

    act(() => {
      result.current.updateField('apiBaseUrl', ' https://example.com/v1 ');
      result.current.updateField('apiKey', '  secret-key  ');
      result.current.updateField('modelName', ' gpt-5-mini ');
    });

    await act(async () => {
      await result.current.saveSettings();
    });

    expect(saveAiProviderSettings).toHaveBeenCalledWith({
      apiBaseUrl: 'https://example.com/v1',
      apiKey: 'secret-key',
      contextSize: 32000,
      keepExistingApiKey: false,
      modelName: 'gpt-5-mini',
      providerId: 'openai',
    });
    expect(result.current.feedback).toEqual({
      type: 'success',
      message: 'settings.ai.saveSuccess',
    });
    expect(result.current.settings).toEqual(savedSettings);
    expect(result.current.form.apiKey).toBe('');
  });

  it('surfaces save failures', async () => {
    vi.mocked(saveAiProviderSettings).mockRejectedValueOnce(new Error('save failed'));

    const { result } = renderHook(() => useAiSettingsManager());

    await waitFor(() => {
      expect(result.current.settings).toEqual(baseSettings);
    });

    await act(async () => {
      await result.current.saveSettings();
    });

    expect(result.current.feedback).toEqual({
      type: 'error',
      message: 'settings.ai.saveFailed',
    });
  });

  it('handles test connection success and failure', async () => {
    vi.mocked(testAiProviderSettings)
      .mockResolvedValueOnce({ message: 'Connection OK', preview: 'pong' })
      .mockRejectedValueOnce(new Error('test failed'));

    const { result } = renderHook(() => useAiSettingsManager());

    await waitFor(() => {
      expect(result.current.settings).toEqual(baseSettings);
    });

    await act(async () => {
      await result.current.testSettings();
    });

    expect(result.current.feedback).toEqual({
      type: 'success',
      message: 'Connection OK settings.ai.testPreviewPrefix:pong',
    });

    await act(async () => {
      await result.current.testSettings();
    });

    expect(result.current.feedback).toEqual({
      type: 'error',
      message: 'settings.ai.testFailed',
    });
  });

  it('validates passwords and handles export failure and success', async () => {
    vi.mocked(exportAiProviderSettings)
      .mockRejectedValueOnce(new Error('export failed'))
      .mockResolvedValueOnce('encrypted-config');

    const { result } = renderHook(() => useAiSettingsManager());

    await waitFor(() => {
      expect(result.current.settings).toEqual(baseSettings);
    });

    act(() => {
      result.current.openExportModal();
    });

    await act(async () => {
      await result.current.exportConfig();
    });

    expect(result.current.exportDialogFeedback).toEqual({
      type: 'error',
      message: 'settings.ai.passwordTooShort',
    });

    act(() => {
      result.current.setExportPasswordValue('good-password');
    });

    await act(async () => {
      await result.current.exportConfig();
    });

    expect(result.current.exportDialogFeedback).toEqual({
      type: 'error',
      message: 'settings.ai.exportFailed',
    });

    await act(async () => {
      await result.current.exportConfig();
    });

    expect(exportAiProviderSettings).toHaveBeenLastCalledWith('good-password');
    expect(downloadFile).toHaveBeenCalledWith(
      'encrypted-config',
      'plotmapai-ai-config.enc',
      'application/octet-stream',
    );
    expect(result.current.isExportModalOpen).toBe(false);
    expect(result.current.feedback).toEqual({
      type: 'success',
      message: 'settings.ai.exportSuccess',
    });
  });

  it('validates passwords and handles import failure and success with form resync', async () => {
    const importedSettings = {
      ...baseSettings,
      apiBaseUrl: 'https://imported.example/v1',
      modelName: 'gpt-5',
    };

    vi.mocked(getAiProviderSettings)
      .mockResolvedValueOnce(baseSettings)
      .mockResolvedValueOnce(importedSettings);
    vi.mocked(importAiProviderSettings)
      .mockRejectedValueOnce(new Error('import failed'))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAiSettingsManager());

    await waitFor(() => {
      expect(result.current.settings).toEqual(baseSettings);
    });

    act(() => {
      result.current.queueImportFile(new File(['encrypted'], 'config.enc', { type: 'application/octet-stream' }));
    });

    await act(async () => {
      await result.current.confirmImport();
    });

    expect(result.current.importDialogFeedback).toEqual({
      type: 'error',
      message: 'settings.ai.passwordTooShort',
    });

    act(() => {
      result.current.setImportPasswordValue('good-password');
    });

    await act(async () => {
      await result.current.confirmImport();
    });

    expect(result.current.importDialogFeedback).toEqual({
      type: 'error',
      message: 'settings.ai.importFailed',
    });

    await act(async () => {
      await result.current.confirmImport();
    });

    expect(importAiProviderSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'config.enc' }),
      'good-password',
    );
    expect(result.current.settings).toEqual(importedSettings);
    expect(result.current.form).toMatchObject({
      apiBaseUrl: 'https://imported.example/v1',
      apiKey: '',
      modelName: 'gpt-5',
    });
    expect(result.current.isImportModalOpen).toBe(false);
    expect(result.current.feedback).toEqual({
      type: 'success',
      message: 'settings.ai.importSuccess',
    });
  });
});
