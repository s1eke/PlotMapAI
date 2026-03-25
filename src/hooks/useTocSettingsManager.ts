import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tocRulesApi } from '../api/settings/tocRules';
import type { TocRule } from '../api/settings/types';
import type { SettingsFeedbackState } from '../utils/settingsPage';
import {
  buildActionErrorMessage,
  downloadFile,
} from '../utils/settingsPage';

export interface TocSettingsManager {
  rules: TocRule[];
  isLoading: boolean;
  isRuleModalOpen: boolean;
  editingRule: TocRule | null;
  pendingDeleteRule: TocRule | null;
  feedback: SettingsFeedbackState | null;
  clearFeedback: () => void;
  openCreateRule: () => void;
  openEditRule: (rule: TocRule) => void;
  closeRuleModal: () => void;
  saveRule: (data: Partial<TocRule>) => Promise<void>;
  toggleRule: (id: number, isEnabled: boolean) => Promise<void>;
  requestDeleteRule: (rule: TocRule) => void;
  cancelDeleteRule: () => void;
  confirmDeleteRule: () => Promise<void>;
  importYaml: (file: File) => Promise<void>;
  exportYaml: () => Promise<void>;
}

export function useTocSettingsManager(): TocSettingsManager {
  const { t } = useTranslation();
  const [rules, setRules] = useState<TocRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TocRule | null>(null);
  const [pendingDeleteRule, setPendingDeleteRule] = useState<TocRule | null>(null);
  const [feedback, setFeedback] = useState<SettingsFeedbackState | null>(null);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  const loadRules = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await tocRulesApi.getTocRules();
      setRules(data);
    } catch (error) {
      console.error('Failed to load TOC rules', error);
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

  const openCreateRule = useCallback(() => {
    setEditingRule(null);
    setIsRuleModalOpen(true);
  }, []);

  const openEditRule = useCallback((rule: TocRule) => {
    setEditingRule(rule);
    setIsRuleModalOpen(true);
  }, []);

  const closeRuleModal = useCallback(() => {
    setIsRuleModalOpen(false);
    setEditingRule(null);
  }, []);

  const saveRule = useCallback(async (data: Partial<TocRule>) => {
    try {
      if (editingRule) {
        await tocRulesApi.updateTocRule(editingRule.id, data);
      } else {
        await tocRulesApi.createTocRule(data as Omit<TocRule, 'id' | 'isDefault'>);
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
      await tocRulesApi.updateTocRule(id, { isEnabled });
    } catch (error) {
      setRules((previous) => previous.map((rule) => (rule.id === id ? { ...rule, isEnabled: !isEnabled } : rule)));
      setFeedback({
        type: 'error',
        message: buildActionErrorMessage(t('settings.common.updateFailed'), error),
      });
    }
  }, [t]);

  const requestDeleteRule = useCallback((rule: TocRule) => {
    setPendingDeleteRule(rule);
  }, []);

  const cancelDeleteRule = useCallback(() => {
    setPendingDeleteRule(null);
  }, []);

  const confirmDeleteRule = useCallback(async () => {
    if (!pendingDeleteRule) return;

    try {
      await tocRulesApi.deleteTocRule(pendingDeleteRule.id);
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

  const importYaml = useCallback(async (file: File) => {
    setIsLoading(true);

    try {
      await tocRulesApi.uploadTocRulesYaml(file);
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
      const content = await tocRulesApi.exportTocRulesYaml();
      downloadFile(content, 'toc-rules.yaml', 'text/yaml');
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
    isLoading,
    isRuleModalOpen,
    editingRule,
    pendingDeleteRule,
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
    importYaml,
    exportYaml,
  };
}
