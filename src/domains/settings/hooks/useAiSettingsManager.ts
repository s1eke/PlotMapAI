import type {
  AiSettingsManager,
  AiSettingsManagerActions,
} from '../settingsManagers';
import type {
  AiProviderSettings,
  AiProviderSettingsPayload,
} from '../types';
import type { SettingsFeedbackState } from '../utils/settingsPage';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DEFAULT_ANALYSIS_PROVIDER_ID } from '@shared/contracts';
import { translateAppError } from '@shared/errors';

import { getAiProviderSettings } from '../aiConfigRepository';
import { downloadFile } from '../utils/settingsPage';

const DEFAULT_AI_FORM: AiProviderSettingsPayload = {
  providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
  apiBaseUrl: '',
  apiKey: '',
  modelName: '',
  contextSize: 32000,
  keepExistingApiKey: true,
};

export function useAiSettingsManager(
  actions: AiSettingsManagerActions,
): AiSettingsManager {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AiProviderSettings | null>(null);
  const [form, setForm] = useState<AiProviderSettingsPayload>(DEFAULT_AI_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<SettingsFeedbackState | null>(null);
  const [exportDialogFeedback, setExportDialogFeedback] =
    useState<SettingsFeedbackState | null>(null);
  const [importDialogFeedback, setImportDialogFeedback] =
    useState<SettingsFeedbackState | null>(null);

  const clearFeedback = useCallback((): void => {
    setFeedback(null);
  }, []);

  const syncForm = useCallback((data: AiProviderSettings): void => {
    setForm({
      providerId: data.providerId,
      apiBaseUrl: data.apiBaseUrl,
      apiKey: '',
      modelName: data.modelName,
      contextSize: data.contextSize,
      keepExistingApiKey: data.hasApiKey,
    });
  }, []);

  const loadSettings = useCallback(async (): Promise<void> => {
    setIsLoading(true);

    try {
      const data = await getAiProviderSettings();
      setSettings(data);
      syncForm(data);
    } catch (error) {
      setFeedback({
        type: 'error',
        message: translateAppError(error, t, 'settings.ai.loadFailed', {
          source: 'settings',
          kind: 'execution',
        }),
      });
    } finally {
      setIsLoading(false);
    }
  }, [syncForm, t]);

  useEffect(() => {
    loadSettings().catch(() => undefined);
  }, [loadSettings]);

  const buildPayload = useCallback((): AiProviderSettingsPayload => {
    const apiKey = form.apiKey?.trim() ?? '';

    return {
      providerId: form.providerId,
      apiBaseUrl: form.apiBaseUrl.trim(),
      apiKey,
      modelName: form.modelName.trim(),
      contextSize: Number(form.contextSize),
      keepExistingApiKey: apiKey ? false : Boolean(settings?.hasApiKey),
    };
  }, [form, settings?.hasApiKey]);

  const updateField = useCallback(<K extends keyof AiProviderSettingsPayload>(
    key: K,
    value: AiProviderSettingsPayload[K],
  ): void => {
    setFeedback(null);
    setForm((previous) => ({ ...previous, [key]: value }));
  }, []);

  const saveSettings = useCallback(async (): Promise<void> => {
    setIsSaving(true);
    setFeedback(null);

    try {
      const data = await actions.saveAiProviderSettings(buildPayload());
      setSettings(data);
      syncForm(data);
      setFeedback({
        type: 'success',
        message: t('settings.ai.saveSuccess'),
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: translateAppError(error, t, 'settings.ai.saveFailed', {
          source: 'settings',
          kind: 'execution',
        }),
      });
    } finally {
      setIsSaving(false);
    }
  }, [actions, buildPayload, syncForm, t]);

  const testSettings = useCallback(async (): Promise<void> => {
    setIsTesting(true);
    setFeedback(null);

    try {
      const result = await actions.testAiProviderSettings(buildPayload());
      const preview = result.preview
        ? ` ${t('settings.ai.testPreviewPrefix', { preview: result.preview })}`
        : '';

      setFeedback({
        type: 'success',
        message: `${result.message}${preview}`.trim(),
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: translateAppError(error, t, 'settings.ai.testFailed', {
          source: 'settings',
          kind: 'execution',
        }),
      });
    } finally {
      setIsTesting(false);
    }
  }, [actions, buildPayload, t]);

  const openExportModal = useCallback((): void => {
    setExportPassword('');
    setExportDialogFeedback(null);
    setIsExportModalOpen(true);
  }, []);

  const closeExportModal = useCallback((): void => {
    setIsExportModalOpen(false);
    setExportPassword('');
    setExportDialogFeedback(null);
  }, []);

  const setExportPasswordValue = useCallback((password: string): void => {
    setExportPassword(password);
    setExportDialogFeedback(null);
  }, []);

  const exportConfig = useCallback(async (): Promise<void> => {
    if (exportPassword.length < 4) {
      setExportDialogFeedback({
        type: 'error',
        message: t('settings.ai.passwordTooShort'),
      });
      return;
    }

    setIsExporting(true);

    try {
      const content = await actions.exportAiProviderSettings(exportPassword);
      downloadFile(content, 'plotmapai-ai-config.enc', 'application/octet-stream');
      closeExportModal();
      setFeedback({
        type: 'success',
        message: t('settings.ai.exportSuccess'),
      });
    } catch (error) {
      setExportDialogFeedback({
        type: 'error',
        message: translateAppError(error, t, 'settings.ai.exportFailed', {
          source: 'settings',
          kind: 'execution',
        }),
      });
    } finally {
      setIsExporting(false);
    }
  }, [actions, closeExportModal, exportPassword, t]);

  const queueImportFile = useCallback((file: File): void => {
    setPendingImportFile(file);
    setImportPassword('');
    setImportDialogFeedback(null);
    setIsImportModalOpen(true);
  }, []);

  const closeImportModal = useCallback((): void => {
    setPendingImportFile(null);
    setImportPassword('');
    setImportDialogFeedback(null);
    setIsImportModalOpen(false);
  }, []);

  const setImportPasswordValue = useCallback((password: string): void => {
    setImportPassword(password);
    setImportDialogFeedback(null);
  }, []);

  const confirmImport = useCallback(async (): Promise<void> => {
    if (!pendingImportFile) {
      return;
    }

    if (importPassword.length < 4) {
      setImportDialogFeedback({
        type: 'error',
        message: t('settings.ai.passwordTooShort'),
      });
      return;
    }

    setIsImporting(true);

    try {
      await actions.importAiProviderSettings(pendingImportFile, importPassword);
      const data = await getAiProviderSettings();
      setSettings(data);
      syncForm(data);
      closeImportModal();
      setFeedback({
        type: 'success',
        message: t('settings.ai.importSuccess'),
      });
    } catch (error) {
      setImportDialogFeedback({
        type: 'error',
        message: translateAppError(error, t, 'settings.ai.importFailed', {
          source: 'settings',
          kind: 'execution',
        }),
      });
    } finally {
      setIsImporting(false);
    }
  }, [actions, closeImportModal, importPassword, pendingImportFile, syncForm, t]);

  return {
    settings,
    form,
    isLoading,
    isSaving,
    isTesting,
    isExporting,
    isImporting,
    isExportModalOpen,
    isImportModalOpen,
    exportPassword,
    importPassword,
    pendingImportFile,
    feedback,
    exportDialogFeedback,
    importDialogFeedback,
    clearFeedback,
    updateField,
    saveSettings,
    testSettings,
    openExportModal,
    closeExportModal,
    setExportPasswordValue,
    exportConfig,
    queueImportFile,
    closeImportModal,
    setImportPasswordValue,
    confirmImport,
  };
}
