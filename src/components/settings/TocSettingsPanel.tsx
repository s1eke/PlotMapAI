import { useRef } from 'react';
import { Download, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChangeEvent } from 'react';
import TocRuleModal from '../TocRuleModal';
import type { TocSettingsManager } from '../../hooks/useTocSettingsManager';
import SettingsActionMenu from './SettingsActionMenu';
import SettingsConfirmModal from './SettingsConfirmModal';
import SettingsEmptyState from './SettingsEmptyState';
import SettingsFeedbackBanner from './SettingsFeedbackBanner';
import SettingsSectionHeader from './SettingsSectionHeader';
import RuleCard from '../RuleCard';

interface TocSettingsPanelProps {
  manager: TocSettingsManager;
}

export default function TocSettingsPanel({ manager }: TocSettingsPanelProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    void manager.importYaml(file);
    event.target.value = '';
  };

  const renderActions = () => (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".yaml,.yml"
        className="hidden"
      />
      <SettingsActionMenu
        primary={[
          {
            label: t('settings.toc.addRule'),
            icon: <Plus className="w-4 h-4" />,
            onClick: manager.openCreateRule,
          },
        ]}
        overflow={[
          {
            label: t('settings.common.import'),
            icon: <Upload className="w-4 h-4" />,
            onClick: () => fileInputRef.current?.click(),
          },
          {
            label: t('settings.common.export'),
            icon: <Download className="w-4 h-4" />,
            onClick: () => void manager.exportYaml(),
          },
        ]}
      />
    </>
  );

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title={t('settings.toc.title')}
        subtitle={t('settings.toc.subtitle')}
        actions={renderActions()}
      />

      <SettingsFeedbackBanner feedback={manager.feedback} onDismiss={manager.clearFeedback} />

      {manager.isLoading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : manager.rules.length === 0 ? (
        <SettingsEmptyState
          title={t('settings.toc.emptyTitle')}
          description={t('settings.toc.emptyDescription')}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold text-text-primary border-l-4 border-accent pl-3">
            {t('settings.tocRules')}
            <span className="text-xs font-normal text-text-secondary bg-white/5 px-2 py-0.5 rounded-full">
              {manager.rules.length}
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {manager.rules.map((rule) => (
              <RuleCard
                key={rule.id}
                name={rule.name}
                pattern={rule.rule}
                isEnabled={rule.isEnabled}
                priority={rule.priority}
                isDefault={rule.isDefault}
                isCustom={!rule.isDefault}
                onToggle={(checked) => void manager.toggleRule(rule.id, checked)}
                onEdit={() => manager.openEditRule(rule)}
                onDelete={() => manager.requestDeleteRule(rule)}
              />
            ))}
          </div>
        </div>
      )}

      <TocRuleModal
        isOpen={manager.isRuleModalOpen}
        onClose={manager.closeRuleModal}
        onSave={manager.saveRule}
        rule={manager.editingRule}
      />

      <SettingsConfirmModal
        isOpen={Boolean(manager.pendingDeleteRule)}
        onClose={manager.cancelDeleteRule}
        onConfirm={() => void manager.confirmDeleteRule()}
        title={t('settings.toc.deleteTitle')}
        description={t('settings.toc.deleteConfirm')}
        cancelLabel={t('common.actions.cancel')}
        confirmLabel={t('common.actions.delete')}
        confirmVariant="danger"
        confirmIcon={<Trash2 className="w-4 h-4" />}
      />
    </div>
  );
}
