import type { AiProviderSettings, AiProviderSettingsPayload } from './types';
import type { SettingsFeedbackState } from './utils/settingsPage';

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
  updateField: <K extends keyof AiProviderSettingsPayload>(
    key: K,
    value: AiProviderSettingsPayload[K],
  ) => void;
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

export interface AiSettingsManagerActions {
  exportAiProviderSettings: (password: string) => Promise<string>;
  importAiProviderSettings: (file: File, password: string) => Promise<void>;
  saveAiProviderSettings: (
    payload: AiProviderSettingsPayload,
  ) => Promise<AiProviderSettings>;
  testAiProviderSettings: (
    payload: Partial<AiProviderSettingsPayload>,
  ) => Promise<{ message: string; preview: string }>;
}
