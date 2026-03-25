import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Download, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PurificationRuleModal from '../PurificationRuleModal';
import RuleCard from '../RuleCard';
import type { PurificationSettingsManager } from '../../hooks/usePurificationSettingsManager';
import SettingsActionMenu from './SettingsActionMenu';
import SettingsConfirmModal from './SettingsConfirmModal';
import SettingsEmptyState from './SettingsEmptyState';
import SettingsFeedbackBanner from './SettingsFeedbackBanner';
import SettingsSectionHeader from './SettingsSectionHeader';

interface PurificationSettingsPanelProps {
  manager: PurificationSettingsManager;
}

export default function PurificationSettingsPanel({ manager }: PurificationSettingsPanelProps) {
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
            label: t('settings.purification.addRule'),
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
          ...(manager.rules.length > 0
            ? [{
                label: t('settings.purification.clearAll'),
                icon: <Trash2 className="w-4 h-4" />,
                onClick: manager.requestClearAll,
                variant: 'danger' as const,
              }]
            : []),
        ]}
      />
    </>
  );

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title={t('settings.purification.title')}
        subtitle={t('settings.purification.subtitle')}
        actions={renderActions()}
      />

      <SettingsFeedbackBanner feedback={manager.feedback} onDismiss={manager.clearFeedback} />

      {manager.isLoading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : manager.groupedRules.length === 0 ? (
        <SettingsEmptyState
          title={t('settings.purification.emptyTitle')}
          description={t('settings.purification.emptyDescription')}
        />
      ) : (
        <div className="space-y-8">
          {manager.groupedRules.map((group) => (
            <div key={group.name} className="space-y-4">
              <div className="text-lg font-semibold text-text-primary border-l-4 border-accent pl-3 flex items-center gap-2">
                {group.name}
                <span className="text-xs font-normal text-text-secondary bg-white/5 px-2 py-0.5 rounded-full">
                  {group.rules.length}
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {group.rules.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    name={rule.name}
                    pattern={rule.pattern}
                    isEnabled={rule.isEnabled}
                    priority={rule.order}
                    type={rule.isRegex ? 'regex' : 'text'}
                    scopes={[
                      rule.scopeTitle ? t('settings.purification.scopeTitle') : '',
                      rule.scopeContent ? t('settings.purification.scopeContent') : '',
                    ].filter(Boolean)}
                    onToggle={(checked) => void manager.toggleRule(rule.id, checked)}
                    onEdit={() => manager.openEditRule(rule)}
                    onDelete={() => manager.requestDeleteRule(rule)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <PurificationRuleModal
        isOpen={manager.isRuleModalOpen}
        onClose={manager.closeRuleModal}
        onSave={manager.saveRule}
        rule={manager.editingRule}
      />

      <SettingsConfirmModal
        isOpen={Boolean(manager.pendingDeleteRule)}
        onClose={manager.cancelDeleteRule}
        onConfirm={() => void manager.confirmDeleteRule()}
        title={t('settings.purification.deleteTitle')}
        description={t('settings.purification.deleteConfirm')}
        cancelLabel={t('common.actions.cancel')}
        confirmLabel={t('common.actions.delete')}
        confirmVariant="danger"
        confirmIcon={<Trash2 className="w-4 h-4" />}
      />

      <SettingsConfirmModal
        isOpen={manager.isClearAllModalOpen}
        onClose={manager.cancelClearAll}
        onConfirm={() => void manager.confirmClearAll()}
        title={t('settings.purification.clearAllTitle')}
        description={t('settings.purification.clearAllConfirm', { count: manager.rules.length })}
        cancelLabel={t('common.actions.cancel')}
        confirmLabel={t('settings.purification.clearAll')}
        confirmVariant="danger"
        isConfirming={manager.isClearingAll}
        confirmIcon={manager.isClearingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      />
    </div>
  );
}
