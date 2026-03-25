import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { purificationRulesApi } from '../api/settings/purificationRules';
import type { PurificationRule } from '../api/settings/types';
import type { PurificationRuleGroup, SettingsFeedbackState } from '../utils/settingsPage';
import {
  buildActionErrorMessage,
  downloadFile,
  groupPurificationRules,
} from '../utils/settingsPage';

export interface PurificationSettingsManager {
  rules: PurificationRule[];
  groupedRules: PurificationRuleGroup[];
  isLoading: boolean;
  isRuleModalOpen: boolean;
  editingRule: PurificationRule | null;
  pendingDeleteRule: PurificationRule | null;
  isClearAllModalOpen: boolean;
  isClearingAll: boolean;
  feedback: SettingsFeedbackState | null;
  clearFeedback: () => void;
  openCreateRule: () => void;
  openEditRule: (rule: PurificationRule) => void;
  closeRuleModal: () => void;
  saveRule: (data: Partial<PurificationRule>) => Promise<void>;
  toggleRule: (id: number, isEnabled: boolean) => Promise<void>;
  requestDeleteRule: (rule: PurificationRule) => void;
  cancelDeleteRule: () => void;
  confirmDeleteRule: () => Promise<void>;
  requestClearAll: () => void;
  cancelClearAll: () => void;
  confirmClearAll: () => Promise<void>;
  importYaml: (file: File) => Promise<void>;
  exportYaml: () => Promise<void>;
}

export function usePurificationSettingsManager(): PurificationSettingsManager {
  const { t } = useTranslation();
  const [rules, setRules] = useState<PurificationRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PurificationRule | null>(null);
  const [pendingDeleteRule, setPendingDeleteRule] = useState<PurificationRule | null>(null);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [feedback, setFeedback] = useState<SettingsFeedbackState | null>(null);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  const loadRules = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await purificationRulesApi.getPurificationRules();
      setRules(data);
    } catch (error) {
      console.error('Failed to load purification rules', error);
      setFeedback({
        type: 'error',
        message: t('settings.common.loadFailed'),
      });
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const groupedRules = useMemo(
    () => groupPurificationRules(rules, t('settings.purification.ungrouped')),
    [rules, t],
  );

  const openCreateRule = useCallback(() => {
    setEditingRule(null);
    setIsRuleModalOpen(true);
  }, []);

  const openEditRule = useCallback((rule: PurificationRule) => {
    setEditingRule(rule);
    setIsRuleModalOpen(true);
  }, []);

  const closeRuleModal = useCallback(() => {
    setIsRuleModalOpen(false);
    setEditingRule(null);
  }, []);

  const saveRule = useCallback(async (data: Partial<PurificationRule>) => {
    try {
      if (editingRule) {
        await purificationRulesApi.updatePurificationRule(editingRule.id, data);
      } else {
        await purificationRulesApi.createPurificationRule(data);
      }

      await loadRules();
      setFeedback({
        type: 'success',
        message: t('settings.common.saveSuccess'),
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: buildActionErrorMessage(t('settings.common.updateFailed'), error),
      });
      throw error;
    }
  }, [editingRule, loadRules, t]);

  const toggleRule = useCallback(async (id: number, isEnabled: boolean) => {
    setRules((previous) => previous.map((rule) => (rule.id === id ? { ...rule, isEnabled } : rule)));

    try {
      await purificationRulesApi.updatePurificationRule(id, { isEnabled });
    } catch (error) {
      setRules((previous) => previous.map((rule) => (rule.id === id ? { ...rule, isEnabled: !isEnabled } : rule)));
      setFeedback({
        type: 'error',
        message: buildActionErrorMessage(t('settings.common.updateFailed'), error),
      });
    }
  }, [t]);

  const requestDeleteRule = useCallback((rule: PurificationRule) => {
    setPendingDeleteRule(rule);
  }, []);

  const cancelDeleteRule = useCallback(() => {
    setPendingDeleteRule(null);
  }, []);

  const confirmDeleteRule = useCallback(async () => {
    if (!pendingDeleteRule) return;

    try {
      await purificationRulesApi.deletePurificationRule(pendingDeleteRule.id);
      setRules((previous) => previous.filter((rule) => rule.id !== pendingDeleteRule.id));
      setFeedback({
        type: 'success',
        message: t('settings.common.deleteSuccess'),
      });
      setPendingDeleteRule(null);
    } catch (error) {
      setFeedback({
        type: 'error',
        message: buildActionErrorMessage(t('settings.common.deleteFailed'), error),
      });
    }
  }, [pendingDeleteRule, t]);

  const requestClearAll = useCallback(() => {
    setIsClearAllModalOpen(true);
  }, []);

  const cancelClearAll = useCallback(() => {
    setIsClearAllModalOpen(false);
  }, []);

  const confirmClearAll = useCallback(async () => {
    setIsClearingAll(true);

    try {
      await purificationRulesApi.clearAllPurificationRules();
      setRules([]);
      setFeedback({
        type: 'success',
        message: t('settings.common.clearSuccess'),
      });
      setIsClearAllModalOpen(false);
    } catch (error) {
      setFeedback({
        type: 'error',
        message: buildActionErrorMessage(t('settings.common.deleteFailed'), error),
      });
    } finally {
      setIsClearingAll(false);
    }
  }, [t]);

  const importYaml = useCallback(async (file: File) => {
    setIsLoading(true);

    try {
      await purificationRulesApi.uploadPurificationRulesYaml(file);
      await loadRules();
      setFeedback({
        type: 'success',
        message: t('settings.common.importSuccess'),
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: buildActionErrorMessage(t('settings.common.uploadFailed'), error),
      });
    } finally {
      setIsLoading(false);
    }
  }, [loadRules, t]);

  const exportYaml = useCallback(async () => {
    try {
      const content = await purificationRulesApi.exportPurificationRulesYaml();
      downloadFile(content, 'purification-rules.yaml', 'text/yaml');
      setFeedback({
        type: 'success',
        message: t('settings.common.exportSuccess'),
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: buildActionErrorMessage(t('settings.common.exportFailed'), error),
      });
    }
  }, [t]);

  return {
    rules,
    groupedRules,
    isLoading,
    isRuleModalOpen,
    editingRule,
    pendingDeleteRule,
    isClearAllModalOpen,
    isClearingAll,
    feedback,
    clearFeedback,
    openCreateRule,
    openEditRule,
    closeRuleModal,
    saveRule,
    toggleRule,
    requestDeleteRule,
    cancelDeleteRule,
    confirmDeleteRule,
    requestClearAll,
    cancelClearAll,
    confirmClearAll,
    importYaml,
    exportYaml,
  };
}
