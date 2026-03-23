import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Download, Loader2, Save, Upload, Wifi } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../Modal';
import type { AiSettingsManager } from '../../hooks/useAiSettingsManager';
import SettingsActionMenu from './SettingsActionMenu';
import SettingsFeedbackBanner from './SettingsFeedbackBanner';
import SettingsSectionHeader from './SettingsSectionHeader';

interface AiSettingsPanelProps {
  manager: AiSettingsManager;
}

export default function AiSettingsPanel({ manager }: AiSettingsPanelProps) {
  const { t } = useTranslation();
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleImportFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    manager.queueImportFile(file);
    event.target.value = '';
  };

  return (
    <div className="space-y-6">
      <input
        type="file"
        ref={importFileRef}
        onChange={handleImportFileSelected}
        accept=".enc,.json"
        className="hidden"
      />

      <SettingsSectionHeader
        title={t('settings.ai.title')}
        subtitle={t('settings.ai.subtitle')}
        actions={(
          <SettingsActionMenu
            overflow={[
              {
                label: t('settings.common.import'),
                icon: <Upload className="w-4 h-4" />,
                onClick: () => importFileRef.current?.click(),
              },
              {
                label: t('settings.common.export'),
                icon: <Download className="w-4 h-4" />,
                onClick: manager.openExportModal,
                disabled: !manager.settings?.hasApiKey,
              },
            ]}
          />
        )}
      />

      <SettingsFeedbackBanner feedback={manager.feedback} onDismiss={manager.clearFeedback} />

      {manager.isLoading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : (
        <section className="rounded-2xl border border-border-color/20 bg-muted-bg/20 p-5 sm:p-6 space-y-5">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-text-primary">{t('settings.ai.connectionTitle')}</h3>
            <p className="text-sm text-text-secondary leading-6">{t('settings.ai.connectionDescription')}</p>
          </div>

          <div className="grid grid-cols-1 gap-5">
            <label className="space-y-2">
              <span className="text-sm font-medium text-text-primary">{t('settings.ai.apiBaseUrlLabel')}</span>
              <input
                value={manager.form.apiBaseUrl}
                onChange={(event) => manager.updateField('apiBaseUrl', event.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full rounded-xl border border-border-color/20 bg-muted-bg/50 px-4 py-3 text-text-primary outline-none focus:border-accent"
              />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <label className="space-y-2">
                <span className="text-sm font-medium text-text-primary">{t('settings.ai.modelNameLabel')}</span>
                <input
                  value={manager.form.modelName}
                  onChange={(event) => manager.updateField('modelName', event.target.value)}
                  placeholder="gpt-4.1-mini"
                  className="w-full rounded-xl border border-border-color/20 bg-muted-bg/50 px-4 py-3 text-text-primary outline-none focus:border-accent"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-text-primary">{t('settings.ai.contextSizeLabel')}</span>
                <input
                  type="number"
                  min={12000}
                  step={1000}
                  value={manager.form.contextSize}
                  onChange={(event) => manager.updateField('contextSize', Number(event.target.value))}
                  className="w-full rounded-xl border border-border-color/20 bg-muted-bg/50 px-4 py-3 text-text-primary outline-none focus:border-accent"
                />
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-text-primary">{t('settings.ai.apiTokenLabel')}</span>
              <input
                type="password"
                value={manager.form.apiKey}
                onChange={(event) => manager.updateField('apiKey', event.target.value)}
                placeholder={manager.settings?.hasApiKey ? t('settings.ai.apiTokenPlaceholderKeep') : t('settings.ai.apiTokenPlaceholderEmpty')}
                className="w-full rounded-xl border border-border-color/20 bg-muted-bg/50 px-4 py-3 text-text-primary outline-none focus:border-accent"
              />
              {manager.settings?.hasApiKey && (
                <p className="text-xs text-text-secondary">
                  {t('settings.ai.savedTokenLabel', { maskedApiKey: manager.settings.maskedApiKey })}
                </p>
              )}
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void manager.saveSettings()}
              disabled={manager.isSaving}
              className="px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              {manager.isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('settings.ai.saveButton')}
            </button>
            <button
              type="button"
              onClick={() => void manager.testSettings()}
              disabled={manager.isTesting}
              className="px-4 py-2.5 rounded-xl border border-border-color/20 hover:bg-white/5 text-text-primary transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              {manager.isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
              {t('settings.ai.testButton')}
            </button>
          </div>
        </section>
      )}

      <Modal
        isOpen={manager.isExportModalOpen}
        onClose={manager.closeExportModal}
        title={t('settings.ai.exportTitle')}
      >
        <div className="flex flex-col gap-5">
          <p className="text-sm text-text-secondary leading-6">{t('settings.ai.exportHint')}</p>
          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">{t('settings.ai.passwordLabel')}</span>
            <input
              type="password"
              value={manager.exportPassword}
              onChange={(event) => manager.setExportPasswordValue(event.target.value)}
              placeholder={t('settings.ai.passwordPlaceholder')}
              className="w-full rounded-xl border border-border-color/20 bg-muted-bg/50 px-4 py-3 text-text-primary outline-none focus:border-accent"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && manager.exportPassword.length >= 4) {
                  void manager.exportConfig();
                }
              }}
            />
          </label>
          <SettingsFeedbackBanner feedback={manager.exportDialogFeedback} />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={manager.closeExportModal}
              className="px-4 py-2 rounded-lg font-medium hover:bg-white/10 transition-colors"
            >
              {t('common.actions.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void manager.exportConfig()}
              disabled={manager.exportPassword.length < 4 || manager.isExporting}
              className="px-4 py-2 rounded-lg font-medium bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {manager.isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {t('settings.ai.exportButton')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={manager.isImportModalOpen}
        onClose={manager.closeImportModal}
        title={t('settings.ai.importTitle')}
      >
        <div className="flex flex-col gap-5">
          <p className="text-sm text-text-secondary leading-6">{t('settings.ai.importHint')}</p>
          {manager.pendingImportFile && (
            <div className="text-sm text-text-secondary">
              {t('settings.ai.selectedFile')}: <span className="text-text-primary font-medium">{manager.pendingImportFile.name}</span>
            </div>
          )}
          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">{t('settings.ai.passwordLabel')}</span>
            <input
              type="password"
              value={manager.importPassword}
              onChange={(event) => manager.setImportPasswordValue(event.target.value)}
              placeholder={t('settings.ai.passwordPlaceholder')}
              className="w-full rounded-xl border border-border-color/20 bg-muted-bg/50 px-4 py-3 text-text-primary outline-none focus:border-accent"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && manager.importPassword.length >= 4) {
                  void manager.confirmImport();
                }
              }}
            />
          </label>
          <SettingsFeedbackBanner feedback={manager.importDialogFeedback} />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={manager.closeImportModal}
              className="px-4 py-2 rounded-lg font-medium hover:bg-white/10 transition-colors"
            >
              {t('common.actions.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void manager.confirmImport()}
              disabled={!manager.pendingImportFile || manager.importPassword.length < 4 || manager.isImporting}
              className="px-4 py-2 rounded-lg font-medium bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {manager.isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {t('settings.ai.importButton')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
