import { translateAppError } from '@shared/errors';
import { DEFAULT_ANALYSIS_PROVIDER_ID } from '@domains/analysis';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { aiConfigApi } from '../api/aiConfig';
import type {
  AiProviderSettings,
  AiProviderSettingsPayload,
} from '../api/types';
import type { SettingsFeedbackState } from '../utils/settingsPage';
import {
  downloadFile,
} from '../utils/settingsPage';

export interface AiSettingsManager {
  settings: AiProviderSettings | null;
  form: AiProviderSettingsPayload;
  isLoading: boolean;
  isSaving: boolean;
  isTesting: boolean;
  isExporting: boolean;
  isImporting: boolean;
  isExportModalOpen: boolean;
  isImportModalOpen: boolean;
  exportPassword: string;
  importPassword: string;
  pendingImportFile: File | null;
  feedback: SettingsFeedbackState | null;
  exportDialogFeedback: SettingsFeedbackState | null;
  importDialogFeedback: SettingsFeedbackState | null;
  clearFeedback: () => void;
  updateField: <K extends keyof AiProviderSettingsPayload>(key: K, value: AiProviderSettingsPayload[K]) => void;
  saveSettings: () => Promise<void>;
  testSettings: () => Promise<void>;
  openExportModal: () => void;
  closeExportModal: () => void;
  setExportPasswordValue: (password: string) => void;
  exportConfig: () => Promise<void>;
  queueImportFile: (file: File) => void;
  closeImportModal: () => void;
  setImportPasswordValue: (password: string) => void;
  confirmImport: () => Promise<void>;
}

const DEFAULT_AI_FORM: AiProviderSettingsPayload = {
  providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
  apiBaseUrl: '',
  apiKey: '',
  modelName: '',
  contextSize: 32000,
  keepExistingApiKey: true,
};

export function useAiSettingsManager(): AiSettingsManager {
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
  const [exportDialogFeedback, setExportDialogFeedback] = useState<SettingsFeedbackState | null>(null);
  const [importDialogFeedback, setImportDialogFeedback] = useState<SettingsFeedbackState | null>(null);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  const syncForm = useCallback((data: AiProviderSettings) => {
    setForm({
      providerId: data.providerId,
      apiBaseUrl: data.apiBaseUrl,
      apiKey: '',
      modelName: data.modelName,
      contextSize: data.contextSize,
      keepExistingApiKey: data.hasApiKey,
    });
  }, []);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await aiConfigApi.getAiProviderSettings();
      setSettings(data);
      syncForm(data);
    } catch (error) {
      console.error('Failed to load AI settings', error);
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
    void loadSettings();
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
  ) => {
    setFeedback(null);
    setForm((previous) => ({ ...previous, [key]: value }));
  }, []);

  const saveSettings = useCallback(async () => {
    setIsSaving(true);
    setFeedback(null);

    try {
      const data = await aiConfigApi.updateAiProviderSettings(buildPayload());
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
  }, [buildPayload, syncForm, t]);

  const testSettings = useCallback(async () => {
    setIsTesting(true);
    setFeedback(null);

    try {
      const result = await aiConfigApi.testAiProviderSettings(buildPayload());
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
  }, [buildPayload, t]);

  const openExportModal = useCallback(() => {
    setExportPassword('');
    setExportDialogFeedback(null);
    setIsExportModalOpen(true);
  }, []);

  const closeExportModal = useCallback(() => {
    setIsExportModalOpen(false);
    setExportPassword('');
    setExportDialogFeedback(null);
  }, []);

  const setExportPasswordValue = useCallback((password: string) => {
    setExportPassword(password);
    setExportDialogFeedback(null);
  }, []);

  const exportConfig = useCallback(async () => {
    if (exportPassword.length < 4) {
      setExportDialogFeedback({
        type: 'error',
        message: t('settings.ai.passwordTooShort'),
      });
      return;
    }

    setIsExporting(true);

    try {
      const content = await aiConfigApi.exportAiConfig(exportPassword);
      downloadFile(content, 'plotmapai-ai-config.enc', 'application/octet-stream');
      closeExportModal();
      setFeedback({
        type: 'success',
        message: t('settings.ai.exportSuccess'),
      });
    } catch (error) {
      setExportDialogFeedback({
        type: 'error',
        message: translateAppError(error, t, 'settings.ai.errorExport', {
          source: 'settings',
          kind: 'execution',
        }),
      });
    } finally {
      setIsExporting(false);
    }
  }, [closeExportModal, exportPassword, t]);

  const queueImportFile = useCallback((file: File) => {
    setPendingImportFile(file);
    setImportPassword('');
    setImportDialogFeedback(null);
    setIsImportModalOpen(true);
  }, []);

  const closeImportModal = useCallback(() => {
    setIsImportModalOpen(false);
    setImportPassword('');
    setImportDialogFeedback(null);
    setPendingImportFile(null);
  }, []);

  const setImportPasswordValue = useCallback((password: string) => {
    setImportPassword(password);
    setImportDialogFeedback(null);
  }, []);

  const confirmImport = useCallback(async () => {
    if (!pendingImportFile) return;

    if (importPassword.length < 4) {
      setImportDialogFeedback({
        type: 'error',
        message: t('settings.ai.passwordTooShort'),
      });
      return;
    }

    setIsImporting(true);

    try {
      await aiConfigApi.importAiConfig(pendingImportFile, importPassword);
      closeImportModal();
      setFeedback({
        type: 'success',
        message: t('settings.ai.importSuccess'),
      });
      await loadSettings();
    } catch (error) {
      setImportDialogFeedback({
        type: 'error',
        message: translateAppError(error, t, 'settings.ai.errorImport', {
          source: 'settings',
          kind: 'execution',
        }),
      });
    } finally {
      setIsImporting(false);
    }
  }, [closeImportModal, importPassword, loadSettings, pendingImportFile, t]);

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
